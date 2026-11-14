// Hostile text through the value parsers a substituted `var()` reaches: none may hang, run out of
// stack or emit JSON a reader cannot parse
#include <gtest/gtest.h>

#include <atomic>
#include <chrono>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#include "SymbioteCalc.h"
#include "SymbioteComputedValue.h"
#include "SymbioteContainerQuery.h"
#include "SymbioteMath.h"
#include "SymbioteRegisteredProperties.h"
#include "SymbioteShorthand.h"
#include "SymbioteStructuredStyle.h"
#include "SymbioteStyleText.h"
#include "SymbioteSyntax.h"

namespace symbiote {
namespace {

constexpr size_t kHuge = 200'000;
constexpr auto kSlow = std::chrono::seconds(2);

const ColorParser kNoColor = [](const std::string &) { return std::optional<long long>(); };

std::string repeated(const std::string &unit, size_t count) {
  std::string out;
  out.reserve(unit.size() * count);
  for (size_t at = 0; at < count; at += 1) out += unit;
  return out;
}

template <typename Run>
std::chrono::steady_clock::duration timed(Run run) {
  const auto started = std::chrono::steady_clock::now();
  run();
  return std::chrono::steady_clock::now() - started;
}

// Strings close, no raw control character sits inside one, and the brackets outside balance
bool isWellFormedJson(const std::string &json) {
  bool inString = false;
  bool escaped = false;
  int depth = 0;
  for (const char c : json) {
    if (!inString) {
      if (c == '"') inString = true;
      if (c == '{' || c == '[') depth += 1;
      if (c == '}' || c == ']') depth -= 1;
      if (depth < 0) return false;
    } else if (static_cast<unsigned char>(c) < 0x20) {
      return false;
    } else if (escaped) {
      escaped = false;
    } else if (c == '\\') {
      escaped = true;
    } else if (c == '"') {
      inString = false;
    }
  }
  return !inString && depth == 0;
}

TEST(Adversarial, deepCalcNestingIsAnAnswerNotACrash) {
  const std::string text = repeated("calc(", kHuge) + "1px" + repeated(")", kHuge);

  EXPECT_LT(timed([&] { evaluateCalc(text); }), kSlow);
}

TEST(Adversarial, deepMathNestingIsAnAnswerNotACrash) {
  const std::string text = repeated("max(1px, ", kHuge) + "1px" + repeated(")", kHuge);

  EXPECT_LT(timed([&] { parseMath(text); }), kSlow);
}

TEST(Adversarial, unclosedMathCallsAreRefused) {
  EXPECT_FALSE(parseMath(repeated("min(", kHuge)).has_value());
  EXPECT_FALSE(evaluateCalc(repeated("calc(", kHuge)).has_value());
}

TEST(Adversarial, splittingTextOfOpeningBracketsIsLinear) {
  const std::string text = repeated("(", kHuge) + " a, b";

  EXPECT_LT(timed([&] { splitOutsideParens(text, true); }), kSlow);
}

TEST(Adversarial, aSyntaxOfManyAlternativesParsesInBoundedTime) {
  const std::string syntax = repeated("<length>+ | ", kHuge) + "<color>";

  EXPECT_LT(timed([&] { parseSyntax(syntax); }), kSlow);
}

TEST(Adversarial, aVeryLongIdentInASyntaxParsesInBoundedTime) {
  const std::string syntax = std::string(1'000'000, 'a');

  EXPECT_LT(timed([&] { parseSyntax(syntax); }), kSlow);
}

TEST(Adversarial, aLongListMatchesAMultipliedSyntaxInBoundedTime) {
  const std::optional<Syntax> syntax = parseSyntax("<length>+");
  ASSERT_TRUE(syntax.has_value());
  const std::string value = repeated("1px ", kHuge);

  EXPECT_LT(timed([&] { matchesSyntax(*syntax, value, ValueContext::kDeclared, kNoColor); }), kSlow);
}

TEST(Adversarial, aTextThatNearlyMatchesManyAlternativesIsRefusedInBoundedTime) {
  const std::optional<Syntax> syntax = parseSyntax(repeated("<length> | ", 2'000) + "<number>");
  ASSERT_TRUE(syntax.has_value());
  const std::string value = repeated("1px ", 50'000) + "x";

  EXPECT_LT(timed([&] { matchesSyntax(*syntax, value, ValueContext::kDeclared, kNoColor); }), kSlow);
}

TEST(Adversarial, aHugeCommaListShadowIsBoundedInTime) {
  const std::string text = repeated("1px 1px 1px red, ", kHuge);

  EXPECT_LT(timed([&] { structuredStyleJson("boxShadow", text, kNoColor); }), kSlow);
}

TEST(Adversarial, aHugeTransformListIsBoundedInTime) {
  const std::string text = repeated("translateX(1px) ", kHuge);

  EXPECT_LT(timed([&] { structuredStyleJson("transform", text, kNoColor); }), kSlow);
}

TEST(Adversarial, deeplyNestedFilterFunctionsAreBoundedInTime) {
  const std::string text = repeated("blur(", kHuge) + "1px" + repeated(")", kHuge);

  EXPECT_LT(timed([&] { structuredStyleJson("filter", text, kNoColor); }), kSlow);
}

TEST(Adversarial, aHugeShorthandIsBoundedInTime) {
  const std::string text = repeated("1px ", kHuge);

  EXPECT_LT(timed([&] { expandShorthand("margin", text); }), kSlow);
  EXPECT_LT(timed([&] { expandShorthand("border", text); }), kSlow);
}

TEST(Adversarial, jsonTextEscapesQuotesAndBackslashes) {
  const std::string json = jsonText("\"\\\"},{\"evil\":\"1");

  EXPECT_TRUE(isWellFormedJson(json));
  EXPECT_EQ(json.front(), '"');
  EXPECT_EQ(json.back(), '"');
}

TEST(Adversarial, structuredJsonStaysSafeForAValueCarryingQuotesAndBackslashes) {
  for (const char *key : {"boxShadow", "filter", "transform"}) {
    const std::optional<std::string> json =
        structuredStyleJson(key, "blur(\"}{\\) 1px \"x\"", kNoColor);
    if (json.has_value()) EXPECT_TRUE(isWellFormedJson(*json)) << key;
  }
}

TEST(Adversarial, structuredJsonStaysWellFormedForAControlCharacterInsideAToken) {
  const char *templates[] = {"0 0 4px X red", "0 X 4px red", "drop-shadow(0 0 4px X)", "blur(X1px)",
                             "translateX(X1px)", "url(X)", "X"};
  std::vector<std::string> broken;
  for (const char *key : {"boxShadow", "filter", "transform"}) {
    for (int code = 1; code < 0x20; code += 1) {
      for (const char *pattern : templates) {
        std::string text = pattern;
        text.replace(text.find('X'), 1, std::string(1, static_cast<char>(code)));
        const std::optional<std::string> json = structuredStyleJson(key, text, kNoColor);
        if (json.has_value() && !isWellFormedJson(*json)) {
          broken.push_back(std::string(key) + " <- " + pattern + " with code " + std::to_string(code));
        }
      }
    }
  }

  EXPECT_EQ(broken, std::vector<std::string>{});
}

TEST(Adversarial, structuredJsonStaysWellFormedForANumberBeyondTheDoubleRange) {
  const char *values[] = {"1e999px", "-1e999px", "1e999", "1e999deg", "999999999999999999999999px"};
  std::vector<std::string> broken;
  for (const char *value : values) {
    const std::string texts[] = {std::string("translateX(") + value + ")", std::string("scale(") + value + ")",
                                 std::string("rotate(") + value + ")",
                                 std::string("matrix(") + value + ", 0, 0, 1, 0, 0)",
                                 std::string("0 0 ") + value + " red", std::string("blur(") + value + ")"};
    for (const std::string &text : texts) {
      for (const char *key : {"boxShadow", "filter", "transform"}) {
        const std::optional<std::string> json = structuredStyleJson(key, text, kNoColor);
        if (json.has_value() && (!isWellFormedJson(*json) || json->find("inf") != std::string::npos ||
                                 json->find("nan") != std::string::npos)) {
          broken.push_back(std::string(key) + " <- " + text);
        }
      }
    }
  }

  EXPECT_EQ(broken, std::vector<std::string>{});
}

TEST(Adversarial, aDeeplyNestedContainerConditionIsRefusedNotACrash) {
  const std::string deep = repeated("[\"!\",", kHuge) + "[\"&\",[]]" + repeated("]", kHuge);

  EXPECT_FALSE(parseContainerCondition(deep).has_value());
}

TEST(Adversarial, aLongListOfContainerComparisonsParsesInBoundedTime) {
  const std::string json =
      "[\"@\",null,[\"&\",[" + repeated("[\">=\",\"width\",400],", 30'000) + "true]]]";

  EXPECT_LT(timed([&] { parseContainerCondition(json); }), kSlow);
}

TEST(Adversarial, aDeeplyNestedContainerVariantEnvelopeIsRefusedNotACrash) {
  const std::string deep = repeated("[\"!\",", kHuge) + "[\"&\",[]]" + repeated("]", kHuge);

  EXPECT_FALSE(parseContainerVariants("[[" + deep + "]]").has_value());
}

TEST(Adversarial, readersStayConsistentWhileAnotherThreadRegistersAndSwapsTheColourParser) {
  RegisteredProperties &table = RegisteredProperties::instance();
  table.clear();
  table.setColorParser(kNoColor);
  std::atomic<bool> isDone{false};
  std::atomic<int> wrong{0};
  std::vector<std::thread> readers;
  for (int reader = 0; reader < 4; reader += 1) {
    readers.emplace_back([&] {
      while (!isDone.load()) {
        const std::optional<std::string> length = table.settle("--w", std::optional<std::string>("4px"));
        if (length != std::optional<std::string>("4px")) wrong += 1;
        table.settle("--c", std::optional<std::string>("red"));
        table.rejects("--w", std::optional<std::string>("4px"));
      }
    });
  }
  std::thread writer([&] {
    for (int round = 0; round < 20'000; round += 1) {
      table.add("--w", "<length>", true, std::string("0px"));
      table.add("--c", "<color>", true, std::string("red"));
      table.setColorParser(round % 2 == 0 ? ColorParser(kNoColor) : ColorParser([](const std::string &) {
        return std::optional<long long>(1);
      }));
      table.remove("--w");
      table.remove("--c");
    }
    isDone.store(true);
  });
  writer.join();
  for (std::thread &reader : readers) reader.join();
  table.clear();

  EXPECT_EQ(wrong.load(), 0);
}

TEST(Adversarial, computedTextOfAHugeValueIsBoundedInTime) {
  const std::optional<Syntax> syntax = parseSyntax("<length>+");
  ASSERT_TRUE(syntax.has_value());
  const std::string value = repeated("1px ", kHuge);

  EXPECT_LT(timed([&] { computedText(*syntax, value, kNoColor); }), kSlow);
}

} // namespace
} // namespace symbiote

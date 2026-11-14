// Decision 18: one registry of `@property` / `CSS.registerProperty` descriptors
// Registration rules are those of wpt `css-properties-values-api/register-property.html`
#include <gtest/gtest.h>

#include <map>
#include <optional>
#include <string>

#include "SymbioteRegisteredProperties.h"

namespace symbiote {
namespace {

std::optional<long long> fakeColor(const std::string &token) {
  static const std::map<std::string, long long> known = {{"red", 1}, {"blue", 2}};
  const auto found = known.find(token);
  if (found == known.end()) return std::nullopt;
  return found->second;
}

class RegisteredPropertiesTest : public ::testing::Test {
 protected:
  void SetUp() override {
    RegisteredProperties::instance().clear();
    RegisteredProperties::instance().setColorParser(fakeColor);
  }

  void TearDown() override {
    RegisteredProperties::instance().clear();
  }

  RegisterOutcome add(
      std::string_view name,
      std::string_view syntax,
      bool inherits,
      std::optional<std::string> initial = std::nullopt) {
    return RegisteredProperties::instance().add(name, syntax, inherits, initial);
  }

  std::optional<std::string> computed(
      std::string_view name, const std::optional<std::string> &substituted) {
    const std::optional<RegisteredProperty> property = RegisteredProperties::instance().find(name);
    EXPECT_TRUE(property.has_value()) << name;
    if (!property.has_value()) return std::nullopt;
    return RegisteredProperties::instance().computedValue(*property, substituted);
  }
};

TEST_F(RegisteredPropertiesTest, RegistersATypedPropertyWithItsInitialValue) {
  EXPECT_EQ(add("--w", "<length>", false, "0px"), RegisterOutcome::kRegistered);
  const std::optional<RegisteredProperty> found = RegisteredProperties::instance().find("--w");
  ASSERT_TRUE(found.has_value());
  EXPECT_FALSE(found->inherits);
  EXPECT_EQ(found->initialValue, std::optional<std::string>("0px"));
}

TEST_F(RegisteredPropertiesTest, AllowsTheUniversalSyntaxWithoutAnInitialValue) {
  EXPECT_EQ(add("--any", "*", true), RegisterOutcome::kRegistered);
  EXPECT_FALSE(RegisteredProperties::instance().find("--any")->initialValue.has_value());
}

TEST_F(RegisteredPropertiesTest, RequiresAnInitialValueForAnyOtherSyntax) {
  EXPECT_EQ(add("--w", "<length>", true), RegisterOutcome::kMissingInitialValue);
  EXPECT_FALSE(RegisteredProperties::instance().find("--w").has_value());
}

TEST_F(RegisteredPropertiesTest, RejectsAnInitialValueThatDoesNotMatchOrDependsOnAComputation) {
  EXPECT_EQ(add("--a", "<length>", true, "10"), RegisterOutcome::kBadInitialValue);
  EXPECT_EQ(add("--b", "<length>", true, "10em"), RegisterOutcome::kBadInitialValue);
  EXPECT_EQ(add("--c", "*", true, "var(--x)"), RegisterOutcome::kBadInitialValue);
  EXPECT_EQ(add("--d", "<length>", true, "calc(5px + 10%)"), RegisterOutcome::kBadInitialValue);
}

TEST_F(RegisteredPropertiesTest, RejectsABadSyntaxAndABadName) {
  EXPECT_EQ(add("--e", "<banana>", true, "x"), RegisterOutcome::kBadSyntax);
  EXPECT_EQ(add("--f", "", true, "x"), RegisterOutcome::kBadSyntax);
  EXPECT_EQ(add("width", "<length>", true, "0px"), RegisterOutcome::kBadName);
  EXPECT_EQ(add("--", "<length>", true, "0px"), RegisterOutcome::kBadName);
  EXPECT_EQ(add("-x", "<length>", true, "0px"), RegisterOutcome::kBadName);
}

TEST_F(RegisteredPropertiesTest, RejectsANameThatIsNoIdentifier) {
  for (const char *name : {"--a b", "--a;b", "--a{b}", "--\"x\"", "--a(b)", "--a,b", "--a:b", "--a\tb"}) {
    EXPECT_EQ(add(name, "*", true), RegisterOutcome::kBadName) << name;
  }
  EXPECT_EQ(add(std::string_view("--a\0b", 5), "*", true), RegisterOutcome::kBadName);
  EXPECT_EQ(add("--a\\", "*", true), RegisterOutcome::kBadName);
}

TEST_F(RegisteredPropertiesTest, AcceptsAnIdentifierAsAName) {
  for (const char *name : {"--a", "--A_b-9", "--_", "---", "--\xC3\xA9", "--a\\ b", "--a\\;b"}) {
    EXPECT_EQ(add(name, "*", true), RegisterOutcome::kRegistered) << name;
  }
}

TEST_F(RegisteredPropertiesTest, RejectsASecondRegistrationOfTheSameName) {
  EXPECT_EQ(add("--w", "<length>", true, "0px"), RegisterOutcome::kRegistered);
  EXPECT_EQ(add("--w", "<number>", true, "0"), RegisterOutcome::kAlreadyRegistered);
  EXPECT_EQ(RegisteredProperties::instance().find("--w")->initialValue, std::optional<std::string>("0px"));
}

TEST_F(RegisteredPropertiesTest, MatchesATypedColour) {
  EXPECT_EQ(add("--c", "<color>", true, "red"), RegisterOutcome::kRegistered);
  EXPECT_EQ(add("--d", "<color>", true, "fancy"), RegisterOutcome::kBadInitialValue);
}

TEST_F(RegisteredPropertiesTest, DropsAParseTimeInvalidDeclarationButKeepsOneHoldingAVarCall) {
  add("--w", "<length>", true, "0px");
  const RegisteredProperty property = *RegisteredProperties::instance().find("--w");
  const RegisteredProperties &registry = RegisteredProperties::instance();
  EXPECT_TRUE(registry.declarationApplies(property, "8px"));
  EXPECT_TRUE(registry.declarationApplies(property, "2em"));
  EXPECT_FALSE(registry.declarationApplies(property, "8"));
  EXPECT_FALSE(registry.declarationApplies(property, "banana"));
  EXPECT_TRUE(registry.declarationApplies(property, "var(--other)"));
}

TEST_F(RegisteredPropertiesTest, ComputesTheSubstitutedValueOrFallsBackToTheInitialOne) {
  add("--w", "<length>", true, "0px");
  EXPECT_EQ(computed("--w", "8px"), std::optional<std::string>("8px"));
  EXPECT_EQ(computed("--w", "  8px "), std::optional<std::string>("8px"));
  EXPECT_EQ(computed("--w", "8"), std::optional<std::string>("0px"));
  EXPECT_EQ(computed("--w", std::nullopt), std::optional<std::string>("0px"));
}

TEST_F(RegisteredPropertiesTest, ComputesToGuaranteedInvalidWhenThereIsNoInitialValue) {
  add("--any", "*", true);
  EXPECT_EQ(computed("--any", "anything"), std::optional<std::string>("anything"));
  EXPECT_EQ(computed("--any", std::nullopt), std::nullopt);
}

TEST_F(RegisteredPropertiesTest, KeepsAnInvalidUniversalValueGuaranteedInvalidDespiteAnInitialValue) {
  add("--any", "*", true, "0px");
  EXPECT_EQ(computed("--any", std::nullopt), std::nullopt);
  EXPECT_FALSE(RegisteredProperties::instance().rejects("--any", std::nullopt));
}

TEST_F(RegisteredPropertiesTest, RejectsWhatTheSyntaxRefusesOnATypedNameOnly) {
  add("--w", "<length>", true, "0px");
  const RegisteredProperties &registry = RegisteredProperties::instance();
  EXPECT_TRUE(registry.rejects("--w", std::nullopt));
  EXPECT_TRUE(registry.rejects("--w", "8"));
  EXPECT_FALSE(registry.rejects("--w", " 8px "));
  EXPECT_FALSE(registry.rejects("--other", std::nullopt));
}

TEST_F(RegisteredPropertiesTest, SettlesARegisteredNameAndPassesAnUnregisteredOneThrough) {
  add("--w", "<length>", true, "0px");
  const RegisteredProperties &registry = RegisteredProperties::instance();
  EXPECT_EQ(registry.settle("--w", "oops"), std::optional<std::string>("0px"));
  EXPECT_EQ(registry.settle("--other", "oops"), std::optional<std::string>("oops"));
  EXPECT_EQ(registry.settle("--other", std::nullopt), std::nullopt);
}

TEST_F(RegisteredPropertiesTest, KnowsWhenNothingIsRegistered) {
  EXPECT_TRUE(RegisteredProperties::instance().isEmpty());
  add("--w", "<length>", true, "0px");
  EXPECT_FALSE(RegisteredProperties::instance().isEmpty());
  RegisteredProperties::instance().clear();
  EXPECT_TRUE(RegisteredProperties::instance().isEmpty());
}

TEST_F(RegisteredPropertiesTest, ForgetsEverythingOnClear) {
  add("--w", "<length>", true, "0px");
  RegisteredProperties::instance().clear();
  EXPECT_FALSE(RegisteredProperties::instance().find("--w").has_value());
  EXPECT_EQ(add("--w", "<number>", true, "0"), RegisterOutcome::kRegistered);
}

TEST_F(RegisteredPropertiesTest, RemovesOneNameAndLetsItBeRegisteredAgain) {
  add("--w", "<length>", true, "0px");
  add("--n", "<number>", true, "0");
  EXPECT_TRUE(RegisteredProperties::instance().remove("--w"));
  EXPECT_FALSE(RegisteredProperties::instance().find("--w").has_value());
  EXPECT_TRUE(RegisteredProperties::instance().find("--n").has_value());
  EXPECT_EQ(add("--w", "<number>", true, "1"), RegisterOutcome::kRegistered);
}

TEST_F(RegisteredPropertiesTest, AnswersFalseWhenRemovingAnUnregisteredName) {
  EXPECT_FALSE(RegisteredProperties::instance().remove("--w"));
}

TEST_F(RegisteredPropertiesTest, ReportsEmptyAfterTheLastNameIsRemoved) {
  add("--w", "<length>", true, "0px");
  RegisteredProperties::instance().remove("--w");
  EXPECT_TRUE(RegisteredProperties::instance().isEmpty());
}

TEST_F(RegisteredPropertiesTest, SharesTheDescriptorWithoutCopyingItAndKeepsItAliveAfterRemoval) {
  add("--w", "<length>", true, "0px");
  const auto first = RegisteredProperties::instance().share("--w");
  const auto second = RegisteredProperties::instance().share("--w");
  ASSERT_NE(first, nullptr);
  EXPECT_EQ(first, second);
  RegisteredProperties::instance().remove("--w");
  EXPECT_EQ(RegisteredProperties::instance().share("--w"), nullptr);
  EXPECT_EQ(first->initialValue, std::optional<std::string>("0px"));
}

int gColorCalls = 0;

std::optional<long long> countingColor(const std::string &token) {
  gColorCalls += 1;
  return fakeColor(token);
}

TEST_F(RegisteredPropertiesTest, AsksTheColourParserOnceForTheSameSubstitutedText) {
  RegisteredProperties::instance().setColorParser(countingColor);
  add("--c", "<color>", true, "blue");
  const std::optional<std::string> first = computed("--c", std::string("red"));
  const int callsAfterFirst = gColorCalls;
  const std::optional<std::string> second = computed("--c", std::string("red"));

  EXPECT_EQ(second, first);
  EXPECT_GT(callsAfterFirst, 0);
  EXPECT_EQ(gColorCalls, callsAfterFirst);
}

TEST_F(RegisteredPropertiesTest, ChecksTheSyntaxOnceForTheSameTextAcrossRejectAndApply) {
  RegisteredProperties::instance().setColorParser(countingColor);
  add("--c", "<color>", true, "blue");
  const auto property = RegisteredProperties::instance().share("--c");
  ASSERT_NE(property, nullptr);
  const std::optional<std::string> text = std::string("red");
  EXPECT_FALSE(RegisteredProperties::instance().rejects("--c", text));
  const int callsAfterFirst = gColorCalls;
  EXPECT_FALSE(RegisteredProperties::instance().rejects("--c", text));
  EXPECT_TRUE(RegisteredProperties::instance().declarationApplies(*property, "red"));

  EXPECT_GT(callsAfterFirst, 0);
  EXPECT_EQ(gColorCalls, callsAfterFirst);
}

TEST_F(RegisteredPropertiesTest, StillRejectsATextThatDoesNotMatchAfterItWasMemoized) {
  add("--c", "<color>", true, "blue");
  const std::optional<std::string> text = std::string("12px");
  EXPECT_TRUE(RegisteredProperties::instance().rejects("--c", text));
  EXPECT_TRUE(RegisteredProperties::instance().rejects("--c", text));
}

TEST_F(RegisteredPropertiesTest, AnswersAfreshWhenTheColourParserChanges) {
  add("--c", "<color>", true, "blue");
  EXPECT_NE(computed("--c", std::string("red")), std::optional<std::string>("blue"));
  RegisteredProperties::instance().setColorParser(
      [](const std::string &) { return std::optional<long long>(); });

  EXPECT_EQ(computed("--c", std::string("red")), std::optional<std::string>("blue"));
}

} // namespace
} // namespace symbiote

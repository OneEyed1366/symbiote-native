// Decision 35: the `syntax` grammar of `@property` and `CSS.registerProperty`
// Cases are ported from wpt `css/css-properties-values-api/register-property-syntax-parsing.html`,
// where a pair is valid when registering the syntax with that initial value does not throw
#include <gtest/gtest.h>

#include <map>
#include <optional>
#include <string>

#include "SymbioteSyntax.h"

namespace symbiote {
namespace {

std::optional<long long> fakeColor(const std::string &token) {
  static const std::map<std::string, long long> known = {
      {"red", 1}, {"blue", 2}, {"yellow", 3}, {"lightgoldenrodyellow", 4}, {"rgb(12, 34, 56)", 5}};
  const auto found = known.find(token);
  if (found == known.end()) return std::nullopt;
  return found->second;
}

bool registers(const std::string &syntax, const std::string &initial) {
  const std::optional<Syntax> parsed = parseSyntax(syntax);
  return parsed.has_value() && matchesSyntax(*parsed, initial, ValueContext::kInitialValue, fakeColor);
}

void expectValid(const std::string &syntax, const std::string &initial) {
  EXPECT_TRUE(registers(syntax, initial)) << "syntax:'" << syntax << "' initial:'" << initial << "'";
}

void expectInvalid(const std::string &syntax, const std::string &initial) {
  EXPECT_FALSE(registers(syntax, initial)) << "syntax:'" << syntax << "' initial:'" << initial << "'";
}

TEST(SyntaxTest, AcceptsTheUniversalSyntaxAndAnyBalancedValue) {
  expectValid("*", "a");
  expectValid(" * ", "b");
  expectValid("*", ":> hello");
  expectValid("*", "([ brackets ]) { yay (??)}");
  expectValid("*", "yep 'this is valid too'");
  expectValid("*", "unmatched opening bracket is valid :(");
  expectValid("*", "\"");
  expectValid("*", "default");
}

TEST(SyntaxTest, AcceptsTheDataTypesAndTheirMultipliers) {
  expectValid("<length>", "2px");
  expectValid(" <number>", "5");
  expectValid("<percentage> ", "10%");
  expectValid("<color>+", "red");
  expectValid(" <length>+ | <percentage>", "2px 8px");
  expectValid(" <length>+ | <color>#", "red, blue");
  expectValid("<length>|<percentage>|<length-percentage>", "2px");
  expectValid("<color> | <image> | <url> | <integer> | <angle>", "red");
  expectValid("<time> | <resolution> | <transform-list> | <custom-ident>", "red");
  expectValid("\t<color>\n|   foo", "foo");
}

TEST(SyntaxTest, ReadsLengthsAndCalcOverThem) {
  expectValid("<length>", "0");
  expectValid("<length>", "10px /*:)*/");
  expectValid("<length>", " calc(-2px)");
  expectValid("<length>", "calc(2px*4 + 10px)");
  expectValid("<length>", "7.1e-4cm");
  expectValid("<length>", "calc(7in - 12px)");
  expectValid("<length>+", "2px 7px calc(8px)");
  expectValid("<length>#", "2px, 7px, calc(8px)");
  expectValid("<percentage>", "-9.3e3%");
  expectValid("<length-percentage>", "-54%");
  expectValid("<length-percentage>", "0");
  expectValid("<length-percentage>", "calc(-11px + 10.4%)");
  expectValid("<length>", "10vmin");
  expectValid("<percentage> | <length>+", "calc(100vh - 10px) 30px");
}

TEST(SyntaxTest, ReadsNumbersAndIntegers) {
  expectValid("<number>", "-109");
  expectValid("<number>", "2.3e4");
  expectValid("<number>", "calc(1 / 2)");
  expectValid("<integer>", "-109");
  expectValid("<integer>", "19");
  expectValid("<integer>", "calc(1)");
  expectValid("<integer>", "calc(1 + 2)");
  expectValid("<integer>", "calc(3.1415)");
  expectValid("<integer>", "calc(3.1415 + 3.1415)");
}

TEST(SyntaxTest, ReadsAnglesTimesResolutionsAndTransforms) {
  expectValid("<angle>", "10deg");
  expectValid("<angle>", "20.5rad");
  expectValid("<angle>", "calc(50grad + 3.14159rad)");
  expectValid("<time>", "2s");
  expectValid("<time>", "calc(2s - 9ms)");
  expectValid("<resolution>", "10dpi");
  expectValid("<resolution>", "3dPpX");
  expectValid("<transform-function>", "translateX(2px)");
  expectValid("<transform-function>|<integer>", "5");
  expectValid("<transform-function>|<integer>", "scale(2)");
  expectValid("<transform-function>+", "translateX(2px) rotate(42deg)");
  expectValid("<transform-list>", "scale(2)");
  expectValid("<transform-list>", "translateX(2px) rotate(20deg)");
  expectValid("<transform-list>", "scale(2) rotate(90deg) ");
  expectValid("<transform-list> | <transform-function>", "scale(2) rotate(90deg)");
  expectValid("<transform-function>+ | <transform-list>", "scale(2) rotate(90deg)");
  expectValid("<transform-list> | <transform-function>#", "scale(2), rotate(90deg)");
}

TEST(SyntaxTest, ReadsStrings) {
  expectValid("<string>", "'foo bar'");
  expectValid("<string>", " 'foo bar' ");
  expectValid("<string>", "'foo bar");
  expectValid("<string>", "'\"foo\" bar'");
  expectValid("<string>", "\"bar 'baz'\"");
  expectValid("<string>+", "'foo' 'bar'");
  expectValid("<string>#", "'foo', 'bar'");
  expectValid("<string>+ | <string>#", "'foo' \"bar\"");
  expectValid("<string># | <string>+", "'foo', 'bar' ");
}

TEST(SyntaxTest, ReadsColoursImagesAndUrls) {
  expectValid("<color>", "rgb(12, 34, 56)");
  expectValid("<color>", "lightgoldenrodyellow");
  expectValid("<image>", "url(a)");
  expectValid("<image>", "linear-gradient(yellow, blue)");
  expectValid("<url>", "url(a)");
  expectValid("<color>+", "yellow blue ");
  expectValid("<color>+ | <color>", "yellow blue");
  expectValid("<color># | <color>", "yellow, blue");
  expectValid("<color>+ | yellow", "yellow blue");
  expectValid("yellow", "yellow");
  expectValid("yellow | <color>#", "yellow, blue");
  expectValid("<integer>+ | <percentage>+ | <length>+ ", "1 1");
  expectValid("<integer>+ | <percentage>+ | <length>+ ", "1% 1%");
  expectValid("<integer>+ | <percentage>+ | <length>+ ", "1px 1px");
}

TEST(SyntaxTest, ReadsIdentifiersWithEscapes) {
  expectValid("banana", "banana");
  expectValid("bAnAnA", "bAnAnA");
  expectValid("ba-na-nya", "ba-na-nya");
  expectValid("banana", R"(banan\61)");
  expectValid(R"(banan\61)", "banana");
  expectValid("<custom-ident>", R"(banan\61)");
  expectValid("big | bigger | BIGGER", "bigger");
  expectValid("foo+|bar", "foo foo foo");
  expectValid("banana\t", "banana");
  expectValid("\nbanana\r\n", "banana");
  expectValid("ba\f\n|\tna\r|nya", "nya");
  expectValid(R"(\1F914)", "🤔");
  expectValid(R"(hmm\1F914)", "hmm🤔");
  expectValid(R"(\1F914hmm)", "🤔hmm");
  expectValid(R"(\1F914 hmm)", "🤔hmm");
  expectValid(R"(\1F914\1F914)", "🤔🤔");
}

TEST(SyntaxTest, RejectsAMalformedSyntax) {
  expectInvalid("<color>#", "yellow blue");
  expectInvalid("banana,nya", "banana");
  expectInvalid(R"(<\6c ength>)", "10px");
  expectInvalid("<banana>", "banana");
  expectInvalid("<Number>", "10");
  expectInvalid("<length", "10px");
  expectInvalid("<LENGTH>", "10px");
  expectInvalid("< length>", "10px");
  expectInvalid("<length >", "10px");
  expectInvalid("<length> +", "10px");
  expectInvalid("<transform-list>+", "scale(2)");
  expectInvalid("<transform-list>#", "scale(2)");
  expectInvalid("<length>++", "10px");
  expectInvalid("<length>##", "10px");
  expectInvalid("<length>+#", "10px");
  expectInvalid("<length>#+", "10px");
  expectInvalid("<length> | *", "10px");
  expectInvalid("*|banana", "banana");
  expectInvalid("|banana", "banana");
  expectInvalid("*+", "banana");
  expectInvalid("|", "banana");
  expectInvalid(" |", "banana");
  expectInvalid("||", "banana");
  expectInvalid("foo bar", "foo bar");
  expectInvalid("foo foo foo", "foo foo foo");
  expectInvalid("foo § bar", "foo § bar");
  expectInvalid("<length> <number>", "0px 0");
  expectInvalid("<length> <length> <length>", "0px 0px 0px");
}

TEST(SyntaxTest, RejectsAWideKeywordAsAnIdentifier) {
  expectInvalid("initial", "initial");
  expectInvalid("inherit", "inherit");
  expectInvalid("unset", "unset");
  expectInvalid("revert", "revert");
  expectInvalid("revert-layer", "revert-layer");
  expectInvalid("default", "default");
  expectInvalid("<length>|initial", "10px");
  expectInvalid("<length>|INHERIT", "10px");
  expectInvalid("<percentage>|unsEt", "2%");
  expectInvalid("<color>|REVert", "red");
  expectInvalid("<integer>|deFAUlt", "1");
}

TEST(SyntaxTest, RejectsAValueThatDoesNotMatchBeyondTheCommaAndSpaceRules) {
  expectInvalid("<length>+", "2px,7px,calc(8px)");
  expectInvalid("<length>#", "2px 7px calc(8px)");
  expectInvalid("<integer>+ | <percentage>+ | <length>+ ", "1 1%");
  expectInvalid("<integer>+ | <percentage>+ | <length>+ ", "1% 1");
  expectInvalid("<integer>+ | <percentage>+ | <length>+ ", "1px 1");
  expectInvalid("<integer>+ | <percentage>+ | <length>+ ", "1px 1%");
  expectInvalid("<length>+", "");
  expectInvalid("<length>#", "");
}

TEST(SyntaxTest, RejectsAWideKeywordAsAnInitialValue) {
  expectInvalid("*", "initial");
  expectInvalid("*", "inherit");
  expectInvalid("*", "unset");
  expectInvalid("*", "revert");
  expectInvalid("*", "revert-layer");
  expectInvalid("<custom-ident>", "initial");
  expectInvalid("<custom-ident>", "default");
  expectInvalid("<custom-ident>+", "foo initial bar");
  expectInvalid("<custom-ident>+", "foo default bar");
}

TEST(SyntaxTest, RejectsAnUnbalancedOrUnsafeUniversalValue) {
  expectInvalid("*", ")");
  expectInvalid("*", "([)]");
  expectInvalid("*", "whee!");
  expectInvalid("*", "\"\n");
  expectInvalid("*", "url(moo '')");
  expectInvalid("*", "semi;colon");
  expectInvalid("*", "var(invalid var ref)");
  expectInvalid("*", "var(--foo)");
}

TEST(SyntaxTest, RejectsAValueThatIsNotComputationallyIndependent) {
  expectInvalid("banana", "bAnAnA");
  expectInvalid("<length>", "var(--moo)");
  expectInvalid("<length>", "10");
  expectInvalid("<length>", "10%");
  expectInvalid("<length>", "calc(5px + 10%)");
  expectInvalid("<length>", "10em");
  expectInvalid("<length>", "calc(4px + 3em)");
  expectInvalid("<length>", "calc(4px + calc(8 * 2em))");
  expectInvalid("<length>+", "calc(2ex + 16px)");
  expectInvalid("<length>+", "10px calc(20px + 4rem)");
  expectInvalid("<length>", "10px;");
  expectInvalid("<length-percentage>", "calc(2px + 10% + 7ex)");
  expectInvalid("<percentage>", "0");
  expectInvalid("<integer>", "1.0");
  expectInvalid("<integer>", "1e0");
  expectInvalid("<number>|foo", "foo var(--foo, bla)");
  expectInvalid("Foo | bar", "foo");
  expectInvalid("Foo | bar", "Bar");
}

TEST(SyntaxTest, RejectsTheWrongUnitForAType) {
  expectInvalid("<angle>", "0");
  expectInvalid("<angle>", "10%");
  expectInvalid("<time>", "2px");
  expectInvalid("<resolution>", "10");
  expectInvalid("<resolution>", "-5.3dpcm");
  expectInvalid("<transform-function>", "scale()");
  expectInvalid("<transform-list>", "scale()");
  expectInvalid("<transform-list>+", "translateX(2px) rotate(20deg)");
  expectInvalid("<color>", "fancy-looking");
  expectInvalid("<image>", "banana.png");
  expectInvalid("<url>", "banana.png");
}

TEST(SyntaxTest, RejectsATransformInitialValueThatNeedsAComputedLength) {
  expectInvalid("<transform-function>", "translateX(1em)");
  expectInvalid("<transform-function>", "translateY(1lh)");
  expectInvalid("<transform-function>", "translateX(calc(1em + 2px))");
  expectInvalid("<transform-list>", "rotate(10deg) translateX(1em)");
  expectInvalid("<transform-list>", "rotate(10deg) translateY(1lh)");
  expectValid("<transform-function>", "translateX(10px)");
  expectValid("<transform-list>", "rotate(10deg) translateX(10px)");
}

TEST(SyntaxTest, TakesARelativeTransformWhenItIsDeclared) {
  const std::optional<Syntax> parsed = parseSyntax("<transform-function>");
  ASSERT_TRUE(parsed.has_value());
  EXPECT_TRUE(matchesSyntax(*parsed, "translateX(1em)", ValueContext::kDeclared, fakeColor));
}

TEST(SyntaxTest, RejectsAStringThatIsNotOne) {
  expectInvalid("<string>", "foo bar'");
  expectInvalid("<string>", "foo bar\"");
  expectInvalid("<string>", "\"foo\" bar");
  expectInvalid("<string>", "'foo' 2px");
  expectInvalid("<string>", "foo");
  expectInvalid("<string>", "1");
  expectInvalid("<string>", "calc(1 + 2)");
  expectInvalid("<string>", "rgb(255, 99, 71)");
  expectInvalid("<string>+", "foo 'bar'");
  expectInvalid("<string>#", "foo, 'bar'");
}

TEST(SyntaxTest, LetsADeclaredValueUseRelativeUnitsAndVarCalls) {
  const std::optional<Syntax> length = parseSyntax("<length>");
  ASSERT_TRUE(length.has_value());
  EXPECT_TRUE(matchesSyntax(*length, "10em", ValueContext::kDeclared, fakeColor));
  EXPECT_TRUE(matchesSyntax(*length, "calc(4px + 3em)", ValueContext::kDeclared, fakeColor));
  EXPECT_FALSE(matchesSyntax(*length, "10", ValueContext::kDeclared, fakeColor));
}

} // namespace
} // namespace symbiote

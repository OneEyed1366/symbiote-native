// The computed value of a typed property, as wpt `registered-property-computation.html` expects it
// `em` and `rem` are 16 px: the engine has no inherited font size to resolve them against
#include <gtest/gtest.h>

#include <map>
#include <optional>
#include <string>

#include "SymbioteComputedValue.h"
#include "SymbioteSyntax.h"

namespace symbiote {
namespace {

std::optional<long long> fakeColor(const std::string &token) {
  static const std::map<std::string, long long> known = {
      {"tomato", 0xFFFF6347}, {"plum", 0xFFDDA0DD}, {"transparent", 0x00000000}, {"#badbee33", 0x33BADBEE}};
  const auto found = known.find(token);
  if (found == known.end()) return std::nullopt;
  return found->second;
}

std::string computed(std::string_view syntaxText, std::string_view value) {
  const std::optional<Syntax> syntax = parseSyntax(syntaxText);
  EXPECT_TRUE(syntax.has_value()) << syntaxText;
  if (!syntax.has_value()) return "";
  return computedText(*syntax, value, fakeColor);
}

TEST(ComputedValueTest, KeepsAnAbsoluteLengthAndResolvesRelativeOnes) {
  EXPECT_EQ(computed("<length>", "12px"), "12px");
  EXPECT_EQ(computed("<length>", "14em"), "224px");
  EXPECT_EQ(computed("<length>", "1rem"), "16px");
  EXPECT_EQ(computed("<length>", "0"), "0px");
}

TEST(ComputedValueTest, ConvertsPhysicalLengthUnitsToPixels) {
  EXPECT_EQ(computed("<length>", "1in"), "96px");
  EXPECT_EQ(computed("<length>", "2.54cm"), "96px");
  EXPECT_EQ(computed("<length>", "25.4mm"), "96px");
  EXPECT_EQ(computed("<length>", "6pc"), "96px");
  EXPECT_EQ(computed("<length>", "72pt"), "96px");
}

TEST(ComputedValueTest, FoldsACalcOfLengthsIntoOneLength) {
  EXPECT_EQ(computed("<length>", "calc(20px + 40px)"), "60px");
  EXPECT_EQ(computed("<length>", "calc(14em + 10px)"), "234px");
  EXPECT_EQ(computed("<length>", "calc(10px - 1em)"), "-6px");
}

TEST(ComputedValueTest, LeavesAUnitItCannotResolveUntouched) {
  EXPECT_EQ(computed("<length>", "10vh"), "10vh");
  EXPECT_EQ(computed("<length>", "calc(16px - 7em + 10vh)"), "calc(16px - 7em + 10vh)");
}

TEST(ComputedValueTest, KeepsAPercentageBesideAResolvedLength) {
  EXPECT_EQ(computed("<length-percentage>", "17em"), "272px");
  EXPECT_EQ(computed("<length-percentage>", "18%"), "18%");
  EXPECT_EQ(computed("<length-percentage>", "calc(19em - 2%)"), "calc(-2% + 304px)");
  EXPECT_EQ(computed("<length-percentage>", "calc(13% + 37px)"), "calc(13% + 37px)");
  EXPECT_EQ(computed("<length-percentage>", "calc(50% - 1em)"), "calc(50% - 16px)");
}

TEST(ComputedValueTest, ComputesEveryItemOfAList) {
  EXPECT_EQ(computed("<length>#", "10px, 3em"), "10px, 48px");
  EXPECT_EQ(computed("<length>#", "4em ,9px"), "64px, 9px");
  EXPECT_EQ(computed("<length>#", "8em"), "128px");
  EXPECT_EQ(computed("<length>+", "10px 3em"), "10px 48px");
  EXPECT_EQ(computed("<length-percentage>#", "calc(50% + 1em), 4px"), "calc(50% + 16px), 4px");
}

TEST(ComputedValueTest, RoundsAnIntegerAndFoldsItsCalc) {
  EXPECT_EQ(computed("<integer>", "15"), "15");
  EXPECT_EQ(computed("<integer>", "calc(15 + 15)"), "30");
  EXPECT_EQ(computed("<integer>", "calc(2.4)"), "2");
  EXPECT_EQ(computed("<integer>", "calc(2.6)"), "3");
  EXPECT_EQ(computed("<integer>", "calc(2.6 + 3.1)"), "6");
  EXPECT_EQ(computed("<integer>+", "15 calc(2.4) calc(2.6)"), "15 2 3");
}

TEST(ComputedValueTest, FoldsANumberCalc) {
  EXPECT_EQ(computed("<number>", "15"), "15");
  EXPECT_EQ(computed("<number>", "calc(15 + 15)"), "30");
  EXPECT_EQ(computed("<number>", "calc(24 / 10)"), "2.4");
  EXPECT_EQ(computed("<number>+", "15 calc(15 + 15) calc(24 / 10)"), "15 30 2.4");
}

TEST(ComputedValueTest, ConvertsAnAngleToDegrees) {
  EXPECT_EQ(computed("<angle>", "180deg"), "180deg");
  EXPECT_EQ(computed("<angle>", "400grad"), "360deg");
  EXPECT_EQ(computed("<angle>", "calc(360deg + 400grad)"), "720deg");
  EXPECT_EQ(computed("<angle>", "0.5turn"), "180deg");
}

TEST(ComputedValueTest, ConvertsATimeToSeconds) {
  EXPECT_EQ(computed("<time>", "1s"), "1s");
  EXPECT_EQ(computed("<time>", "1000ms"), "1s");
  EXPECT_EQ(computed("<time>", "calc(1000ms + 1s)"), "2s");
  EXPECT_EQ(computed("<time>", "250ms"), "0.25s");
}

TEST(ComputedValueTest, ConvertsAResolutionToDppx) {
  EXPECT_EQ(computed("<resolution>", "1dppx"), "1dppx");
  EXPECT_EQ(computed("<resolution>", "96dpi"), "1dppx");
  EXPECT_EQ(computed("<resolution>", "calc(1dppx + 96dpi)"), "2dppx");
  EXPECT_EQ(computed("<resolution>", "2x"), "2dppx");
}

TEST(ComputedValueTest, SerializesAColorAsRgb) {
  EXPECT_EQ(computed("<color>", "tomato"), "rgb(255, 99, 71)");
  EXPECT_EQ(computed("<color>", "plum"), "rgb(221, 160, 221)");
  EXPECT_EQ(computed("<color>", "#badbee33"), "rgba(186, 219, 238, 0.2)");
  EXPECT_EQ(computed("<color>", "transparent"), "rgba(0, 0, 0, 0)");
}

TEST(ComputedValueTest, LeavesWhatIsNotAComputedTypeAlone) {
  EXPECT_EQ(computed("*", "50s"), "50s");
  EXPECT_EQ(computed("*", "-50grad"), "-50grad");
  EXPECT_EQ(computed("tomato | plum", "plum"), "plum");
  EXPECT_EQ(computed("tomato | plum | <color>", "plum"), "plum");
  EXPECT_EQ(computed("*", "url(why)"), "url(why)");
}

TEST(ComputedValueTest, WritesAStringWithDoubleQuotes) {
  EXPECT_EQ(computed("<string>", "'foo bar'"), "\"foo bar\"");
  EXPECT_EQ(computed("<string>", " 'foo bar' "), "\"foo bar\"");
  EXPECT_EQ(computed("<string>", "'\"foo\" bar'"), "\"\\\"foo\\\" bar\"");
  EXPECT_EQ(computed("<string>", "\"bar baz\""), "\"bar baz\"");
  EXPECT_EQ(computed("<string>", "\"bar 'baz'\""), "\"bar 'baz'\"");
  EXPECT_EQ(computed("<string>", "'it\\'s'"), "\"it's\"");
  EXPECT_EQ(computed("<string>+", "'foo' 'bar'"), "\"foo\" \"bar\"");
  EXPECT_EQ(computed("<string>#", "'foo', 'bar'"), "\"foo\", \"bar\"");
  EXPECT_EQ(computed("<string># | <string>+", "\"foo\", 'bar'"), "\"foo\", \"bar\"");
}

TEST(ComputedValueTest, ComputesTheArgumentsOfATransform) {
  EXPECT_EQ(computed("<transform-function>", "rotate(42deg)"), "rotate(42deg)");
  EXPECT_EQ(computed("<transform-function>", "scale(calc(2 + 2))"), "scale(4)");
  EXPECT_EQ(computed("<transform-function>", "translateX(10em)"), "translateX(160px)");
  EXPECT_EQ(computed("<transform-function>", "translateX(calc(11em + 10%))"), "translateX(calc(10% + 176px))");
  EXPECT_EQ(computed("<transform-function>", "translate(1px,calc(1px + 1px))"), "translate(1px, 2px)");
  EXPECT_EQ(computed("<transform-list>", "scale(calc(2 + 1)) translateX(calc(3px + 1px))"), "scale(3) translateX(4px)");
  EXPECT_EQ(computed("<transform-list>", "rotateX(0deg) translateX(10px)"), "rotateX(0deg) translateX(10px)");
  EXPECT_EQ(computed("<transform-function>+", "translateX(10%) scale(2)"), "translateX(10%) scale(2)");
}

TEST(ComputedValueTest, ComputesTheFirstAlternativeThatMatches) {
  EXPECT_EQ(computed("<length> | none", "2em"), "32px");
  EXPECT_EQ(computed("<length> | none", "none"), "none");
}

} // namespace
} // namespace symbiote

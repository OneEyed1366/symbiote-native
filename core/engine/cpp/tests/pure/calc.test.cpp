// `calc()` over px, rem and plain numbers, the layer-1 slice of decision 39
#include <gtest/gtest.h>

#include <optional>

#include "SymbioteCalc.h"

namespace symbiote {
namespace {

void expectLength(std::string_view text, double pixels) {
  const std::optional<CalcResult> result = evaluateCalc(text);
  ASSERT_TRUE(result.has_value()) << text;
  EXPECT_EQ(result->kind, CalcKind::kLength) << text;
  EXPECT_DOUBLE_EQ(result->value, pixels) << text;
}

void expectInvalid(std::string_view text) {
  EXPECT_FALSE(evaluateCalc(text).has_value()) << text;
}

TEST(CalcTest, AddsLengthsOfOneUnit) {
  expectLength("calc(1px + 2px)", 3);
}

TEST(CalcTest, ConvertsRemAndEmToPixelsAgainstTheRootFontSize) {
  expectLength("calc(1rem + 2px)", 18);
  expectLength("calc(0.5em * 2)", 16);
}

TEST(CalcTest, SubtractsAndNegates) {
  expectLength("calc(10px - 4px)", 6);
  expectLength("calc(-1 * 4px)", -4);
}

TEST(CalcTest, MultipliesAndDividesByANumber) {
  expectLength("calc(2 * 8px)", 16);
  expectLength("calc(8px * 2)", 16);
  expectLength("calc(16px / 2)", 8);
}

TEST(CalcTest, KeepsMultiplicationAheadOfAddition) {
  expectLength("calc(1px + 2px * 3)", 7);
  expectLength("calc((1px + 2px) * 2)", 6);
}

TEST(CalcTest, AcceptsANestedCalcAndAnyCase) {
  expectLength("calc(1px + calc(2px * 2))", 5);
  expectLength("CALC(1px + 2px)", 3);
}

TEST(CalcTest, KeepsAPlainNumberAndAPercentageAsTheirOwnKind) {
  const std::optional<CalcResult> number = evaluateCalc("calc(2 * 3)");
  ASSERT_TRUE(number.has_value());
  EXPECT_EQ(number->kind, CalcKind::kNumber);
  EXPECT_DOUBLE_EQ(number->value, 6);

  const std::optional<CalcResult> percent = evaluateCalc("calc(50% + 25%)");
  ASSERT_TRUE(percent.has_value());
  EXPECT_EQ(percent->kind, CalcKind::kPercent);
  EXPECT_DOUBLE_EQ(percent->value, 75);
}

TEST(CalcTest, RefusesAPercentageMixedWithALength) {
  expectInvalid("calc(100% - 8px)");
}

TEST(CalcTest, RefusesANumberAddedToALength) {
  expectInvalid("calc(1px + 2)");
}

TEST(CalcTest, RefusesAProductOfTwoLengths) {
  expectInvalid("calc(2px * 3px)");
}

TEST(CalcTest, ClampsADivisionByZeroToTheLargestLengthAndNaNToZero) {
  expectLength("calc(4px / 0)", kLargestUsedValue);
  expectLength("calc(-4px / 0)", -kLargestUsedValue);
  expectLength("calc(0px / 0)", 0);
}

// Ported from wpt `css/css-values/calc-unit-analysis.html`, `calc-invalid-parsing.html`,
// `calc-parenthesis-stack.html` and `calc-in-calc.html`
TEST(CalcTest, FollowsTheWptTypeChecking) {
  expectLength("calc(0px)", 0);
  expectLength("calc(2px * 2)", 4);
  expectLength("calc(2 * 2px)", 4);
  expectInvalid("calc(2 + 1px)");
  expectInvalid("calc(1px - 2)");
  expectInvalid("calc(2 - 1px)");
  expectInvalid("calc(2px * 1px)");
  expectInvalid("calc(20 / 0.75rem)");
}

TEST(CalcTest, RefusesAWordAndABracketInsideTheExpression) {
  expectInvalid("calc(7px * up)");
  expectInvalid("calc([])");
  expectInvalid("calc( [])");
}

TEST(CalcTest, AcceptsThirtyTwoNestedParenthesesAndACalcInACalc) {
  const std::string deep = "calc(" + std::string(32, '(') + "100%" + std::string(32, ')') + ")";
  const std::optional<CalcResult> percent = evaluateCalc(deep);
  ASSERT_TRUE(percent.has_value());
  EXPECT_EQ(percent->kind, CalcKind::kPercent);
  EXPECT_DOUBLE_EQ(percent->value, 100);
  const std::optional<CalcResult> nested = evaluateCalc("calc(calc(100%))");
  ASSERT_TRUE(nested.has_value());
  EXPECT_DOUBLE_EQ(nested->value, 100);
}

TEST(CalcTest, RequiresSpacesAroundPlusAndMinus) {
  expectInvalid("calc(1px+2px)");
  expectInvalid("calc(1px -2px)");
}

TEST(CalcTest, RefusesMalformedInput) {
  expectInvalid("calc(1px +)");
  expectInvalid("calc()");
  expectInvalid("calc(1px");
  expectInvalid("calc(1px) 2px");
  expectInvalid("1px + 2px");
  expectInvalid("calc(1vw + 2px)");
}

} // namespace
} // namespace symbiote

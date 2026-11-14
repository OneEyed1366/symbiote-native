// Typed `calc()` arithmetic and math functions, ported from wpt `css/css-values` with `em` at 16px
// Not ported: a percentage resolved against a box, `sibling-index()`, `infinity` and `NaN`
#include <gtest/gtest.h>

#include <cmath>
#include <optional>
#include <string>

#include "SymbioteCalc.h"
#include "SymbioteComputedValue.h"
#include "SymbioteMath.h"
#include "SymbioteSyntax.h"
#include "SymbioteSyntaxNumber.h"

namespace symbiote {
namespace {

constexpr double kTolerance = 1e-6;

std::optional<MathValue> mathOf(const std::string &expression) {
  return parseMath("calc(" + expression + ")");
}

MathValue mustParse(const std::string &expression) {
  const std::optional<MathValue> value = mathOf(expression);
  EXPECT_TRUE(value.has_value()) << expression;
  return value.value_or(MathValue{});
}

void expectLength(const std::string &expression, double pixels) {
  const MathValue value = mustParse(expression);
  EXPECT_EQ(value.type.length, 1) << expression;
  EXPECT_EQ(value.type.angle + value.type.time + value.type.resolution, 0) << expression;
  EXPECT_FALSE(value.type.hasPercent) << expression;
  EXPECT_NEAR(value.amount, pixels, kTolerance) << expression;
}

void expectNumber(const std::string &expression, double number) {
  const MathValue value = mustParse(expression);
  EXPECT_EQ(value.type.length + value.type.angle + value.type.time + value.type.resolution, 0)
      << expression;
  EXPECT_FALSE(value.type.hasPercent) << expression;
  EXPECT_NEAR(value.amount, number, kTolerance) << expression;
}

void expectTime(const std::string &expression, double seconds) {
  const MathValue value = mustParse(expression);
  EXPECT_EQ(value.type.time, 1) << expression;
  EXPECT_NEAR(value.amount, seconds, kTolerance) << expression;
}

void expectAngle(const std::string &expression, double degrees) {
  const MathValue value = mustParse(expression);
  EXPECT_EQ(value.type.angle, 1) << expression;
  EXPECT_NEAR(value.amount, degrees, kTolerance) << expression;
}

void expectInvalid(const std::string &expression) {
  EXPECT_FALSE(mathOf(expression).has_value()) << expression;
}

TEST(MathTest, MultipliesAndDividesLengthsByTheirDimensions) {
  expectLength("5px * 3px / 6px", 2.5);
  expectLength("2px * 3px / 1px", 6);
  expectNumber("6px / 3px", 2);
  expectNumber("1in / 1px", 96);
}

TEST(MathTest, KeepsTheWptUnitAnalysisRefusals) {
  const MathValue square = mustParse("2px * 1px");
  EXPECT_EQ(square.type.length, 2);
  const MathValue inverse = mustParse("20 / 0.75rem");
  EXPECT_EQ(inverse.type.length, -1);
  expectInvalid("2 + 1px");
  expectInvalid("1px - 2");
  expectInvalid("1px + 1s");
  expectInvalid("1px + 1deg");
}

TEST(MathTest, ConvertsAbsoluteUnitsToPixelsAndTimeToSeconds) {
  expectLength("1in + 1pc + 6pt", 96 + 16 + 8);
  expectLength("2.54cm", 96);
  expectLength("25.4mm", 96);
  expectLength("101.6Q", 96);
  expectTime("1s + 500ms", 1.5);
  expectAngle("1turn + 90deg", 450);
  expectAngle("200grad", 180);
}

TEST(MathTest, TakesTheSmallestAndTheLargestOfLengths) {
  expectLength("min(1px)", 1);
  expectLength("max(1in)", 96);
  expectLength("min(1px, 2px)", 1);
  expectLength("max(1px, 2px)", 2);
  expectLength("min(95px, 1in)", 95);
  expectLength("max(95px, 1in)", 96);
  expectLength("min(1em, 2em)", 16);
  expectLength("max(1rem, 2rem)", 32);
}

TEST(MathTest, ComparesAbsoluteAgainstRelativeLengths) {
  expectLength("min(15px, 1em)", 15);
  expectLength("min(25px, 1em)", 16);
  expectLength("max(15px, 1em)", 16);
  expectLength("max(25px, 1em)", 25);
}

TEST(MathTest, NestsMinAndMaxAndFoldsThemIntoArithmetic) {
  expectLength("min(25px, max(15px, 1em))", 16);
  expectLength("max(15px, min(25px, 1em))", 16);
  expectLength("min(1em, 21px) + 10px", 26);
  expectLength("max(1em, 19px) * 2", 38);
  expectLength("min(1em + 1px, 22px) - max(0.9em, 20px)", -3);
}

TEST(MathTest, ClampsBetweenAMinimumAndAMaximum) {
  expectLength("clamp(10px, 20px, 30px)", 20);
  expectLength("clamp(10px, 5px, 30px)", 10);
  expectLength("clamp(10px, 35px, 30px)", 30);
  expectLength("clamp(30px, 100px, 20px)", 30);
  expectLength("clamp(-30px, -100px, -10px)", -30);
  expectLength("clamp(-10px, 100px, -30px)", -10);
  expectLength("0px - clamp(30px, 100px, 20px)", -30);
}

TEST(MathTest, LetsClampDropABoundWithNone) {
  expectLength("clamp(none, 5px, 10px)", 5);
  expectLength("clamp(none, 50px, 10px)", 10);
  expectLength("clamp(10px, 5px, none)", 10);
  expectLength("clamp(none, 5px, none)", 5);
}

TEST(MathTest, TakesTheAbsoluteValueAndTheSign) {
  expectNumber("abs(-1)", 1);
  expectNumber("sign(-1)", -1);
  expectNumber("abs(sign(sign(1) + sign(1)))", 1);
  expectLength("abs(-10px)", 10);
  expectNumber("abs(0.1 + 0.2) * -2", -0.6);
  expectNumber("20 - abs(-10)", 10);
  expectNumber("10 - abs(10 - abs(-30))", -10);
  expectNumber("10 - abs(20 - sign(2 - abs(-20)))", -11);
  expectNumber("sign(0)", 0);
}

TEST(MathTest, GivesTheSignOfAnyDimensionAsANumber) {
  expectNumber("sign(1px)", 1);
  expectNumber("sign(-1in)", -1);
  expectNumber("sign(-1em)", -1);
  expectNumber("sign(1s)", 1);
  expectNumber("sign(-1turn)", -1);
  expectNumber("sign(0px)", 0);
}

TEST(MathTest, ScalesALengthBySignOfALengthDifference) {
  expectLength("15px + (sign(20px - 10px) * 5px)", 20);
  expectLength("15px + (sign(10px - 20px) * 5px)", 10);
}

TEST(MathTest, RoundsToAMultipleWithEachStrategy) {
  expectNumber("round(100, 10)", 100);
  expectNumber("round(up, 101, 10)", 110);
  expectNumber("round(down, 106, 10)", 100);
  expectNumber("round(to-zero, 105, 10)", 100);
  expectNumber("round(to-zero, -105, 10)", -100);
  expectNumber("round(up, -103, 10)", -100);
  expectNumber("round(nearest, 14, 10)", 10);
  expectNumber("round(16, 10)", 20);
}

TEST(MathTest, RoundsTiesTowardPositiveInfinity) {
  expectNumber("round(15, 10)", 20);
  expectNumber("round(-15, 10)", -10);
}

TEST(MathTest, RoundsLengthsTimesAndAngles) {
  expectLength("round(10px, 6px)", 12);
  expectLength("round(10in, 6in)", 1152);
  expectLength("round(2rem, 5px)", 30);
  expectLength("round(100px, 1rem)", 96);
  expectTime("round(10s, 6s)", 12);
  expectTime("round(10s, 6000ms)", 12);
  expectAngle("round(10deg, 6deg)", 12);
}

TEST(MathTest, DefaultsTheRoundingIntervalOfANumberToOne) {
  expectNumber("round(2.4)", 2);
  expectNumber("round(up, 2.1)", 3);
  expectInvalid("round(2.4px)");
}

TEST(MathTest, TakesTheModulusWithTheSignOfTheDivisorAndTheRemainderOfTheDividend) {
  expectNumber("mod(18, 5)", 3);
  expectNumber("rem(18, 5)", 3);
  expectNumber("mod(-18, 5)", 2);
  expectNumber("rem(-18, 5)", -3);
  expectNumber("mod(-140, -90)", -50);
  expectNumber("mod(140, -90)", -40);
  expectNumber("rem(140, -90)", 50);
  expectNumber("mod(1, 1)", 0);
}

TEST(MathTest, TakesTheModulusOfLengthsAndTimes) {
  expectLength("mod(10px, 6px)", 4);
  expectLength("rem(10in, 6in)", 384);
  expectLength("mod(2rem, 5px)", 2);
  expectLength("mod(100px, 1rem)", 4);
  expectTime("mod(10s, 6000ms)", 4);
  expectTime("mod(10000ms, 6s)", 4);
}

TEST(MathTest, NestsRoundingAndModulus) {
  expectNumber("round(up, round(100, 10) + 1, 10)", 110);
  expectNumber("round(to-zero, round(100, 10) * 2 - 95, 10)", 100);
  expectNumber("mod(18, 5) * 2 + mod(17, 5)", 8);
  expectNumber("rem(mod(18, 5), mod(17, 5))", 1);
  expectNumber("mod(rem(1, 18) * -1, 5)", 4);
}

TEST(MathTest, RaisesToAPowerAndTakesARoot) {
  expectNumber("pow(1, 1)", 1);
  expectNumber("sqrt(1)", 1);
  expectNumber("sqrt(pow(1, 1))", 1);
  expectLength("100px * pow(2, pow(2, 2))", 1600);
  expectLength("1px * pow(2, 3)", 8);
  expectLength("100px * sqrt(100)", 1000);
  expectLength("3px * pow(20, 4)", 480000);
  expectLength("2px * sqrt(100000000)", 20000);
  expectNumber("hypot(pow((1 + sqrt(1)) / 2, sqrt(1)))", 1);
}

TEST(MathTest, TakesTheHypotenuseOfLengthsAndTimes) {
  expectLength("hypot(3px, 4px)", 5);
  expectLength("hypot(-5px)", 5);
  expectLength("100px * hypot(3, 4)", 500);
  expectLength("-2 * hypot(3px, 4px)", -10);
  expectLength("hypot(1in)", 96);
  expectLength("hypot(1em)", 16);
  expectTime("hypot(1ms)", 0.001);
  expectLength("hypot(3e+9px, 4e+9px)", 5e+9);
}

TEST(MathTest, TakesLogarithmsAndExponentialsWithTheConstants) {
  expectNumber("log(1)", 0);
  expectNumber("log(10, 10)", 1);
  expectNumber("exp(0)", 1);
  expectNumber("log(e)", 1);
  expectNumber("e - exp(1)", 0);
  expectNumber("exp(log(1) + exp(0) * 2)", 7.38905609893065);
  expectNumber("log(log(1) + exp(0) * 20, 10)", 1.30102999566398);
  expectNumber("log((3 + 1) / 2, 2) / log(e, e) + exp(0 * 1) * 2 * log(e, e)", 3);
  expectNumber("pi * 2", 6.28318530717959);
}

// The ported trigonometry pages compare within 0.1
void expectNumberWithin(const std::string &expression, double number) {
  const MathValue value = mustParse(expression);
  EXPECT_EQ(value.type.length + value.type.angle + value.type.time + value.type.resolution, 0)
      << expression;
  EXPECT_NEAR(value.amount, number, 0.1) << expression;
}

void expectAngleWithin(const std::string &expression, double degrees) {
  const MathValue value = mustParse(expression);
  EXPECT_EQ(value.type.angle, 1) << expression;
  EXPECT_NEAR(value.amount, degrees, 0.1) << expression;
}

TEST(MathTest, TakesSineCosineAndTangentOfANumberOrAnAngle) {
  expectNumberWithin("sin(0)", 0);
  expectNumberWithin("cos(0)", 1);
  expectNumberWithin("tan(0)", 0);
  expectNumberWithin("tan(315deg)", -1);
  expectNumberWithin("tan(360deg)", 0);
  expectNumberWithin("tan(405deg)", 1);
  expectNumberWithin("sin(pi/2 - pi/2)", 0);
  expectNumberWithin("cos(pi - 3.14159265358979323846)", 1);
  expectNumberWithin("cos(e - 2.7182818284590452354)", 1);
  expectNumberWithin("sin(30deg + 1.0471967rad)", 1);
  expectNumberWithin("cos(30deg - 0.523599rad)", 1);
  expectNumberWithin("sin(3.14159 / 2 + 1 - 1)", 1);
  expectNumberWithin("sin(100grad)", 1);
  expectNumberWithin("tan(30deg + 0.261799rad)", 1);
  expectNumberWithin("tan(0.7853975rad)", 1);
  expectNumberWithin("sin(0.25turn)", 1);
  expectNumberWithin("cos(sin(cos(pi) + 1))", 1);
  expectNumberWithin("sin(tan(pi/4)*pi/2)", 1);
}

TEST(MathTest, TakesInverseTrigonometryOfANumberAsAnAngle) {
  expectAngleWithin("asin(sin(pi/2))", 90);
  expectAngleWithin("acos(cos(pi - 3.14159265358979323846))", 0);
  expectAngleWithin("atan(e - 2.7182818284590452354)", 0);
  expectAngleWithin("asin(sin(30deg + 1.0471967rad))", 90);
  expectAngleWithin("acos(cos(30deg - 0.523599rad))", 0);
  expectAngleWithin("asin(sin(100grad))", 90);
  expectAngleWithin("atan(tan(30deg + 0.261799rad))", 45);
  expectAngleWithin("asin(sin(0.25turn))", 90);
  expectNumberWithin("cos(sin(acos(cos(pi))))", 1);
}

TEST(MathTest, TakesTheArcTangentOfTwoValuesOfOneType) {
  expectAngleWithin("atan2(0, 1)", 0);
  expectAngleWithin("atan2(0, -1) / 4", 45);
  expectAngleWithin("atan2(1, -1)", 135);
  expectAngleWithin("atan2(-1, 1)", -45);
  expectAngleWithin("atan2(1px, -1px)", 135);
  expectAngleWithin("atan2(1in, -1in)", 135);
  expectAngleWithin("atan2(1em, -1em)", 135);
  expectAngleWithin("atan2(1rem + 1px - 1px, -1rem)", 135);
  expectAngleWithin("atan2(1deg, -1deg)", 135);
  expectAngleWithin("atan2(1turn, -1turn)", 135);
  expectAngleWithin("atan2(1s, -1s)", 135);
  expectAngleWithin("atan2(1ms, -1ms)", 135);
}

TEST(MathTest, MarksTheArcTangentOfViewportLengthsOpaque) {
  const MathValue value = mustParse("atan2(1vh, -1vh)");
  EXPECT_TRUE(value.isOpaque);
  EXPECT_EQ(value.type.angle, 1);
}

TEST(MathTest, RefusesTrigonometryOfTheWrongTypeOrCount) {
  expectInvalid("sin(1px)");
  expectInvalid("cos(1s)");
  expectInvalid("tan(1%)");
  expectInvalid("sin()");
  expectInvalid("sin(1, 2)");
  expectInvalid("asin(1deg)");
  expectInvalid("acos(1px)");
  expectInvalid("atan(1s)");
  expectInvalid("atan2(1px, 1)");
  expectInvalid("atan2(1)");
  expectInvalid("atan2(1, 2, 3)");
}

TEST(MathTest, RefusesAMathFunctionOfTheWrongType) {
  expectInvalid("min(1px, 2)");
  expectInvalid("max(1px, 1s)");
  expectInvalid("clamp(1px, 2, 3px)");
  expectInvalid("pow(2px, 2)");
  expectInvalid("sqrt(4px)");
  expectInvalid("exp(1px)");
  expectInvalid("log(1px)");
  expectInvalid("mod(1px, 2)");
  expectInvalid("rem(1, 2px)");
  expectInvalid("sign(abs)");
}

TEST(MathTest, RefusesAMalformedMathFunction) {
  expectInvalid("min()");
  expectInvalid("min(1px,)");
  expectInvalid("min(, 1px)");
  expectInvalid("clamp(1px, 2px)");
  expectInvalid("clamp(1px, 2px, 3px, 4px)");
  expectInvalid("abs(1, 2)");
  expectInvalid("sign()");
  expectInvalid("round(up)");
  expectInvalid("round(sideways, 5, 10)");
  expectInvalid("mod(1)");
  expectInvalid("pow(1)");
  expectInvalid("unknown(1)");
}

TEST(MathTest, RefusesTheWptSyntaxErrorsOfEveryFunction) {
  const char *const functions[] = {"min", "max", "clamp", "abs", "sign", "round", "mod",
                                   "rem", "hypot", "sqrt", "pow", "exp", "log"};
  const char *const arguments[] = {"", " ", ",", "1, ", ", 1", "1 + ", "1 - ", "1 * ", "1 / ",
                                   "1 2", "1, , 2"};
  for (const char *function : functions) {
    for (const char *argument : arguments) {
      expectInvalid(std::string(function) + "(" + argument + ")");
    }
  }
}

TEST(MathTest, RefusesTheWptSyntaxErrorsOfLengthArguments) {
  expectInvalid("min(1py)");
  expectInvalid("max(1px 2px)");
  expectInvalid("clamp(1px 1px 1px)");
  expectInvalid("clamp(1px, 1px, 1px, )");
  expectInvalid("clamp(, 1px, 1px)");
  expectInvalid("round(1, nearest, 12)");
  expectInvalid("round(1, nearest)");
  expectInvalid("round(nearest, 1, nearest)");
  expectInvalid("round(nearest, 1 2)");
  expectInvalid("abs(1, 0px)");
  expectInvalid("sign(1, 1%)");
  expectInvalid("sqrt(1, 2)");
  expectInvalid("exp(1, 0s)");
}

TEST(MathTest, RefusesTheWptTypeErrors) {
  expectInvalid("min(1px, 0)");
  expectInvalid("min(1px, 0s)");
  expectInvalid("min(1px, 0dpi)");
  expectInvalid("clamp(0, 10rem, 100%)");
  expectInvalid("sign(10px + 5rad)");
  expectInvalid("pow(10, 1px)");
  expectInvalid("hypot(2px, 3)");
  expectInvalid("pow(2px, 3px)");
  expectInvalid("mod(1, 1%)");
  expectInvalid("round(1, 0px)");
  expectInvalid("rem(1, 0deg)");
  expectInvalid("log(1, 0px)");
  expectInvalid("1px * pow(2 3)");
}

bool isPositiveInfinity(const std::string &expression) {
  const MathValue value = mustParse(expression);
  return std::isinf(value.amount) && value.amount > 0;
}

bool isNegativeInfinity(const std::string &expression) {
  const MathValue value = mustParse(expression);
  return std::isinf(value.amount) && value.amount < 0;
}

bool isNotANumber(const std::string &expression) {
  return std::isnan(mustParse(expression).amount);
}

TEST(MathTest, DividesByZeroToInfinityOrNaN) {
  EXPECT_TRUE(isPositiveInfinity("1 / 0"));
  EXPECT_TRUE(isNegativeInfinity("-1 / 0"));
  EXPECT_TRUE(isNotANumber("0 / 0"));
  EXPECT_TRUE(isPositiveInfinity("100px / 0"));
  EXPECT_TRUE(isPositiveInfinity("100px / (2 - 2)"));
  EXPECT_TRUE(isPositiveInfinity("100px * (1 / (2 - (-62 + 64)))"));
  EXPECT_TRUE(isNotANumber("100px * 0 / 0"));
  EXPECT_TRUE(isPositiveInfinity("4px / 0px"));
  EXPECT_EQ(mustParse("100px / 0").type.length, 1);
}

TEST(MathTest, ReadsTheConstantsInfinityAndNaNInAnyCase) {
  EXPECT_TRUE(isPositiveInfinity("infinity"));
  EXPECT_TRUE(isNegativeInfinity("-infinity"));
  EXPECT_TRUE(isPositiveInfinity("1px * iNFinIty"));
  EXPECT_TRUE(isNegativeInfinity("1px * -infinity"));
  EXPECT_TRUE(isNotANumber("NaN"));
  EXPECT_TRUE(isNotANumber("1px * nan"));
  EXPECT_EQ(mustParse("1px * infinity").type.length, 1);
}

// Ported from wpt `calc-infinity-nan-serialize-length` and `-number`
TEST(MathTest, CombinesInfinitiesAsIEEEDoes) {
  EXPECT_TRUE(isNotANumber("1px * infinity / infinity"));
  EXPECT_TRUE(isNotANumber("1px * 0 * infinity"));
  EXPECT_TRUE(isNotANumber("1px * (infinity + -infinity)"));
  EXPECT_TRUE(isNotANumber("1px * (infinity - infinity)"));
  EXPECT_TRUE(isPositiveInfinity("1px * (infinity + infinity)"));
  EXPECT_TRUE(isNegativeInfinity("1px * (-infinity + -infinity)"));
  EXPECT_TRUE(isPositiveInfinity("1px * -infinity * -infinity"));
  expectLength("1px * 1/infinity", 0);
}

TEST(MathTest, LetsNaNWinAnyComparisonAndInfinityBeClamped) {
  EXPECT_TRUE(isPositiveInfinity("1 * max(INFinity*3, 0)"));
  expectNumber("1 * min(inFInity*4, 0)", 0);
  EXPECT_TRUE(isNotANumber("1 * max(nAn*2, 0)"));
  EXPECT_TRUE(isNotANumber("1 * min(nan*3, 0)"));
  EXPECT_TRUE(isNotANumber("1px * max(NaN, min(0,10))"));
  EXPECT_TRUE(isNotANumber("1px * max(0, min(10, NaN))"));
  EXPECT_TRUE(isNotANumber("1px * max(0, min(NaN, 10))"));
  EXPECT_TRUE(isNotANumber("1px * clamp(NaN, 0, 10)"));
  EXPECT_TRUE(isNotANumber("1px * clamp(0, 10, NaN)"));
  EXPECT_TRUE(isNotANumber("1px * clamp(0, NaN, 10)"));
  expectNumber("1 * clamp(-INFINITY*20, 0, infiniTY*10)", 0);
  expectLength("1px * clamp(-Infinity, 0, infinity)", 0);
  expectLength("1px * clamp(-inFinity, infinity, 10)", 10);
  EXPECT_TRUE(isNotANumber("1 * min(NaN * 1pt, NaN * 1cm)"));
  EXPECT_TRUE(isNotANumber("abs(NaN)"));
  EXPECT_TRUE(isPositiveInfinity("abs(-infinity)"));
}

TEST(MathTest, KeepsAValueThatIsNotFiniteOutOfFunctions) {
  EXPECT_TRUE(isNotANumber("mod(5, 0)"));
  EXPECT_TRUE(isNotANumber("rem(5, 0)"));
  EXPECT_TRUE(isNotANumber("round(5, 0)"));
  EXPECT_TRUE(isNegativeInfinity("log(0)"));
  EXPECT_TRUE(isNotANumber("sqrt(-1)"));
  EXPECT_TRUE(isPositiveInfinity("exp(1000)"));
  EXPECT_TRUE(isNotANumber("asin(2)"));
  EXPECT_TRUE(isNotANumber("acos(-2)"));
  EXPECT_TRUE(isNotANumber("sign(NaN)"));
}

TEST(MathTest, KeepsAZeroNextToInfinityOutOfThePercentagePart) {
  const MathValue length = mustParse("1px * infinity");
  EXPECT_FALSE(length.type.hasPercent);
  EXPECT_EQ(length.percent, 0);
  const MathValue percent = mustParse("50% * infinity");
  EXPECT_TRUE(std::isinf(percent.percent));
  EXPECT_EQ(percent.amount, 0);
}

TEST(MathTest, MarksAValueItCannotKnowAsOpaque) {
  const MathValue viewport = mustParse("min(1vw, 2vw)");
  EXPECT_TRUE(viewport.isOpaque);
  EXPECT_EQ(viewport.type.length, 1);
  EXPECT_TRUE(mustParse("1ch + 2px").isOpaque);
  EXPECT_FALSE(mustParse("1em + 2px").isOpaque);
  EXPECT_TRUE(mustParse("1em + 2px").isRelative);
  EXPECT_FALSE(mustParse("1in + 2px").isRelative);
}

TEST(MathTest, KeepsAPercentageApartFromALength) {
  const MathValue mixed = mustParse("10% + 5px");
  EXPECT_TRUE(mixed.type.hasPercent);
  EXPECT_EQ(mixed.type.length, 1);
  EXPECT_NEAR(mixed.percent, 10, kTolerance);
  EXPECT_NEAR(mixed.amount, 5, kTolerance);
  const MathValue pure = mustParse("min(10%, 20%)");
  EXPECT_TRUE(pure.type.hasPercent);
  EXPECT_NEAR(pure.percent, 10, kTolerance);
  expectInvalid("10% + 5");
  expectInvalid("10% * 5px");
  expectInvalid("5px / 10%");
}

TEST(MathTest, DoesNotCompareAPercentageWithALength) {
  const MathValue value = mustParse("min(10%, 20px)");
  EXPECT_TRUE(value.isOpaque);
  EXPECT_TRUE(value.type.hasPercent);
  EXPECT_EQ(value.type.length, 1);
}

TEST(MathTest, ReadsAMathFunctionOnItsOwnAsTheWholeText) {
  EXPECT_TRUE(parseMath("min(1px, 2px)").has_value());
  EXPECT_TRUE(parseMath("  MAX(1PX, 2px) ").has_value());
  EXPECT_FALSE(parseMath("min(1px, 2px) 3px").has_value());
  EXPECT_FALSE(parseMath("1px + 2px").has_value());
}

TEST(MathTest, ReadsALiteralAsTheWholeText) {
  const std::optional<MathValue> length = parseMath("12px");
  ASSERT_TRUE(length.has_value());
  EXPECT_EQ(length->type.length, 1);
  EXPECT_NEAR(length->amount, 12, kTolerance);
  EXPECT_FALSE(parseMath("12 px").has_value());
}

TEST(MathTest, NamesTheDimensionOfAResult) {
  EXPECT_EQ(mathDimension(mustParse("1px").type), Dimension::kLength);
  EXPECT_EQ(mathDimension(mustParse("1").type), Dimension::kNumber);
  EXPECT_EQ(mathDimension(mustParse("1%").type), Dimension::kPercent);
  EXPECT_EQ(mathDimension(mustParse("1% + 1px").type), Dimension::kLengthPercent);
  EXPECT_EQ(mathDimension(mustParse("1s").type), Dimension::kTime);
  EXPECT_EQ(mathDimension(mustParse("1deg").type), Dimension::kAngle);
  EXPECT_EQ(mathDimension(mustParse("1dppx").type), Dimension::kResolution);
  EXPECT_FALSE(mathDimension(mustParse("1px * 1px").type).has_value());
}

TEST(MathCalcTest, EvaluatesATypedProductAndAMathFunction) {
  const std::optional<CalcResult> product = evaluateCalc("calc(5px * 3px / 6px)");
  ASSERT_TRUE(product.has_value());
  EXPECT_EQ(product->kind, CalcKind::kLength);
  EXPECT_DOUBLE_EQ(product->value, 2.5);
  const std::optional<CalcResult> sign = evaluateCalc("calc(15px + (sign(20px - 10px) * 5px))");
  ASSERT_TRUE(sign.has_value());
  EXPECT_DOUBLE_EQ(sign->value, 20);
}

TEST(MathCalcTest, EvaluatesAMathFunctionOnItsOwn) {
  const std::optional<CalcResult> least = evaluateCalc("min(10px, 2rem)");
  ASSERT_TRUE(least.has_value());
  EXPECT_EQ(least->kind, CalcKind::kLength);
  EXPECT_DOUBLE_EQ(least->value, 10);
}

double usedLength(const char *text) {
  const std::optional<CalcResult> result = evaluateCalc(text);
  EXPECT_TRUE(result.has_value()) << text;
  EXPECT_EQ(result.has_value() ? result->kind : CalcKind::kLength, CalcKind::kLength) << text;
  return result.has_value() ? result->value : 0;
}

// Ported from wpt `calc-infinity-nan-computed`, NaN used as zero and infinity as the largest
TEST(MathCalcTest, UsesNaNAsZeroAndInfinityAsTheLargestLength) {
  EXPECT_EQ(usedLength("calc(NaN * 1px)"), 0);
  EXPECT_EQ(usedLength("calc(NaN * 1rem)"), 0);
  EXPECT_EQ(usedLength("calc(10.135262721212548pc - 199pt / NaN)"), 0);
  EXPECT_EQ(usedLength("max(15px, NaN * 1px)"), 0);
  EXPECT_EQ(usedLength("min(NaN * 1px, -15px)"), 0);
  EXPECT_EQ(usedLength("calc(infinity * 1px - infinity * 1px)"), 0);
  EXPECT_EQ(usedLength("calc(infinity * 1px)"), kLargestUsedValue);
  EXPECT_EQ(usedLength("calc(infinity * 1cm)"), kLargestUsedValue);
  EXPECT_EQ(usedLength("calc(max(infinity * 1px, 10px))"), kLargestUsedValue);
  EXPECT_EQ(usedLength("calc(-infinity * 1px)"), -kLargestUsedValue);
  EXPECT_EQ(usedLength("calc(min(-infinity * 1px, 10px))"), -kLargestUsedValue);
  EXPECT_EQ(usedLength("calc(-infinity * 1px - infinity * 1px)"), -kLargestUsedValue);
  EXPECT_EQ(usedLength("calc(max(10000px, 0px) + min(-infinity * 1px, infinity * 1px))"),
            -kLargestUsedValue);
}

TEST(MathCalcTest, UsesInfinityOfANumberAsTheLargestNumber) {
  const std::optional<CalcResult> number = evaluateCalc("calc(max(infinity, 10))");
  ASSERT_TRUE(number.has_value());
  EXPECT_EQ(number->kind, CalcKind::kNumber);
  EXPECT_EQ(number->value, kLargestUsedValue);
  const std::optional<CalcResult> negative = evaluateCalc("calc(-infinity * 10)");
  ASSERT_TRUE(negative.has_value());
  EXPECT_EQ(negative->value, -kLargestUsedValue);
}

TEST(MathCalcTest, KeepsRefusingAResultThatIsNotANumberALengthOrAPercentage) {
  EXPECT_FALSE(evaluateCalc("calc(2px * 1px)").has_value());
  EXPECT_FALSE(evaluateCalc("calc(20 / 0.75rem)").has_value());
  EXPECT_FALSE(evaluateCalc("calc(1s + 1s)").has_value());
  EXPECT_FALSE(evaluateCalc("calc(1vw + 2px)").has_value());
  EXPECT_FALSE(evaluateCalc("calc(100% - 8px)").has_value());
}

TEST(MathTypedTest, TypesTheSameExpressionsForTheRegistry) {
  const std::optional<TypedValue> product = typedValue("calc(5px * 3px / 6px)");
  ASSERT_TRUE(product.has_value());
  EXPECT_EQ(product->dimension, Dimension::kLength);
  const std::optional<TypedValue> sign = typedValue("calc(15px + (sign(20px - 10px) * 5px))");
  ASSERT_TRUE(sign.has_value());
  EXPECT_EQ(sign->dimension, Dimension::kLength);
  const std::optional<TypedValue> least = typedValue("min(1em, 2em)");
  ASSERT_TRUE(least.has_value());
  EXPECT_EQ(least->dimension, Dimension::kLength);
  EXPECT_TRUE(least->isRelative);
  const std::optional<TypedValue> time = typedValue("max(1s, 500ms)");
  ASSERT_TRUE(time.has_value());
  EXPECT_EQ(time->dimension, Dimension::kTime);
}

TEST(MathTypedTest, TypesAViewportLengthItCannotEvaluate) {
  const std::optional<TypedValue> viewport = typedValue("calc(1vw + 2px)");
  ASSERT_TRUE(viewport.has_value());
  EXPECT_EQ(viewport->dimension, Dimension::kLength);
  EXPECT_FALSE(viewport->isRelative);
}

TEST(MathTypedTest, ReadsALengthWithAPercentageOnlyAsALengthPercentage) {
  const ColorParser noColor = [](std::string_view) { return std::optional<long long>(); };
  const std::optional<Syntax> length = parseSyntax("<length>");
  const std::optional<Syntax> lengthPercentage = parseSyntax("<length-percentage>");
  ASSERT_TRUE(length.has_value());
  ASSERT_TRUE(lengthPercentage.has_value());
  const std::string text = "max(1px, 0%)";
  EXPECT_FALSE(matchesSyntax(*length, text, ValueContext::kDeclared, noColor));
  EXPECT_TRUE(matchesSyntax(*lengthPercentage, text, ValueContext::kDeclared, noColor));
}

TEST(MathTypedTest, RefusesAnUnnameableDimension) {
  EXPECT_FALSE(typedValue("calc(2px * 1px)").has_value());
  EXPECT_FALSE(typedValue("calc(20 / 0.75rem)").has_value());
  EXPECT_FALSE(typedValue("min(1px, 1s)").has_value());
}

TEST(MathComputedTest, SerializesTheComputedValueOfAMathFunction) {
  const ColorParser noColor = [](std::string_view) { return std::optional<long long>(); };
  const std::optional<Syntax> length = parseSyntax("<length>");
  ASSERT_TRUE(length.has_value());
  EXPECT_EQ(computedText(*length, "calc(5px * 3px / 6px)", noColor), "2.5px");
  EXPECT_EQ(computedText(*length, "min(1em, 20px)", noColor), "16px");
  EXPECT_EQ(computedText(*length, "calc(15px + (sign(20px - 10px) * 5px))", noColor), "20px");
  const std::optional<Syntax> time = parseSyntax("<time>");
  ASSERT_TRUE(time.has_value());
  EXPECT_EQ(computedText(*time, "round(10s, 6000ms)", noColor), "12s");
}

std::string computed(const char *syntax, const char *value) {
  const ColorParser noColor = [](std::string_view) { return std::optional<long long>(); };
  const std::optional<Syntax> parsed = parseSyntax(syntax);
  EXPECT_TRUE(parsed.has_value()) << syntax;
  return parsed.has_value() ? computedText(*parsed, value, noColor) : std::string();
}

// Ported from wpt `calc-angle-values`, with each angle written in degrees to six digits
TEST(MathComputedTest, AddsAndSubtractsAnglesOfDifferentUnits) {
  EXPECT_EQ(computed("<angle>", "calc(45deg + 45deg)"), "90deg");
  EXPECT_EQ(computed("<angle>", "calc(45deg + 1rad)"), "102.296deg");
  EXPECT_EQ(computed("<angle>", "calc(20deg + 200grad)"), "200deg");
  EXPECT_EQ(computed("<angle>", "calc(200deg + 0.5turn)"), "380deg");
  EXPECT_EQ(computed("<angle>", "calc(45rad + 45rad)"), "5156.62deg");
  EXPECT_EQ(computed("<angle>", "calc(1rad + 40grad)"), "93.2958deg");
  EXPECT_EQ(computed("<angle>", "calc(1rad + 0.5turn)"), "237.296deg");
  EXPECT_EQ(computed("<angle>", "calc(45grad + 45grad)"), "81deg");
  EXPECT_EQ(computed("<angle>", "calc(10grad + 0.5turn)"), "189deg");
  EXPECT_EQ(computed("<angle>", "calc(90deg - 1rad)"), "32.7042deg");
  EXPECT_EQ(computed("<angle>", "calc(38deg - 20grad)"), "20deg");
  EXPECT_EQ(computed("<angle>", "calc(360deg - 0.5turn)"), "180deg");
  EXPECT_EQ(computed("<angle>", "calc(30rad - 10grad)"), "1709.87deg");
  EXPECT_EQ(computed("<angle>", "calc(4rad - 0.1turn)"), "193.183deg");
  EXPECT_EQ(computed("<angle>", "calc(100grad - 0.25turn)"), "0deg");
}

// Ported from wpt `calc-time-values`
TEST(MathComputedTest, AddsMultipliesAndConvertsTimes) {
  EXPECT_EQ(computed("<time>", "calc(4s + 1s)"), "5s");
  EXPECT_EQ(computed("<time>", "calc(4s + 1ms)"), "4.001s");
  EXPECT_EQ(computed("<time>", "calc(4ms + 1ms)"), "0.005s");
  EXPECT_EQ(computed("<time>", "calc(4s - 1ms)"), "3.999s");
  EXPECT_EQ(computed("<time>", "calc(4 * 1ms)"), "0.004s");
  EXPECT_EQ(computed("<time>", "calc(4ms / 2)"), "0.002s");
  EXPECT_EQ(computed("<time>", "calc(4000ms)"), "4s");
}

// Ported from wpt `calc-integer`: the rounding happens once, at the end
TEST(MathComputedTest, RoundsAnIntegerCalcOnlyAtTheEnd) {
  EXPECT_EQ(computed("<integer>", "calc(2)"), "2");
  EXPECT_EQ(computed("<integer>", "calc(4 / 2)"), "2");
  EXPECT_EQ(computed("<integer>", "calc(1 / 2)"), "1");
  EXPECT_EQ(computed("<integer>", "calc(0.5)"), "1");
  EXPECT_EQ(computed("<integer>", "calc(6 / 2.0)"), "3");
  EXPECT_EQ(computed("<integer>", "calc(1 / 3)"), "0");
  EXPECT_EQ(computed("<integer>", "calc(calc(1 / 3) * 3)"), "1");
}

// Ported from wpt `calc-rounds-to-integer`
TEST(MathComputedTest, AcceptsAFractionalCalcAsAnIntegerButNotAFractionalLiteral) {
  const ColorParser noColor = [](std::string_view) { return std::optional<long long>(); };
  const std::optional<Syntax> integer = parseSyntax("<integer>");
  ASSERT_TRUE(integer.has_value());
  for (const char *valid : {"10", "calc(10)", "calc(10.1)", "calc(1e1)", "calc(1.1e1)"}) {
    EXPECT_TRUE(matchesSyntax(*integer, valid, ValueContext::kDeclared, noColor)) << valid;
  }
  for (const char *invalid : {"1e1", "1.1e1", "10.1"}) {
    EXPECT_FALSE(matchesSyntax(*integer, invalid, ValueContext::kDeclared, noColor)) << invalid;
  }
}

// Ported from wpt `calc-infinity-nan-serialize-*`, each dimension in its base unit
TEST(MathComputedTest, SerializesNaNAndInfinityAsACalcOfTheBaseUnit) {
  EXPECT_EQ(computed("<length>", "calc(1px * NaN)"), "calc(NaN * 1px)");
  EXPECT_EQ(computed("<length>", "calc(1in * NaN)"), "calc(NaN * 1px)");
  EXPECT_EQ(computed("<length>", "calc(1px * infinity)"), "calc(infinity * 1px)");
  EXPECT_EQ(computed("<length>", "calc(1px * -infinity)"), "calc(-infinity * 1px)");
  EXPECT_EQ(computed("<length>", "calc(1px * 1/infinity)"), "0px");
  EXPECT_EQ(computed("<length>", "calc(1 * max(nAn*2px, 0px))"), "calc(NaN * 1px)");
  EXPECT_EQ(computed("<percentage>", "calc(1% * NaN)"), "calc(NaN * 1%)");
  EXPECT_EQ(computed("<percentage>", "calc(1% * -infinity)"), "calc(-infinity * 1%)");
  EXPECT_EQ(computed("<number>", "calc(NaN)"), "calc(NaN)");
  EXPECT_EQ(computed("<number>", "calc(infinity)"), "calc(infinity)");
  EXPECT_EQ(computed("<number>", "calc(-infinity)"), "calc(-infinity)");
  EXPECT_EQ(computed("<number>", "calc(1 * 1/infinity)"), "0");
  EXPECT_EQ(computed("<integer>", "calc(infinity)"), "calc(infinity)");
  EXPECT_EQ(computed("<angle>", "calc(1rad * NaN)"), "calc(NaN * 1deg)");
  EXPECT_EQ(computed("<angle>", "calc(1deg * infinity)"), "calc(infinity * 1deg)");
  EXPECT_EQ(computed("<time>", "calc(1ms * NaN)"), "calc(NaN * 1s)");
  EXPECT_EQ(computed("<resolution>", "calc(1x * infinity)"), "calc(infinity * 1dppx)");
}

// Ported from wpt `calc-nesting-002`
TEST(MathComputedTest, FoldsNestedCalcsAndKeepsThePercentageTermFirst) {
  EXPECT_EQ(computed("<length>", "calc(20px + calc(80px))"), "100px");
  EXPECT_EQ(computed("<length>", "calc(calc(100px))"), "100px");
  EXPECT_EQ(computed("<length>", "calc(calc(2) * calc(50px))"), "100px");
  EXPECT_EQ(computed("<length>", "calc(calc(150px*2/3))"), "100px");
  EXPECT_EQ(computed("<length>", "calc(calc(2 * calc(calc(3)) + 4) * 10px)"), "100px");
  EXPECT_EQ(computed("<length-percentage>", "calc(50px + calc(40%))"), "calc(40% + 50px)");
}

// Ported from wpt `calc-nesting-002` and `hypot-pow-sqrt-computed`: a zero percentage stays written
TEST(MathComputedTest, KeepsAZeroPercentageBesideALength) {
  EXPECT_EQ(computed("<length-percentage>", "calc(calc(300px - 1 * (0% + 100px)))"), "calc(0% + 200px)");
  EXPECT_EQ(computed("<length-percentage>", "calc(calc(300px - (0% + 100px) * -1))"), "calc(0% + 400px)");
  EXPECT_EQ(computed("<length-percentage>", "calc(calc(300px - 1 * (0% - 100px)))"), "calc(0% + 400px)");
  EXPECT_EQ(computed("<length-percentage>", "hypot(0% + 772.333px)"), "calc(0% + 772.333px)");
  EXPECT_EQ(computed("<length-percentage>", "calc(0% + 5px)"), "calc(0% + 5px)");
}

} // namespace
} // namespace symbiote

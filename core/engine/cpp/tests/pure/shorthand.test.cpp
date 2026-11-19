// Layer 2 of decision 34: a shorthand whose value held a `var()` is split into RN longhands
#include <gtest/gtest.h>

#include <string>
#include <utility>
#include <vector>

#include "SymbioteShorthand.h"

namespace symbiote {
namespace {

using Pairs = std::vector<std::pair<std::string, std::string>>;

Pairs expanded(std::string_view key, std::string_view text) {
  const ShorthandResult result = expandShorthand(key, text);
  EXPECT_EQ(result.outcome, ShorthandOutcome::kExpanded) << key << ": " << text;
  return result.longhands;
}

void expectUntouched(std::string_view key, std::string_view text) {
  EXPECT_EQ(expandShorthand(key, text).outcome, ShorthandOutcome::kNotShorthand)
      << key << ": " << text;
}

void expectInvalid(std::string_view key, std::string_view text) {
  EXPECT_EQ(expandShorthand(key, text).outcome, ShorthandOutcome::kInvalid)
      << key << ": " << text;
}

TEST(ShorthandTest, SplitsAPaddingByTheCssSideOrder) {
  EXPECT_EQ(
      expanded("padding", "8px 16px"),
      (Pairs{{"paddingTop", "8px"}, {"paddingRight", "16px"}, {"paddingBottom", "8px"}, {"paddingLeft", "16px"}}));
  EXPECT_EQ(
      expanded("padding", "1px 2px 3px"),
      (Pairs{{"paddingTop", "1px"}, {"paddingRight", "2px"}, {"paddingBottom", "3px"}, {"paddingLeft", "2px"}}));
  EXPECT_EQ(
      expanded("padding", "1px 2px 3px 4px"),
      (Pairs{{"paddingTop", "1px"}, {"paddingRight", "2px"}, {"paddingBottom", "3px"}, {"paddingLeft", "4px"}}));
}

TEST(ShorthandTest, KeepsTheOneKeyFormWhenEverySideIsEqual) {
  EXPECT_EQ(expanded("padding", "8px 8px"), (Pairs{{"padding", "8px"}}));
  expectUntouched("padding", "8px");
}

TEST(ShorthandTest, KeepsAnAutoMarginAsText) {
  EXPECT_EQ(
      expanded("margin", "0 auto"),
      (Pairs{{"marginTop", "0"}, {"marginRight", "auto"}, {"marginBottom", "0"}, {"marginLeft", "auto"}}));
}

TEST(ShorthandTest, TreatsAFunctionAsOneToken) {
  EXPECT_EQ(
      expanded("borderColor", "rgb(1, 2, 3) red"),
      (Pairs{{"borderTopColor", "rgb(1, 2, 3)"}, {"borderRightColor", "red"}, {"borderBottomColor", "rgb(1, 2, 3)"}, {"borderLeftColor", "red"}}));
}

TEST(ShorthandTest, AlwaysSplitsInsetEvenWhenUniform) {
  EXPECT_EQ(
      expanded("inset", "0"),
      (Pairs{{"top", "0"}, {"right", "0"}, {"bottom", "0"}, {"left", "0"}}));
  EXPECT_EQ(
      expanded("inset", "0 10px"),
      (Pairs{{"top", "0"}, {"right", "10px"}, {"bottom", "0"}, {"left", "10px"}}));
}

TEST(ShorthandTest, SplitsBorderWidthLikeAPadding) {
  EXPECT_EQ(
      expanded("borderWidth", "1px 2px"),
      (Pairs{{"borderTopWidth", "1px"}, {"borderRightWidth", "2px"}, {"borderBottomWidth", "1px"}, {"borderLeftWidth", "2px"}}));
}

TEST(ShorthandTest, SplitsBorderRadiusByCornerAndKeepsOnlyTheHorizontalRadius) {
  EXPECT_EQ(
      expanded("borderRadius", "4px 8px"),
      (Pairs{{"borderTopLeftRadius", "4px"}, {"borderTopRightRadius", "8px"}, {"borderBottomRightRadius", "4px"}, {"borderBottomLeftRadius", "8px"}}));
  EXPECT_EQ(expanded("borderRadius", "4px / 8px"), (Pairs{{"borderRadius", "4px"}}));
  EXPECT_EQ(expanded("borderRadius", "4px 4px 4px 4px"), (Pairs{{"borderRadius", "4px"}}));
}

TEST(ShorthandTest, SplitsGapIntoRowThenColumn) {
  EXPECT_EQ(expanded("gap", "8px 12px"), (Pairs{{"rowGap", "8px"}, {"columnGap", "12px"}}));
  EXPECT_EQ(expanded("gap", "8px 8px"), (Pairs{{"gap", "8px"}}));
  expectUntouched("gap", "8px");
}

TEST(ShorthandTest, SplitsAFlexIntoGrowShrinkAndBasis) {
  EXPECT_EQ(
      expanded("flex", "1 0 auto"),
      (Pairs{{"flexGrow", "1"}, {"flexShrink", "0"}, {"flexBasis", "auto"}}));
  EXPECT_EQ(
      expanded("flex", "1 2"),
      (Pairs{{"flexGrow", "1"}, {"flexShrink", "2"}, {"flexBasis", "0%"}}));
  EXPECT_EQ(
      expanded("flex", "1 100px"),
      (Pairs{{"flexGrow", "1"}, {"flexShrink", "1"}, {"flexBasis", "100px"}}));
  EXPECT_EQ(
      expanded("flex", "100px"),
      (Pairs{{"flexGrow", "1"}, {"flexShrink", "1"}, {"flexBasis", "100px"}}));
}

TEST(ShorthandTest, KeepsRnsOneKeyFlexWhenItMeansTheSame) {
  EXPECT_EQ(expanded("flex", "2 1 0%"), (Pairs{{"flex", "2"}}));
  EXPECT_EQ(expanded("flex", "2 1"), (Pairs{{"flex", "2"}}));
  expectUntouched("flex", "1");
}

TEST(ShorthandTest, KnowsTheFlexKeywords) {
  EXPECT_EQ(
      expanded("flex", "none"),
      (Pairs{{"flexGrow", "0"}, {"flexShrink", "0"}, {"flexBasis", "auto"}}));
  EXPECT_EQ(
      expanded("flex", "auto"),
      (Pairs{{"flexGrow", "1"}, {"flexShrink", "1"}, {"flexBasis", "auto"}}));
}

TEST(ShorthandTest, AcceptsOverflowOnlyWhenBothAxesAgree) {
  EXPECT_EQ(expanded("overflow", "hidden hidden"), (Pairs{{"overflow", "hidden"}}));
  expectInvalid("overflow", "hidden scroll");
  expectUntouched("overflow", "hidden");
}

TEST(ShorthandTest, AcceptsBorderStyleOnlyWhenEverySideAgrees) {
  EXPECT_EQ(expanded("borderStyle", "solid solid"), (Pairs{{"borderStyle", "solid"}}));
  expectInvalid("borderStyle", "solid dashed");
}

TEST(ShorthandTest, TurnsARatioIntoANumber) {
  EXPECT_EQ(expanded("aspectRatio", "16 / 9"), (Pairs{{"aspectRatio", "1.777778"}}));
  EXPECT_EQ(expanded("aspectRatio", "2/3"), (Pairs{{"aspectRatio", "0.6666667"}}));
  expectInvalid("aspectRatio", "4 / 0");
  expectUntouched("aspectRatio", "1.5");
}

TEST(ShorthandTest, RefusesTooManyValues) {
  expectInvalid("padding", "1px 2px 3px 4px 5px");
  expectInvalid("gap", "1px 2px 3px");
}

TEST(ShorthandTest, LeavesAnyOtherPropertyAlone) {
  expectUntouched("width", "calc(1px + 2px)");
  expectUntouched("color", "red blue");
}

} // namespace
} // namespace symbiote

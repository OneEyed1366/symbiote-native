// Layer 3 of decision 34: the text of a shadow, a filter or a transform that held a `var()`
// Expectations are RN's own JS processors, whose unit tests these cases are ported from
#include <gtest/gtest.h>

#include <map>
#include <optional>
#include <string>

#include "SymbioteStructuredStyle.h"

namespace symbiote {
namespace {

constexpr long long kRed = 0xffff0000LL;
constexpr long long kTranslucentBlack = 0x80000000LL;

std::optional<long long> fakeColor(const std::string &token) {
  static const std::map<std::string, long long> known = {
      {"red", kRed}, {"rgba(0, 0, 0, 0.5)", kTranslucentBlack}};
  const auto found = known.find(token);
  if (found == known.end()) return std::nullopt;
  return found->second;
}

std::string json(const std::string &key, const std::string &text) {
  const std::optional<std::string> parsed = structuredStyleJson(key, text, fakeColor);
  EXPECT_TRUE(parsed.has_value()) << key;
  return parsed.value_or("");
}

std::string shadow(const std::string &text) {
  return json("boxShadow", text);
}

std::string filter(const std::string &text) {
  return json("filter", text);
}

std::string transform(const std::string &text) {
  return json("transform", text);
}

TEST(StructuredStyleTest, LeavesAKeyWithoutAProcessorAlone) {
  EXPECT_FALSE(structuredStyleJson("margin", "4px", fakeColor).has_value());
}

TEST(BoxShadowTest, ParsesEveryComponentOfAFullShadow) {
  EXPECT_EQ(
      shadow("0 0 22px 3px red"),
      R"([{"offsetX":0,"offsetY":0,"blurRadius":22,"spreadDistance":3,"color":4294901760}])");
}

TEST(BoxShadowTest, ParsesTheInsetKeywordAndAColourInAnyOrder) {
  EXPECT_EQ(shadow("inset red 1px 2px"), R"([{"offsetX":1,"offsetY":2,"color":4294901760,"inset":true}])");
}

TEST(BoxShadowTest, KeepsACommaInsideAColourFunction) {
  EXPECT_EQ(
      shadow("1px 2px rgba(0, 0, 0, 0.5), 0 0 3px red"),
      R"([{"offsetX":1,"offsetY":2,"color":2147483648},{"offsetX":0,"offsetY":0,"blurRadius":3,"color":4294901760}])");
}

TEST(BoxShadowTest, ZeroesTheWholeListOnAnInvalidPrimitive) {
  EXPECT_EQ(shadow("5 0px red"), "[]");
  EXPECT_EQ(shadow("1px 2px, 3em 4px"), "[]");
  EXPECT_EQ(shadow("0 0 -1px"), "[]");
}

TEST(BoxShadowTest, RejectsTwoColoursAFifthLengthAndNoLengths) {
  EXPECT_EQ(shadow("red 0px 0px red"), "[]");
  EXPECT_EQ(shadow("0px 0px 0px 0px 0px"), "[]");
  EXPECT_EQ(shadow("inset"), "[]");
}

TEST(BoxShadowTest, RejectsALengthAfterAKeywordThatSplitsTheLengths) {
  EXPECT_EQ(shadow("0px inset 0px"), "[]");
}

TEST(FilterTest, ParsesEachFunctionByItsOwnAmountRule) {
  EXPECT_EQ(filter("brightness(0.5) hue-rotate(90deg)"), R"([{"brightness":0.5},{"hueRotate":90}])");
  EXPECT_EQ(filter("blur(4px) opacity(50%) grayscale(1)"), R"([{"blur":4},{"opacity":0.5},{"grayscale":1}])");
  EXPECT_EQ(filter("hue-rotate(0)"), R"([{"hueRotate":0}])");
}

TEST(FilterTest, ParsesADropShadowWithANestedColourFunction) {
  EXPECT_EQ(
      filter("drop-shadow(1px 2px 3px red)"),
      R"([{"dropShadow":{"offsetX":1,"offsetY":2,"standardDeviation":3,"color":4294901760}}])");
  EXPECT_EQ(
      filter("drop-shadow(1px 2px rgba(0, 0, 0, 0.5))"),
      R"([{"dropShadow":{"offsetX":1,"offsetY":2,"color":2147483648}}])");
}

TEST(FilterTest, ZeroesTheListWhenAnyFunctionIsInvalid) {
  EXPECT_EQ(filter("blur(2em)"), "[]");
  EXPECT_EQ(filter("blur(-1px)"), "[]");
  EXPECT_EQ(filter("opacity(1) hue-rotate(45)"), "[]");
  EXPECT_EQ(filter("drop-shadow(1px)"), "[]");
  EXPECT_EQ(filter("sparkle(1)"), "[]");
}

TEST(FilterTest, IsEmptyForNoFunctions) {
  EXPECT_EQ(filter(""), "[]");
}

TEST(TransformTest, ParsesTheSingleValueSteps) {
  EXPECT_EQ(transform("rotate(6deg)"), R"([{"rotate":"6deg"}])");
  EXPECT_EQ(transform("translateX(10px) scale(1.5)"), R"([{"translateX":10},{"scale":1.5}])");
  EXPECT_EQ(transform("perspective(100px)"), R"([{"perspective":100}])");
}

TEST(TransformTest, ReadsAPercentageTranslateAxisAsANumber) {
  EXPECT_EQ(transform("translateX(10%)"), R"([{"translateX":10}])");
}

TEST(TransformTest, NormalisesTranslateAndTranslate3dToTheTranslateKey) {
  EXPECT_EQ(transform("translate(10px, 20px)"), R"([{"translate":[10,20]}])");
  EXPECT_EQ(transform("translate(1px)"), R"([{"translate":[1,0]}])");
  EXPECT_EQ(transform("translate3d(5px, 10px, 0)"), R"([{"translate":[5,10,0]}])");
  EXPECT_EQ(transform("translate(50%, 2px)"), R"([{"translate":["50%",2]}])");
}

TEST(TransformTest, ReadsAMatrixAsABareNumberList) {
  EXPECT_EQ(
      transform("matrix(1, 0, 0, 0, 1, 0, 0, 0, 1)"), R"([{"matrix":[1,0,0,0,1,0,0,0,1]}])");
}

TEST(TransformTest, DropsTheWholeListOnAStepRnRefuses) {
  EXPECT_EQ(transform("rotate(0.5)"), "[]");
  EXPECT_EQ(transform("matrix(1, 0, 0, 1, 10, 20)"), "[]");
  EXPECT_EQ(transform("translateX(10)"), "[]");
  EXPECT_EQ(transform("perspective(0)"), "[]");
  EXPECT_EQ(transform("scale(2) fooBar(1)"), "[]");
}

TEST(TransformTest, LeavesOutAStepWithoutAUsableValue) {
  EXPECT_EQ(transform("translateX()"), "[]");
  EXPECT_EQ(transform("translateY(px) scale(2)"), R"([{"scale":2}])");
  EXPECT_EQ(transform(""), "[]");
}

} // namespace
} // namespace symbiote

// The string cases of React Native's own suites for the JS processors the scanners mirror:
// `processFilter-test.js`, `processTransform-test.js` and `processBoxShadow-itest.js`
// A transform RN throws on is `[]` here, a development build being the reference
#include <gtest/gtest.h>

#include <cmath>
#include <map>
#include <optional>
#include <string>

#include "SymbioteStructuredStyle.h"

namespace symbiote {
namespace {

std::optional<long long> fakeColor(const std::string &token) {
  static const std::map<std::string, long long> known = {
      {"red", 11},
      {"purple", 12},
      {"#FFFFFF", 13},
      {"rgba(255, 255, 255, 0.5)", 14},
      {"hsl(318, 69%, 55%)", 15},
      {"rgba(0, 0, 0, 1)", 16}};
  const auto found = known.find(token);
  if (found == known.end()) return std::nullopt;
  return found->second;
}

std::string json(const std::string &key, const std::string &text) {
  return structuredStyleJson(key, text, fakeColor).value_or("<no processor>");
}

std::string filter(const std::string &text) {
  return json("filter", text);
}

std::string shadow(const std::string &text) {
  return json("boxShadow", text);
}

bool acceptsTransform(const std::string &text) {
  return json("transform", text) != "[]";
}

std::string number(double value) {
  return jsonNumber(value);
}

TEST(UpstreamFilterTest, ParsesTheStandardAmountFilters) {
  for (const char *name : {"brightness", "opacity", "contrast", "saturate", "grayscale", "sepia", "invert"}) {
    const std::string key = name;
    EXPECT_EQ(filter(key + "(0.5)"), "[{\"" + key + "\":0.5}]");
    EXPECT_EQ(filter(key + "(-0.5)"), "[]");
    EXPECT_EQ(filter(key + "(0.5px)"), "[{\"" + key + "\":0.5}]");
    EXPECT_EQ(filter(key + "(0.5%)"), "[{\"" + key + "\":" + number(0.5 / 100) + "}]");
  }
}

TEST(UpstreamFilterTest, ParsesBlurAsALengthInPixelsOnly) {
  EXPECT_EQ(filter("blur(5)"), R"([{"blur":5}])");
  EXPECT_EQ(filter("blur(-5)"), "[]");
  EXPECT_EQ(filter("blur(5%)"), "[]");
  EXPECT_EQ(filter("blur(5px)"), R"([{"blur":5}])");
}

TEST(UpstreamFilterTest, ParsesHueRotateAsAnAngle) {
  EXPECT_EQ(filter("hue-rotate(0)"), R"([{"hueRotate":0}])");
  EXPECT_EQ(filter("hue-rotate(90deg)"), R"([{"hueRotate":90}])");
  EXPECT_EQ(filter("hue-rotate(1.5708rad)"), "[{\"hueRotate\":" + number(180 * 1.5708 / M_PI) + "}]");
  EXPECT_EQ(filter("hue-rotate(-90deg)"), R"([{"hueRotate":-90}])");
  EXPECT_EQ(filter("hue-rotate(1.5grad)"), "[]");
  EXPECT_EQ(filter("hue-rotate(90)"), "[]");
  EXPECT_EQ(filter("hue-rotate(50%)"), "[]");
}

TEST(UpstreamFilterTest, ParsesSeveralFilters) {
  EXPECT_EQ(
      filter("brightness(0.5) opacity(0.5) blur(5px) hue-rotate(90deg)"),
      R"([{"brightness":0.5},{"opacity":0.5},{"blur":5},{"hueRotate":90}])");
  EXPECT_EQ(
      filter("brightness(0.5)\n   opacity(0.5)\n   blur(5)\n   hue-rotate(90deg)"),
      R"([{"brightness":0.5},{"opacity":0.5},{"blur":5},{"hueRotate":90}])");
  EXPECT_EQ(
      filter("brightness(0.5) brightness(0.5) brightness(0.5) brightness(0.5)"),
      R"([{"brightness":0.5},{"brightness":0.5},{"brightness":0.5},{"brightness":0.5}])");
}

TEST(UpstreamFilterTest, ReadsNamesInAnyCase) {
  EXPECT_EQ(
      filter("brIGhTneSs(0.5) hUE-rOTatE(90deg) briGhtNess(0.5) Brightness(0.5)"),
      R"([{"brightness":0.5},{"hueRotate":90},{"brightness":0.5},{"brightness":0.5}])");
}

TEST(UpstreamFilterTest, ZeroesTheListOnAnInvalidFunction) {
  EXPECT_EQ(filter("brightness(0.5) opacity(0.5) blur(5px) hue-rotate(90foo)"), "[]");
  EXPECT_EQ(filter(""), "[]");
  EXPECT_EQ(filter("foo: 5"), "[]");
  EXPECT_EQ(filter("brightness: {}"), "[]");
  EXPECT_EQ(filter("brightness(.5)"), R"([{"brightness":0.5}])");
}

TEST(UpstreamFilterTest, ParsesADropShadow) {
  EXPECT_EQ(
      filter("drop-shadow(4px 4px 10px red)"),
      R"([{"dropShadow":{"offsetX":4,"offsetY":4,"standardDeviation":10,"color":11}}])");
  EXPECT_EQ(filter("drop-shadow(-4px -4px)"), R"([{"dropShadow":{"offsetX":-4,"offsetY":-4}}])");
  EXPECT_EQ(
      filter("drop-shadow(4px 4px) drop-shadow(4px 4px) drop-shadow(4px 4px)"),
      R"([{"dropShadow":{"offsetX":4,"offsetY":4}},{"dropShadow":{"offsetX":4,"offsetY":4}},{"dropShadow":{"offsetX":4,"offsetY":4}}])");
  EXPECT_EQ(
      filter("    drop-shadow(4px  4px   10px        red)    "),
      R"([{"dropShadow":{"offsetX":4,"offsetY":4,"standardDeviation":10,"color":11}}])");
  EXPECT_EQ(
      filter("drop-shadow(4px 4px 10px red) brightness(0.5) brightness(0.5)"),
      R"([{"dropShadow":{"offsetX":4,"offsetY":4,"standardDeviation":10,"color":11}},{"brightness":0.5},{"brightness":0.5}])");
  EXPECT_EQ(filter("drop-shadow(50px 50px purple)"), R"([{"dropShadow":{"offsetX":50,"offsetY":50,"color":12}}])");
  EXPECT_EQ(
      filter("drop-shadow(50px 50px rgba(0, 0, 0, 1))"), R"([{"dropShadow":{"offsetX":50,"offsetY":50,"color":16}}])");
  EXPECT_EQ(filter("DroP-sHaDOw(50px 50px purple)"), R"([{"dropShadow":{"offsetX":50,"offsetY":50,"color":12}}])");
}

TEST(UpstreamFilterTest, ZeroesTheListOnAnInvalidDropShadow) {
  EXPECT_EQ(filter("drop-shadow(4px, 4px, 10px, red)"), "[]");
  EXPECT_EQ(filter("drop-shadow(4& 4* 10$ red)"), "[]");
  EXPECT_EQ(filter("drop-shadow(10px red 10px 10px"), "[]");
  EXPECT_EQ(filter("drop-shadow(10px 10px red  10px"), "[]");
  EXPECT_EQ(filter("drop-shadow(10px 10px -10px"), "[]");
  EXPECT_EQ(filter("drop-shadow(10px red 10px 10px)"), "[]");
  EXPECT_EQ(filter("drop-shadow(10px 10px red 10px)"), "[]");
  EXPECT_EQ(filter("drop-shadow(10px 10px -10px)"), "[]");
}

TEST(UpstreamTransformTest, AcceptsAValidTransform) {
  EXPECT_TRUE(acceptsTransform("scale(0.5) translateX(10px) translateY(20px) rotate(10deg)"));
  EXPECT_TRUE(acceptsTransform("translateX(10%)"));
  EXPECT_TRUE(acceptsTransform("matrix(1, 1, 1, 1, 1, 1, 1, 1, 1)"));
  EXPECT_TRUE(acceptsTransform("matrix(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)"));
  EXPECT_TRUE(acceptsTransform("translate(1px)"));
  EXPECT_TRUE(acceptsTransform("translate(1px, 1px)"));
  EXPECT_TRUE(acceptsTransform("skewY(10deg)"));
  EXPECT_TRUE(acceptsTransform("rotateX(1.16rad)"));
}

TEST(UpstreamTransformTest, RefusesWhatRnThrowsOn) {
  EXPECT_FALSE(acceptsTransform("translateW(10)"));
  EXPECT_FALSE(acceptsTransform("matrix(1, 1, 1, 1)"));
  EXPECT_FALSE(acceptsTransform("translate(1px, 1px, 1px, 1px)"));
  EXPECT_FALSE(acceptsTransform("rotate(10)"));
  EXPECT_FALSE(acceptsTransform("skewX(10drg)"));
}

TEST(UpstreamBoxShadowTest, ParsesTheLengthsColourAndInset) {
  EXPECT_EQ(shadow("10px 5px"), R"([{"offsetX":10,"offsetY":5}])");
  EXPECT_EQ(shadow("10px 0"), R"([{"offsetX":10,"offsetY":0}])");
  EXPECT_EQ(shadow("10px    5px"), R"([{"offsetX":10,"offsetY":5}])");
  EXPECT_EQ(shadow("red 10px 5px"), R"([{"offsetX":10,"offsetY":5,"color":11}])");
  EXPECT_EQ(shadow("rgba(255, 255, 255, 0.5) 10px 5px"), R"([{"offsetX":10,"offsetY":5,"color":14}])");
  EXPECT_EQ(shadow("hsl(318, 69%, 55%) 10px 5px"), R"([{"offsetX":10,"offsetY":5,"color":15}])");
  EXPECT_EQ(shadow("#FFFFFF 10px 5px"), R"([{"offsetX":10,"offsetY":5,"color":13}])");
  EXPECT_EQ(shadow("red 10px 5px 2px"), R"([{"offsetX":10,"offsetY":5,"blurRadius":2,"color":11}])");
  EXPECT_EQ(
      shadow("red 10px 5px 2px 3px"),
      R"([{"offsetX":10,"offsetY":5,"blurRadius":2,"spreadDistance":3,"color":11}])");
  EXPECT_EQ(shadow("5px 2px inset"), R"([{"offsetX":5,"offsetY":2,"inset":true}])");
  EXPECT_EQ(shadow("red 10px 10px inset"), R"([{"offsetX":10,"offsetY":10,"color":11,"inset":true}])");
}

TEST(UpstreamBoxShadowTest, ParsesSeveralShadowsAndNumberSpellings) {
  EXPECT_EQ(
      shadow("10px 5px red, 5px 12px inset, inset 10px 45px 13px red"),
      R"([{"offsetX":10,"offsetY":5,"color":11},{"offsetX":5,"offsetY":12,"inset":true},{"offsetX":10,"offsetY":45,"blurRadius":13,"color":11,"inset":true}])");
  EXPECT_EQ(
      shadow("10px 5px red, 5px 12px inset,\n  inset 10px 45px 13px red"),
      R"([{"offsetX":10,"offsetY":5,"color":11},{"offsetX":5,"offsetY":12,"inset":true},{"offsetX":10,"offsetY":45,"blurRadius":13,"color":11,"inset":true}])");
  EXPECT_EQ(shadow(".5px 2px"), R"([{"offsetX":0.5,"offsetY":2}])");
  EXPECT_EQ(shadow("+5px 2px"), R"([{"offsetX":5,"offsetY":2}])");
}

TEST(UpstreamBoxShadowTest, ZeroesTheListOnAnInvalidShadow) {
  EXPECT_EQ(shadow("red 10em 5$ 2| 3rp"), "[]");
  EXPECT_EQ(shadow("10px 5px 2px 3px 10px 10px"), "[]");
  EXPECT_EQ(shadow("10px inset 5px 2px 3px,"), "[]");
  EXPECT_EQ(shadow("red red 10px 5px"), "[]");
  EXPECT_EQ(shadow("10px 5px inset inset"), "[]");
  EXPECT_EQ(shadow("10px red 5px 2px 3px,"), "[]");
  EXPECT_EQ(shadow("red 10foo 5px 2px 3px,"), "[]");
  EXPECT_EQ(shadow("1.5dog 2px"), "[]");
  EXPECT_EQ(shadow("red asf 5px 2px 3px"), "[]");
  EXPECT_EQ(shadow("10.px 5px"), "[]");
  EXPECT_EQ(shadow("red 5px 2px -3px"), "[]");
  EXPECT_EQ(shadow("10px 5"), "[]");
  EXPECT_EQ(shadow("10px 5px outset"), "[]");
  EXPECT_EQ(shadow("10px 5px 2px 3px 10px 10px, 10px 5px"), "[]");
}

} // namespace
} // namespace symbiote

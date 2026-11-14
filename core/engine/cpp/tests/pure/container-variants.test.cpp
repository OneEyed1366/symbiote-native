// The envelope the JS side ships per consumer: the settled conditions and one style per truth mask
#include <gtest/gtest.h>

#include <optional>
#include <string>

#include "SymbioteContainerQuery.h"

namespace symbiote {
namespace {

const char *const kTwoConditions =
    R"([[["@",null,[">=","width",400]],["@","side",["<","height",100]]],)"
    R"([1,{"padding":16}],[2,{"margin":"8px"}],[3,{"padding":24,"margin":0}]])";

ContainerLookup alwaysSized(double width, double height) {
  return [=](const std::optional<std::string> &) { return ContainerSize{width, height}; };
}

TEST(ContainerVariants, ReadsTheConditionsAndTheStyleOfEachMask) {
  const std::optional<ContainerVariants> variants = parseContainerVariants(kTwoConditions);
  ASSERT_TRUE(variants.has_value());
  EXPECT_EQ(variants->conditions.size(), 2u);
  ASSERT_EQ(variants->styles.size(), 3u);
  EXPECT_EQ(variants->styles[0].mask, 1u);
  EXPECT_EQ(variants->styles[0].styleJson, R"({"padding":16})");
  EXPECT_EQ(variants->styles[2].styleJson, R"({"padding":24,"margin":0})");
}

TEST(ContainerVariants, KeepsAStyleStringWithEscapesWhole) {
  const std::optional<ContainerVariants> variants =
      parseContainerVariants(R"([[true],[1,{"content":"a\"}]b"}]])");
  ASSERT_TRUE(variants.has_value());
  EXPECT_EQ(variants->styles[0].styleJson, R"({"content":"a\"}]b"})");
}

TEST(ContainerVariants, SetsOneBitPerConditionThatHolds) {
  const std::optional<ContainerVariants> variants = parseContainerVariants(kTwoConditions);
  ASSERT_TRUE(variants.has_value());
  EXPECT_EQ(holdingMask(*variants, alwaysSized(500, 50)), 3u);
  EXPECT_EQ(holdingMask(*variants, alwaysSized(500, 200)), 1u);
  EXPECT_EQ(holdingMask(*variants, alwaysSized(300, 50)), 2u);
  EXPECT_EQ(holdingMask(*variants, alwaysSized(300, 200)), 0u);
}

TEST(ContainerVariants, HoldsNothingWhenNoContainerAnswers) {
  const std::optional<ContainerVariants> variants = parseContainerVariants(kTwoConditions);
  ASSERT_TRUE(variants.has_value());
  const ContainerLookup none = [](const std::optional<std::string> &) { return std::nullopt; };
  EXPECT_EQ(holdingMask(*variants, none), 0u);
}

TEST(ContainerVariants, FindsTheStyleOfAMaskAndNoneForTheRest) {
  const std::optional<ContainerVariants> variants = parseContainerVariants(kTwoConditions);
  ASSERT_TRUE(variants.has_value());
  EXPECT_EQ(styleJsonForMask(*variants, 2u), std::optional<std::string>(R"({"margin":"8px"})"));
  EXPECT_EQ(styleJsonForMask(*variants, 0u), std::nullopt);
  EXPECT_EQ(styleJsonForMask(*variants, 4u), std::nullopt);
}

TEST(ContainerVariants, RejectsTextThatIsNotAnEnvelope) {
  EXPECT_FALSE(parseContainerVariants("").has_value());
  EXPECT_FALSE(parseContainerVariants("[]").has_value());
  EXPECT_FALSE(parseContainerVariants(R"([[true],[1,{"a":1}]] tail)").has_value());
  EXPECT_FALSE(parseContainerVariants(R"([[true],[1,{"a":1}])").has_value());
  EXPECT_FALSE(parseContainerVariants(R"([[["?"]],[1,{}]])").has_value());
}

} // namespace
} // namespace symbiote

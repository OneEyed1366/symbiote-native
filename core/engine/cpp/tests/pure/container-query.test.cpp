// Ported from `style-registry/container-evaluate.test.ts` on the same condition literals
// Constants stand for the env leaves the JS side already settled
#include <gtest/gtest.h>

#include <optional>
#include <string>
#include <vector>

#include "SymbioteContainerQuery.h"

namespace symbiote {
namespace {

std::optional<bool> holds(
    const std::string &json,
    const std::optional<ContainerSize> &size,
    std::vector<std::string> *asked = nullptr) {
  const std::optional<ContainerCondition> condition = parseContainerCondition(json);
  if (!condition.has_value()) return std::nullopt;
  return holdsContainerCondition(*condition, [&](const std::optional<std::string> &name) {
    if (asked != nullptr) asked->push_back(name.value_or("null"));
    return size;
  });
}

TEST(ContainerQuery, ComparesTheContainerWidthAndHeight) {
  EXPECT_EQ(holds(R"(["@",null,[">=","width",400]])", ContainerSize{500, 100}), true);
  EXPECT_EQ(holds(R"(["@",null,[">=","width",400]])", ContainerSize{300, 100}), false);
  EXPECT_EQ(holds(R"(["@",null,[">","height",200]])", ContainerSize{100, 201}), true);
  EXPECT_EQ(holds(R"(["@",null,[">","height",200]])", ContainerSize{100, 200}), false);
}

TEST(ContainerQuery, ReadsAspectRatioAsWidthOverHeight) {
  EXPECT_EQ(holds(R"(["@",null,[">","aspect-ratio",1.5]])", ContainerSize{320, 160}), true);
  EXPECT_EQ(holds(R"(["@",null,[">","aspect-ratio",1.5]])", ContainerSize{150, 100}), false);
}

TEST(ContainerQuery, CallsASquareContainerPortrait) {
  const std::string portrait = R"(["@",null,["=","orientation","portrait"]])";
  const std::string landscape = R"(["@",null,["=","orientation","landscape"]])";
  EXPECT_EQ(holds(portrait, ContainerSize{100, 100}), true);
  EXPECT_EQ(holds(landscape, ContainerSize{100, 100}), false);
  EXPECT_EQ(holds(landscape, ContainerSize{200, 100}), true);
}

TEST(ContainerQuery, TreatsAContainerWithNoHeightAsAnAspectRatioThatHoldsNothing) {
  EXPECT_EQ(holds(R"(["@",null,[">","aspect-ratio",0]])", ContainerSize{100, 0}), false);
}

TEST(ContainerQuery, IsFalseWhenNoContainerAnswersNotInsideTheQueryIncluded) {
  const std::string narrow = R"(["@",null,["!",["<","width",200]]])";
  EXPECT_EQ(holds(narrow, std::nullopt), false);
  EXPECT_EQ(holds(narrow, ContainerSize{300, 100}), true);
}

TEST(ContainerQuery, AsksForTheContainerByTheNameTheQueryCarries) {
  std::vector<std::string> asked;
  holds(R"(["@","card",[">=","width",0]])", ContainerSize{1, 1}, &asked);
  holds(R"(["@",null,[">=","width",0]])", ContainerSize{1, 1}, &asked);
  EXPECT_EQ(asked, (std::vector<std::string>{"card", "null"}));
}

TEST(ContainerQuery, JoinsWithTheConstantsTheEnvironmentSettled) {
  const std::string both = R"(["&",[["@",null,[">=","width",400]],true]])";
  const std::string blocked = R"(["&",[["@",null,[">=","width",400]],false]])";
  const std::string either = R"(["|",[false,["@",null,["<","width",400]]]])";
  EXPECT_EQ(holds(both, ContainerSize{500, 100}), true);
  EXPECT_EQ(holds(both, ContainerSize{300, 100}), false);
  EXPECT_EQ(holds(blocked, ContainerSize{500, 100}), false);
  EXPECT_EQ(holds(either, ContainerSize{300, 100}), true);
}

TEST(ContainerQuery, AnswersAConstantWithoutAskingForAContainer) {
  std::vector<std::string> asked;
  EXPECT_EQ(holds("true", std::nullopt, &asked), true);
  EXPECT_EQ(holds("false", std::nullopt, &asked), false);
  EXPECT_TRUE(asked.empty());
}

// A container whose style leaves an axis to its content answers no query that reads that axis
TEST(ContainerQuery, IsFalseForAQueryOnAnAxisTheContainerLeavesToItsContent) {
  const ContainerSize widthOpen{500, 100, true, false};
  const ContainerSize heightOpen{500, 100, false, true};
  EXPECT_EQ(holds(R"(["@",null,[">=","width",400]])", widthOpen), false);
  EXPECT_EQ(holds(R"(["@",null,[">=","height",50]])", widthOpen), true);
  EXPECT_EQ(holds(R"(["@",null,[">=","height",50]])", heightOpen), false);
  EXPECT_EQ(holds(R"(["@",null,[">=","width",400]])", heightOpen), true);
}

TEST(ContainerQuery, ReadsAspectRatioAndOrientationFromBothAxes) {
  const ContainerSize widthOpen{500, 100, true, false};
  EXPECT_EQ(holds(R"(["@",null,[">","aspect-ratio",1]])", widthOpen), false);
  EXPECT_EQ(holds(R"(["@",null,["=","orientation","landscape"]])", widthOpen), false);
}

TEST(ContainerQuery, KeepsTheLeafFalseWhenANotSitsInsideTheQuery) {
  const ContainerSize widthOpen{500, 100, true, false};
  EXPECT_EQ(holds(R"(["@",null,["!",["<","width",400]]])", widthOpen), false);
  EXPECT_EQ(holds(R"(["@",null,["|",[["<","width",400],[">=","height",50]]]])", widthOpen), false);
  EXPECT_EQ(holds(R"(["@",null,["&",[[">=","height",50],[">","height",10]]]])", widthOpen), true);
}

TEST(ContainerQuery, RejectsTextThatIsNotACondition) {
  EXPECT_EQ(holds("", std::nullopt), std::nullopt);
  EXPECT_EQ(holds("[", std::nullopt), std::nullopt);
  EXPECT_EQ(holds(R"(["?",1])", std::nullopt), std::nullopt);
  EXPECT_EQ(holds(R"(["@",null,[">=","hue",1]])", std::nullopt), std::nullopt);
  EXPECT_EQ(holds(R"(["@",null,[">=","width","wide"]])", std::nullopt), std::nullopt);
  EXPECT_EQ(holds(R"(["@",null,true] trailing)", std::nullopt), std::nullopt);
}

} // namespace
} // namespace symbiote

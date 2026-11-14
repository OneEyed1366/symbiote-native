// The process-wide `:root` table of decision 38: one value per name, shared by every surface
#include <gtest/gtest.h>

#include <optional>
#include <string>

#include "SymbioteGlobalVariables.h"

namespace symbiote {
namespace {

class GlobalVariablesTest : public ::testing::Test {
 protected:
  void SetUp() override {
    GlobalVariables::instance().clear();
  }
};

TEST_F(GlobalVariablesTest, StoresAValueUnderItsName) {
  GlobalVariables::instance().set("--gap", "8px");

  EXPECT_EQ(GlobalVariables::instance().get("--gap"), std::optional<std::string>("8px"));
}

TEST_F(GlobalVariablesTest, AnUndeclaredNameReadsAsNothing) {
  EXPECT_EQ(GlobalVariables::instance().get("--missing"), std::nullopt);
}

TEST_F(GlobalVariablesTest, ALaterWriteReplacesTheValue) {
  GlobalVariables::instance().set("--ink", "#111");
  GlobalVariables::instance().set("--ink", "#eee");

  EXPECT_EQ(GlobalVariables::instance().get("--ink"), std::optional<std::string>("#eee"));
}

TEST_F(GlobalVariablesTest, EraseForgetsOnlyThatName) {
  GlobalVariables::instance().set("--a", "1");
  GlobalVariables::instance().set("--b", "2");
  GlobalVariables::instance().erase("--a");

  EXPECT_EQ(GlobalVariables::instance().get("--a"), std::nullopt);
  EXPECT_EQ(GlobalVariables::instance().get("--b"), std::optional<std::string>("2"));
}

TEST_F(GlobalVariablesTest, ErasingAnUnknownNameIsHarmless) {
  GlobalVariables::instance().erase("--never-set");

  EXPECT_EQ(GlobalVariables::instance().get("--never-set"), std::nullopt);
}

TEST_F(GlobalVariablesTest, TheInstanceIsOneObject) {
  EXPECT_EQ(&GlobalVariables::instance(), &GlobalVariables::instance());
}

} // namespace
} // namespace symbiote

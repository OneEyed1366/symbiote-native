// The per-surface table of decision 20: a variable written on one surface is invisible to another
#include <gtest/gtest.h>

#include <optional>
#include <string>

#include "SymbioteSurfaceVariables.h"

namespace symbiote {
namespace {

constexpr int32_t kMine = 1;
constexpr int32_t kTheirs = 11;

class SurfaceVariablesTest : public ::testing::Test {
 protected:
  void SetUp() override {
    SurfaceVariables::instance().clear();
  }
};

TEST_F(SurfaceVariablesTest, StoresAValueUnderItsSurfaceAndName) {
  SurfaceVariables::instance().set(kMine, "--gap", "8px");

  EXPECT_EQ(SurfaceVariables::instance().get(kMine, "--gap"), std::optional<std::string>("8px"));
}

TEST_F(SurfaceVariablesTest, AnotherSurfaceDoesNotSeeIt) {
  SurfaceVariables::instance().set(kMine, "--gap", "8px");

  EXPECT_EQ(SurfaceVariables::instance().get(kTheirs, "--gap"), std::nullopt);
}

TEST_F(SurfaceVariablesTest, ALaterWriteReplacesTheValue) {
  SurfaceVariables::instance().set(kMine, "--ink", "#111");
  SurfaceVariables::instance().set(kMine, "--ink", "#eee");

  EXPECT_EQ(SurfaceVariables::instance().get(kMine, "--ink"), std::optional<std::string>("#eee"));
}

TEST_F(SurfaceVariablesTest, EraseForgetsOnlyThatNameOnThatSurface) {
  SurfaceVariables::instance().set(kMine, "--a", "1");
  SurfaceVariables::instance().set(kMine, "--b", "2");
  SurfaceVariables::instance().set(kTheirs, "--a", "3");
  SurfaceVariables::instance().erase(kMine, "--a");

  EXPECT_EQ(SurfaceVariables::instance().get(kMine, "--a"), std::nullopt);
  EXPECT_EQ(SurfaceVariables::instance().get(kMine, "--b"), std::optional<std::string>("2"));
  EXPECT_EQ(SurfaceVariables::instance().get(kTheirs, "--a"), std::optional<std::string>("3"));
}

TEST_F(SurfaceVariablesTest, ErasingAnUnknownNameOrSurfaceIsHarmless) {
  SurfaceVariables::instance().erase(kTheirs, "--never-set");

  EXPECT_EQ(SurfaceVariables::instance().get(kTheirs, "--never-set"), std::nullopt);
}

} // namespace
} // namespace symbiote

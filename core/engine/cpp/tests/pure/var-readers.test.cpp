// Which nodes read which variable name, so a write marks only those (decision 55)
#include <gtest/gtest.h>

#include <algorithm>
#include <string>
#include <vector>

#include "SymbioteVarReaders.h"

namespace symbiote {
namespace {

class VarReadersTest : public ::testing::Test {
 protected:
  void SetUp() override {
    VarReaders::instance().clear();
  }

  static bool isReader(void *owner, const char *name) {
    const std::vector<void *> readers = VarReaders::instance().readersOf(name);
    return std::find(readers.begin(), readers.end(), owner) != readers.end();
  }
};

TEST_F(VarReadersTest, AnOwnerIsFoundUnderEveryNameItRead) {
  int node = 0;
  VarReaders::instance().set(&node, {"--bg", "--gap"});

  EXPECT_TRUE(isReader(&node, "--bg"));
  EXPECT_TRUE(isReader(&node, "--gap"));
}

TEST_F(VarReadersTest, AnOwnerIsNotFoundUnderAnotherName) {
  int node = 0;
  VarReaders::instance().set(&node, {"--bg"});

  EXPECT_FALSE(isReader(&node, "--gap"));
}

TEST_F(VarReadersTest, ANewListReplacesTheOldOne) {
  int node = 0;
  VarReaders::instance().set(&node, {"--bg"});
  VarReaders::instance().set(&node, {"--gap"});

  EXPECT_FALSE(isReader(&node, "--bg"));
  EXPECT_TRUE(isReader(&node, "--gap"));
}

TEST_F(VarReadersTest, AnEmptyListForgetsTheOwner) {
  int node = 0;
  VarReaders::instance().set(&node, {"--bg"});
  VarReaders::instance().set(&node, {});

  EXPECT_FALSE(isReader(&node, "--bg"));
}

TEST_F(VarReadersTest, ForgetDropsOnlyThatOwner) {
  int first = 0;
  int second = 0;
  VarReaders::instance().set(&first, {"--bg"});
  VarReaders::instance().set(&second, {"--bg"});
  VarReaders::instance().forget(&first);

  EXPECT_FALSE(isReader(&first, "--bg"));
  EXPECT_TRUE(isReader(&second, "--bg"));
}

TEST_F(VarReadersTest, IsEmptyUntilSomeoneReadsAName) {
  int node = 0;
  EXPECT_TRUE(VarReaders::instance().empty());

  VarReaders::instance().set(&node, {"--bg"});
  EXPECT_FALSE(VarReaders::instance().empty());

  VarReaders::instance().forget(&node);
  EXPECT_TRUE(VarReaders::instance().empty());
}

TEST_F(VarReadersTest, ARepeatedNameIsListedOnce) {
  int node = 0;
  VarReaders::instance().set(&node, {"--bg", "--bg"});

  EXPECT_EQ(VarReaders::instance().readersOf("--bg").size(), 1u);
}

} // namespace
} // namespace symbiote

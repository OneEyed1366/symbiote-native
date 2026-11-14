// A follow-up commit is owed to the surface whose own consumers wait, never to another surface's
#include <gtest/gtest.h>

#include <memory>
#include <vector>

#include "SymbioteDeferredConsumers.h"

namespace symbiote {
namespace {

constexpr int32_t kSurfaceA = 1;
constexpr int32_t kSurfaceB = 11;

struct FakeNode {
  bool isWaiting = true;
};

const auto kIsWaiting = [](const FakeNode &node) { return node.isWaiting; };

TEST(DeferredConsumersTest, OwesAFollowUpWhileItsOwnConsumerWaits) {
  DeferredConsumers<FakeNode> deferred;
  const auto node = std::make_shared<FakeNode>();
  deferred.replace(kSurfaceA, {node});

  EXPECT_TRUE(deferred.hasAny(kSurfaceA, kIsWaiting));
}

TEST(DeferredConsumersTest, AnotherSurfaceWaitingDoesNotOweThisOneAFollowUp) {
  DeferredConsumers<FakeNode> deferred;
  const auto nodeOfB = std::make_shared<FakeNode>();
  deferred.replace(kSurfaceB, {nodeOfB});

  EXPECT_FALSE(deferred.hasAny(kSurfaceA, kIsWaiting));
}

TEST(DeferredConsumersTest, ADeadConsumerOfThisSurfaceIsNotOwedWhileAnotherSurfaceStillWaits) {
  DeferredConsumers<FakeNode> deferred;
  const auto nodeOfB = std::make_shared<FakeNode>();
  deferred.replace(kSurfaceB, {nodeOfB});
  {
    const auto nodeOfA = std::make_shared<FakeNode>();
    deferred.replace(kSurfaceA, {nodeOfA});
  }

  EXPECT_FALSE(deferred.hasAny(kSurfaceA, kIsWaiting));
  EXPECT_TRUE(deferred.hasAny(kSurfaceB, kIsWaiting));
}

TEST(DeferredConsumersTest, AConsumerThatNoLongerWaitsOwesNothing) {
  DeferredConsumers<FakeNode> deferred;
  const auto node = std::make_shared<FakeNode>();
  deferred.replace(kSurfaceA, {node});
  node->isWaiting = false;

  EXPECT_FALSE(deferred.hasAny(kSurfaceA, kIsWaiting));
}

TEST(DeferredConsumersTest, ACleanPassClearsOnlyItsOwnSurface) {
  DeferredConsumers<FakeNode> deferred;
  const auto nodeOfA = std::make_shared<FakeNode>();
  const auto nodeOfB = std::make_shared<FakeNode>();
  deferred.replace(kSurfaceA, {nodeOfA});
  deferred.replace(kSurfaceB, {nodeOfB});

  deferred.replace(kSurfaceA, {});

  EXPECT_FALSE(deferred.hasAny(kSurfaceA, kIsWaiting));
  EXPECT_TRUE(deferred.hasAny(kSurfaceB, kIsWaiting));
}

} // namespace
} // namespace symbiote

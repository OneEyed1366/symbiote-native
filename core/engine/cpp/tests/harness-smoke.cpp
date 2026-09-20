/*
 * Does this build actually give us React Native's renderer, with its asserts live?
 *
 * Every later test here rests on three claims: a `UIManager` is constructible outside an app, the
 * calls `SymbioteTree.cpp` makes on it (`createNode`, `appendChild`) work against it, and
 * `react_native_assert` still fires. None is obvious -- the whole reason the TypeScript stand-in
 * exists is that "you cannot run Fabric headless" was assumed. If this file goes red, the harness
 * is wrong and nothing built on top of it means anything.
 *
 * The setup below is React Native's own, from
 * `ReactCommon/react/renderer/uimanager/tests/FindShadowNodeByTagTest.cpp`.
 */

#include <react/debug/react_native_assert.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/components/root/RootComponentDescriptor.h>
#include <react/renderer/components/view/ViewComponentDescriptor.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/core/ShadowNodeFragment.h>
#include <react/renderer/uimanager/UIManager.h>

#include <gtest/gtest.h>

namespace facebook::react {
namespace {

class HarnessTest : public ::testing::Test {
 protected:
  HarnessTest() {
    contextContainer_ = std::make_shared<ContextContainer>();

    auto registry = providers_.createComponentDescriptorRegistry(ComponentDescriptorParameters{
        .eventDispatcher = EventDispatcher::Shared{},
        .contextContainer = contextContainer_,
        .flavor = nullptr});
    providers_.add(concreteComponentDescriptorProvider<RootComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ViewComponentDescriptor>());

    // The executor never runs: nothing in the tree path needs to re-enter JavaScript.
    RuntimeExecutor never = [](std::function<void(jsi::Runtime &)> &&) {};
    uiManager_ = std::make_unique<UIManager>(never, contextContainer_);
    uiManager_->setComponentDescriptorRegistry(registry);
  }

  std::shared_ptr<ShadowNode> view(int32_t tag) {
    return uiManager_->createNode(tag, "View", surfaceId_, RawProps(folly::dynamic::object()), nullptr);
  }

  SurfaceId surfaceId_{1};
  ComponentDescriptorProviderRegistry providers_{};
  std::shared_ptr<const ContextContainer> contextContainer_;
  std::unique_ptr<UIManager> uiManager_;
};

// why: `createNode` by view NAME is the single call our tree makes to bring a node into existence;
// if a name does not resolve to a component here, nothing downstream can be tested at all.
TEST_F(HarnessTest, createsANodeFromAViewName) {
  auto node = view(1);

  ASSERT_NE(node, nullptr);
  EXPECT_EQ(node->getComponentName(), std::string{"View"});
  EXPECT_EQ(node->getTag(), 1);
}

// why: `createNode` + `appendChild` is the entire pair `materialize` uses to assemble a subtree, and
// a child landing in the parent is the precondition for every child-set rule we have.
TEST_F(HarnessTest, appendChildPutsTheChildInTheParent) {
  auto parent = view(1);
  auto child = view(2);

  uiManager_->appendChild(parent, child);

  ASSERT_EQ(parent->getChildren().size(), 1u);
  EXPECT_EQ(parent->getChildren().at(0)->getTag(), 2);
}

// why: this build exists to catch what a Release device build swallows. `ShadowNodeFamily::setParent`
// asserts that a family is bound to one parent for life, and that assert is what aborted the app on
// 2026-09-15; under NDEBUG it early-returns instead and leaves a mis-attached child standing. A green
// suite here would mean nothing if the asserts were compiled out, so prove they are not.
TEST(HarnessDeathTest, stillAbortsOnAReactNativeAssert) {
  EXPECT_DEATH({ react_native_assert(1 == 2); }, "");
}

} // namespace
} // namespace facebook::react

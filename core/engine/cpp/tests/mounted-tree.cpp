/*
 * What the PLATFORM received, read back through React Native's own stub host.
 *
 * Every other test in this directory reads the shadow tree — the state the engine left behind.
 * These read the mutations the differ produced from it, which is what iOS and Android actually
 * consume, and therefore what a headless test has to assert on if it wants to claim the app would
 * behave the same way.
 *
 * The distance between the two is not academic, and the first test below is the proof: a `<View>`
 * with nothing on it produces a shadow node and NO NATIVE VIEW AT ALL. `core/test-utils`'s fake
 * Fabric has been reporting a created, committed node for every one of those all along — a whole
 * class of view that does not exist on a device.
 *
 * The ops are written as literal numbers rather than through a builder on purpose: the opcode
 * alphabet is the contract with `core/engine/src/mutation-buffer.ts`, and a test that imports the
 * numbers from the code it tests can only confirm that code agrees with itself.
 */

#include "symbiote-host.h"

#include <gtest/gtest.h>

#include <memory>

namespace symbiote::testing {
namespace {

void evaluate(Host &host, const char *source) {
  host.runtime().evaluateJavaScript(std::make_shared<jsi::StringBuffer>(source), "case.js");
}

// why: Fabric FLATTENS a view that carries no reason to exist — no testID, no background, no
// border, no handler, no opacity (`ViewShadowNode::initialize`). Layout still happens; a native
// view is never created. Anything that reports such a node as mounted is describing a device this
// project does not run on.
TEST(MountedTree, aViewWithNothingOnItIsFlattenedAway) {
  Host host;
  evaluate(host, R"JS(
    var slots = [{}, {}];
    var instances = [{}, {}];
    var ops = new Int32Array([
      0, 0, 0, 0, 0, -1,
      0, 1, 0, 0, 1, -1,
      3, 0, 1, -1, -1, -1,
      8, 1, 0, -1, -1, -1
    ]);
    __symbioteEngineNative.applyOps(ops, ['RCTView', 'RCTView'], [], instances, slots);
  )JS");
  host.mount();

  EXPECT_EQ(host.committedRootChildCount(), 1u);
  EXPECT_EQ(host.shape(), "RootView()");
}

// why: a `testID` is the cheapest thing that makes a view real — it is what a test queries by, so a
// queryable view is by definition one the platform holds. It does NOT make it a container: a view
// that forms no stacking context is painted but not nested, and its children are mounted as the
// SIBLINGS of it. The native tree is therefore not the shadow tree reshaped; it is flatter.
TEST(MountedTree, aTestIdMakesAViewRealButNotAContainer) {
  Host host;
  evaluate(host, R"JS(
    var slots = [{}, {}];
    var instances = [{}, {}];
    var ops = new Int32Array([
      0, 0, 0, 0, 0, -1,
      0, 1, 0, 0, 1, -1,
      6, 0, 1, 0, -1, -1,
      6, 1, 1, 1, -1, -1,
      3, 0, 1, -1, -1, -1,
      8, 1, 0, -1, -1, -1
    ]);
    __symbioteEngineNative.applyOps(
      ops, ['RCTView', 'testID'], ['surface', 'child'], instances, slots);
  )JS");
  host.mount();

  EXPECT_EQ(host.shape(), "RootView(View()View())");
}

// why: nesting on the platform costs a STACKING CONTEXT, and `nativeID` is one of the things that
// buys it (`ViewShadowNode::initialize`). Same shadow tree as the case above, different mounted
// shape — which is the whole reason a test may not read the shadow tree and call it the platform.
TEST(MountedTree, aStackingContextIsWhatMakesAViewNestOnThePlatform) {
  Host host;
  evaluate(host, R"JS(
    var slots = [{}, {}];
    var instances = [{}, {}];
    var ops = new Int32Array([
      0, 0, 0, 0, 0, -1,
      0, 1, 0, 0, 1, -1,
      6, 0, 1, 0, -1, -1,
      6, 1, 1, 1, -1, -1,
      3, 0, 1, -1, -1, -1,
      8, 1, 0, -1, -1, -1
    ]);
    __symbioteEngineNative.applyOps(
      ops, ['RCTView', 'nativeID'], ['surface', 'child'], instances, slots);
  )JS");
  host.mount();

  EXPECT_EQ(host.shape(), "RootView(View(View()))");
}

} // namespace
} // namespace symbiote::testing

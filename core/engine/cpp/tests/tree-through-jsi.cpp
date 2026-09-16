/*
 * `SymbioteTree.cpp` driven through its REAL entry point -- `applyOps` on a real JSI runtime, with
 * real `Int32Array` commands, real placeholder objects carrying `NativeState`, and a real
 * `UIManager` committing into a real `ShadowTree`.
 *
 * This is the file that makes `core/test-utils/src/tree-applier.ts` unnecessary. That module is a
 * second implementation of the rules below, written in TypeScript so that vitest has something to
 * commit into; being a second implementation, it can and did disagree with this one in silence.
 * Here there is one implementation, and it is the one that ships.
 *
 * Every assertion reads the tree React Native ended up holding, never the bookkeeping our own side
 * kept -- a test that asks the implementation what it did proves only that it is self-consistent.
 *
 * The runtime is JavaScriptCore rather than Hermes only because macOS carries it. Nothing in the
 * tree path is engine-specific; what matters is that the values crossing into `applyOps` are real
 * JS values, which is the half a TypeScript stand-in can never be.
 */

#include "SymbioteEngineBindings.h"

#include <JSCRuntime.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/componentregistry/componentNameByReactViewName.h>
#include <react/renderer/components/root/RootComponentDescriptor.h>
#include <react/renderer/components/scrollview/ScrollViewComponentDescriptor.h>
#include <react/renderer/components/text/ParagraphComponentDescriptor.h>
#include <react/renderer/components/text/RawTextComponentDescriptor.h>
#include <react/renderer/components/text/TextComponentDescriptor.h>
#include <react/renderer/components/view/ViewComponentDescriptor.h>
#include <react/renderer/mounting/ShadowTree.h>
#include <react/renderer/uimanager/UIManager.h>
#include <react/renderer/uimanager/UIManagerBinding.h>

#include <gtest/gtest.h>

namespace facebook::react {
namespace {

constexpr SurfaceId kSurfaceId = 1;

/**
 * The opcode alphabet, which is the contract between `core/engine/src/mutation-buffer.ts` and
 * `SymbioteTree.cpp`. Spelled out here rather than included from either side: a test that reads the
 * numbers out of the thing it tests can only ever confirm that thing agrees with itself.
 */
enum Op : int32_t {
  opCreateElement = 0,
  opCreateRawText = 1,
  opCreateAnchor = 2,
  opAppendChild = 3,
  opInsertBefore = 4,
  opRemoveChild = 5,
  opSetProp = 6,
  opSetText = 7,
  opCommit = 8,
  opSetComponent = 9,
};
constexpr int32_t kStride = 6;
constexpr int32_t kNone = -1;

/**
 * One batch, written the way an adapter writes one. Slot 0 is by convention the surface node --
 * the container every commit is asked about -- and slots 1 and up are the tree beneath it.
 *
 * `viewName` and `text` arguments are indices into the batch's string table, and `value` indices
 * into its value table, exactly as the buffer interns them.
 */
struct Batch {
  std::vector<int32_t> ops;

  Batch &element(int32_t slot, int32_t viewName, bool isText = false) {
    return push({opCreateElement, slot, viewName, isText ? 1 : 0, slot, kNone});
  }
  Batch &rawText(int32_t slot, int32_t text) { return push({opCreateRawText, slot, text}); }
  Batch &anchor(int32_t slot) { return push({opCreateAnchor, slot}); }
  Batch &append(int32_t parent, int32_t child) { return push({opAppendChild, parent, child}); }
  Batch &insertBefore(int32_t parent, int32_t child, int32_t before) {
    return push({opInsertBefore, parent, child, before});
  }
  Batch &remove(int32_t parent, int32_t child) { return push({opRemoveChild, parent, child}); }
  Batch &prop(int32_t slot, int32_t key, int32_t value) { return push({opSetProp, slot, key, value}); }
  Batch &dropProp(int32_t slot, int32_t key) { return push({opSetProp, slot, key, kNone}); }
  Batch &text(int32_t slot, int32_t value) { return push({opSetText, slot, value}); }
  Batch &component(int32_t slot, int32_t viewName) { return push({opSetComponent, slot, viewName}); }
  Batch &commit() { return push({opCommit, kSurfaceId, 0}); }

 private:
  Batch &push(std::vector<int32_t> op) {
    op.resize(kStride, kNone);
    ops.insert(ops.end(), op.begin(), op.end());
    return *this;
  }
};

class TreeTest : public ::testing::Test {
 protected:
  TreeTest() : runtime_(jsc::makeJSCRuntime()) {
    contextContainer_ = std::make_shared<ContextContainer>();

    auto registry = providers_.createComponentDescriptorRegistry(ComponentDescriptorParameters{
        .eventDispatcher = EventDispatcher::Shared{},
        .contextContainer = contextContainer_,
        .flavor = nullptr});
    providers_.add(concreteComponentDescriptorProvider<RootComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ViewComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ParagraphComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<TextComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<RawTextComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ScrollViewComponentDescriptor>());

    RuntimeExecutor never = [](std::function<void(jsi::Runtime &)> &&) {};
    uiManager_ = std::make_shared<UIManager>(never, contextContainer_);
    uiManager_->setComponentDescriptorRegistry(registry);

    // A real box to lay out in. With a zero-sized constraint the layout pass has nothing to do, and
    // the layout pass is precisely what clones children behind a targeted replace.
    uiManager_->getShadowTreeRegistry().add(std::make_unique<ShadowTree>(
        kSurfaceId,
        LayoutConstraints{.minimumSize = {.width = 0, .height = 0},
                          .maximumSize = {.width = 500, .height = 500}},
        LayoutContext{},
        *uiManager_,
        *contextContainer_));

    UIManagerBinding::createAndInstallIfNeeded(*runtime_, uiManager_);
    symbiote::installBindings(*runtime_);
    installOpsHelper();
  }

  ~TreeTest() override { uiManager_->getShadowTreeRegistry().remove(kSurfaceId); }

  /**
   * What an adapter keeps around the buffer, and nothing more: one placeholder object per slot, for
   * as long as the node lives, plus the public instance each created node is handed. The slot table
   * lives in JS deliberately -- a node's owner is its handle, so a table on the C++ side would keep
   * nodes alive that the real system lets go.
   */
  void installOpsHelper() {
    runtime_->evaluateJavaScript(
        std::make_shared<jsi::StringBuffer>(R"JS(
          var slots = [];
          var instances = [];
          function apply(ops, strings, values, slotCount) {
            while (slots.length < slotCount) { slots.push({}); instances.push({}); }
            var buffer = new Int32Array(ops.length);
            buffer.set(ops);
            __symbioteEngineNative.applyOps(buffer, strings, values, instances, slots);
          }
        )JS"),
        "ops-helper.js");
  }

  void apply(const Batch &batch,
             const std::vector<std::string> &strings = {},
             int32_t slotCount = 8,
             const std::vector<folly::dynamic> &values = {}) {
    auto &runtime = *runtime_;
    auto opsArray = jsi::Array(runtime, batch.ops.size());
    for (size_t at = 0; at < batch.ops.size(); at++) {
      opsArray.setValueAtIndex(runtime, at, jsi::Value(batch.ops[at]));
    }
    auto stringsArray = jsi::Array(runtime, strings.size());
    for (size_t at = 0; at < strings.size(); at++) {
      stringsArray.setValueAtIndex(runtime, at, jsi::String::createFromUtf8(runtime, strings[at]));
    }
    auto valuesArray = jsi::Array(runtime, values.size());
    for (size_t at = 0; at < values.size(); at++) {
      valuesArray.setValueAtIndex(runtime, at, jsi::valueFromDynamic(runtime, values[at]));
    }
    runtime.global()
        .getPropertyAsFunction(runtime, "apply")
        .call(runtime, std::move(opsArray), std::move(stringsArray), std::move(valuesArray),
              jsi::Value(slotCount));
  }

  /**
   * The surface node as React Native holds it, not as we believe we built it.
   *
   * Slot 0 is contributed to the root child set ITSELF rather than flattened into it -- it is the
   * app container view, and it commits. So the tree under test hangs one level below here.
   */
  std::shared_ptr<const ShadowNode> surface() {
    std::shared_ptr<const ShadowNode> node;
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      const auto &children = shadowTree.getCurrentRevision().rootShadowNode->getChildren();
      if (!children.empty()) node = children.at(0);
    });
    return node;
  }

  std::vector<std::shared_ptr<const ShadowNode>> mounted() {
    auto node = surface();
    return node == nullptr ? std::vector<std::shared_ptr<const ShadowNode>>{} : node->getChildren();
  }

  static std::vector<std::string> namesOf(
      const std::vector<std::shared_ptr<const ShadowNode>> &nodes) {
    std::vector<std::string> names;
    names.reserve(nodes.size());
    for (const auto &node : nodes) names.emplace_back(node->getComponentName());
    return names;
  }

  static std::vector<std::string> childNamesOf(const ShadowNode &node) {
    std::vector<std::string> names;
    for (const auto &child : node.getChildren()) names.emplace_back(child->getComponentName());
    return names;
  }

  std::unique_ptr<jsi::Runtime> runtime_;
  ComponentDescriptorProviderRegistry providers_{};
  std::shared_ptr<const ContextContainer> contextContainer_;
  std::shared_ptr<UIManager> uiManager_;
};

// String-table indices used across the tests below.
constexpr int32_t kView = 0;
constexpr int32_t kText = 1;
constexpr int32_t kScrollView = 2;
const std::vector<std::string> kNames{"RCTView", "RCTText", "RCTScrollView"};

// why: everything else here rests on a batch reaching Fabric at all -- one element under the
// surface node has to arrive as one child of the committed root.
TEST_F(TreeTest, commitsACreatedElementIntoTheTree) {
  Batch batch;
  batch.element(0, kView).element(1, kView).append(0, 1).commit();

  apply(batch, kNames);

  EXPECT_EQ(namesOf(mounted()), (std::vector<std::string>{"View"}));
}

// why: a parent that changes its component keeps its tag and its node identity, so a child that
// compares only "same parent object" reuses a family the new parent does not own. Fabric answers
// that with `react_native_assert(parent_.lock() == nullptr || parent_.lock() == parent)` inside
// `ShadowNodeFamily::setParent` -- an abort in Debug, and in Release a silent early return that
// leaves a mis-attached child. This is the 2026-09-15 device crash, and it stood under 5 666 green
// tests because a TypeScript stand-in has no families to mis-attach.
TEST_F(TreeTest, survivesAParentThatChangesItsComponent) {
  Batch built;
  built.element(0, kView).element(1, kView).element(2, kView).append(0, 1).append(1, 2).commit();
  apply(built, kNames);

  Batch renamed;
  renamed.component(1, kScrollView).commit();
  apply(renamed, kNames);

  auto children = mounted();
  ASSERT_EQ(children.size(), 1u);
  EXPECT_EQ(childNamesOf(*children.at(0)).size(), 1u);
}

// why: a `<Text>` inside a `<Text>` is a different native view -- `RCTVirtualText`, which Fabric
// calls `Text`, against `RCTText`'s `Paragraph`. No adapter implements this; the engine decides it
// when a node acquires a parent, because that is when the answer first exists.
TEST_F(TreeTest, nestedTextBecomesVirtualText) {
  Batch batch;
  batch.element(0, kView)
      .element(1, kText, true)
      .element(2, kText, true)
      .append(0, 1)
      .append(1, 2)
      .commit();

  apply(batch, kNames);

  auto children = mounted();
  ASSERT_EQ(children.size(), 1u);
  EXPECT_EQ(children.at(0)->getComponentName(), std::string{"Paragraph"});
  EXPECT_EQ(childNamesOf(*children.at(0)), (std::vector<std::string>{"Text"}));
}

// why: an anchor is a framework bookkeeping node (Svelte's block markers, Vue's fragments) with no
// native counterpart. It must contribute its CHILDREN in its own place -- not itself, and not
// nothing, which would drop everything inside an `{#if}`.
TEST_F(TreeTest, anchorContributesItsChildrenInItsOwnPlace) {
  Batch batch;
  batch.element(0, kView)
      .element(1, kView)
      .anchor(2)
      .element(3, kView)
      .element(4, kView)
      .append(0, 1)
      .append(0, 2)
      .append(2, 3)
      .append(2, 4)
      .commit();

  apply(batch, kNames);

  EXPECT_EQ(namesOf(mounted()), (std::vector<std::string>{"View", "View", "View"}));
}

// why: an empty raw text would paint in Fabric, so it is skipped from its parent's child set --
// and it has to stop being skipped the moment it gains text, which is the update every framework
// emits for an interpolation that was empty on first render.
TEST_F(TreeTest, emptyRawTextIsSkippedUntilItHasText) {
  Batch built;
  built.element(0, kView).element(1, kText, true).rawText(2, 3).append(0, 1).append(1, 2).commit();
  apply(built, {"RCTView", "RCTText", "RCTScrollView", ""});

  ASSERT_EQ(mounted().size(), 1u);
  EXPECT_TRUE(mounted().at(0)->getChildren().empty());

  Batch filled;
  filled.text(2, 3).commit();
  apply(filled, {"RCTView", "RCTText", "RCTScrollView", "hello"});

  EXPECT_EQ(childNamesOf(*mounted().at(0)), (std::vector<std::string>{"RawText"}));
}

// why: a Fabric node belongs to one family for life, so a node handed to a DIFFERENT parent has to
// be rebuilt rather than cloned -- even when the node itself is untouched. A move is the one
// mutation where nothing about the node changed and it still cannot be reused.
TEST_F(TreeTest, movedChildIsRebuiltUnderItsNewParent) {
  Batch built;
  built.element(0, kView)
      .element(1, kView)
      .element(2, kView)
      .element(3, kView)
      .append(0, 1)
      .append(0, 2)
      .append(1, 3)
      .commit();
  apply(built, kNames);

  Batch moved;
  moved.remove(1, 3).append(2, 3).commit();
  apply(moved, kNames);

  auto children = mounted();
  ASSERT_EQ(children.size(), 2u);
  EXPECT_TRUE(children.at(0)->getChildren().empty());
  EXPECT_EQ(children.at(1)->getChildren().size(), 1u);
}

// why: `cloneNodeWithNewProps` MERGES, so a prop that vanished has to travel as an explicit null --
// otherwise the old value stands forever and the view keeps a style the app has removed.
TEST_F(TreeTest, aDeletedPropReturnsTheViewToItsDefault) {
  Batch built;
  built.element(0, kView).element(1, kView).append(0, 1).prop(1, 3, 0).commit();
  apply(built, {"RCTView", "RCTText", "RCTScrollView", "opacity"}, 8, {folly::dynamic(0.25)});

  ASSERT_EQ(mounted().size(), 1u);
  auto faded = std::dynamic_pointer_cast<const ViewShadowNode>(mounted().at(0));
  ASSERT_NE(faded, nullptr);
  ASSERT_FLOAT_EQ(faded->getConcreteProps().opacity, 0.25);

  Batch cleared;
  cleared.dropProp(1, 3).commit();
  apply(cleared, {"RCTView", "RCTText", "RCTScrollView", "opacity"});

  auto restored = std::dynamic_pointer_cast<const ViewShadowNode>(mounted().at(0));
  ASSERT_NE(restored, nullptr);
  EXPECT_FLOAT_EQ(restored->getConcreteProps().opacity, 1.0);
}

// why: `insertBefore` has to land the node at the named position rather than at the end -- a list
// that inserts at the head is the cheapest way to catch a child set that is only ever appended to.
TEST_F(TreeTest, insertBeforePlacesTheNodeAtThatPosition) {
  Batch built;
  built.element(0, kView).element(1, kView).element(2, kText, true).append(0, 1).append(0, 2).commit();
  apply(built, kNames);
  ASSERT_EQ(namesOf(mounted()), (std::vector<std::string>{"View", "Paragraph"}));

  Batch inserted;
  inserted.element(3, kScrollView).insertBefore(0, 3, 2).commit();
  apply(inserted, kNames);

  EXPECT_EQ(namesOf(mounted()), (std::vector<std::string>{"View", "ScrollView", "Paragraph"}));
}

// why: `canReplaceInPlace` rewrites only the moved slots of a parent instead of handing Fabric a
// whole child list, and it measured 500x on a select over 1 000 rows (F-65). It was switched off on
// 2026-09-15 after the device aborted in `ShadowNode::replaceChild` with "Child to replace was not
// found": the layout pass clones a child the parent does not own (`configureYogaTree`), our record
// of the committed children goes stale, and the NEXT commit cannot find what it was told to replace.
//
// The mirror kept taking this path, which is why headless stayed green while the device crashed --
// `replaceChild` is not on the JSI slot at all, so the TypeScript side could never execute the code
// that breaks. This is that gap, reproduced against the real thing: a list updated repeatedly, which
// is the shape a benchmark row takes on its first timed step.
TEST_F(TreeTest, survivesRepeatedUpdatesToOneChildOfALaidOutList) {
  constexpr int32_t kRows = 6;
  constexpr int32_t kOpacity = 3;
  constexpr int32_t kHeight = 4;
  const std::vector<std::string> names{"RCTView", "RCTText", "RCTScrollView", "opacity", "height"};
  const std::vector<folly::dynamic> sizes{folly::dynamic(1.0), folly::dynamic(40.0)};

  Batch built;
  built.element(0, kView);
  for (int32_t at = 1; at <= kRows; at++) {
    built.element(at, kView).append(0, at).prop(at, kHeight, 1);
  }
  built.commit();
  apply(built, names, kRows + 2, sizes);
  ASSERT_EQ(mounted().size(), static_cast<size_t>(kRows));

  // Without this the whole test is theatre: `configureYogaTree` is what clones a child behind a
  // targeted replace, and it only runs when there is layout to do.
  auto laidOut = std::dynamic_pointer_cast<const LayoutableShadowNode>(mounted().at(0));
  ASSERT_NE(laidOut, nullptr);
  ASSERT_FLOAT_EQ(laidOut->getLayoutMetrics().frame.size.height, 40.0f);

  for (int32_t round = 1; round <= 4; round++) {
    const auto faded = folly::dynamic(1.0 / (round + 1));
    Batch update;
    update.prop(2, kOpacity, 2).prop(4, kOpacity, 2).commit();
    apply(update, names, kRows + 2, {sizes.at(0), sizes.at(1), faded});

    ASSERT_EQ(mounted().size(), static_cast<size_t>(kRows)) << "after round " << round;
    auto row = std::dynamic_pointer_cast<const ViewShadowNode>(mounted().at(1));
    ASSERT_NE(row, nullptr);
    EXPECT_FLOAT_EQ(row->getConcreteProps().opacity, faded.asDouble()) << "after round " << round;
    EXPECT_FLOAT_EQ(row->getLayoutMetrics().frame.size.height, 40.0f) << "after round " << round;
  }
}

// why: the narrower shape the disabled-path comment predicts. A child whose COMPONENT changed is
// minted fresh rather than cloned, so it has never been through `configureYogaTree` -- and a
// replacement the parent does not own is exactly what that function clones in place, behind our
// record of the committed children. If the prediction holds, the commit AFTER this one cannot find
// the child it is told to replace.
TEST_F(TreeTest, survivesAChildOfALaidOutListChangingItsComponent) {
  constexpr int32_t kRows = 4;
  constexpr int32_t kHeight = 3;
  const std::vector<std::string> names{"RCTView", "RCTText", "RCTScrollView", "height"};
  const std::vector<folly::dynamic> sizes{folly::dynamic(40.0), folly::dynamic(0.5)};

  Batch built;
  built.element(0, kView);
  for (int32_t at = 1; at <= kRows; at++) {
    built.element(at, kView).append(0, at).prop(at, kHeight, 0);
  }
  built.commit();
  apply(built, names, kRows + 2, sizes);
  auto laidOut = std::dynamic_pointer_cast<const LayoutableShadowNode>(mounted().at(0));
  ASSERT_NE(laidOut, nullptr);
  ASSERT_FLOAT_EQ(laidOut->getLayoutMetrics().frame.size.height, 40.0f);

  Batch swapped;
  swapped.component(2, kScrollView).commit();
  apply(swapped, names, kRows + 2, sizes);
  EXPECT_EQ(namesOf(mounted()),
            (std::vector<std::string>{"View", "ScrollView", "View", "View"}));

  Batch after;
  after.prop(3, kHeight, 0).prop(4, kHeight, 0).commit();
  apply(after, names, kRows + 2, {folly::dynamic(64.0)});

  EXPECT_EQ(namesOf(mounted()),
            (std::vector<std::string>{"View", "ScrollView", "View", "View"}));
}

// why: a reorder inside one parent -- a list swap, the commonest update a list makes -- hands the
// SAME nodes back in a new order. Those nodes are reused untouched, so their yoga nodes are still
// owned by this very parent, and `YogaLayoutableShadowNode::replaceChild` asserts that a replacement
// has no owner (`YogaLayoutableShadowNode.cpp:303`). The targeted-replace path therefore may not be
// taken for a replacement that is already standing in this child set.
//
// Found by the fuzzer below at seed 23, step 15, three milliseconds in.
TEST_F(TreeTest, reordersTwoChildrenWithinTheSameParent) {
  constexpr int32_t kHeight = 3;
  const std::vector<std::string> names{"RCTView", "RCTText", "RCTScrollView", "height"};

  Batch built;
  built.element(0, kView)
      .element(1, kView)
      .element(2, kScrollView)
      .append(0, 1)
      .append(0, 2)
      .prop(1, kHeight, 0)
      .prop(2, kHeight, 0)
      .commit();
  apply(built, names, 4, {folly::dynamic(40.0)});
  ASSERT_EQ(namesOf(mounted()), (std::vector<std::string>{"View", "ScrollView"}));

  Batch swapped;
  swapped.remove(0, 1).append(0, 1).commit();
  apply(swapped, names, 4, {folly::dynamic(40.0)});

  EXPECT_EQ(namesOf(mounted()), (std::vector<std::string>{"ScrollView", "View"}));
}

// ── The fuzzer ───────────────────────────────────────────────────────────────────────────────────
//
// Random op programs against the real tree. The judge is two things and neither is a second
// implementation of the engine: React Native's own asserts, which abort the process, and an ORACLE
// that says what shape should be standing.
//
// The oracle earns that name by modelling the OUTPUT, not the mechanism. It keeps the authored tree
// the ops describe -- who is whose child, what each node is -- and reads off the expected Fabric
// shape by applying the three rules that decide what reaches Fabric: an anchor contributes its
// children in its place, an empty raw text contributes nothing, and a text element under a text
// element is `RCTVirtualText`. It knows nothing of clone-on-write, families, generations, dirty
// propagation, reuse or prop diffing -- the parts `tree-applier.ts` re-implements and the parts that
// drifted. There is nothing here for the engine to disagree with except the answer.

struct ModelNode {
  int32_t kind = opCreateElement;
  int32_t viewName = kView;
  bool isText = false;
  bool hasText = false;
  int32_t parent = kNone;
  std::vector<int32_t> children;
};

/** The shape Fabric should be holding, as `componentName(childShape…)`. */
std::string expectedShape(const std::vector<ModelNode> &model, int32_t slot, bool hasTextAncestor) {
  const auto &node = model.at(static_cast<size_t>(slot));
  const bool childHasTextAncestor = hasTextAncestor || node.isText;

  std::string children;
  for (int32_t child : node.children) {
    const auto &below = model.at(static_cast<size_t>(child));
    if (below.kind == opCreateAnchor) {
      children += expectedShape(model, child, childHasTextAncestor);
      continue;
    }
    if (below.kind == opCreateRawText && !below.hasText) continue;
    children += expectedShape(model, child, childHasTextAncestor);
  }
  if (node.kind == opCreateAnchor) return children;

  std::string name = node.kind == opCreateRawText ? "RCTRawText"
      : (node.isText && hasTextAncestor)          ? "RCTVirtualText"
                                                  : kNames.at(static_cast<size_t>(node.viewName));
  return componentNameByReactViewName(name) + "(" + children + ")";
}

std::string committedShape(const ShadowNode &node) {
  std::string children;
  for (const auto &child : node.getChildren()) children += committedShape(*child);
  return std::string(node.getComponentName()) + "(" + children + ")";
}

/** Deterministic and tiny, so a failing seed is a reproduction rather than a story. */
struct Rng {
  uint64_t state;
  uint32_t next() {
    state = state * 6364136223846793005ULL + 1442695040888963407ULL;
    return static_cast<uint32_t>(state >> 33);
  }
  uint32_t upTo(uint32_t bound) { return bound == 0 ? 0 : next() % bound; }
};

bool descendsFrom(const std::vector<ModelNode> &model, int32_t slot, int32_t ancestor) {
  if (ancestor == kNone) return false;
  for (int32_t at = slot; at != kNone; at = model.at(static_cast<size_t>(at)).parent) {
    if (at == ancestor) return true;
  }
  return false;
}

/** A node that may take a child: anything already attached, plus the surface itself. */
int32_t pickParent(const std::vector<ModelNode> &model, Rng &rng, int32_t except = kNone) {
  std::vector<int32_t> candidates{0};
  for (size_t at = 1; at < model.size(); at++) {
    const auto &node = model.at(at);
    if (node.kind == opCreateRawText || node.parent == kNone) continue;
    if (static_cast<int32_t>(at) == except || descendsFrom(model, static_cast<int32_t>(at), except)) {
      continue;
    }
    candidates.push_back(static_cast<int32_t>(at));
  }
  return candidates.at(rng.upTo(static_cast<uint32_t>(candidates.size())));
}

/** A node currently attached to something, so it can be moved or removed. */
int32_t pickDetachable(const std::vector<ModelNode> &model, Rng &rng) {
  std::vector<int32_t> candidates;
  for (size_t at = 1; at < model.size(); at++) {
    if (model.at(at).parent != kNone) candidates.push_back(static_cast<int32_t>(at));
  }
  if (candidates.empty()) return kNone;
  return candidates.at(rng.upTo(static_cast<uint32_t>(candidates.size())));
}

void detach(std::vector<ModelNode> &model, int32_t slot) {
  auto &node = model.at(static_cast<size_t>(slot));
  auto &siblings = model.at(static_cast<size_t>(node.parent)).children;
  siblings.erase(std::find(siblings.begin(), siblings.end(), slot));
  node.parent = kNone;
}

class TreeFuzzTest : public TreeTest, public ::testing::WithParamInterface<uint64_t> {};

TEST_P(TreeFuzzTest, committedShapeMatchesTheOracleThroughAnOpProgram) {
  constexpr int32_t kSlots = 14;
  constexpr int32_t kSteps = 40;
  const std::vector<std::string> names{"RCTView", "RCTText", "RCTScrollView", "", "x"};
  const std::vector<folly::dynamic> values{folly::dynamic(1.0), folly::dynamic(2.0)};

  Rng rng{GetParam()};
  std::vector<ModelNode> model(1);
  model.at(0) = ModelNode{opCreateElement, kView, false, false, kNone, {}};

  Batch opening;
  opening.element(0, kView).commit();
  apply(opening, names, kSlots, values);

  for (int32_t step = 0; step < kSteps; step++) {
    Batch batch;
    const auto live = static_cast<int32_t>(model.size());
    const uint32_t choice = rng.upTo(100);

    if (choice < 30 && live < kSlots) {
      // Create, and attach it somewhere so it is reachable -- an orphan exercises nothing.
      const int32_t slot = live;
      const uint32_t kind = rng.upTo(10);
      ModelNode made;
      if (kind < 6) {
        made = {opCreateElement, static_cast<int32_t>(rng.upTo(3)), rng.upTo(2) == 0, false, kNone, {}};
        batch.element(slot, made.viewName, made.isText);
      } else if (kind < 8) {
        made = {opCreateRawText, kView, false, rng.upTo(2) == 0, kNone, {}};
        batch.rawText(slot, made.hasText ? 4 : 3);
      } else {
        made = {opCreateAnchor, kView, false, false, kNone, {}};
        batch.anchor(slot);
      }
      const int32_t parent = pickParent(model, rng);
      made.parent = parent;
      model.push_back(made);
      model.at(static_cast<size_t>(parent)).children.push_back(slot);
      batch.append(parent, slot);
    } else if (choice < 50) {
      const int32_t moved = pickDetachable(model, rng);
      if (moved != kNone) {
        const int32_t from = model.at(static_cast<size_t>(moved)).parent;
        detach(model, moved);
        batch.remove(from, moved);
        const int32_t to = pickParent(model, rng, moved);
        model.at(static_cast<size_t>(moved)).parent = to;
        model.at(static_cast<size_t>(to)).children.push_back(moved);
        batch.append(to, moved);
      }
    } else if (choice < 65) {
      const int32_t dropped = pickDetachable(model, rng);
      if (dropped != kNone) {
        batch.remove(model.at(static_cast<size_t>(dropped)).parent, dropped);
        detach(model, dropped);
      }
    } else if (choice < 80) {
      const int32_t slot = static_cast<int32_t>(rng.upTo(static_cast<uint32_t>(live)));
      auto &node = model.at(static_cast<size_t>(slot));
      if (node.kind == opCreateRawText) {
        node.hasText = !node.hasText;
        batch.text(slot, node.hasText ? 4 : 3);
      } else if (node.kind == opCreateElement && slot != 0) {
        node.viewName = static_cast<int32_t>(rng.upTo(3));
        batch.component(slot, node.viewName);
      }
    } else {
      const int32_t slot = static_cast<int32_t>(rng.upTo(static_cast<uint32_t>(live)));
      batch.prop(slot, 4, static_cast<int32_t>(rng.upTo(2)));
    }

    // An abort takes the process with it, so a failing seed leaves no gtest report -- only whatever
    // reached stderr before it. `SYMBIOTE_FUZZ_TRACE=1` turns the program itself into that trail.
    if (std::getenv("SYMBIOTE_FUZZ_TRACE") != nullptr) {
      std::fprintf(stderr, "step %d:", step);
      for (size_t at = 0; at < batch.ops.size(); at += kStride) {
        std::fprintf(stderr, " [%d %d %d %d]", batch.ops[at], batch.ops[at + 1],
                     batch.ops[at + 2], batch.ops[at + 3]);
      }
      std::fprintf(stderr, "\n  expect %s\n", expectedShape(model, 0, false).c_str());
    }

    batch.commit();
    apply(batch, names, kSlots, values);

    auto node = surface();
    ASSERT_NE(node, nullptr) << "seed " << GetParam() << ", step " << step;
    EXPECT_EQ(committedShape(*node), expectedShape(model, 0, false))
        << "seed " << GetParam() << ", step " << step;
  }
}

// 300 programs cost about a second. The budget is deliberate: this runs on every `test:cpp`, so it
// has to be cheap enough that nobody is tempted to skip it.
INSTANTIATE_TEST_SUITE_P(Seeds, TreeFuzzTest, ::testing::Range<uint64_t>(1, 301));

} // namespace
} // namespace facebook::react

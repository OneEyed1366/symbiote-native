#include "SymbioteTree.h"

#include "SymbioteFabricProps.h"

#include <folly/dynamic.h>
#include <jsi/JSIDynamic.h>
#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/renderer/core/InstanceHandle.h>
#include <react/renderer/core/RawProps.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/core/LayoutableShadowNode.h>
#include <react/renderer/core/ShadowNodeFragment.h>
#include <react/renderer/mounting/ShadowTree.h>
#include <react/renderer/mounting/ShadowTreeRegistry.h>
#include <react/renderer/telemetry/TransactionTelemetry.h>
#include <react/renderer/uimanager/UIManager.h>
#include <react/renderer/uimanager/UIManagerBinding.h>
#include <react/renderer/uimanager/primitives.h>

// `react/renderer/dom/` is NOT among the header folders ReactAndroid copies into its prefab
// (`ReactAndroid/build.gradle.kts` lists uimanager, mounting, core, … and no dom), so including it
// unconditionally breaks the Android build of this same file. iOS compiles against the full
// ReactCommon tree and has it.
//
// Detected rather than branched on `__ANDROID__`, because the fact is about the TOOLCHAIN'S HEADERS,
// not about the platform — and it self-heals the day upstream exports the folder. The three
// `measure*` throw where it is absent; everything else needs none of it and works everywhere.
#if __has_include(<react/renderer/dom/DOM.h>)
#define SYMBIOTE_HAS_DOM_MEASURE 1
#include <react/renderer/dom/DOM.h>
#include <react/renderer/uimanager/consistency/ShadowTreeRevisionProvider.h>
#endif

#include <algorithm>
#include <atomic>
#include <chrono>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_set>
#include <utility>
#include <vector>

namespace symbiote {

using namespace facebook;

namespace {

// ── THE WIRE FORMAT ──────────────────────────────────────────────────────────────────────────────
//
// Mirrors `core/engine/src/mutation-buffer.ts`. These numbers ARE the contract: renumbering them
// there without renumbering them here commits a different tree, silently, and no test in either
// language can see across the boundary.
constexpr size_t kOpStride = 6;

constexpr int32_t kOpCreateElement = 0;
constexpr int32_t kOpCreateRawText = 1;
constexpr int32_t kOpCreateAnchor = 2;
constexpr int32_t kOpAppendChild = 3;
constexpr int32_t kOpInsertBefore = 4;
constexpr int32_t kOpRemoveChild = 5;
constexpr int32_t kOpSetProp = 6;
constexpr int32_t kOpSetText = 7;
constexpr int32_t kOpCommit = 8;
constexpr int32_t kOpSetComponent = 9;

constexpr int32_t kKindElement = 0;
constexpr int32_t kKindRawText = 1;
constexpr int32_t kKindAnchor = 2;

// A `setProp` whose value slot is this DELETES the key. `null` cannot carry it: null is a legitimate
// Fabric value meaning "reset to the default", and a merge-based clone needs the two distinguished.
constexpr int32_t kNoValue = -1;

// The one position-dependent view name. A text element inside another text element commits as a
// virtual span — and the flag is STICKY, so `<Text><View><Text>` is virtual too. That is
// `commit.ts:964`'s `node.isText || hasTextAncestor`, and it is the reason the name is resolved
// while the child set is built rather than when a node is inserted: an insert cannot see the whole
// chain, and a reparent would have to rewrite a subtree.
// A `std::string` and not a `const char *` so `materialize` can bind a REFERENCE to either this or
// the node's own name. As a `const char *` the ternary there has no common type but `std::string`,
// so every call constructed one — see there.
const std::string kVirtualTextViewName = "RCTVirtualText";

// Tags identify a node to Fabric and must not collide with a surface's root tag. The JS side used to
// allocate them; there is no reason for that to cross a boundary, so the counter lives here. The
// base is far above any root tag a host hands out, and the step is 2 to keep our tags out of any
// contiguous range another allocator might use.
std::atomic<int32_t> nextTag_{1 << 20};

int32_t allocateTag() {
  return nextTag_.fetch_add(2, std::memory_order_relaxed);
}

// The ceiling on ONE JSI->folly conversion, counted in object entries. Two orders of magnitude
// above anything real: the widest style bag on the benchmark row is ~30 keys.
constexpr size_t kMaxDynamicEntries = 10000;

// `jsi::dynamicFromValue`, bounded. Call this; never the raw one.
//
// The raw walk uses an EXPLICIT STACK and keeps no visited set (JSIDynamic.cpp), so a CYCLIC value
// is not a stack overflow — it is an endless `while (!stack.empty())` allocating one
// `folly::dynamic` entry per turn. The JS thread never returns from `applyOps` and the heap grows
// without bound. Measured 2026-09-09 on `examples/solid`: one press on an Animated control, 15 GB,
// JS thread dead. Every JS-side counter read zero throughout — a saturated thread delivers no
// console line, so the silence was the instrument, not the finding.
//
// An AnimatedNode graph is circular by construction (`leaf-lifecycle.ts` says so where it refuses
// to deep-compare props), so one reaching a prop write is enough.
//
// `filterObjectKeys` is invoked once per key of every object the walk expands, which bounds it
// without reimplementing it. Throwing names the value: a hang becomes a report.
//
// `describe` is a CALLABLE and not the message, because the message is built at the call site out of
// the prop key and the view name and the throw essentially never happens. Taking a `const
// std::string &` made every caller compose it eagerly: two temporaries and a result per prop write,
// 7 003 of them on a 1 000-row Solid create, and a bench of that arm alone put the concatenation at
// 48.8% of the decode path. Same class as the `dlog` arguments `CLAUDE.md` records on the Angular
// renderer — the guard has to be at the ARGUMENT, not inside the function.
template <typename Describe>
folly::dynamic boundedDynamicFrom(
    jsi::Runtime &runtime,
    const jsi::Value &value,
    Describe &&describe) {
  size_t entries = 0;
  return jsi::dynamicFromValue(runtime, value, [&](const std::string &) {
    if (++entries > kMaxDynamicEntries) {
      throw jsi::JSError(
          runtime,
          "symbiote engine: " + describe() + " expanded past " +
              std::to_string(kMaxDynamicEntries) +
              " entries — the value is cyclic or not serialisable");
    }
    return false;
  });
}

struct Node;
using NodePtr = std::shared_ptr<Node>;
using ChildSet = std::vector<std::shared_ptr<const react::ShadowNode>>;

/**
 * A node in OUR tree, which is not Fabric's tree.
 *
 * The distinction is load-bearing and it is the one thing `IMirror` was genuinely for: an ANCHOR has
 * no Fabric counterpart at all, so a store that WAS the Fabric tree could not hold one, and the
 * frameworks put anchors everywhere (`{#if}`, a fragment, a `{@render}` slot).
 *
 * Ownership: `children` is strong and `parent` is raw. So a node is alive while a parent holds it OR
 * while JS names it through its handle's `NativeState`, and dead otherwise — the browser's rule, and
 * the reason nothing here needs an explicit release. Raw upward also means no cycle to leak.
 */
// Whether this node's JS handle carries a `payloadFold`, once anything has looked.
enum class FoldProbe : uint8_t { unknown, absent, present };

struct Node {
  int32_t kind = kKindElement;
  bool isText = false;
  // As the adapter authored it. `committedViewName` below is what was actually sent, which differs
  // exactly when the virtual-text rule fired.
  std::string viewName;
  react::Tag tag = 0;
  folly::dynamic props = folly::dynamic::object();
  std::shared_ptr<const react::InstanceHandle> instanceHandle;

  std::vector<NodePtr> children;
  Node *parent = nullptr;

  // The placeholder object this node was published on, WEAK — what the structural reads hand back,
  // since JS compares the answer by IDENTITY against the host node it is already holding.
  //
  // Weak is forced, and the reference applier is what shows why the two sides differ here: its
  // `nodes` is a `WeakMap<handle, node>` with a STRONG `node.handle` back-edge, so a node held by a
  // parent keeps its handle alive. Inverting that here is not available — the handle owns the node
  // through `NativeState`, so a strong edge back is a cycle across the GC boundary, which is the one
  // shape this file's header spends four paragraphs refusing. RN solves the identical problem the
  // identical way: `InstanceHandle` holds a `jsi::WeakObject` for the JS instance a shadow node
  // names.
  std::optional<jsi::WeakObject> handle;

  // The same placeholder again, STRONG, held for exactly as long as a parent holds this node.
  //
  // The weak edge above is right about ownership and wrong about lifetime, and the gap is what a
  // structural read falls into: JS does not have to name a node to ASK about it — it asks the
  // PARENT for its children. Vue's `setElementText` builds a raw text, appends it and drops it on
  // the same line; solid-js/universal re-derives every position through `childrenOf`. Once the
  // placeholder is collected, `handleOf` answers undefined and the child vanishes from an answer
  // it belongs in — so Vue appends a second raw text over the first (text visibly accumulates,
  // randomly, on GC's schedule) and Solid cannot find a node it placed. React and Svelte never
  // navigate the host, which is why only the two adapters that do went wrong.
  //
  // The cycle this creates — object -> NativeState -> node -> object — is broken by the tree
  // itself: a removed node drops this, and `~Node` drops it for every child, so the collection
  // that frees a subtree cascades down it. Being IN the tree is what pins the handle, exactly as a
  // node in the document is reachable in a browser.
  std::optional<jsi::Object> attachedHandle;

  // ── Commit state ───────────────────────────────────────────────────────────────────────────────
  std::shared_ptr<const react::ShadowNode> committed;
  // What the last commit actually sent, so the next payload can be a minimal diff.
  // `cloneNodeWithNewProps` MERGES rather than replaces (`commit.ts:222-230`), so re-sending an
  // unchanged key re-invokes its native setter — and some ViewManagers rebuild the view on any set.
  folly::dynamic committedProps = folly::dynamic::object();
  std::string committedViewName;
  // The node that held this one in FABRIC at the last commit — the nearest non-anchor ancestor,
  // since an anchor hoists and has no Fabric counterpart. `nullptr` means the surface's child set.
  //
  // A Fabric node belongs to one FAMILY, so a node handed to a different parent must be re-created
  // rather than cloned. A move is therefore the one case where a node can be perfectly CLEAN and
  // still need rebuilding, which is why this is checked apart from the dirty pair. Raw, and safe:
  // it is only ever compared for identity, never dereferenced.
  const Node *committedParent = nullptr;
  // How many Fabric FAMILIES this node has minted, and the parent generation it was last attached
  // under. `committedParent` cannot answer this: a rebuilt node keeps its tag and its identity as a
  // tree node, so a child comparing parents sees no change, takes the reuse path, and is appended
  // into the new family while still holding the old one. `ShadowNodeFamily::setParent` asserts a
  // family has one parent for life — Debug aborts, and Release takes the `hasParent_` early return
  // and leaves the child silently attached to a family that has left the tree.
  //
  // Both rest at 0 and a minted generation is always >= 1, so a node with no Fabric parent — the
  // surface — compares equal forever and is never rebuilt for this.
  unsigned familyGeneration = 0;
  unsigned committedUnderGeneration = 0;
  // The text ancestry and the surface this node last committed UNDER — context taken ABOVE it that
  // its own subtree depends on, and neither is derivable from anything else here. A plain `<View>`
  // moved under a `<Text>` keeps its name and its parent and still has to rebuild, so the `<Text>`
  // beneath IT can go out virtual; and a top-level node moving between two surfaces has
  // `committedParent == nullptr` on both sides, so the surface id is the only thing separating them.
  bool committedTextAncestor = false;
  react::SurfaceId committedSurfaceId = 0;
  // The Fabric children it last handed over, so a rebuild that produces the identical list can
  // decline to clone. A node is DIRTY whenever an op named it, and an op is not a change: an adapter
  // that re-renders the same content writes a fresh object for an unchanged style, which every
  // identity guard above `diffProps` must let through by design.
  ChildSet committedChildren;
  // A SURFACE only: the root child set it last handed to `completeSurface`, so a commit that
  // rebuilds the identical list can decline to complete the root at all. Empty on every other node.
  ChildSet committedRenderable;
  bool hasCommittedRenderable = false;

  // `selfDirty`: this node's own props or child list changed. `pathDirty`: something at or below it
  // did. The pair is what lets an untouched sibling subtree hand back its committed node without
  // being walked at all, which is the whole reason a commit is cheap.
  bool selfDirty = true;
  bool pathDirty = true;
  // Whether the JS handle carries a `payloadFold`. See `foldFor` for why one probe settles it.
  FoldProbe foldProbe = FoldProbe::unknown;

  // A child OUTLIVES its parent whenever JS still names it — `children` is strong and the handle's
  // `NativeState` is a second strong owner, so dropping the parent's reference is not the last one.
  // Its `parent` would then point at freed memory, and two paths dereference it: `markDirty` walks
  // upward through it and `parentOf` hands it to JS.
  //
  // The reference applier has no such window (a JS child's `parent` reference keeps the parent
  // alive), so nothing headless can reach this and there is no test to write for it.
  ~Node() {
    for (const NodePtr &child : children) {
      child->parent = nullptr;
      // Its parent is gone, so nothing pins its placeholder any more. Dropping the strong edge here
      // is what makes the release CASCADE: a child JS no longer names becomes unreachable from both
      // sides, and the collection that frees it runs this same loop one level down.
      child->attachedHandle.reset();
    }
  }
};

struct NodeState : jsi::NativeState {
  explicit NodeState(NodePtr value) : node(std::move(value)) {}
  NodePtr node;
};

/**
 * The node a placeholder owns.
 *
 * `hasNativeState` is asked first because reading state from an object that has none is not
 * something JSI promises anything about, and because the two failures mean different things: no
 * state at all is a batch naming a node it never created.
 */
NodePtr nodeFrom(jsi::Runtime &runtime, const jsi::Object &handle, const char *what) {
  if (!handle.hasNativeState(runtime)) {
    throw jsi::JSError(
        runtime, std::string(what) + ": names a node this batch never created");
  }
  auto state = std::dynamic_pointer_cast<NodeState>(handle.getNativeState(runtime));
  if (state == nullptr) {
    throw jsi::JSError(runtime, std::string(what) + ": handle carries foreign native state");
  }
  return state->node;
}

/**
 * The JS object a node is published on, or `undefined` for a node that is in no tree and that
 * nothing in JS names any more.
 *
 * A node WITH a parent always answers, because the parent pins the placeholder (`attachedHandle`).
 * That is not a nicety: the structural reads are asked about children, and a caller does not have
 * to hold a node to ask about it. This used to say the miss was unreachable, which cost Vue and
 * Solid a silently truncated child list.
 */
jsi::Value handleOf(jsi::Runtime &runtime, const Node &node) {
  if (!node.handle.has_value()) return jsi::Value::undefined();
  return node.handle->lock(runtime);
}

/** Pin the placeholder for as long as a parent holds this node. Idempotent, O(1), no recursion:
 * every node is attached to its own parent at some point and is pinned there. */
void holdHandle(jsi::Runtime &runtime, Node &node) {
  if (node.attachedHandle.has_value() || !node.handle.has_value()) return;
  auto live = node.handle->lock(runtime);
  if (live.isObject()) node.attachedHandle.emplace(live.getObject(runtime));
}

react::UIManager &uiManagerFor(jsi::Runtime &runtime, const char *what) {
  auto binding = react::UIManagerBinding::getBinding(runtime);
  if (binding == nullptr) {
    throw jsi::JSError(
        runtime,
        std::string(what) + ": nativeFabricUIManager is not installed on this runtime");
  }
  return binding->getUIManager();
}

/**
 * A zero-copy view over a JS `Int32Array`.
 *
 * `ArrayBuffer::data` hands back the backing store, so the commands never become JS values — which
 * is the entire reason the format is flat. `byteOffset` is read rather than assumed: a typed array
 * need not start at the head of its buffer.
 */
const int32_t *int32ArrayData(jsi::Runtime &runtime, const jsi::Value &value, size_t &lengthOut) {
  auto typedArray = value.asObject(runtime);
  auto buffer = typedArray.getPropertyAsObject(runtime, "buffer").getArrayBuffer(runtime);
  auto byteOffset = static_cast<size_t>(typedArray.getProperty(runtime, "byteOffset").asNumber());
  lengthOut = static_cast<size_t>(typedArray.getProperty(runtime, "length").asNumber());
  return reinterpret_cast<const int32_t *>(buffer.data(runtime) + byteOffset);
}

// ── DIRTY MARKING ────────────────────────────────────────────────────────────────────────────────

/**
 * Mark a node changed and raise `pathDirty` to the root.
 *
 * The climb stops at the first ancestor already marked, which keeps the invariant "pathDirty implies
 * pathDirty on every ancestor" and makes the whole thing O(1) amortised: after the first op in a
 * subtree, the rest cost one comparison. A reparent is the one case that could break the invariant —
 * a dirty node moved under a clean parent — so every structural op marks the PARENT, which repairs
 * it by construction.
 *
 * The early stop is only sound while EVERY node the commit walks clears its flags, and the nodes the
 * walk contributes nothing for are the ones that would not: an anchor and an empty raw text never
 * reach `materialize`. So `appendRenderable` clears them itself. Without that an anchor keeps
 * `pathDirty` forever after its first commit, the climb halts AT it, and the element above it is
 * never marked — every mutation inside an `{#if}` that already committed is silently dropped.
 */
void markDirty(Node &node) {
  node.selfDirty = true;
  for (Node *at = &node; at != nullptr && !at->pathDirty; at = at->parent) {
    at->pathDirty = true;
  }
}

void detachFromParent(const NodePtr &child) {
  Node *parent = child->parent;
  if (parent == nullptr) return;
  auto &siblings = parent->children;
  siblings.erase(std::remove(siblings.begin(), siblings.end(), child), siblings.end());
  child->parent = nullptr;
  markDirty(*parent);
}

// ── COMMIT ───────────────────────────────────────────────────────────────────────────────────────

/** Element-wise identity. Fabric is clone-on-write, so an unchanged node IS the same object. */
bool sameNodes(const ChildSet &previous, const ChildSet &next) {
  if (previous.size() != next.size()) return false;
  for (size_t at = 0; at < previous.size(); at += 1) {
    if (previous[at] != next[at]) return false;
  }
  return true;
}

/**
 * Whether a changed child list can be applied one slot at a time instead of handed over whole.
 *
 * THE POINT. Handing Fabric a child list costs `updateYogaChildren()` — `adoptYogaChild` per child,
 * and a child still owned by the previous revision is `clone({})`d outright. Measured on Yoga alone
 * (`core/engine/bench/replace-child-equivalence.cpp`): replacing one child of a thousand costs 1 000
 * children touched and **999 yoga clones** that way, against 1 and 0 this way, with the two arms
 * producing the identical tree. Through a real adapter the same quantity reads 1 001 children handed
 * over for 2 moved positions on a select — 500x (each adapter's `work-ledger.probe.test`).
 *
 * THIS IS NOT AVAILABLE TO A JS RENDERER. `nativeFabricUIManager` exposes three clone forms and no
 * `replaceChild` (`UIManagerBinding.cpp`); it is a `ShadowNode` method, reachable only because this
 * applier lives on the native side and `UIManager::cloneNode` hands back a NON-const node. React's
 * own renderer cannot do this.
 *
 * Three conditions, and each rules out a real case rather than a hypothetical one:
 *
 *   SAME LENGTH        an insert or a removal has no slot to rewrite. The whole list goes over, as
 *                      before, and the work ledger reports those steps at 1.0x for exactly this
 *                      reason.
 *   SOMETHING MOVED    a list held whole is already served by `childrenPlaceholder()` above.
 *   VIEW CULLING OFF   and this one is an UPSTREAM BUG, not a preference. `ShadowNode::appendChild`
 *                      ends with `propagateUncullableTraitsFromChildren()`;
 *                      `ShadowNode::replaceChild` has that same call placed AFTER both of its
 *                      `return`s, so it is dead on every success path. With culling on, a parent
 *                      whose child was replaced would keep a stale `Unstable_uncullableTrace` where
 *                      the list hand-over refreshes it. `enableViewCulling()` defaults to FALSE in
 *                      0.86 so the divergence is latent today — this guard is what keeps it latent
 *                      on the day someone flips the flag.
 */
/**
 * How many positions moved, or `kWidthChanged` when the list is not the same length.
 *
 * ONE pass, and it answers both questions the clone branch asks. It first did not: `sameNodes` said
 * whether anything moved and `canReplaceInPlace` then walked the same vector again to ask how much —
 * a second O(width) pass added by the very change that removes O(width) work. Caught by reading this
 * file the way it asks everything else to be read.
 */
constexpr size_t kWidthChanged = static_cast<size_t>(-1);

size_t countChangedPositions(const ChildSet &previous, const ChildSet &next) {
  if (previous.size() != next.size()) return kWidthChanged;
  size_t changed = 0;
  for (size_t at = 0; at < next.size(); at += 1) {
    if (previous[at] != next[at]) changed += 1;
  }
  return changed;
}

/**
 * The renderable children a parent collected, plus the one fact about their kinds the replace rule
 * needs.
 *
 * One object rather than a vector and a loose count, so the count cannot drift from the vector it
 * describes — the same reason `work-ledger.ts` owns its columns instead of four probes each keeping
 * their own.
 */
struct IOwnerTally {
  std::vector<Node *> nodes;
  size_t rawTexts = 0;
};

/**
 * Whether a `children_` index is also a valid `yogaLayoutableChildren_` index for this parent.
 *
 * The Yoga override validates `suggestedIndex` against `yogaLayoutableChildren_` and falls back to a
 * `find_if` when it does not match — slow, never wrong. The two vectors diverge only for a MIXED
 * parent, because `RawTextShadowNode` extends plain `ShadowNode` and is the one child kind that is
 * not Yoga-layoutable. All-layoutable and none-layoutable both align: in the second case the yoga
 * vector is EMPTY, the scan finds nothing and returns immediately, which is O(1) rather than a fall
 * back to anything.
 *
 * F-40 stood in for this check with a half-width bound, on the grounds that nothing enforces the
 * shape. Nothing does — but the shape is READABLE from our own tree, which is strictly better than a
 * bound that turns away work it did not have to.
 */
bool childIndicesAlign(const IOwnerTally &owners, const ChildSet &next) {
  if (owners.nodes.size() != next.size()) return false;
  // A COUNT, not a scan. This walked the owners vector a second time to recover kinds the loop that
  // BUILT it had already seen — 1 001 owners re-examined per select on a 1 000-row list, and a full
  // scan even on an append, where it is an argument the rule then throws away. F-41 fused the same
  // shape once already; F-49 is that lesson arriving at the pass F-43 introduced.
  return owners.rawTexts == 0 || owners.rawTexts == owners.nodes.size();
}

/**
 * Whether every replacement leaves the layout alone.
 *
 * THE CONDITION THE TARGETED PATH CANNOT BE CORRECT WITHOUT, and F-51 is the measurement that says
 * so. Replacing in place leaves the standing children owned by the PREVIOUS revision, so the first
 * layout pass that does work on this parent clones every one of them
 * (`yoga::Node::cloneChildrenIfNeeded` → `cloneChildInPlace`) and swaps them in behind us. The child
 * list `adoptLandedChildren` recorded at commit time then names nodes that are no longer there —
 * measured at 999 of 1 000 — and the NEXT commit's `ShadowNode::replaceChild` cannot find the child
 * it was asked to replace. That path ends in `react_native_assert(false && "Child to replace was not
 * found.")`, which is nothing at all in a Release build: the function returns having replaced
 * nothing and the mutation is silently dropped.
 *
 * A layout pass only does that work when the parent is dirty, and a parent goes dirty because a
 * child did. So the targeted path is safe exactly when no replacement moved layout — which is also
 * the only case where F-45 says it saves any clones. The two conditions coinciding is the reason to
 * trust the rule rather than a coincidence to note.
 */
bool replacementsAreLayoutClean(const ChildSet &previous, const ChildSet &next) {
  for (size_t at = 0; at < next.size(); at += 1) {
    if (previous[at] == next[at]) continue;
    const auto *layoutable =
        dynamic_cast<const react::LayoutableShadowNode *>(next[at].get());
    if (layoutable != nullptr && !layoutable->getIsLayoutClean()) return false;
  }
  return true;
}

/**
 * No replacement may be a node this parent is ALREADY holding.
 *
 * `YogaLayoutableShadowNode::replaceChild` asserts `YGNodeGetOwner(&newChild->yogaNode_) == nullptr`
 * (`YogaLayoutableShadowNode.cpp:303`) and then claims ownership. A node standing in this very child
 * set is owned by this very parent, so handing it back at another index aborts — and in Release
 * silently corrupts the yoga tree, since the owner is overwritten while the old slot still points at
 * it. That is a REORDER, which is what every list swap emits.
 *
 * The full child-list handover has no such restriction: `updateYogaChildren` re-adopts the lot.
 *
 * TWO CHILD LISTS, AND THE ASYMMETRY IS THE WHOLE POINT — see `liveChildrenOf`. `recorded` decides
 * WHICH slots moved, because `next` was derived from it and only the two together are consistent.
 * `standing` decides WHAT THIS PARENT ACTUALLY HOLDS, because a replacement already owned by this
 * parent is an owner conflict whether or not our record knows the node is there.
 */
bool replacementsAreFresh(
    const ChildSet &recorded,
    const ChildSet &standing,
    const ChildSet &next) {
  std::unordered_set<const react::ShadowNode *> held;
  held.reserve(standing.size());
  for (const auto &child : standing) held.insert(child.get());
  for (size_t at = 0; at < next.size(); at += 1) {
    if (recorded[at] == next[at]) continue;
    if (held.count(next[at].get()) != 0) return false;
  }
  return true;
}

/**
 * What this parent's children ARE right now, as opposed to what we recorded them to be.
 *
 * THE LAYOUT PASS MUTATES A STANDING PARENT IN PLACE, and that is the fact this whole path was
 * disabled over. `YogaLayoutableShadowNode::cloneChildInPlace` clones a child and calls
 * `replaceChild(childNode, clonedChildNode, layoutableChildIndex)` on the parent it is already
 * holding — so the PARENT's own pointer never changes while its children vector does. That is what
 * defeats `adoptCommitted`'s `node.committed == landed` stop: the pointer is identical, the subtree
 * is not, and Fabric's "an identical child pointer means an identical subtree" invariant does not
 * hold across a layout pass. Our record then names a node that is no longer in the list, and
 * `ShadowNode::replaceChild` ends in `react_native_assert(false && "Child to replace was not
 * found.")` — silent in Release, where the mutation is simply dropped.
 *
 * The rule the disabling comment asked for is therefore not a predicate over which nodes Fabric may
 * substitute — it is to stop needing one. A record can go stale; the parent cannot be wrong about
 * its own children. Note `cloneChildInPlace` substitutes AT THE SAME INDEX, which is what makes
 * position the stable key both sides can agree on.
 */
const ChildSet &liveChildrenOf(const Node &node) {
  static const ChildSet kNone;
  return node.committed == nullptr ? kNone : node.committed->getChildren();
}

/**
 * How many parents took the targeted path since this was last read.
 *
 * A LIVENESS counter, and it exists because every test in this repository stays green when the path
 * is off — that is how it spent eighteen months disabled with a comment claiming a 500x on the line
 * above it. Correctness here is the fuzzer's job; this answers the other question, which no
 * correctness test can: did the fast path RUN. A guard tightened by accident shows up as a zero
 * rather than as nothing at all.
 *
 * Process-wide and zeroed on read, the same deal `readCommitProfile`'s counters make in JS.
 */
size_t targetedReplaces_ = 0;

/**
 * `materialize`'s own stopwatch, because the walk is invisible to every clock React Native owns.
 *
 * `TransactionTelemetry` times `ShadowTree::commit` and Yoga, and `materialize` runs in `kOpCommit`
 * BEFORE `completeSurface` is called at all — so the walk sits in neither window. Priced by
 * subtraction on 2026-09-17 (`raw-fabric-vs-engine.itest.ts`: our commit 229 ms against a Fabric
 * `commitMs` of 26.7, and a bare-JSI arm whose whole `completeRoot` was 28 ms), which put ~200 ms of
 * a 327 ms create inside this function and named nothing inside it. A number reached by subtracting
 * two others is a budget, not an address.
 *
 * Nanoseconds, accumulated across the whole walk and zeroed when read. `steady_clock::now()` costs
 * ~20 ns here against phases of tens of milliseconds, and it is read at most five times per node.
 */
struct IWalkCost {
  double walkNs = 0;
  double propsNs = 0;
  double rawPropsNs = 0;
  double createNs = 0;
  double appendNs = 0;
  double diffNs = 0;
  size_t created = 0;
  size_t cloned = 0;
  size_t reused = 0;
  // `applyOps`' own half, which is a different question from the walk's: the walk asks what Fabric
  // charges, this asks what OUR decode charges to turn one op into one node. On `build-release` the
  // decode came out the same size as the per-node JSI calls it exists to replace, which is the one
  // result that would make the buffer architecture pointless — so it gets named from the inside too.
  double decodeNs = 0;
  double instanceHandleNs = 0;
  double publishNs = 0;
  double nativeStateNs = 0;
  size_t decoded = 0;
  // `kOpSetProp`, and inside it the JS value -> `folly::dynamic` conversion. NOT counted on the two
  // early exits (an absent key being deleted, and a value that compares equal to the standing one) —
  // both leave before the accumulate, and both are the cheap paths, so the sum is an under-count of
  // a case that is already small when it exits early. `propConvertNs` has no such hole.
  double setPropNs = 0;
  double propConvertNs = 0;
  size_t setProps = 0;
  // How well the interning actually worked: entries in the batch's value table against conversions
  // performed. `setProps` / `valueEntries` is the dedup the buffer achieved, and
  // `valueConversions` / `valueEntries` says how much of the table the ops even reached.
  size_t valueEntries = 0;
  size_t valueConversions = 0;
};
IWalkCost walkCost_;

using ISteadyClock = std::chrono::steady_clock;

double nanosSince(const ISteadyClock::time_point &startedAt) {
  return std::chrono::duration<double, std::nano>(ISteadyClock::now() - startedAt).count();
}

bool canReplaceInPlace(
    const Node &node,
    const ChildSet &standing,
    const ChildSet &next,
    size_t changed,
    bool indicesAlign) {
  // ON since 2026-09-17, after eighteen months of this comment saying OFF. What changed is not
  // another guard — it is where the old child comes from.
  //
  // This path rewrites a standing parent's moved slots instead of handing Fabric a whole child list.
  // Handing the list over ends in `YogaLayoutableShadowNode::updateYogaChildren`, which re-adopts and
  // re-clones EVERY standing child, so the cost of touching one row is the width of the list it sits
  // in. Measured through the real engine on a real JSI runtime
  // (`core/engine/cpp/tests/js/create-append-phase-split.itest.ts`), one prop on one row of a list
  // 4 000 wide, node count held constant at 20 000: **405 ms with this path off, 3 ms with it on**,
  // and flat in width instead of rising with it. That is F-65's "500x on a select", recovered.
  //
  // WHY IT WAS OFF, AND WHY THE TWO FAILURES WERE ONE FAILURE. It was disabled after a device abort
  // in `ShadowNode::replaceChild` that nothing headless could reproduce; the fuzzer here then found
  // two, and the older version of this comment read them as separate problems:
  //
  //   `YogaLayoutableShadowNode.cpp:303` — a replacement whose yoga node already has an owner.
  //   `ShadowNode.cpp:281` — "Child to replace was not found."
  //
  // Both are the same cause. `YogaLayoutableShadowNode::cloneChildInPlace` clones a child during
  // LAYOUT and calls `replaceChild` on the parent it is already holding, so the parent's own pointer
  // is unchanged while its children vector is not. `adoptCommitted`'s `node.committed == landed` stop
  // therefore never fires for that parent, our `committedChildren` keeps the pre-layout pointers, and
  // the next commit names a node that left the list. Fabric's "an identical child pointer means an
  // identical subtree" invariant simply does not hold across a layout pass.
  //
  // THE RULE, and it is smaller than the one this comment used to ask for. It asked for a predicate
  // over which nodes Fabric may substitute behind us. There is none worth writing: the answer is to
  // stop keeping a record that can disagree with Fabric. `recorded` still decides WHICH slots moved,
  // because `next` was derived from it and only those two are consistent with each other; but the
  // node to name is read from the parent itself (`liveChildrenOf`, `replacedChangedChildren`), and a
  // parent cannot be wrong about its own children. `cloneChildInPlace` substitutes at the SAME index,
  // which is what leaves position as a key both sides still agree on.
  //
  // The fuzzer is the evidence, and it is the same fuzzer that condemned this path: 300 random op
  // programs, each comparing the committed shape against the oracle, all green. Re-read
  // `replacementsAreFresh` before weakening anything here — its membership set is the LIVE children
  // for this same reason, and that is what closed the owner assert.
  if (react::ReactNativeFeatureFlags::enableViewCulling()) return false;
  if (changed == kWidthChanged || node.committedChildren.empty()) return false;
  // The two lists must agree on WIDTH before position can be used as a key between them. Layout
  // substitutes in place and never changes the count, so this holds wherever the rest of the guard
  // does — it is here because `standing` is read from Fabric rather than maintained by us, and a
  // rule that rests on an index must say out loud which index space it means.
  if (standing.size() != node.committedChildren.size()) return false;
  // A props change of our OWN can dirty us through `updateYogaProps`, and a dirty parent is what
  // sends the layout pass into the children this path declined to re-adopt. The clone is checked
  // again after it exists, because `completeClone` dirties a measurable node whatever its props did.
  if (node.selfDirty) return false;
  // A PARENT THAT DERIVES ITS OWN PAYLOAD FROM ITS CHILDREN CANNOT HAVE THEM SWAPPED SILENTLY.
  //
  // `LeafYogaNode` is Fabric's own name for a node whose children are CONTENT rather than laid-out
  // children — `ParagraphShadowNode` is the one that matters here: its `AttributedString` is built
  // from its children and published as STATE during layout
  // (`updateStateIfNeeded<ParagraphState>`, ParagraphShadowNode.cpp:336). The targeted path hands
  // `childrenPlaceholder()` and rewrites one slot, which changes the content and dirties NOTHING, so
  // the paragraph keeps the state it measured last time. The tree is then correct and the screen is
  // stale, because the differ compares ShadowViews and a ShadowView carries state: with the old state
  // still standing it sees no change and tells the platform nothing.
  //
  // Measured, not reasoned: `react-state-reaches-the-screen.itest.tsx` reads
  // `Update {type: "Paragraph"}` on every round with this path off and NOTHING with it on, while the
  // committed shadow tree carries the new text in both arms. That is the whole device regression —
  // a label stuck at 50% under a moving thumb.
  //
  // `replacedChangedChildren`'s own comment came within one word of this: it argues the parent needs
  // no dirtying because "`completeClone` sets one only for a measurable node, which a `<View>` list
  // parent is not". True of a `<View>`, and the reason the 500x list case is safe — and exactly
  // false of a `<Text>`.
  if (node.committed->getTraits().check(
          react::ShadowNodeTraits::Trait::LeafYogaNode)) {
    return false;
  }
  if (!replacementsAreLayoutClean(node.committedChildren, next)) return false;
  if (!replacementsAreFresh(node.committedChildren, standing, next)) return false;
  // Indices align, so every `replaceChild` is O(1) however many of them there are, and the bound
  // below has nothing left to protect.
  if (indicesAlign) return changed > 0;
  // A MIXED parent, the one case where `suggestedIndex` genuinely cannot be trusted. Bound the share
  // of the width so k replacements cannot become O(N*k); this is a safety property, not a knob.
  //
  // The Yoga override validates `suggestedIndex` against `yogaLayoutableChildren_` and falls back to
  // a `find_if` when it does not match — SLOW, never wrong, which is the failure mode that ships.
  // The two vectors diverge whenever a child is not Yoga-layoutable, and one is:
  // `RawTextShadowNode` extends plain `ShadowNode`. Our commit walk only ever puts raw text under a
  // text element, where the yoga vector is EMPTY and the scan is free — but nothing enforces that
  // shape, and k replacements over a width-N parent would be O(N*k) if it ever stopped holding.
  //
  // Capping the moved share keeps that product bounded and costs nothing real: the win is
  // concentrated exactly where few positions move (a select on 1 000 rows moves 2 and saves 500x),
  // while a list whose every child moved measures 1.7x — the marginal case, and the one carrying the
  // risk. It goes over whole, as before.
  return changed > 0 && changed * 2 <= next.size();
}

// WHY THERE IS NO APPEND PATH HERE, since the shape obviously invites one.
//
// `ShadowNode::appendChild` is public, virtual, O(1) per child in the Yoga override, and absent from
// the JSI surface — the same lever `replaceChild` is. F-48 built it and measured it: same tree, same
// layout, and the children a commit walks halved for a 1 000-onto-1 000 append.
//
// F-51 withdrew it, and unlike the targeted replace it has no safe case to narrow to. Appending
// leaves the standing children owned by the previous revision, exactly as replacing does — but an
// append CHANGES THE CHILD COUNT, so the parent is dirty by construction, the layout pass always
// does work on it, and it always clones every standing child. `core/engine/bench/replace-child-
// layout-clones.cpp` reads 1 000 of 1 004 recorded slots stale afterwards, and the next commit's
// `replaceChild` cannot find the child it was told to replace. There is no condition to guard with:
// the unsafe case IS the case.
//
// `core/engine/bench/append-child-equivalence.cpp` stays as the record of what it was worth.

/**
 * Rewrite every moved slot of `parent`, leaving the rest of its children untouched.
 *
 * The index is passed as `suggestedIndex` and is always the real one, since we built both vectors:
 * `ShadowNode::replaceChild` and its Yoga override each VALIDATE it and fall back to a linear scan,
 * so a wrong index would be slow rather than incorrect — but there is no reason to hand them one.
 *
 * THE DIRTY FLAG IS THE HALF THAT IS EASY TO MISS, and this function no longer touches it because
 * `canReplaceInPlace` now refuses the case entirely. Handing a child list over ends in
 * `YogaLayoutableShadowNode::updateYogaChildren`, whose last line is `yogaNode_.setDirty(!isClean)`
 * — a dirty child dirties its parent, one level per clone, so a row whose height moved reaches the
 * layout pass. Nothing here does that: `yoga::Node::replaceChild` sets no flag, and `completeClone`
 * sets one only for a measurable node, which a `<View>` list parent is not.
 *
 * F-46 answered that by dirtying the parent from here. F-51 found the deeper problem the flag could
 * not fix — a layout pass on this parent clones the children this path declined to re-adopt, and the
 * commit's own record of them goes stale — and moved the answer into the guard: no replacement may
 * move layout. With that in force there is nothing left to dirty, and a flag that can never be set
 * is worse than no flag, because it reads as protection.
 *
 * Measured rather than argued, in `core/engine/bench/replace-child-layout-clones.cpp`.
 */
void replacedChangedChildren(
    react::ShadowNode &parent,
    const ChildSet &recorded,
    const ChildSet &next) {
  // THE OLD CHILD IS READ OFF THE PARENT, NOT OFF OUR RECORD, and the split is the fix that let this
  // path come back on. `recorded` is what `next` was derived from, so it is the only list that can
  // answer "did this slot move"; but it can name a node the LAYOUT pass has since replaced in place
  // (`liveChildrenOf`), and naming that node is precisely the "Child to replace was not found" abort.
  // The parent is never wrong about its own children, so the node to replace is read from there.
  //
  // A slot that moved AND was substituted resolves correctly under both readings: the replacement is
  // a clone of our own (pre-layout) node, which is in the same family, and the subtree is dirty by
  // construction so the layout metrics it drops are recomputed on this very commit.
  const ChildSet &standing = parent.getChildren();
  for (size_t at = 0; at < next.size() && at < standing.size(); at += 1) {
    if (recorded[at] == next[at]) continue;
    parent.replaceChild(*standing[at], next[at], at);
  }
}

/**
 * The family generation a child attached under `parent` should be carrying.
 *
 * `nullptr` is the surface's child set, which is not a node and mints no family — so a top-level
 * node answers against 0, its own resting value, and is never rebuilt for this.
 */
unsigned generationOf(const Node *parent) {
  return parent == nullptr ? 0u : parent->familyGeneration;
}

/** Whether this node's own text makes it invisible. An empty `RCTRawText` would actually paint. */
bool isEmptyRawText(const Node &node) {
  if (node.kind != kKindRawText) return false;
  const auto *text = node.props.get_ptr("text");
  return text == nullptr || !text->isString() || text->asString().empty();
}

/**
 * The minimal payload for a CLONE.
 *
 * Fabric merges a clone's raw props onto the node's existing ones, so a key the node no longer has
 * must be sent as an explicit `null` to reset it to the default, and an unchanged key must not be
 * sent at all — re-sending re-invokes that prop's native setter, and AndroidProgressBar's
 * `styleAttr` setter rebuilds the whole view. Mirrors React's own `diffProperties`.
 */
folly::dynamic diffProps(const folly::dynamic &previous, const folly::dynamic &next) {
  folly::dynamic out = folly::dynamic::object();
  for (const auto &pair : next.items()) {
    const auto *before = previous.get_ptr(pair.first);
    if (before == nullptr || *before != pair.second) out[pair.first] = pair.second;
  }
  for (const auto &pair : previous.items()) {
    if (next.get_ptr(pair.first) == nullptr) out[pair.first] = nullptr;
  }
  return out;
}

std::shared_ptr<const react::ShadowNode> materialize(
    jsi::Runtime &runtime,
    react::UIManager &uiManager,
    Node &node,
    bool hasTextAncestor,
    react::SurfaceId surfaceId,
    const Node *fabricParent);

/**
 * The node's own payload fold, reached through the JS handle it is published on.
 *
 * Empty for the ~all of them that carry none, and the PROBE is what that costs: a `WeakObject` lock
 * plus a property read, on the commit path. So the answer is cached — `foldProbe` — and the
 * assumption that makes caching sound is that a fold is assigned before the node's first commit.
 * Every one is: `attachHostBehavior` writes `node.payloadFold` immediately after `createElement`,
 * and the per-node folds a behavior builds itself (`stickyFold`, `contentFold`) are written in
 * `attach` / `buildStructure`, which run there too. A fold assigned after the first commit is
 * ignored, silently — the reason this paragraph exists rather than a shorter one.
 *
 * The returned closure captures `runtime` and the handle by value; it lives only for the duration of
 * one `fabricProps` call, so nothing here outlives the commit that made it. Deliberately NOT stored
 * on the Node: the closure names the handle, the handle owns the Node through `NativeState`, and a
 * `Node -> Function -> handle -> Node` edge is the GC-boundary cycle this file's header refuses.
 */
IPayloadFold foldFor(jsi::Runtime &runtime, Node &node) {
  if (node.foldProbe == FoldProbe::absent) return {};

  jsi::Value handle = handleOf(runtime, node);
  if (!handle.isObject()) {
    // A collected handle is one no JS caller holds, so nothing can be waiting on its fold. Not
    // cached as `absent`: the miss is about the handle, not about the node.
    return {};
  }
  jsi::Value fold = handle.getObject(runtime).getProperty(runtime, "payloadFold");
  if (!fold.isObject() || !fold.getObject(runtime).isFunction(runtime)) {
    node.foldProbe = FoldProbe::absent;
    return {};
  }
  node.foldProbe = FoldProbe::present;

  // Through a `shared_ptr` because `IPayloadFold` is a `std::function`, which requires a COPYABLE
  // callable, and `jsi::Function` is move-only. Capturing it by value does not compile.
  auto function = std::make_shared<jsi::Function>(fold.getObject(runtime).getFunction(runtime));
  return [&runtime, function](const folly::dynamic &props) {
    return boundedDynamicFrom(
        runtime,
        function->call(runtime, jsi::valueFromDynamic(runtime, props)),
        [] { return std::string("the payloadFold result"); });
  };
}

/**
 * Put `node`'s Fabric contribution into `out` — which is zero, one, or several nodes.
 *
 * An ANCHOR contributes its own children in its place, recursively: it is a position marker the
 * framework inserted and it has no Fabric counterpart. An empty raw text contributes nothing. A
 * SURFACE reaches here too, as an anchor, which is why the commit needs no `rootTag -> node` map.
 */
void appendRenderable(
    jsi::Runtime &runtime,
    react::UIManager &uiManager,
    ChildSet &out,
    // Which of OUR nodes contributed `out[i]`, parallel and always the same length. It exists so a
    // parent can adopt back what Fabric actually kept — see `adoptLandedChildren`. It cannot be
    // derived afterwards: an anchor contributes its children in its place, recursively, so the
    // mapping is not `node.children[i]`.
    //
    // The raw-text count rides along for the same reason: this walk already holds every child's
    // kind, and recovering it later cost a full second pass (F-49).
    IOwnerTally &owners,
    Node &node,
    bool hasTextAncestor,
    react::SurfaceId surfaceId,
    const Node *fabricParent) {
  if (node.kind == kKindAnchor) {
    // The anchor is transparent, so its children's Fabric parent is the anchor's, not the anchor.
    for (const auto &child : node.children) {
      appendRenderable(
          runtime, uiManager, out, owners, *child, hasTextAncestor, surfaceId, fabricParent);
    }
    // Walked, so its flags clear here — `materialize` never sees it. See `markDirty`.
    node.selfDirty = false;
    node.pathDirty = false;
    return;
  }
  if (isEmptyRawText(node)) {
    node.selfDirty = false;
    node.pathDirty = false;
    return;
  }
  out.push_back(materialize(runtime, uiManager, node, hasTextAncestor, surfaceId, fabricParent));
  owners.nodes.push_back(&node);
  if (node.kind == kKindRawText) owners.rawTexts += 1;
}

// Take back the children Fabric actually kept, because it does NOT always keep the ones it was
// given.
//
// `YogaLayoutableShadowNode::adoptYogaChild` clones a child that is still owned by its previous
// parent's yoga node and swaps the clone into the list with `replaceChild` — RN's own comment there
// says "At this point, React has wrong reference to the node. (T138668036)". So after a clone or an
// append loop, our `Node::committed` can name a node that is NOT in the committed tree.
//
// Left uncorrected, that costs the whole commit: `updateMountedFlag` (`updateMountedFlag.cpp:57`)
// and `progressState` (`ShadowTree.cpp:135`) both skip a subtree only when the child pointer is
// IDENTICAL between revisions. Handing back the orphan makes every child differ on the next commit,
// so both walks — and the differ behind them — descend the entire tree for a one-row change.
//
void adoptLandedChildren(Node &node, const std::vector<Node *> &owners) {
  // The generation every owner is now attached under. Its own loop, over ALL of them rather than
  // the min below: a child Fabric did not keep is still a child we handed over, and leaving it on a
  // stale generation would rebuild it forever. Recorded here rather than at the append, because the
  // clone paths never append at all and their children are attached just the same — and `owners`
  // is what carries anchors' hoisted children.
  for (Node *owner : owners) owner->committedUnderGeneration = node.familyGeneration;
  const ChildSet &landed = node.committed->getChildren();
  const size_t count = std::min(owners.size(), landed.size());
  for (size_t index = 0; index < count; index++) {
    if (owners[index]->committed == landed[index]) continue;
    owners[index]->committed = landed[index];
  }
  // What Fabric HOLDS, not what we offered — `sameNodes` on the next commit has to compare against
  // the tree that exists, or an unchanged list reads as changed forever.
  node.committedChildren = landed;
}

// `appendRenderable`'s traversal with the materialising taken out: which of our nodes contribute
// `node`'s Fabric children, in order. Anchors hoist theirs, an empty raw text contributes nothing.
void collectRenderableOwners(Node &node, std::vector<Node *> &owners) {
  for (const auto &child : node.children) {
    if (child->kind == kKindAnchor) {
      collectRenderableOwners(*child, owners);
      continue;
    }
    if (isEmptyRawText(*child)) continue;
    owners.push_back(child.get());
  }
}

// Re-point the retained tree at the nodes Fabric ACTUALLY COMMITTED, after the commit.
//
// This is the repair for the one number that never moved: the measurable text nodes still DIRTY in
// the tree about to be committed read 4 971 on every step, even right after a full layout. Yoga
// clears a node's dirty flag on the object
// it laid out (`CalculateLayout.cpp`, `setDirty(false)` under `performLayout`), so ours staying
// dirty forever means the objects that got laid out were not ours — Fabric substituted clones
// inside the commit and we went on holding the originals. Every later commit then handed it a tree
// whose every measurable leaf was dirty, which is why a 33-write Swap re-measured 2 867 texts while
// React's own renderer, on the identical tree in the same binary, re-measured none.
//
// `adoptLandedChildren` already did this DURING the walk, and that is why it is kept — but it only
// ever sees children of nodes the walk materialised, which on a one-row change is a handful. The
// other 999 rows kept stale pointers. This pass closes that, and it has to run after the commit
// because substitution happens inside it.
//
// O(changed), not O(tree): a ShadowNode is immutable, so an identical pointer means an identical
// subtree and the descent stops there.
void adoptCommitted(Node &node, const std::shared_ptr<const react::ShadowNode> &landed) {
  if (node.committed == nullptr || landed == nullptr) return;
  // A stranger is not adopted. `completeSurface` returns void, so a commit that was cancelled or
  // lost a race leaves the registry holding the PREVIOUS revision — and walking that would drag our
  // pointers backwards, which is worse than the staleness this exists to fix. Family identity is
  // what tells the two apart.
  if (!react::ShadowNode::sameFamily(*node.committed, *landed)) return;
  if (node.committed == landed) return;

  node.committed = landed;
  std::vector<Node *> owners;
  collectRenderableOwners(node, owners);
  const ChildSet &children = landed->getChildren();
  const size_t count = std::min(owners.size(), children.size());
  for (size_t index = 0; index < count; index++) {
    adoptCommitted(*owners[index], children[index]);
  }
  node.committedChildren = children;
}

std::shared_ptr<const react::ShadowNode> materialize(
    jsi::Runtime &runtime,
    react::UIManager &uiManager,
    Node &node,
    bool hasTextAncestor,
    react::SurfaceId surfaceId,
    const Node *fabricParent) {
  // A REFERENCE, and the `&` is the whole point. This ran before the reuse fast path below and
  // constructed a `std::string` on every call — including the ~all of them that are about to return
  // the committed node untouched. Counted through Solid on a 1 000-row list
  // (`adapters/solid/src/work-ledger.probe.test.tsx`): 9 002 calls on a create, 1 005 on a select
  // that rebuilds 3 nodes, 10 002 on an append. Most view names fit libc++'s 22-byte inline buffer,
  // but `RCTSinglelineTextInputView` is 26 and heap-allocates, so the benchmark row pays a malloc
  // and a free per TextInput per commit for a name it already holds.
  //
  // It cannot move below the fast path: `needsFreshFamily` is one of the fast path's own conditions
  // and reads it. Binding a reference is what makes it free rather than what makes it later.
  const std::string &viewName =
      (node.isText && hasTextAncestor) ? kVirtualTextViewName : node.viewName;
  // Two things force a FRESH FAMILY rather than a clone, and neither is visible in the dirty pair.
  //
  // A node whose view name flipped cannot be cloned into the other one — no prop write moves a node
  // between native views. And a node handed to a different parent cannot either: a Fabric node
  // belongs to one family, so a MOVE rebuilds even when the node itself is perfectly clean. That
  // second one is why `fabricParent` is threaded at all, and it is not theoretical — the fake host
  // asserts it (`fake-fabric.ts`'s `assertSameFamily`) and found it in the reference applier.
  //
  // THE THIRD is the PARENT's rebuild, and it is what aborted a Debug build inside
  // `ShadowNodeFamily::setParent`. A parent that flips its view name keeps its tag and its node
  // identity, so `committedParent` sees no change and the child takes the reuse path — into a
  // family it does not belong to. Generations see it, and they see it even for a child that slept
  // through the rebuild: an empty raw text is skipped entirely and never updates its own.
  const bool needsFreshFamily = node.committed != nullptr &&
      (viewName != node.committedViewName || node.committedParent != fabricParent ||
       node.committedUnderGeneration != generationOf(fabricParent));

  // The reuse fast path needs the node to be clean AND its CONTEXT to be the one it committed under.
  // Those are two different questions: the dirty pair is about ops that named this subtree, and the
  // context is about a decision taken above it that the subtree's payload depends on. A node that
  // moved keeps both flags false.
  //
  // Text ancestry is the sharp one, because a rebuild here is not about this node at all — a plain
  // `<View>` carried under a `<Text>` sends the identical payload under an identical name, and the
  // `<Text>` UNDER it has to switch to `RCTVirtualText`. Reuse and the whole subtree keeps the old
  // name, and only the first intermediate node has to be clean for it to happen.
  const bool contextHeld =
      node.committedTextAncestor == hasTextAncestor && node.committedSurfaceId == surfaceId;

  if (!node.selfDirty && !node.pathDirty && node.committed != nullptr && !needsFreshFamily &&
      contextHeld) {
    walkCost_.reused += 1;
    return node.committed;
  }

  auto children = std::make_shared<ChildSet>();
  IOwnerTally owners;
  // STICKY, per `commit.ts:964` — once inside a text element everything below is virtual, including
  // through a non-text element in between.
  const bool childHasTextAncestor = hasTextAncestor || node.isText;
  // BUMPED BEFORE THE CHILDREN ARE WALKED, which is the whole trick: the create branch below has
  // not run yet, so a child asking about its parent's family has to be told what it is ABOUT to be.
  // Same condition that branch tests — a node with no committed form is minting its first family,
  // which is a rebuild from a child's point of view exactly as a re-creation is.
  if (node.committed == nullptr || needsFreshFamily) node.familyGeneration += 1;
  for (const auto &child : node.children) {
    appendRenderable(
        runtime, uiManager, *children, owners, *child, childHasTextAncestor, surfaceId, &node);
  }

  if (node.committed == nullptr || needsFreshFamily) {
    if (node.tag == 0) node.tag = allocateTag();
    // `node.viewName`, NOT the resolved `viewName` above: the fold keys its processors on the
    // AUTHORED component, which a nested `<Text>` never has rewritten to `RCTVirtualText`. Passing
    // the local would silently change which processors run on every nested text node.
    //
    auto startedAt = ISteadyClock::now();
    folly::dynamic payload =
        fabricProps(node.viewName, node.props, foldFor(runtime, node));
    walkCost_.propsNs += nanosSince(startedAt);
    // The payload is needed TWICE and only one of those needs a copy. `RawProps` takes its
    // `folly::dynamic` BY VALUE (`RawProps.h:65`) and consumes it, so Fabric's half is a copy no
    // matter what; the baseline `diffProps` will read on the next commit is the other half, and it
    // used to be a SECOND deep copy because `payload` was const. Every key and every value of every
    // created node, twice — 32 001 entries on a 1 000-row Solid create rather than 32 001 plus a
    // pointer swap. The update path below already moved both of its halves; only create did not.
    startedAt = ISteadyClock::now();
    folly::dynamic forFabric = payload;
    walkCost_.rawPropsNs += nanosSince(startedAt);

    startedAt = ISteadyClock::now();
    auto created = uiManager.createNode(
        node.tag,
        viewName,
        surfaceId,
        react::RawProps(std::move(forFabric)),
        node.instanceHandle);
    walkCost_.createNs += nanosSince(startedAt);

    startedAt = ISteadyClock::now();
    for (const auto &child : *children) uiManager.appendChild(created, child);
    walkCost_.appendNs += nanosSince(startedAt);
    walkCost_.created += 1;
    node.committed = created;
    node.committedProps = std::move(payload);
  } else {
    // DIRTY is not CHANGED, and this is the only place that can tell them apart. An op names a node
    // whether or not it moved a value: a framework re-rendering identical content hands back a fresh
    // object for an unchanged style, and identity is all `setProp` has to go on, so it correctly
    // lets that through. `diffProps` compares by VALUE and is the first thing that can see there is
    // nothing to send. Cloning anyway is not merely wasted work — a new node propagates to the root
    // and makes the surface commit, so an app re-rendering the same tree pays a full
    // `ShadowTree::commit`, with layout and a mount pass, per render.
    // Folded before diffing, so `committedProps` holds the same alphabet on both paths — diffing a
    // folded baseline against a raw bag reports every hoisted style key as vanished, every commit.
    folly::dynamic next = folly::dynamic::object();
    folly::dynamic payload = folly::dynamic::object();
    if (node.selfDirty) {
      auto startedAt = ISteadyClock::now();
      next = fabricProps(node.viewName, node.props, foldFor(runtime, node));
      walkCost_.propsNs += nanosSince(startedAt);
      startedAt = ISteadyClock::now();
      payload = diffProps(node.committedProps, next);
      walkCost_.diffNs += nanosSince(startedAt);
    }
    walkCost_.cloned += 1;
    const size_t changedPositions = countChangedPositions(node.committedChildren, *children);
    const bool childrenHeld = changedPositions == 0;
    const bool sendsNothing = payload.empty() && childrenHeld;
    if (!sendsNothing) {
      // A CHILD LIST IS NOT A FREE ARGUMENT — hand it over only when it actually changed.
      //
      // `fragment.children` is read as a flag three times inside the clone, and every one of them is
      // expensive on a list that did not move (`YogaLayoutableShadowNode.cpp`): it forces
      // `updateYogaChildren()`, which calls `adoptYogaChild` per child, and a child already owned by
      // its previous parent's yoga node is CLONED and swapped in by `replaceChild` — RN's own TODO
      // there says the caller is left holding the wrong reference. It also drops
      // `yogaTreeHasBeenConfigured_`, forcing a full `configureYogaTree` descent, and dirties
      // measurement in `completeClone`. So a props-only change on a parent of a thousand rows
      // re-clones all thousand, every commit, forever.
      //
      // The previous JS engine drew this line and this file had lost it: a props-only change went
      // through `cloneNodeWithNewProps`, with no child list at all (`commit.ts:569`).
      //
      // AND WHEN IT DID CHANGE, IT STILL DOES NOT HAVE TO BE HANDED OVER WHOLE. See
      // `replacedChangedChildren` below — the same argument taken one step further.
      auto rawProps =
          node.selfDirty ? react::RawProps(std::move(payload)) : react::RawProps();
      if (canReplaceInPlace(
              node,
              liveChildrenOf(node),
              *children,
              changedPositions,
              childIndicesAlign(owners, *children))) {
        // The clone gets the PLACEHOLDER, so `fragment.children` is null and `updateYogaChildren()`
        // never runs (`YogaLayoutableShadowNode.cpp:149`) — nothing is re-adopted and nothing is
        // cloned. Then one slot per moved position is rewritten.
        //
        // `rawProps` is EMPTY here and not by luck: `canReplaceInPlace` declines a self-dirty node,
        // which is what lets the fallback below re-clone from the original without rebuilding it.
        auto cloned = uiManager.cloneNode(
            *node.committed, react::ShadowNodeFragment::childrenPlaceholder(), std::move(rawProps));
        // THE LAST GUARD, and it needs the clone to exist. `canReplaceInPlace` ruled out every way
        // this node's own props could dirty it, but `completeClone` dirties a MeasurableYogaNode on
        // any clone whatever its props did — and a dirty parent is what sends the layout pass into
        // the children this path just declined to re-adopt (F-51). Reading the answer costs one
        // virtual call; guessing it from traits would be a second copy of Fabric's rule.
        const auto *layoutable =
            dynamic_cast<const react::LayoutableShadowNode *>(cloned.get());
        if (layoutable == nullptr || layoutable->getIsLayoutClean()) {
          replacedChangedChildren(*cloned, node.committedChildren, *children);
          node.committed = std::move(cloned);
          targetedReplaces_ += 1;
        } else {
          node.committed =
              uiManager.cloneNode(*node.committed, children, react::RawProps());
        }
      } else {
        std::shared_ptr<const ChildSet> handedChildren =
            react::ShadowNodeFragment::childrenPlaceholder();
        if (!childrenHeld) handedChildren = children;
        node.committed =
            uiManager.cloneNode(*node.committed, handedChildren, std::move(rawProps));
      }
    }
    if (node.selfDirty) node.committedProps = std::move(next);
  }

  adoptLandedChildren(node, owners.nodes);
  node.committedViewName = viewName;
  node.committedParent = fabricParent;
  node.committedTextAncestor = hasTextAncestor;
  node.committedSurfaceId = surfaceId;
  node.selfDirty = false;
  node.pathDirty = false;
  return node.committed;
}

// A telemetry interval, or zero when either end was never stamped. `TelemetryClock` IS
// `steady_clock` (`react/utils/Telemetry.h`), so no conversion is involved — but an unstamped point
// is `TimePoint::max()`, and subtracting it yields a plausible-looking enormous number rather than
// an error. A commit that skipped layout must read 0, not centuries.
double millisBetween(
    react::TelemetryTimePoint started,
    react::TelemetryTimePoint ended) {
  if (started == react::kTelemetryUndefinedTimePoint ||
      ended == react::kTelemetryUndefinedTimePoint) {
    return 0;
  }
  return std::chrono::duration<double, std::milli>(ended - started).count();
}

} // namespace

jsi::Value Tree::applyOps(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 5) {
    throw jsi::JSError(
        runtime,
        "symbiote engine: expected applyOps(ops, strings, values, instanceHandles, handles)");
  }

  auto &uiManager = uiManagerFor(runtime, "applyOps");

  size_t opsLength = 0;
  const int32_t *ops = int32ArrayData(runtime, arguments[0], opsLength);
  auto strings = arguments[1].asObject(runtime).asArray(runtime);
  auto values = arguments[2].asObject(runtime).asArray(runtime);
  auto instanceHandles = arguments[3].asObject(runtime).asArray(runtime);
  auto handles = arguments[4].asObject(runtime).asArray(runtime);
  const size_t slotCount = handles.size(runtime);

  // Slot -> node, resolved at most ONCE per batch and usually not at all: a slot this batch creates
  // is written by its own create op and never read from JS, which on a create-shaped commit is
  // nearly every slot. Only a slot naming a node an EARLIER batch created costs a read, and it costs
  // exactly one however many ops go on to name it.
  std::vector<NodePtr> bySlot(slotCount);

  auto checkSlot = [&](int32_t slot) -> size_t {
    if (slot < 0 || static_cast<size_t>(slot) >= slotCount) {
      throw jsi::JSError(
          runtime,
          "applyOps: op names slot " + std::to_string(slot) +
              ", which is outside this batch's handle array");
    }
    return static_cast<size_t>(slot);
  };

  auto nodeAt = [&](int32_t slot) -> const NodePtr & {
    auto at = checkSlot(slot);
    auto &cached = bySlot[at];
    if (cached == nullptr) {
      cached = nodeFrom(runtime, handles.getValueAtIndex(runtime, at).asObject(runtime), "applyOps");
    }
    return cached;
  };

  // Hand a freshly built node to its placeholder. THIS is where it acquires an owner, and it is the
  // only place one is taken — afterwards the object JS already holds is the handle, and when JS and
  // the parent both let go, the node goes.
  auto publish = [&](int32_t slot, NodePtr node) {
    const auto publishStartedAt = ISteadyClock::now();
    auto at = checkSlot(slot);
    auto object = handles.getValueAtIndex(runtime, at).asObject(runtime);
    // Taken once, here, for the same reason the node is: this is the only moment both halves are in
    // hand. Every later op resolves the node THROUGH the object, so the edge back can never be
    // re-derived from anything the ops carry.
    node->handle.emplace(runtime, object);
    const auto stateStartedAt = ISteadyClock::now();
    object.setNativeState(runtime, std::make_shared<NodeState>(node));
    walkCost_.nativeStateNs += nanosSince(stateStartedAt);
    bySlot[at] = std::move(node);
    walkCost_.publishNs += nanosSince(publishStartedAt);
  };

  // Decoded ONCE per batch, not once per op that names a string.
  //
  // This used to read the JSI array and allocate a fresh `std::string` inside the op loop, which
  // spent exactly the saving `mutation-buffer.ts` interns for: its own comment says a 1 000-row
  // create emits about a dozen distinct view names across 10 000 elements and draws every prop key
  // from a set of a few hundred, and none of that reached here. Counted through a real adapter
  // (`adapters/solid/src/batch-decode-census.probe.test.tsx`): 16 005 decodes against a table of
  // 2 008 entries on a create, and the same 8.0x on an append.
  //
  // Two costs go, and only one of them is measurable without a device. The allocation half a bench
  // puts at 3.26x for the whole path (`core/engine/bench/batch-string-decode.cpp`); the other half
  // is 13 997 JSI crossings that simply stop happening, and nothing headless can price those.
  std::vector<std::string> decodedStrings;
  {
    const size_t count = strings.size(runtime);
    decodedStrings.reserve(count);
    for (size_t at = 0; at < count; ++at) {
      decodedStrings.push_back(
          strings.getValueAtIndex(runtime, at).asString(runtime).utf8(runtime));
    }
  }

  // Prop VALUES, converted at most once per entry per batch — the other half of the buffer's
  // interning, and useless without it. `mutation-buffer.ts` gives one entry to one object however
  // many nodes were handed it, so a `StyleSheet.create` style shared by a thousand rows arrives as
  // one entry; this is what turns that into one conversion instead of a thousand identical ones.
  //
  // LAZY rather than eager, unlike the strings above: a batch's value table can hold entries no
  // surviving op names — a prop written and then overwritten in the same batch — and converting one
  // eagerly would charge for work the ops do not ask for. The strings table has no such shape.
  //
  // One consequence worth knowing when a conversion throws: `boundedDynamicFrom`'s message names the
  // prop and view of the FIRST op to reach a given entry, not every op that shares it.
  std::vector<folly::dynamic> convertedValues(values.size(runtime));
  std::vector<bool> valueIsConverted(convertedValues.size(), false);
  walkCost_.valueEntries += convertedValues.size();

  // Bounds-checked, which the per-op version got for free from `getValueAtIndex` throwing. A vector
  // would not throw — it would read past the end — so the check moves here with the decode.
  auto stringAt = [&](int32_t index) -> const std::string & {
    if (index < 0 || static_cast<size_t>(index) >= decodedStrings.size()) {
      throw jsi::JSError(
          runtime,
          "applyOps: op names string " + std::to_string(index) +
              ", which is outside this batch's strings table");
    }
    return decodedStrings[static_cast<size_t>(index)];
  };

  // `auto &&describe` and not a `std::function`: the description must stay a lambda the compiler can
  // inline away, for the reason `boundedDynamicFrom`'s own comment gives — building the string
  // eagerly was 48.8% of the decode path once, and a `std::function` per op would allocate to
  // reintroduce half of it.
  auto valueAt = [&](int32_t index, auto &&describe) -> const folly::dynamic & {
    if (index < 0 || static_cast<size_t>(index) >= convertedValues.size()) {
      throw jsi::JSError(
          runtime,
          "applyOps: op names value " + std::to_string(index) +
              ", which is outside this batch's values table");
    }
    const auto at = static_cast<size_t>(index);
    if (!valueIsConverted[at]) {
      const auto convertStartedAt = ISteadyClock::now();
      convertedValues[at] =
          boundedDynamicFrom(runtime, values.getValueAtIndex(runtime, at), describe);
      walkCost_.propConvertNs += nanosSince(convertStartedAt);
      walkCost_.valueConversions += 1;
      valueIsConverted[at] = true;
    }
    return convertedValues[at];
  };

  for (size_t at = 0; at + kOpStride <= opsLength; at += kOpStride) {
    switch (ops[at]) {
      case kOpCreateElement: {
        const auto decodeStartedAt = ISteadyClock::now();
        auto node = std::make_shared<Node>();
        node->kind = kKindElement;
        node->viewName = stringAt(ops[at + 2]);
        node->isText = ops[at + 3] != 0;
        node->tag = allocateTag();
        const auto handleStartedAt = ISteadyClock::now();
        node->instanceHandle = std::make_shared<const react::InstanceHandle>(
            runtime,
            instanceHandles.getValueAtIndex(runtime, static_cast<size_t>(ops[at + 4])),
            node->tag);
        walkCost_.instanceHandleNs += nanosSince(handleStartedAt);
        publish(ops[at + 1], std::move(node));
        walkCost_.decodeNs += nanosSince(decodeStartedAt);
        walkCost_.decoded += 1;
        break;
      }
      case kOpCreateRawText: {
        auto node = std::make_shared<Node>();
        node->kind = kKindRawText;
        node->viewName = "RCTRawText";
        node->props["text"] = stringAt(ops[at + 2]);
        publish(ops[at + 1], std::move(node));
        break;
      }
      case kOpCreateAnchor: {
        auto node = std::make_shared<Node>();
        node->kind = kKindAnchor;
        publish(ops[at + 1], std::move(node));
        break;
      }
      case kOpAppendChild: {
        const auto &parent = nodeAt(ops[at + 1]);
        auto child = nodeAt(ops[at + 2]);
        detachFromParent(child);
        child->parent = parent.get();
        holdHandle(runtime, *child);
        parent->children.push_back(std::move(child));
        markDirty(*parent);
        break;
      }
      case kOpInsertBefore: {
        const auto &parent = nodeAt(ops[at + 1]);
        auto child = nodeAt(ops[at + 2]);
        const auto &before = nodeAt(ops[at + 3]);
        detachFromParent(child);
        child->parent = parent.get();
        holdHandle(runtime, *child);
        auto &siblings = parent->children;
        auto position = std::find(siblings.begin(), siblings.end(), before);
        siblings.insert(position, std::move(child));
        markDirty(*parent);
        break;
      }
      case kOpRemoveChild: {
        const auto &parent = nodeAt(ops[at + 1]);
        auto child = nodeAt(ops[at + 2]);
        // Named rather than implied: `detachFromParent` reads the child's OWN parent pointer, which
        // is the truth even when the adapter names a stale parent — frameworks spell a move as
        // remove-then-insert and can arrive here after the insert already re-parented the node.
        if (child->parent == parent.get()) {
          detachFromParent(child);
          // Out of the tree, so nothing pins its placeholder any more. Released HERE and not inside
          // `detachFromParent`, which the two attach ops also call to spell a MOVE: dropping the
          // pin there would leave a window, mid-batch, where the node is in no tree and a
          // collection could take the handle a re-attach is about to need.
          child->attachedHandle.reset();
        }
        break;
      }
      // Writing a value the node already holds is a NO-OP and returns before `markDirty`. Fabric
      // never saw a difference either way — `diffProps` would find the key unchanged and drop it —
      // but the mark is not free: it climbs to the first already-dirty ancestor and strips every one
      // of them of the reuse fast path, so an otherwise untouched subtree gets rebuilt purely to
      // prove it is untouched. Measured: Angular's Pressable host bag pushed 104 000 setProp calls
      // for a screen Solid built in 12 000, 90 000 of them writing `undefined` over an absent key.
      //
      // The guard lives HERE and not in the engine's `setProp` because it needs the value the node
      // already holds — a read JS would have to make over the wire, ~44 001 times on a 1 000-row
      // create, which is exactly the traffic this design removes.
      //
      // ONE DELIBERATE ASYMMETRY with the reference applier, and it is in the safe direction. TS
      // compares with `Object.is`, so for a style object or a handler the guard simply never fires:
      // an adapter may hand back the SAME reference with mutated contents, and identity cannot see
      // that. Here the value is a fresh `folly::dynamic` copied off the JSI value, so nothing can
      // mutate it behind us and a deep compare is both available and correct. It therefore turns
      // away strictly MORE writes than TS does. That changes the work, never the committed tree —
      // `diffProps` drops an unchanged key either way — so the two still agree on output.
      case kOpSetProp: {
        const auto setPropStartedAt = ISteadyClock::now();
        const auto &node = nodeAt(ops[at + 1]);
        const auto &key = stringAt(ops[at + 2]);
        if (ops[at + 3] == kNoValue) {
          // An absent key is not a key holding null: deleting one that is not there changes nothing,
          // while deleting one that is there changes what the next `diffProps` sends, since a
          // vanished key has to go out as an explicit null.
          if (node->props.get_ptr(key) == nullptr) break;
          node->props.erase(key);
        } else {
          const auto &value = valueAt(ops[at + 3], [&] {
            return "prop \"" + key + "\" on <" + node->viewName + ">";
          });
          const auto *existing = node->props.get_ptr(key);
          if (existing != nullptr && *existing == value) break;
          // A COPY, where this used to move: the entry is shared by every node the same object was
          // handed to, so it has to survive this op. One `folly::dynamic` copy against one JS ->
          // dynamic conversion, and the conversion is the JSI crossing.
          node->props[key] = value;
        }
        markDirty(*node);
        walkCost_.setPropNs += nanosSince(setPropStartedAt);
        walkCost_.setProps += 1;
        break;
      }
      // The same guard, and here it is strictly stronger than a reference check even in TS: `text`
      // is a string, so this is a real value comparison. A framework that re-renders a subtree and
      // hands back an unchanged label — every list row whose text did not move, on every update —
      // stops dirtying its ancestors.
      // The one op that changes what a node IS rather than what it holds. `materialize`'s
      // `needsFreshFamily` already covers the consequence — a name differing from
      // `committedViewName` re-creates the node and re-parents its children — so this only moves the
      // name and marks. `TextInput`'s `multiline` flip is the whole reason it exists.
      case kOpSetComponent: {
        const auto &node = nodeAt(ops[at + 1]);
        const auto &viewName = stringAt(ops[at + 2]);
        if (node->viewName == viewName) break;
        node->viewName = viewName;
        markDirty(*node);
        break;
      }
      case kOpSetText: {
        const auto &node = nodeAt(ops[at + 1]);
        const auto &text = stringAt(ops[at + 2]);
        const auto *existing = node->props.get_ptr("text");
        if (existing != nullptr && existing->isString() && existing->asString() == text) break;
        // Read BEFORE the write, and only a FLIP marks the parent.
        //
        // A write to or from '' takes this node out of its parent's renderable child list or puts it
        // back, which is a structural change to the PARENT that nothing else here would record.
        // Marking unconditionally made every ordinary relabel do it too, and `markDirty` sets the
        // parent's SELF-dirty bit — which forces a full `fabricProps` + `diffProps` on a node whose
        // own props did not move. Counted through three adapters on a 1 000-row relabel
        // (`adapters/*/src/work-ledger.probe.test.*`): 3 000 payload keys rebuilt to send 1 000.
        // The walk still reaches this node either way, because `markDirty(*node)` raises
        // `pathDirty` on every ancestor.
        const bool wasEmpty =
            existing == nullptr || !existing->isString() || existing->asString().empty();
        node->props["text"] = text;
        markDirty(*node);
        if (node->parent != nullptr && wasEmpty != text.empty()) markDirty(*node->parent);
        break;
      }
      case kOpCommit: {
        const auto surfaceId = static_cast<react::SurfaceId>(ops[at + 1]);
        const auto &surface = nodeAt(ops[at + 2]);
        auto childSet = std::make_shared<ChildSet>();
        // The surface NODE is contributed, not its children — it is the AppContainer view
        // (`createSurfaceRoot`, `flex: 1` + `box-none`) and it commits. Routing it through the same
        // call keeps the two shapes one path: an ANCHOR in this position hoists its children.
        //
        // `nullptr` as the Fabric parent: the root CHILD SET is not a node. So a top-level node
        // moving between two surfaces is NOT caught by the parent comparison — both sides are
        // `nullptr` — and the surface id is what separates them, which is why `materialize`
        // compares that too.
        // The root child set goes to `completeSurface`, which commits it through a transaction we
        // never see the result of — so there is nothing to adopt back here, and these owners are
        // collected only because `appendRenderable` needs somewhere to put them.
        IOwnerTally rootOwners;
        // THE ONE TIMER THAT IS NOT PER NODE, and it has to be here rather than inside
        // `materialize`: the walk is recursive, so a timer around the recursive call would count
        // every ancestor's time again for every descendant. This is the walk's single entry point.
        const auto walkStartedAt = ISteadyClock::now();
        appendRenderable(
            runtime, uiManager, *childSet, rootOwners, *surface, false, surfaceId, nullptr);
        walkCost_.walkNs += nanosSince(walkStartedAt);
        // SKIPPED when the root child set comes back identical. `materialize` already declines to
        // clone a node nothing changed, so an unchanged tree produces the same handles — and
        // `completeSurface` on them is a full `ShadowTree::commit`, with layout and a mount pass,
        // for no change at all.
        //
        // This is what makes the JS side's commit fan-out free: every commit names every live root,
        // because a cross-surface mutation dirties a surface whose renderer nobody is holding
        // (`commitSurfaceOps` in tree-host.ts). An untouched root reaches here with an identical
        // list and stops.
        if (surface->hasCommittedRenderable &&
            sameNodes(surface->committedRenderable, *childSet)) {
          break;
        }
        surface->committedRenderable = *childSet;
        surface->hasCommittedRenderable = true;
        // `completeSurface` runs `ShadowTree::commit` itself, with a lambda that REPLACES the root's
        // children outright — so a retry against a moved root is harmless and there is nothing to
        // rebase. That is why this needs neither a commit hook nor a retained pending root.
        uiManager.completeSurface(
            surfaceId,
            childSet,
            {.enableStateReconciliation = true,
             .mountSynchronously = false,
             .source = react::ShadowTree::CommitSource::React});
        uiManager.getShadowTreeRegistry().visit(
            surfaceId, [&rootOwners](const react::ShadowTree &shadowTree) {
              // THE REPAIR, and it must run here rather than in `materialize`: substitution happens
              // INSIDE the commit, so the only tree that can be believed is the one the registry
              // holds once `completeSurface` has returned. See `adoptCommitted`.
              const ChildSet &landedRoot =
                  shadowTree.getCurrentRevision().rootShadowNode->getChildren();
              const size_t rootCount =
                  std::min(rootOwners.nodes.size(), landedRoot.size());
              for (size_t index = 0; index < rootCount; index++) {
                adoptCommitted(*rootOwners.nodes[index], landedRoot[index]);
              }
            });
        break;
      }
      default:
        throw jsi::JSError(runtime, "applyOps: unknown opcode " + std::to_string(ops[at]));
    }
  }

  return jsi::Value::undefined();
}

jsi::Value Tree::getProp(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 2) {
    throw jsi::JSError(runtime, "symbiote engine: expected getProp(handle, key)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "getProp");
  const auto *found = node->props.get_ptr(arguments[1].asString(runtime).utf8(runtime));
  if (found == nullptr) return jsi::Value::undefined();
  return jsi::valueFromDynamic(runtime, *found);
}

jsi::Value Tree::getProps(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected getProps(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "getProps");
  // The whole bag in one crossing. The per-key alternative needs the key list first, which is a
  // crossing of its own, and a payload fold reads most of what it is handed.
  return jsi::valueFromDynamic(runtime, node->props);
}

jsi::Value Tree::markPropsDirty(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected markPropsDirty(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "markPropsDirty");
  // The same mark an op leaves. A behavior whose payload is DERIVED — the sticky header's
  // translateY lives in its own runtime, not in the node's props — writes nothing, so without this
  // the commit skips the node it is about to change.
  markDirty(*node);
  return jsi::Value::undefined();
}

jsi::Value Tree::getViewName(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected getViewName(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "getViewName");
  // The COMMITTED name when there is one, because that is the answer the virtual-text rule may have
  // changed; the authored name before a first commit, when the rule has not been asked yet.
  return jsi::String::createFromUtf8(
      runtime, node->committedViewName.empty() ? node->viewName : node->committedViewName);
}

// ── THE STRUCTURAL READS ─────────────────────────────────────────────────────────────────────────
//
// Mirroring `tree-applier.ts`'s `parentHandleOf` / `childHandlesOf` / `committedRecordOf`, which the
// suite exercises. Each divergence below is deliberate and named; nothing else may differ.

jsi::Value Tree::parentOf(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected parentOf(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "parentOf");
  // The node's OWN parent, a SURFACE included. Stopping at a surface is `host-access.ts`'s job, and
  // it does it by reading the answer's `component` — three adapters depend on the miss meaning "not
  // attached to anything I placed" rather than "has no parent".
  if (node->parent == nullptr) return jsi::Value::undefined();
  return handleOf(runtime, *node->parent);
}

/**
 * The node that follows this one in its parent's child list.
 *
 * Its own call rather than `parentOf` + `childrenOf` in JS, and the reason is a measurement: Vue's
 * renderer names `nextSibling` once per row while patching a keyed list, and the JS spelling read
 * the WHOLE sibling list to find one entry. On a 1 000-row append that was 1 002 001 handles
 * marshalled across the boundary — quadratic, and every one of those handles a JSI object built and
 * thrown away. Here the scan is a pointer comparison over a vector and exactly one handle crosses.
 *
 * A SURFACE parent answers like any other: the surface is an ordinary node in this tree, so a
 * top-level node's siblings are its children. That is what lets `host-access.ts` stop passing the
 * surface for this question.
 */
jsi::Value Tree::nextSiblingOf(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected nextSiblingOf(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "nextSiblingOf");
  if (node->parent == nullptr) return jsi::Value::undefined();
  const auto &siblings = node->parent->children;
  auto at = std::find_if(siblings.begin(), siblings.end(), [&](const NodePtr &sibling) {
    return sibling.get() == node.get();
  });
  if (at == siblings.end() || std::next(at) == siblings.end()) {
    return jsi::Value::undefined();
  }
  return handleOf(runtime, **std::next(at));
}

jsi::Value Tree::childrenOf(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected childrenOf(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "childrenOf");

  // ANCHORS INCLUDED. The commit skips them; traversal must not, or a framework runtime desyncs from
  // the tree it built — solid-js/universal keeps its own record of what it inserted and re-derives
  // positions through this call, so a node it placed has to be a node it can find.
  //
  // Built into a vector first because the length is not known until the locks are done: a child
  // whose handle is gone contributes nothing rather than an `undefined` hole, since the ABI's answer
  // is an array of objects. The two are indistinguishable downstream — `childrenOf` in
  // `host-access.ts` filters anything that is not one of our nodes — so the typed one wins.
  std::vector<jsi::Value> live;
  live.reserve(node->children.size());
  for (const auto &child : node->children) {
    auto handle = handleOf(runtime, *child);
    if (handle.isUndefined()) continue;
    live.push_back(std::move(handle));
  }

  auto out = jsi::Array(runtime, live.size());
  for (size_t at = 0; at < live.size(); at += 1) {
    out.setValueAtIndex(runtime, at, std::move(live[at]));
  }
  return out;
}

// A node whose handle is gone contributes neither itself nor its descendants, which is what the JS
// recursion this replaces did: `host-access.ts` filters a dead handle out of the child list, so the
// walk never reached what was under it. Kept identical on purpose — this is a cost fix, and a sweep
// that suddenly tears down MORE nodes than before would be a behaviour change wearing one.
void collectSubtree(jsi::Runtime &runtime, const NodePtr &node, std::vector<jsi::Value> &into) {
  auto handle = handleOf(runtime, *node);
  if (handle.isUndefined()) return;
  into.push_back(std::move(handle));
  for (const auto &child : node->children) collectSubtree(runtime, child, into);
}

jsi::Value Tree::ancestorsOf(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected ancestorsOf(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "ancestorsOf");

  // Counted first so the array is built once at its final size. A chain is short — a screen's depth,
  // not a tree's — so the second walk costs nothing against an array that grows.
  // `.get()` because `nodeFrom` hands back the owning pointer while `parent` is a raw one — the
  // chain is walked as raw pointers, which is what `parentOf` next door does too.
  size_t depth = 0;
  for (const Node *each = node.get(); each != nullptr; each = each->parent) {
    depth += 1;
  }

  auto out = jsi::Array(runtime, depth);
  size_t at = 0;
  // DEEPEST FIRST, the node itself included and a SURFACE included. The order is the contract: the
  // caller reads it both ways, capture reversed and bubble forward, off the one array.
  for (Node *each = node.get(); each != nullptr; each = each->parent, at += 1) {
    out.setValueAtIndex(runtime, at, handleOf(runtime, *each));
  }
  return out;
}

jsi::Value Tree::parentsOf(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected parentsOf(handles)");
  }
  auto handles = arguments[0].asObject(runtime).asArray(runtime);
  const size_t length = handles.size(runtime);

  auto out = jsi::Array(runtime, length);
  for (size_t at = 0; at < length; at += 1) {
    const auto node =
        nodeFrom(runtime, handles.getValueAtIndex(runtime, at).asObject(runtime), "parentsOf");
    // `undefined` per element, never a shorter array: the caller reads this positionally against the
    // list it passed, so a dropped entry would silently shift every answer after it onto the wrong
    // node. Same answer `parentOf` gives for a root — a SURFACE included, since stopping at one is
    // `host-access.ts`'s job and it reads the answer's `component` to do it.
    out.setValueAtIndex(
        runtime,
        at,
        node->parent == nullptr ? jsi::Value::undefined() : handleOf(runtime, *node->parent));
  }
  return out;
}

jsi::Value Tree::subtreesOf(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected subtreesOf(roots)");
  }
  auto roots = arguments[0].asObject(runtime).asArray(runtime);
  const size_t length = roots.size(runtime);

  // PRE-ORDER, each root followed by its own descendants. It is the order the JS recursion visited
  // in, and `onDetached` runs per node in exactly that sequence.
  //
  // Concatenated rather than nested: the caller has no use for the grouping — it tears every node
  // down the same way — and an array of arrays costs an allocation per root to express that.
  std::vector<jsi::Value> flat;
  for (size_t at = 0; at < length; at += 1) {
    const auto root =
        nodeFrom(runtime, roots.getValueAtIndex(runtime, at).asObject(runtime), "subtreesOf");
    collectSubtree(runtime, root, flat);
  }

  auto out = jsi::Array(runtime, flat.size());
  for (size_t at = 0; at < flat.size(); at += 1) {
    out.setValueAtIndex(runtime, at, std::move(flat[at]));
  }
  return out;
}

jsi::Value Tree::committedRecordOf(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected committedRecordOf(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "committedRecordOf");
  // `undefined` before the first commit is the ORDINARY answer, not an error: an adapter that wires
  // an imperative call at lifecycle time runs before the commit under an async-batched renderer, and
  // every caller either defers or logs.
  if (node->committed == nullptr) return jsi::Value::undefined();

  auto record = jsi::Object(runtime);
  // The PLACEHOLDER, not the `ShadowNode`. The reference applier answers with its fake Fabric node
  // because that is what its slot's imperative calls accept; here the imperative five below accept
  // this object, so it is the same field playing the same role. There is no JS value for a
  // `shared_ptr<const ShadowNode>` that anything downstream could use.
  record.setProperty(runtime, "handle", jsi::Value(runtime, arguments[0]));
  record.setProperty(runtime, "tag", jsi::Value(static_cast<double>(node->tag)));
  record.setProperty(
      runtime, "rootTag", jsi::Value(static_cast<double>(node->committedSurfaceId)));
  return record;
}

// ── THE IMPERATIVE FIVE ──────────────────────────────────────────────────────────────────────────
//
// See the header for why they are here rather than beside `Applier`. The one shape they all share:
// a node with no committed `ShadowNode` is answered exactly like a surface with no revision.

jsi::Value Tree::dispatchCommand(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 3) {
    throw jsi::JSError(
        runtime, "symbiote engine: expected dispatchCommand(handle, commandName, args)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "dispatchCommand");
  if (node->committed == nullptr) return jsi::Value::undefined();
  uiManagerFor(runtime, "dispatchCommand")
      .dispatchCommand(
          node->committed,
          arguments[1].asString(runtime).utf8(runtime),
          react::commandArgsFromValue(runtime, arguments[2]));
  return jsi::Value::undefined();
}

jsi::Value Tree::sendAccessibilityEvent(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 2) {
    throw jsi::JSError(
        runtime, "symbiote engine: expected sendAccessibilityEvent(handle, eventType)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "sendAccessibilityEvent");
  if (node->committed == nullptr) return jsi::Value::undefined();
  uiManagerFor(runtime, "sendAccessibilityEvent")
      .sendAccessibilityEvent(node->committed, arguments[1].asString(runtime).utf8(runtime));
  return jsi::Value::undefined();
}

// A JS responder that never reaches native loses the gesture to any scroll view above it, silently:
// the UIScrollView keeps competing and every move after the first arrives as `topScroll`.
jsi::Value Tree::setIsJSResponder(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 3) {
    throw jsi::JSError(
        runtime,
        "symbiote engine: expected setIsJSResponder(handle, isResponder, blockNativeResponder)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "setIsJSResponder");
  if (node->committed == nullptr) return jsi::Value::undefined();
  uiManagerFor(runtime, "setIsJSResponder")
      .setIsJSResponder(node->committed, arguments[1].getBool(), arguments[2].getBool());
  return jsi::Value::undefined();
}

#ifndef SYMBIOTE_HAS_DOM_MEASURE

// The header is absent on this toolchain (Android's prefab does not export `react/renderer/dom/`).
// Throwing is the only honest answer: returning zeroes would be indistinguishable from a node with
// no layout, and an app reading a size of 0 lays out wrongly with nothing to diagnose.
jsi::Value Tree::measure(jsi::Runtime &runtime, const jsi::Value *, size_t) {
  throw jsi::JSError(runtime, "symbiote engine: measure is not built on this platform");
}

jsi::Value Tree::measureInWindow(jsi::Runtime &runtime, const jsi::Value *, size_t) {
  throw jsi::JSError(runtime, "symbiote engine: measureInWindow is not built on this platform");
}

jsi::Value Tree::measureLayout(jsi::Runtime &runtime, const jsi::Value *, size_t) {
  throw jsi::JSError(runtime, "symbiote engine: measureLayout is not built on this platform");
}

#else

jsi::Value Tree::measure(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 2) {
    throw jsi::JSError(runtime, "symbiote engine: expected measure(handle, callback)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "measure");
  auto callback = arguments[1].asObject(runtime).asFunction(runtime);

  auto revision = node->committed == nullptr
      ? nullptr
      : uiManagerFor(runtime, "measure")
            .getShadowTreeRevisionProvider()
            ->getCurrentRevision(node->committed->getSurfaceId());
  if (revision == nullptr) {
    // Six zeroes, matching the binding: a surface that has not committed yet is not an error, and an
    // app that asked where a node is must get an answer rather than a throw.
    callback.call(runtime, {0, 0, 0, 0, 0, 0});
    return jsi::Value::undefined();
  }

  auto rect = react::dom::measure(revision, *node->committed);
  callback.call(
      runtime,
      {jsi::Value{runtime, rect.x},
       jsi::Value{runtime, rect.y},
       jsi::Value{runtime, rect.width},
       jsi::Value{runtime, rect.height},
       jsi::Value{runtime, rect.pageX},
       jsi::Value{runtime, rect.pageY}});
  return jsi::Value::undefined();
}

jsi::Value Tree::measureInWindow(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 2) {
    throw jsi::JSError(runtime, "symbiote engine: expected measureInWindow(handle, callback)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "measureInWindow");
  auto callback = arguments[1].asObject(runtime).asFunction(runtime);

  auto revision = node->committed == nullptr
      ? nullptr
      : uiManagerFor(runtime, "measureInWindow")
            .getShadowTreeRevisionProvider()
            ->getCurrentRevision(node->committed->getSurfaceId());
  if (revision == nullptr) {
    callback.call(runtime, {0, 0, 0, 0});
    return jsi::Value::undefined();
  }

  auto rect = react::dom::measureInWindow(revision, *node->committed);
  callback.call(
      runtime,
      {jsi::Value{runtime, rect.x},
       jsi::Value{runtime, rect.y},
       jsi::Value{runtime, rect.width},
       jsi::Value{runtime, rect.height}});
  return jsi::Value::undefined();
}

jsi::Value Tree::measureLayout(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 4) {
    throw jsi::JSError(
        runtime, "symbiote engine: expected measureLayout(handle, relativeTo, onFail, onSuccess)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "measureLayout");
  const auto relativeTo = nodeFrom(runtime, arguments[1].asObject(runtime), "measureLayout");
  auto onFail = arguments[2].asObject(runtime).asFunction(runtime);
  auto onSuccess = arguments[3].asObject(runtime).asFunction(runtime);

  auto revision = node->committed == nullptr || relativeTo->committed == nullptr
      ? nullptr
      : uiManagerFor(runtime, "measureLayout")
            .getShadowTreeRevisionProvider()
            ->getCurrentRevision(node->committed->getSurfaceId());
  if (revision == nullptr) {
    onFail.call(runtime);
    return jsi::Value::undefined();
  }

  auto maybeRect =
      react::dom::measureLayout(revision, *node->committed, *relativeTo->committed);
  if (!maybeRect) {
    onFail.call(runtime);
    return jsi::Value::undefined();
  }

  auto rect = maybeRect.value();
  onSuccess.call(
      runtime,
      {jsi::Value{runtime, rect.x},
       jsi::Value{runtime, rect.y},
       jsi::Value{runtime, rect.width},
       jsi::Value{runtime, rect.height}});
  return jsi::Value::undefined();
}

#endif // SYMBIOTE_HAS_DOM_MEASURE

jsi::Value Tree::readSurfaceTelemetry(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected readSurfaceTelemetry(surfaceId)");
  }
  const auto surfaceId = static_cast<react::SurfaceId>(arguments[0].asNumber());
  auto result = jsi::Object(runtime);
  double layoutMs = 0;
  double textMs = 0;
  double commitMs = 0;
  int layoutNodes = 0;
  int textMeasures = 0;
  // ANY surface, not only one this host drives. Anything accumulated inside our own `kOpCommit`
  // describes only a tree we committed; to answer "does React's own renderer pay this too" the
  // telemetry has to be readable for a surface React drove. `getCurrentRevision()` is public and
  // carries the
  // `TransactionTelemetry` of whichever commit produced the revision, whoever produced it.
  //
  // Read on demand rather than accumulated: there is no hook of ours in a foreign commit, so the
  // caller reads once the commit it timed has settled and gets that commit's revision.
  uiManagerFor(runtime, "readSurfaceTelemetry")
      .getShadowTreeRegistry()
      .visit(surfaceId, [&](const react::ShadowTree &shadowTree) {
        const react::TransactionTelemetry telemetry = shadowTree.getCurrentRevision().telemetry;
        layoutNodes = telemetry.getAffectedLayoutNodesCount();
        // GATED ON WORK HAVING HAPPENED, because the getter is not safe to ask otherwise:
        // `getLayoutStartTime()` is `react_native_assert(layoutStartTime_ != kTelemetry-
        // UndefinedTimePoint)` and a commit that dirtied no layout never stamps it. `millisBetween`
        // below handles the undefined sentinel, but it only ever sees it in a build where the assert
        // is compiled out — so in Debug this aborted the process instead. Found by the first itest to
        // commit a layout-neutral change, which is exactly the commit shape the targeted-replace path
        // is FOR, so the diagnostic was unusable precisely where it is most interesting.
        if (layoutNodes > 0) {
          layoutMs = millisBetween(telemetry.getLayoutStartTime(), telemetry.getLayoutEndTime());
          textMs =
              std::chrono::duration<double, std::milli>(telemetry.getTextMeasureTime()).count();
        }
        // `ShadowTree::commit`'s own window, and **`materialize` IS NOT IN IT.** This comment used to
        // say it was, and three rounds of investigation (F-80, F-81, F-82) read the number that way
        // and concluded the native pipeline was small. `materialize` runs in `kOpCommit` BEFORE
        // `uiManager.completeSurface` is called at all, so every `createNode`/`cloneNode`/
        // `appendChild` it makes is outside both this window and layout's. To price our own walk,
        // time `applyOps` from JS and subtract these two — see
        // `core/engine/cpp/tests/js/create-append-phase-split.itest.ts`.
        commitMs = millisBetween(telemetry.getCommitStartTime(), telemetry.getCommitEndTime());
        textMeasures = telemetry.getNumberOfTextMeasurements();
      });
  result.setProperty(runtime, "layoutMs", jsi::Value(layoutMs));
  result.setProperty(runtime, "textMs", jsi::Value(textMs));
  result.setProperty(runtime, "commitMs", jsi::Value(commitMs));
  result.setProperty(runtime, "layoutNodes", jsi::Value(static_cast<double>(layoutNodes)));
  result.setProperty(runtime, "textMeasures", jsi::Value(static_cast<double>(textMeasures)));
  // OURS, not RN's, and the only field here that is not read off `TransactionTelemetry`. Zeroed on
  // read, so a caller that samples per step gets disjoint windows. See `targetedReplaces_`.
  result.setProperty(
      runtime, "targetedReplaces", jsi::Value(static_cast<double>(targetedReplaces_)));
  targetedReplaces_ = 0;
  // OURS TOO, and for the same reason: `materialize` runs outside every window above, so without
  // these the walk can only be priced by subtracting `commitMs` from a JS stopwatch. See `IWalkCost`.
  const auto millis = [](double nanos) { return jsi::Value(nanos / 1e6); };
  result.setProperty(runtime, "walkMs", millis(walkCost_.walkNs));
  result.setProperty(runtime, "propsMs", millis(walkCost_.propsNs));
  result.setProperty(runtime, "rawPropsMs", millis(walkCost_.rawPropsNs));
  result.setProperty(runtime, "createNodeMs", millis(walkCost_.createNs));
  result.setProperty(runtime, "appendChildMs", millis(walkCost_.appendNs));
  result.setProperty(runtime, "diffPropsMs", millis(walkCost_.diffNs));
  result.setProperty(
      runtime, "nodesCreated", jsi::Value(static_cast<double>(walkCost_.created)));
  result.setProperty(runtime, "nodesCloned", jsi::Value(static_cast<double>(walkCost_.cloned)));
  result.setProperty(runtime, "nodesReused", jsi::Value(static_cast<double>(walkCost_.reused)));
  result.setProperty(runtime, "decodeMs", millis(walkCost_.decodeNs));
  result.setProperty(runtime, "instanceHandleMs", millis(walkCost_.instanceHandleNs));
  result.setProperty(runtime, "publishMs", millis(walkCost_.publishNs));
  result.setProperty(runtime, "nativeStateMs", millis(walkCost_.nativeStateNs));
  result.setProperty(runtime, "nodesDecoded", jsi::Value(static_cast<double>(walkCost_.decoded)));
  result.setProperty(runtime, "setPropMs", millis(walkCost_.setPropNs));
  result.setProperty(runtime, "propConvertMs", millis(walkCost_.propConvertNs));
  result.setProperty(runtime, "setProps", jsi::Value(static_cast<double>(walkCost_.setProps)));
  result.setProperty(
      runtime, "valueEntries", jsi::Value(static_cast<double>(walkCost_.valueEntries)));
  result.setProperty(
      runtime, "valueConversions", jsi::Value(static_cast<double>(walkCost_.valueConversions)));
  walkCost_ = IWalkCost{};
  return result;
}

} // namespace symbiote

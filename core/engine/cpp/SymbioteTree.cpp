#include "SymbioteTree.h"

#include "SymbioteFabricProps.h"

#include <folly/dynamic.h>
#include <jsi/JSIDynamic.h>
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
constexpr const char *kVirtualTextViewName = "RCTVirtualText";

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
folly::dynamic boundedDynamicFrom(
    jsi::Runtime &runtime,
    const jsi::Value &value,
    const std::string &what) {
  size_t entries = 0;
  return jsi::dynamicFromValue(runtime, value, [&](const std::string &) {
    if (++entries > kMaxDynamicEntries) {
      throw jsi::JSError(
          runtime,
          "symbiote engine: " + what + " expanded past " +
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
        "the payloadFold result");
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
    std::vector<Node *> &owners,
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
  owners.push_back(&node);
}

// Child pointers Fabric swapped out from under us since the last read, reported through
// `takeCommitSplit`. A diagnostic and nothing reads it in anger: it is the ONLY way to see whether
// `adoptLandedChildren` below fires at all, and a fix that fires zero times is indistinguishable
// from a fix that works.
size_t adoptSwaps = 0;

// `cloneNode` calls this host issued that carried a NON-EMPTY props payload, per commit window.
//
// It exists to settle one question that no counter on either side could answer: RN reported 2 869
// text measurements on a 35-write step, and a measurement happens only when a measurable yoga node
// is DIRTY (`Node.h:43` — a yoga clone copies `layout_`, cache included, so cloning alone measures
// nothing). The one dirtying gate a host can trip from outside is `completeClone`, and it reads
// `fragment.props != nullptr` on a Paragraph and `true` on everything else measurable
// (`YogaLayoutableShadowNode.cpp:322` — only Paragraph narrows it, so a TextInput is dirtied by ANY
// fragment). `UIManager::cloneNode` fills that fragment only when `!rawProps.isEmpty()`
// (`UIManager.cpp:123`), so this number IS how many nodes we could possibly have dirtied.
//
// Reading it against `textMeasures` separates the two hypotheses outright: near the write count
// means the dirtying happens INSIDE the commit and our walk is innocent; near the measurement count
// means it is ours. Nothing else distinguishes them — RN's telemetry counts measurements and never
// says which node asked.
size_t propClones = 0;

// Of `adoptSwaps`, the ones where the node Fabric put in our place is a Paragraph. See
// `adoptLandedChildren` for why that kind is the only one whose swap costs more than a pointer.
size_t textSwaps = 0;

// Measurable text nodes already DIRTY in the tree we are about to hand `completeSurface`.
//
// It splits the last question in two, and nothing else can. React's own renderer commits this exact
// tree with 0 text measurements and 1 006 affected layout nodes where we report 2 869 and 8 477
// (`STOCK_ARM` in the react example), and the yoga bench proved only a DIRTY LEAF produces a
// measurement. So either our build phase leaves the leaves dirty — and this counts them before
// Fabric is involved at all — or they are clean here and something inside the commit dirties them.
// The two have nothing in common: the first is our bug in this file, the second is upstream of it.
size_t dirtyTextsBeforeCommit = 0;

// Walks what we are about to commit and counts the dirty measurable text nodes. O(tree) per commit
// and DIAGNOSTIC-ONLY, which is why it is gated on the counter being read at all — a benchmark step
// pays it, a real app never reaches it.
void countDirtyTexts(const react::ShadowNode &node) {
  // Through the BASE class, not `YogaLayoutableShadowNode`: `getIsLayoutClean` is pure virtual on
  // `LayoutableShadowNode`, which lives in `core/` — a folder ReactAndroid does export in its
  // prefab, unlike the Yoga-specific one. Same reasoning the `dom/` guard at the top of this file
  // records, arrived at before it cost a broken Android build rather than after.
  const auto *layoutable = dynamic_cast<const react::LayoutableShadowNode *>(&node);
  if (layoutable != nullptr &&
      node.getTraits().check(react::ShadowNodeTraits::Trait::MeasurableYogaNode) &&
      !layoutable->getIsLayoutClean()) {
    dirtyTextsBeforeCommit += 1;
  }
  for (const auto &child : node.getChildren()) countDirtyTexts(*child);
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
// Returns how many pointers Fabric swapped, which is the only way to see from JS whether this fires
// at all.
size_t adoptLandedChildren(Node &node, const std::vector<Node *> &owners) {
  const ChildSet &landed = node.committed->getChildren();
  size_t swapped = 0;
  const size_t count = std::min(owners.size(), landed.size());
  for (size_t index = 0; index < count; index++) {
    if (owners[index]->committed == landed[index]) continue;
    // WHICH nodes Fabric replaced, not just how many. A Paragraph is the one kind whose swap has a
    // price beyond the pointer: its measured content is memoised in a `mutable` field that the
    // clone constructor does not copy (`ParagraphShadowNode.h:133`), so a replaced Paragraph
    // re-derives its measurement cache key — and that key embeds the node's own layout frame
    // (`AttributedString.cpp:32`), which is zero at create time and distinct per row afterwards.
    // That is the difference between a create measuring 1890 texts and a one-row mutation
    // measuring 2869 on the identical tree with the identical strings.
    if (std::string_view(landed[index]->getComponentName()) == "Paragraph") textSwaps += 1;
    owners[index]->committed = landed[index];
    swapped += 1;
  }
  // What Fabric HOLDS, not what we offered — `sameNodes` on the next commit has to compare against
  // the tree that exists, or an unchanged list reads as changed forever.
  node.committedChildren = landed;
  return swapped;
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
// This is the repair for the one number that never moved: `dirtyTexts` read 4 971 on every step,
// including the one immediately after a full layout. Yoga clears a node's dirty flag on the object
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
size_t adoptCommitted(Node &node, const std::shared_ptr<const react::ShadowNode> &landed) {
  if (node.committed == nullptr || landed == nullptr) return 0;
  // A stranger is not adopted. `completeSurface` returns void, so a commit that was cancelled or
  // lost a race leaves the registry holding the PREVIOUS revision — and walking that would drag our
  // pointers backwards, which is worse than the staleness this exists to fix. Family identity is
  // what tells the two apart.
  if (!react::ShadowNode::sameFamily(*node.committed, *landed)) return 0;
  if (node.committed == landed) return 0;

  node.committed = landed;
  size_t swapped = 1;
  std::vector<Node *> owners;
  collectRenderableOwners(node, owners);
  const ChildSet &children = landed->getChildren();
  const size_t count = std::min(owners.size(), children.size());
  for (size_t index = 0; index < count; index++) {
    swapped += adoptCommitted(*owners[index], children[index]);
  }
  node.committedChildren = children;
  return swapped;
}

std::shared_ptr<const react::ShadowNode> materialize(
    jsi::Runtime &runtime,
    react::UIManager &uiManager,
    Node &node,
    bool hasTextAncestor,
    react::SurfaceId surfaceId,
    const Node *fabricParent) {
  const std::string viewName =
      (node.isText && hasTextAncestor) ? kVirtualTextViewName : node.viewName;
  // Two things force a FRESH FAMILY rather than a clone, and neither is visible in the dirty pair.
  //
  // A node whose view name flipped cannot be cloned into the other one — no prop write moves a node
  // between native views. And a node handed to a different parent cannot either: a Fabric node
  // belongs to one family, so a MOVE rebuilds even when the node itself is perfectly clean. That
  // second one is why `fabricParent` is threaded at all, and it is not theoretical — the fake host
  // asserts it (`fake-fabric.ts`'s `assertSameFamily`) and found it in the reference applier.
  const bool needsFreshFamily = node.committed != nullptr &&
      (viewName != node.committedViewName || node.committedParent != fabricParent);

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
    return node.committed;
  }

  auto children = std::make_shared<ChildSet>();
  std::vector<Node *> owners;
  // STICKY, per `commit.ts:964` — once inside a text element everything below is virtual, including
  // through a non-text element in between.
  const bool childHasTextAncestor = hasTextAncestor || node.isText;
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
    const folly::dynamic payload = fabricProps(node.viewName, node.props, foldFor(runtime, node));
    auto created = uiManager.createNode(
        node.tag,
        viewName,
        surfaceId,
        react::RawProps(folly::dynamic(payload)),
        node.instanceHandle);
    for (const auto &child : *children) uiManager.appendChild(created, child);
    node.committed = created;
    node.committedProps = payload;
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
      next = fabricProps(node.viewName, node.props, foldFor(runtime, node));
      payload = diffProps(node.committedProps, next);
    }
    const bool childrenHeld = sameNodes(node.committedChildren, *children);
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
      std::shared_ptr<const ChildSet> handedChildren =
          react::ShadowNodeFragment::childrenPlaceholder();
      if (!childrenHeld) handedChildren = children;
      if (node.selfDirty && !payload.empty()) propClones += 1;
      node.committed = uiManager.cloneNode(
          *node.committed,
          handedChildren,
          node.selfDirty ? react::RawProps(std::move(payload)) : react::RawProps());
    }
    if (node.selfDirty) node.committedProps = std::move(next);
  }

  adoptSwaps += adoptLandedChildren(node, owners);
  node.committedViewName = viewName;
  node.committedParent = fabricParent;
  node.committedTextAncestor = hasTextAncestor;
  node.committedSurfaceId = surfaceId;
  node.selfDirty = false;
  node.pathDirty = false;
  return node.committed;
}

// `steady_clock` rather than `system_clock`: this measures an interval, and only the steady one is
// guaranteed not to jump. Sub-millisecond resolution matters — the halves being split are single
// milliseconds on a small step.
double millisSince(std::chrono::steady_clock::time_point started) {
  return std::chrono::duration<double, std::milli>(
             std::chrono::steady_clock::now() - started)
      .count();
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
    auto at = checkSlot(slot);
    auto object = handles.getValueAtIndex(runtime, at).asObject(runtime);
    // Taken once, here, for the same reason the node is: this is the only moment both halves are in
    // hand. Every later op resolves the node THROUGH the object, so the edge back can never be
    // re-derived from anything the ops carry.
    node->handle.emplace(runtime, object);
    object.setNativeState(runtime, std::make_shared<NodeState>(node));
    bySlot[at] = std::move(node);
  };

  auto stringAt = [&](int32_t index) -> std::string {
    return strings.getValueAtIndex(runtime, static_cast<size_t>(index))
        .asString(runtime)
        .utf8(runtime);
  };

  for (size_t at = 0; at + kOpStride <= opsLength; at += kOpStride) {
    switch (ops[at]) {
      case kOpCreateElement: {
        auto node = std::make_shared<Node>();
        node->kind = kKindElement;
        node->viewName = stringAt(ops[at + 2]);
        node->isText = ops[at + 3] != 0;
        node->tag = allocateTag();
        node->instanceHandle = std::make_shared<const react::InstanceHandle>(
            runtime,
            instanceHandles.getValueAtIndex(runtime, static_cast<size_t>(ops[at + 4])),
            node->tag);
        publish(ops[at + 1], std::move(node));
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
        const auto &node = nodeAt(ops[at + 1]);
        const auto key = stringAt(ops[at + 2]);
        if (ops[at + 3] == kNoValue) {
          // An absent key is not a key holding null: deleting one that is not there changes nothing,
          // while deleting one that is there changes what the next `diffProps` sends, since a
          // vanished key has to go out as an explicit null.
          if (node->props.get_ptr(key) == nullptr) break;
          node->props.erase(key);
        } else {
          auto value = boundedDynamicFrom(
              runtime,
              values.getValueAtIndex(runtime, static_cast<size_t>(ops[at + 3])),
              "prop \"" + key + "\" on <" + node->viewName + ">");
          const auto *existing = node->props.get_ptr(key);
          if (existing != nullptr && *existing == value) break;
          node->props[key] = std::move(value);
        }
        markDirty(*node);
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
        const auto viewName = stringAt(ops[at + 2]);
        if (node->viewName == viewName) break;
        node->viewName = viewName;
        markDirty(*node);
        break;
      }
      case kOpSetText: {
        const auto &node = nodeAt(ops[at + 1]);
        const auto text = stringAt(ops[at + 2]);
        const auto *existing = node->props.get_ptr("text");
        if (existing != nullptr && existing->isString() && existing->asString() == text) break;
        node->props["text"] = text;
        markDirty(*node);
        // A write to or from '' takes this node out of its parent's renderable child list or puts it
        // back, which is a structural change to the PARENT that nothing else here would record.
        if (node->parent != nullptr) markDirty(*node->parent);
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
        std::vector<Node *> rootOwners;
        const auto buildStartedAt = std::chrono::steady_clock::now();
        appendRenderable(
            runtime, uiManager, *childSet, rootOwners, *surface, false, surfaceId, nullptr);
        buildMs_ += millisSince(buildStartedAt);
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
        // BEFORE `completeSurface`, deliberately: the whole value of this number is that it is read
        // while the tree is still only ours.
        for (const auto &child : *childSet) countDirtyTexts(*child);
        const auto commitStartedAt = std::chrono::steady_clock::now();
        uiManager.completeSurface(
            surfaceId,
            childSet,
            {.enableStateReconciliation = true,
             .mountSynchronously = false,
             .source = react::ShadowTree::CommitSource::React});
        commitMs_ += millisSince(commitStartedAt);
        // RN's own accounting for the commit that just ran. `getCurrentRevision()` is public and the
        // revision carries the `TransactionTelemetry` the commit filled in, so this reads the inside
        // of `commitMs_` without a hook, a fork, or a second clock.
        //
        // Read HERE rather than from a mount hook on purpose: a mount hook fires on the UI thread
        // after the mount pass, so its numbers would land in whichever profile window happened to be
        // open — one step late, and silently.
        uiManager.getShadowTreeRegistry().visit(
            surfaceId, [this, &rootOwners](const react::ShadowTree &shadowTree) {
              const react::ShadowTreeRevision revision = shadowTree.getCurrentRevision();
              // THE REPAIR, and it must run here rather than in `materialize`: substitution happens
              // INSIDE the commit, so the only tree that can be believed is the one the registry
              // holds once `completeSurface` has returned. See `adoptCommitted`.
              const ChildSet &landedRoot = revision.rootShadowNode->getChildren();
              const size_t rootCount = std::min(rootOwners.size(), landedRoot.size());
              for (size_t index = 0; index < rootCount; index++) {
                adoptSwaps += adoptCommitted(*rootOwners[index], landedRoot[index]);
              }
              const react::TransactionTelemetry telemetry = revision.telemetry;
              layoutMs_ += millisBetween(
                  telemetry.getLayoutStartTime(), telemetry.getLayoutEndTime());
              textMs_ += std::chrono::duration<double, std::milli>(
                             telemetry.getTextMeasureTime())
                             .count();
              layoutNodes_ += telemetry.getAffectedLayoutNodesCount();
              textMeasures_ += telemetry.getNumberOfTextMeasurements();
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
  int layoutNodes = 0;
  int textMeasures = 0;
  // ANY surface, not only one this host drives — which is the entire reason it exists. The
  // `takeCommitSplit` numbers accumulate inside our own `kOpCommit`, so they can only ever describe
  // a tree we committed. To answer "does React's own renderer pay this too" the same telemetry has
  // to be readable for a surface React drove, and `getCurrentRevision()` is public and carries the
  // `TransactionTelemetry` of whichever commit produced the revision, whoever produced it.
  //
  // Read on demand rather than accumulated: there is no hook of ours in a foreign commit, so the
  // caller reads once the commit it timed has settled and gets that commit's revision.
  uiManagerFor(runtime, "readSurfaceTelemetry")
      .getShadowTreeRegistry()
      .visit(surfaceId, [&](const react::ShadowTree &shadowTree) {
        const react::TransactionTelemetry telemetry = shadowTree.getCurrentRevision().telemetry;
        layoutMs = millisBetween(telemetry.getLayoutStartTime(), telemetry.getLayoutEndTime());
        textMs =
            std::chrono::duration<double, std::milli>(telemetry.getTextMeasureTime()).count();
        layoutNodes = telemetry.getAffectedLayoutNodesCount();
        textMeasures = telemetry.getNumberOfTextMeasurements();
      });
  result.setProperty(runtime, "layoutMs", jsi::Value(layoutMs));
  result.setProperty(runtime, "textMs", jsi::Value(textMs));
  result.setProperty(runtime, "layoutNodes", jsi::Value(static_cast<double>(layoutNodes)));
  result.setProperty(runtime, "textMeasures", jsi::Value(static_cast<double>(textMeasures)));
  return result;
}

jsi::Value Tree::takeCommitSplit(jsi::Runtime &runtime, const jsi::Value *, size_t) {
  auto split = jsi::Object(runtime);
  split.setProperty(runtime, "buildMs", jsi::Value(buildMs_));
  split.setProperty(runtime, "commitMs", jsi::Value(commitMs_));
  split.setProperty(runtime, "adoptSwaps", jsi::Value(static_cast<double>(adoptSwaps)));
  split.setProperty(runtime, "propClones", jsi::Value(static_cast<double>(propClones)));
  split.setProperty(runtime, "textSwaps", jsi::Value(static_cast<double>(textSwaps)));
  split.setProperty(
      runtime, "dirtyTexts", jsi::Value(static_cast<double>(dirtyTextsBeforeCommit)));
  split.setProperty(runtime, "layoutMs", jsi::Value(layoutMs_));
  split.setProperty(runtime, "textMs", jsi::Value(textMs_));
  split.setProperty(runtime, "layoutNodes", jsi::Value(static_cast<double>(layoutNodes_)));
  split.setProperty(runtime, "textMeasures", jsi::Value(static_cast<double>(textMeasures_)));
  // READ-AND-RESET, so a sampler on an interval gets disjoint windows rather than a growing total —
  // the same contract `readCommitProfile` already carries on the JS side.
  buildMs_ = 0;
  commitMs_ = 0;
  adoptSwaps = 0;
  propClones = 0;
  textSwaps = 0;
  dirtyTextsBeforeCommit = 0;
  layoutMs_ = 0;
  textMs_ = 0;
  layoutNodes_ = 0;
  textMeasures_ = 0;
  return split;
}

} // namespace symbiote

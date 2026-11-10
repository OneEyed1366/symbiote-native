#include "SymbioteTree.h"

#include "SymbioteContainerQuery.h"
#include "SymbioteDebug.h"
#include "SymbioteFabricProps.h"
#include "SymbioteGlobalVariables.h"
#include "SymbioteRegisteredProperties.h"
#include "SymbioteSurfaceVariables.h"
#include "SymbioteVarReaders.h"

#include <folly/dynamic.h>
#include <folly/json.h>
#include <jsi/JSIDynamic.h>
#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/renderer/components/root/RootShadowNode.h>
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
#include <react/renderer/uimanager/UIManagerCommitHook.h>
#include <react/renderer/uimanager/primitives.h>

// `react/renderer/dom/` is NOT among the header folders ReactAndroid copies into its prefab
// (`ReactAndroid/build.gradle.kts` lists uimanager, mounting, core, … and no dom), though
// libreactnative.so exports the functions. `android/CMakeLists.txt` copies `DOM.h` from the app's
// react-native onto the include path; without it this falls back to the throwing stubs. iOS compiles
// against the full ReactCommon tree and has it.
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
#include <cctype>
#include <chrono>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
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
constexpr int32_t kOpSetTag = 10;
constexpr int32_t kOpSetOwnedListener = 11;
constexpr int32_t kOpSetUnderlayShown = 12;
constexpr int32_t kOpCreateVoid = 13;
constexpr int32_t kOpSetReleaseMark = 14;
constexpr int32_t kOpSetGlobalVariable = 15;
constexpr int32_t kOpSetVariable = 16;
constexpr int32_t kOpSetContainerVariants = 17;

// The owned listener names any platform rule reads, one bit each — see `Node::pressListeners`.
// `press` is deliberately bit 0 so the `focusable` question is the cheapest of the two.
constexpr uint8_t kPressListenerPress = 1u << 0;
// The four press names; `hasAnyPressListener` asks about these and nothing else.
constexpr uint8_t kPressListenerMask = 0x0f;
// ScrollView's `sendMomentumEvents` (`ScrollView.js:1801-1804`) asks about either of these two.
constexpr uint8_t kMomentumListenerMask = (1u << 4) | (1u << 5);
// Text's pressability (`Text.js:145-163`): onPress / onLongPress, plus onStartShouldSetResponder.
constexpr uint8_t kTextPressMask = kPressListenerPress | (1u << 3);
constexpr uint8_t kStartShouldSetResponder = 1u << 6;

/** 0 for a name the host has no rule for, which is nearly all of them. */
uint8_t pressListenerBit(const std::string &name) {
  if (name == "press") return kPressListenerPress;
  if (name == "pressIn") return 1u << 1;
  if (name == "pressOut") return 1u << 2;
  if (name == "longPress") return 1u << 3;
  if (name == "momentumScrollBegin") return 1u << 4;
  if (name == "momentumScrollEnd") return 1u << 5;
  if (name == "startShouldSetResponder") return kStartShouldSetResponder;
  return 0;
}

constexpr int32_t kKindElement = 0;
constexpr int32_t kKindRawText = 1;
constexpr int32_t kKindAnchor = 2;
// A node whose entire subtree contributes nothing to Fabric — unlike an anchor, which hoists its
// children up in its own place, a void node's children never reach `appendRenderable` either. See
// `OP_CREATE_VOID` (mutation-buffer.ts) for why: `InputAccessoryView.js` renders `null` on Android.
constexpr int32_t kKindVoid = 3;

// A `setProp` whose value slot is this DELETES the key. `null` cannot carry it: null is a legitimate
// Fabric value meaning "reset to the default", and a merge-based clone needs the two distinguished.
constexpr int32_t kNoValue = -1;

// The one position-dependent view name: a text inside a text is a virtual span, a view ends it.
// Resolved while the child set is built, since an insert cannot see the chain and a reparent
// would rewrite a subtree
// A `std::string` and not a `const char *` so `materialize` can bind a REFERENCE to either this or
// the node's own name. As a `const char *` the ternary there has no common type but `std::string`,
// so every call constructed one — see there.
const std::string kVirtualTextViewName = "RCTVirtualText";
// The one view that ends a text context, see `materialize`
const std::string kViewViewName = "RCTView";

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

// `jsi::dynamicFromValue`, bounded: the raw walk keeps no visited set, so a cyclic value never ends
// `describe` is a callable, because composing the message eagerly cost half of the decode path
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
void refreshVarScope(Node &node);
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

// `jsi::NativeState` so a node can be attached to its JS placeholder without a wrapper object — see
// the note above `nodeFrom`. The base is empty apart from a virtual destructor, so the only cost is
// the vtable pointer, against one heap allocation per node saved.
struct Node : jsi::NativeState {
  int32_t kind = kKindElement;
  bool isText = false;
  // One bit per press-related listener the app wired, since `focusable` asks for `onPress` alone
  // while the underlay of TouchableHighlight reacts to any of four names
  // One bool per question cannot be kept right when a single name departs
  uint8_t pressListeners = 0;
  // TouchableHighlight's underlay is showing. Set by `kOpSetUnderlayShown`, read by
  // `foldTouchableHighlightUnderlay`. It LAGS the press: RN holds the underlay past release through
  // a `delayPressOut` timer that stays in JS, which is why this is its own bit and not the press
  // state that drives `:active` class resolution.
  bool underlayShown = false;
  // As the adapter authored it. `committedViewName` below is what was actually sent, which differs
  // exactly when the virtual-text rule fired.
  std::string viewName;
  // The INTRINSIC TAG — `pressable`, `text-input` — or empty for the ~all of them that carry no host
  // behavior. It is what `fabricProps` keys this tag's platform props off, and it is not derivable
  // from `viewName`: a pressable commits as `RCTView` like any other view. Arrives once, at
  // `attachHostBehavior`, and never changes — a tag is what the node IS.
  std::string tagName;
  // Raised once by `kOpSetReleaseMark`: JS holds per-node state here without a tag (a media
  // subscription), so the narrowed teardown walk must keep the node
  bool releaseMarked = false;
  // What `kOpSetContainerVariants` last shipped: the conditions this node's class reads against a
  // container, and the style for each way they hold. The commit hook picks one in the first commit
  std::shared_ptr<const ContainerVariants> containerVariants;
  // Whether the last payload build read any custom property, so `~Node` knows to unregister
  bool readsVars = false;
  react::Tag tag = 0;
  folly::dynamic props = folly::dynamic::object();
  std::shared_ptr<const react::InstanceHandle> instanceHandle;

  // MAY CONTAIN NULL HOLES between a detach and the next read — see `compactChildren`. Every reader
  // of this vector calls it first; the destructor below is the one place that tolerates a hole
  // instead, because it must not allocate or renumber while the node is being torn down.
  std::vector<NodePtr> children;
  /** How many holes are standing. Zero means the vector is dense and every index is meaningful. */
  size_t holes = 0;
  /**
   * Where this node sits in its parent's vector — a HINT, validated before it is believed.
   *
   * It is what makes a detach O(1): without it, removing a child means scanning the parent's whole
   * child list to find it, so clearing a list of N costs N scans. Measured before this existed
   * (`child-list-scaling.itest.ts`): clearing 1 000 / 2 000 / 4 000 children took 0.45 / 1.27 /
   * 4.29 ms, i.e. doubling factors of 2.8 and 3.4 against the 2.0 linear work would give.
   */
  size_t slotInParent = 0;
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

  // The same placeholder, STRONG, held while a parent holds this node, so a structural read still
  // finds a child that JS no longer names (Vue's `setElementText` drops the raw text it appended)
  // The cycle it makes is broken by the tree: a removed node and `~Node` of each child drop it
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
  // Fabric families this node has minted, and the parent generation it was last attached under
  // `committedParent` cannot tell: a rebuilt parent keeps its tag, so a child would reuse into it
  unsigned familyGeneration = 0;
  unsigned committedUnderGeneration = 0;
  // The text ancestry and the surface this node last committed UNDER — context taken ABOVE it that
  // its own subtree depends on, and neither is derivable from anything else here. A plain `<View>`
  // moved under a `<Text>` keeps its name and its parent and still has to rebuild, so the `<Text>`
  // beneath IT can go out virtual; and a top-level node moving between two surfaces has
  // `committedParent == nullptr` on both sides, so the surface id is the only thing separating them.
  bool committedTextAncestor = false;
  react::SurfaceId committedSurfaceId = 0;
  // The Fabric children last handed over, so a rebuild with the same list can decline to clone
  // An op naming a node is not a change: a re-render writes a fresh object for an unchanged style
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
  // The custom properties this node's own style declares, empty for nearly every node
  VarDeclarations varDecls;
  // This node when it declares any, else the nearest declaring ancestor: a `var()` lookup walks
  // declaring nodes only, never the whole chain. Kept up by `refreshVarScope`
  Node *varScope = nullptr;
  // Whether the JS handle carries a `payloadFold`. See `foldFor` for why one probe settles it.
  FoldProbe foldProbe = FoldProbe::unknown;

  // A child OUTLIVES its parent whenever JS still names it — `children` is strong and the handle's
  // `NativeState` is a second strong owner, so dropping the parent's reference is not the last one.
  // Its `parent` would then point at freed memory, and two paths dereference it: `markDirty` walks
  // upward through it and `parentOf` hands it to JS.
  //
  // The reference applier has no such window (a JS child's `parent` reference keeps the parent
  // alive), so nothing headless can reach this and there is no test to write for it.
  // How many nodes this process is holding, which tests read to see that a root is not kept alive
  // Not atomic, as a commit walk is single-threaded and nothing acts on the number
  static inline int64_t live = 0;

  Node() { live += 1; }

  ~Node() {
    live -= 1;
    if (readsVars) VarReaders::instance().forget(this);
    for (const NodePtr &child : children) {
      // A HOLE, from a detach nothing has read past yet. The destructor is the one reader that does
      // not compact first: compaction renumbers, and renumbering a vector whose owner is being
      // destroyed buys nothing.
      if (child == nullptr) continue;
      child->parent = nullptr;
      refreshVarScope(*child);
      // Its parent is gone, so nothing pins its placeholder any more. Dropping the strong edge here
      // is what makes the release CASCADE: a child JS no longer names becomes unreachable from both
      // sides, and the collection that frees it runs this same loop one level down.
      child->attachedHandle.reset();
    }
  }
};

// A node IS its own native state — there is no wrapper.
//
// There used to be a `NodeState : jsi::NativeState` holding a `NodePtr`, which cost one
// `make_shared` per created node: 10 002 allocations on a 1 000-row create, every one of them
// existing only to be a second pointer to something already heap-allocated. Measured on
// `build-release`, `setNativeState` alone swung 1.2-8.5 ms across runs of the same fixture — the
// spread being the allocator and the collector, which is what an extra allocation per node buys.
//
// `Node` declares the inheritance instead (see the struct). The only thing the wrapper gave was a
// distinct type for `dynamic_pointer_cast` to fail on when a handle carries somebody else's state,
// and casting to `Node` fails exactly as well.

// The node a placeholder owns, asked with `hasNativeState` first as JSI promises nothing otherwise
NodePtr nodeFrom(jsi::Runtime &runtime, const jsi::Object &handle, const char *what) {
  if (!handle.hasNativeState(runtime)) {
    throw jsi::JSError(
        runtime, std::string(what) + ": names a node this batch never created");
  }
  auto node = std::dynamic_pointer_cast<Node>(handle.getNativeState(runtime));
  if (node == nullptr) {
    throw jsi::JSError(runtime, std::string(what) + ": handle carries foreign native state");
  }
  return node;
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

// Re-points `varScope` after the parent or the node's own declarations changed
// A node whose scope did not move leaves its subtree alone, so a bottom-up build stays flat
void refreshVarScope(Node &node) {
  Node *scope = !node.varDecls.empty()
      ? &node
      : (node.parent != nullptr ? node.parent->varScope : nullptr);
  if (scope == node.varScope) return;
  node.varScope = scope;
  for (const NodePtr &child : node.children) {
    if (child != nullptr) refreshVarScope(*child);
  }
}

/**
 * Pin the placeholder for as long as a parent holds this node, and re-point its `varScope`
 * Idempotent, no recursion: every node is attached to its own parent at some point
 */
void holdHandle(jsi::Runtime &runtime, Node &node) {
  refreshVarScope(node);
  if (node.attachedHandle.has_value() || !node.handle.has_value()) return;
  auto live = node.handle->lock(runtime);
  if (live.isObject()) node.attachedHandle.emplace(live.getObject(runtime));
}

/**
 * The UIManager for this runtime.
 *
 * NOT cached, and the failed attempt is worth recording: keying a cache on `&runtime` treats an
 * ADDRESS as a lifetime, and an allocator reuses addresses. `symbiote_tree_tests` builds and tears
 * down a JSCRuntime per case, so the second one can land where the first was and inherit a dangling
 * binding — a crash, not a wrong number. The same mistake with three interned `PropNameID`s aborted
 * that suite outright (`~JSCRuntime`: "destroyed with a dangling API string").
 *
 * It bought nothing anyway: both caches together moved an empty drain 4.46 -> 4.38 us, against the
 * 4.38 -> 1.54 that dropping the checked JSI casts gave.
 */
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
 *
 * The three names are built from UTF-8 on every call and that stands: interning them in a
 * file-scope cache is what aborted `symbiote_tree_tests`, because a `PropNameID` outliving its
 * runtime is a dangling API string. See `uiManagerFor` above for the general form and the price.
 */
const int32_t *int32ArrayData(jsi::Runtime &runtime, const jsi::Value &value, size_t &lengthOut) {
  auto typedArray = value.asObject(runtime);
  auto buffer = typedArray.getProperty(runtime, "buffer").asObject(runtime).getArrayBuffer(runtime);
  auto byteOffset = static_cast<size_t>(typedArray.getProperty(runtime, "byteOffset").asNumber());
  lengthOut = static_cast<size_t>(typedArray.getProperty(runtime, "length").asNumber());
  return reinterpret_cast<const int32_t *>(buffer.data(runtime) + byteOffset);
}

// ── DIRTY MARKING ────────────────────────────────────────────────────────────────────────────────

// Mark a node changed and raise `pathDirty` to the root, stopping at the first ancestor marked
// The stop holds only if every walked node clears its flags, so `appendRenderable` clears anchors
void markDirty(Node &node) {
  node.selfDirty = true;
  for (Node *at = &node; at != nullptr && !at->pathDirty; at = at->parent) {
    at->pathDirty = true;
  }
}

// Remembers which custom properties the node's payload read, replacing the previous build's list
void trackVarReads(Node &node, const std::vector<std::string> &names) {
  if (names.empty() && !node.readsVars) return;
  VarReaders::instance().set(&node, names);
  node.readsVars = !names.empty();
}

// A changed `:root` value reaches only the nodes that read that name
void markVarReaders(std::string_view name) {
  for (void *reader : VarReaders::instance().readersOf(name)) {
    markDirty(*static_cast<Node *>(reader));
  }
}

// A changed surface variable reaches only the nodes of that surface that read the name
void markSurfaceVarReaders(react::SurfaceId surface, std::string_view name) {
  for (void *reader : VarReaders::instance().readersOf(name)) {
    Node &node = *static_cast<Node *>(reader);
    if (node.committedSurfaceId == surface) markDirty(node);
  }
}

std::optional<std::string> declaredIn(const VarDeclarations &declarations, std::string_view name) {
  for (const auto &[declared, value] : declarations) {
    if (declared == name) return value;
  }
  return std::nullopt;
}

// Whether the node sits under the app's top node, the surface root being the one element above it
// Anchors count for nothing
bool isBelowTopNode(const Node &node) {
  size_t elements = 0;
  for (const Node *at = node.parent; at != nullptr; at = at->parent) {
    if (at->kind != kKindAnchor) elements += 1;
  }
  return elements > 1;
}

// What one declaration of a custom property means to a lookup, a CSS-wide keyword included
// `revert` and `revert-layer` act as `unset`, since no origin or layer sets the name
enum class Declared { kValue, kSkip, kInitial, kInherit };

Declared declaredAs(const std::optional<std::string> &text, bool inherits) {
  if (!text.has_value()) return Declared::kSkip;
  std::string word(trimmed(*text));
  std::transform(word.begin(), word.end(), word.begin(),
                 [](unsigned char at) { return static_cast<char>(std::tolower(at)); });
  if (word == "initial") return Declared::kInitial;
  if (word == "inherit") return Declared::kInherit;
  if (word != "unset" && word != "revert" && word != "revert-layer") return Declared::kValue;
  return inherits ? Declared::kInherit : Declared::kInitial;
}

// The nearest element above the node, anchors counting for nothing
const Node *parentElement(const Node &node) {
  const Node *at = node.parent;
  while (at != nullptr && at->kind == kKindAnchor) at = at->parent;
  return at;
}

// Starting places besides a declaring node: the surface table, `:root`, and no declaration at all
const char kSurfaceMark = 1;
const char kRootMark = 2;
const char kInitialMark = 3;

enum class VarStart { kNodes, kSurface, kRoot, kInitial };

struct IVarOrigin {
  VarStart start;
  const Node *node;
};

// One name asked on behalf of the reader, whose surface holds the surface table
struct IVarQuery {
  const Node &reader;
  react::SurfaceId surface;
  std::string_view name;
};

// What a walk over the node chain found, or nothing settled yet so the tables are asked next
struct IVarStep {
  bool isSettled = false;
  std::optional<VarDeclared> declared;
};

// A null `from` starts at the reader, any other is a declaring node or one of the marks
IVarOrigin originOf(const Node &reader, VarScope from) {
  if (from == nullptr) return {VarStart::kNodes, &reader};
  if (from == &kSurfaceMark) return {VarStart::kSurface, nullptr};
  if (from == &kRootMark) return {VarStart::kRoot, nullptr};
  if (from == &kInitialMark) return {VarStart::kInitial, nullptr};
  return {VarStart::kNodes, static_cast<const Node *>(from)};
}

// Where an inheriting name is read again once its value is rejected: above the declaring place
VarScope scopeAbove(VarScope declaredAt) {
  if (declaredAt == nullptr || declaredAt == &kInitialMark) return nullptr;
  if (declaredAt == &kRootMark) return &kInitialMark;
  if (declaredAt == &kSurfaceMark) return &kRootMark;
  const Node *parent = parentElement(*static_cast<const Node *>(declaredAt));
  if (parent == nullptr) return &kSurfaceMark;
  return parent;
}

Declared declarationKind(const RegisteredProperty &property, const std::optional<std::string> &declared) {
  const Declared kind = declaredAs(declared, property.inherits);
  if (kind != Declared::kValue) return kind;
  const bool applies = RegisteredProperties::instance().declarationApplies(property, *declared);
  return applies ? Declared::kValue : Declared::kSkip;
}

VarDeclared valueOf(const RegisteredProperty &property, std::string text, VarScope at) {
  return VarDeclared{std::move(text), at, property.inherits ? scopeAbove(at) : nullptr};
}

std::optional<VarDeclared> initialOf(const RegisteredProperty &property) {
  if (!property.initialValue.has_value()) return std::nullopt;
  return VarDeclared{*property.initialValue, nullptr, nullptr};
}

std::optional<VarDeclared> lookupRegisteredVar(
    const IVarQuery &query, const RegisteredProperty &property, VarScope from);

// A non-inheriting name sees its own declaration only, and below the top node nothing above it
IVarStep ownStep(const IVarQuery &query, const RegisteredProperty &property, const Node &node) {
  std::optional<std::string> own = declaredIn(node.varDecls, query.name);
  const Declared kind = declarationKind(property, own);
  if (kind == Declared::kValue) return {true, valueOf(property, *own, &node)};
  if (kind == Declared::kInitial) return {true, initialOf(property)};
  if (kind != Declared::kInherit) return {isBelowTopNode(node), initialOf(property)};
  const Node *parent = parentElement(node);
  if (parent == nullptr) return {true, initialOf(property)};
  return {true, lookupRegisteredVar(query, property, parent)};
}

IVarStep chainStep(const IVarQuery &query, const RegisteredProperty &property, const Node &node) {
  for (const Node *scope = node.varScope; scope != nullptr;
       scope = scope->parent != nullptr ? scope->parent->varScope : nullptr) {
    std::optional<std::string> declared = declaredIn(scope->varDecls, query.name);
    const Declared kind = declarationKind(property, declared);
    if (kind == Declared::kValue) return {true, valueOf(property, *declared, scope)};
    if (kind == Declared::kInitial) return {true, initialOf(property)};
  }
  return {};
}

IVarStep nodesStep(const IVarQuery &query, const RegisteredProperty &property, const Node &node) {
  if (!property.inherits) {
    IVarStep own = ownStep(query, property, node);
    if (own.isSettled) return own;
  }
  return chainStep(query, property, node);
}

// A registered property reads its initial value where nothing valid is declared
// A non-inheriting one sees its own declaration, and the top node also `:root` as the root does
std::optional<VarDeclared> lookupRegisteredVar(
    const IVarQuery &query, const RegisteredProperty &property, VarScope from) {
  const IVarOrigin origin = originOf(query.reader, from);
  if (origin.start == VarStart::kInitial) return initialOf(property);
  if (origin.start == VarStart::kNodes) {
    IVarStep step = nodesStep(query, property, *origin.node);
    if (step.isSettled) return step.declared;
  }
  if (origin.start != VarStart::kRoot) {
    std::optional<std::string> onSurface = SurfaceVariables::instance().get(query.surface, query.name);
    const Declared kind = declarationKind(property, onSurface);
    if (kind == Declared::kValue) return valueOf(property, *onSurface, &kSurfaceMark);
    if (kind == Declared::kInitial) return initialOf(property);
  }
  std::optional<std::string> onRoot = GlobalVariables::instance().get(query.name);
  if (declarationKind(property, onRoot) != Declared::kValue) return initialOf(property);
  return valueOf(property, *onRoot, &kRootMark);
}

// An unregistered name: `initial` ends the walk with nothing, `inherit` and `unset` go on upward
std::optional<VarDeclared> lookupPlainVar(const IVarQuery &query, VarScope from) {
  const IVarOrigin origin = originOf(query.reader, from);
  if (origin.start == VarStart::kInitial) return std::nullopt;
  if (origin.start == VarStart::kNodes) {
    for (const Node *scope = origin.node->varScope; scope != nullptr;
         scope = scope->parent != nullptr ? scope->parent->varScope : nullptr) {
      std::optional<std::string> declared = declaredIn(scope->varDecls, query.name);
      const Declared kind = declaredAs(declared, true);
      if (kind == Declared::kValue) return VarDeclared{*declared, scope, nullptr};
      if (kind == Declared::kInitial) return std::nullopt;
    }
  }
  if (origin.start != VarStart::kRoot) {
    std::optional<std::string> onSurface = SurfaceVariables::instance().get(query.surface, query.name);
    const Declared kind = declaredAs(onSurface, true);
    if (kind == Declared::kValue) return VarDeclared{*onSurface, &kSurfaceMark, nullptr};
    if (kind == Declared::kInitial) return std::nullopt;
  }
  std::optional<std::string> onRoot = GlobalVariables::instance().get(query.name);
  if (declaredAs(onRoot, true) != Declared::kValue) return std::nullopt;
  return VarDeclared{*onRoot, &kRootMark, nullptr};
}

// The nearest declaration on the declaring scopes, node included, then the surface, then `:root`
std::optional<VarDeclared> lookupVar(const IVarQuery &query, VarScope from) {
  if (!RegisteredProperties::instance().isEmpty()) {
    const std::shared_ptr<const RegisteredProperty> registered =
        RegisteredProperties::instance().share(query.name);
    if (registered != nullptr) return lookupRegisteredVar(query, *registered, from);
  }
  return lookupPlainVar(query, from);
}

// A lookup for one node's payload build that also records every name asked, found or not
VarLookup recordingLookup(
    const Node &node,
    react::SurfaceId surfaceId,
    std::vector<std::string> &reads) {
  return [&node, surfaceId, &reads](std::string_view name, VarScope from) {
    reads.emplace_back(name);
    return lookupVar(IVarQuery{node, surfaceId, name}, from);
  };
}

// A declaration that changed on `scope` reaches its readers at or below it, and only those
void markVarScope(Node &scope, const VarDeclarations &before) {
  std::vector<std::string> names;
  for (const auto &[name, value] : before) names.push_back(name);
  for (const auto &[name, value] : scope.varDecls) names.push_back(name);
  for (const std::string &name : names) {
    if (declaredIn(before, name) == declaredIn(scope.varDecls, name)) continue;
    for (void *reader : VarReaders::instance().readersOf(name)) {
      Node *candidate = static_cast<Node *>(reader);
      for (Node *at = candidate; at != nullptr; at = at->parent) {
        if (at != &scope) continue;
        markDirty(*candidate);
        break;
      }
    }
  }
}

// Re-reads the node's own declarations after its style changed and wakes the readers they reach
void refreshDeclarations(Node &node) {
  VarDeclarations next = declaredStyleVars(node.props);
  if (next == node.varDecls) return;
  VarDeclarations before = std::move(node.varDecls);
  node.varDecls = std::move(next);
  refreshVarScope(node);
  markVarScope(node, before);
}

/**
 * Close the holes a run of detaches left, and renumber what survived.
 *
 * Called by every reader of `node.children` before it walks. Costs nothing on a dense vector — one
 * load and one branch — and one linear pass on a vector that was just emptied, which is what makes
 * a clear of N children O(N) in total rather than O(N) per removal.
 *
 * The alternative was `erase` per removal, and it is quadratic from either end: `std::remove` scans
 * the whole range whatever it finds, and `erase` then shifts the tail. Removing from the front pays
 * the shift, removing from the back pays the scan.
 */
void compactChildren(Node &node) {
  if (node.holes == 0) return;
  auto &children = node.children;
  children.erase(
      std::remove(children.begin(), children.end(), nullptr), children.end());
  for (size_t at = 0; at < children.size(); at += 1) children[at]->slotInParent = at;
  node.holes = 0;
}

void detachFromParent(const NodePtr &child) {
  Node *parent = child->parent;
  if (parent == nullptr) return;
  auto &siblings = parent->children;
  // O(1) through the hint, validated before it is believed, with a scan as the safety net
  const size_t hinted = child->slotInParent;
  if (hinted < siblings.size() && siblings[hinted] == child) {
    siblings[hinted] = nullptr;
    parent->holes += 1;
  } else {
    auto found = std::find(siblings.begin(), siblings.end(), child);
    if (found != siblings.end()) {
      *found = nullptr;
      parent->holes += 1;
    }
  }
  child->parent = nullptr;
  refreshVarScope(*child);
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

// How many positions moved, or `kWidthChanged` when the list is not the same length, in one pass
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
 * Whether every replacement leaves the layout alone
 * A layout pass clones the standing children behind us, then `replaceChild` cannot find its child
 * The targeted path needs layout-clean replacements, or the mutation is silently dropped (F-51)
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

// No replacement may be a node this parent already holds, a reorder would trip Yoga's owner assert
// `recorded` decides which slots moved and `standing` what the parent holds, see `liveChildrenOf`
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
 * What this parent's children ARE right now, as opposed to what we recorded
 * The layout pass clones children in place (`cloneChildInPlace`), so a record can name a gone node
 * Position is the stable key, since the substitution lands at the same index
 */
const ChildSet &liveChildrenOf(const Node &node) {
  static const ChildSet kNone;
  return node.committed == nullptr ? kNone : node.committed->getChildren();
}

// How many parents took the targeted path since the last read, to show the path still runs
// Process-wide and zeroed on read, like the counters of `readCommitProfile` in JS
size_t targetedReplaces_ = 0;

// The stopwatch of `materialize`, which runs before `completeSurface` and so sits in no RN clock
// Nanoseconds, accumulated across the whole walk and zeroed when read
struct IWalkCost {
  double walkNs = 0;
  double propsNs = 0;
  // `propsNs` bills assembly and the `payloadFold` lookup together, so the lookup is split out
  // `foldProbe` caches only the NO, so a folding node pays the JS round trip every commit
  double foldLookupNs = 0;
  size_t foldsFound = 0;
  // Inside a fold that runs: converting the bag out, the JS call, converting the result back.
  double foldToJsNs = 0;
  double foldCallNs = 0;
  double foldFromJsNs = 0;
  // The two `kOpSetProp` early exits, counted apart: a delete of an absent key is a hash lookup
  // A write of an unchanged value has already paid the JSI conversion, which is the costly one
  size_t deletesOfAbsent = 0;
  size_t writesOfUnchanged = 0;
  double rawPropsNs = 0;
  double createNs = 0;
  double appendNs = 0;
  double diffNs = 0;
  size_t created = 0;
  size_t cloned = 0;
  size_t reused = 0;
  // The half of `applyOps` that asks what our own decode costs per op, apart from Fabric's cost
  double decodeNs = 0;
  double instanceHandleNs = 0;
  double publishNs = 0;
  double nativeStateNs = 0;
  size_t decoded = 0;
  // `kOpSetProp`, with the JS value conversion inside it, not counted on the two early exits
  // `propConvertNs` has no such hole
  double setPropNs = 0;
  double propConvertNs = 0;
  size_t setProps = 0;
  // How well interning worked: entries in a batch's value table against conversions performed
  size_t valueEntries = 0;
  size_t valueConversions = 0;
  // The rest of `applyOps`, so the phase's books close. `applyNs` is the whole call; the string
  // table is decoded once up front; `structureNs` is every append/insert/remove op together.
  double applyNs = 0;
  double stringDecodeNs = 0;
  double structureNs = 0;
  // The batched host reads: the teardown sweep gets a handle for every node of a removed subtree
  // The time says whether the crossing or the JS loop above it is the cost
  double hostReadNs = 0;
  size_t hostReadHandles = 0;
  // How many times `applyOps` was entered, as string and value tables are interned per batch
  size_t applyCalls = 0;
  // Inside `structureNs`: promoting a node's WEAK handle reference to a strong one when it acquires
  // a parent. One `jsi::WeakObject::lock` plus one `jsi::Object` per node, i.e. real JSI work on an
  // op that otherwise touches nothing but our own vectors.
  double holdHandleNs = 0;
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
  // Rewrites moved slots, not the whole list: 3 ms against 405 ms for one row of a list 4 000 wide
  // The old child is read off the parent, as layout replaces children in place behind our record
  if (react::ReactNativeFeatureFlags::enableViewCulling()) return false;
  if (changed == kWidthChanged || node.committedChildren.empty()) return false;
  // Position is a key between the two lists only when their widths agree
  if (standing.size() != node.committedChildren.size()) return false;
  // A props change of our own dirties the parent, and the clone is checked again after it exists
  if (node.selfDirty) return false;
  // A leaf parent such as a paragraph derives its state from its children, so a silent swap of a
  // slot leaves the screen stale (`react-state-reaches-the-screen.itest.tsx`)
  if (node.committed->getTraits().check(
          react::ShadowNodeTraits::Trait::LeafYogaNode)) {
    return false;
  }
  if (!replacementsAreLayoutClean(node.committedChildren, next)) return false;
  if (!replacementsAreFresh(node.committedChildren, standing, next)) return false;
  // Aligned indices make every `replaceChild` O(1)
  if (indicesAlign) return changed > 0;
  // A mixed parent bounds the moved share, so k replacements cannot become O(N*k)
  return changed > 0 && changed * 2 <= next.size();
}

// No append path here: an append dirties the parent, so layout clones the standing children
// behind our record and the next `replaceChild` cannot find the child it was told to replace

// Rewrites every moved slot of `parent`, leaving the rest of its children untouched
// It never dirties the parent, as `canReplaceInPlace` refuses a replacement that moves layout
void replacedChangedChildren(
    react::ShadowNode &parent,
    const ChildSet &recorded,
    const ChildSet &next) {
  // The old child is read off the parent, as our record can name a node layout replaced in place
  const ChildSet &standing = parent.getChildren();
  for (size_t at = 0; at < next.size() && at < standing.size(); at += 1) {
    if (recorded[at] == next[at]) continue;
    parent.replaceChild(*standing[at], next[at], at);
  }
}

// A slot holding another node than before is a reorder, a new revision keeps its family
bool hasReorderedChildren(const ChildSet &recorded, const ChildSet &next) {
  if (recorded.size() != next.size()) return false;
  for (size_t at = 0; at < next.size(); at += 1) {
    if (recorded[at] != next[at] && &recorded[at]->getFamily() != &next[at]->getFamily()) {
      return true;
    }
  }
  return false;
}

// Yoga reads a reordered list of equal-style children as clean and keeps every old frame
void dirtyLayoutOf(react::ShadowNode &node) {
  if (auto *layoutable = dynamic_cast<react::LayoutableShadowNode *>(&node)) {
    layoutable->dirtyLayout();
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

// The minimal payload for a clone: a removed key goes as `null`, an unchanged key is not sent
// Re-sending a key re-invokes its native setter, and some of them rebuild the whole view
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

// The parent as `IOwner`: its props, its tag and its press bit, so a rule can be a descendant rule
// The nearest ancestor carrying a tag is `ancestorPropsOf`, as Button's label sits at varying depth
IOwner ownerOf(const Node &node) {
  if (node.parent == nullptr) return {};
  return IOwner{
      &node.parent->props,
      node.parent->tagName.c_str(),
      (node.parent->pressListeners & kPressListenerPress) != 0,
      node.parent->underlayShown,
      (node.parent->pressListeners & kPressListenerMask) != 0};
}

/** The node's own non-prop bits, unpacked from the ops' mask (see `ISelf`) */
ISelf selfOf(const Node &node, bool hasTextAncestor) {
  return ISelf{
      (node.pressListeners & kPressListenerPress) != 0,
      (node.pressListeners & kPressListenerMask) != 0,
      node.underlayShown,
      (node.pressListeners & kMomentumListenerMask) != 0,
      (node.pressListeners & kTextPressMask) != 0,
      (node.pressListeners & kStartShouldSetResponder) != 0,
      node.isText && hasTextAncestor};
}

// The first child as `IFirstChild`, the mirror of `ownerOf` and the only read that goes down
// It skips holes instead of assuming compaction, so a rule does not depend on the caller's order
IFirstChild firstChildOf(const Node &node) {
  for (const auto &child : node.children) {
    if (child == nullptr) continue;
    return IFirstChild{&child->props, child->tagName.c_str()};
  }
  return {};
}

const folly::dynamic *ancestorPropsOf(const void *context, const char *tag) {
  const auto *node = static_cast<const Node *>(context);
  if (node == nullptr || tag == nullptr) return nullptr;
  for (const Node *up = node->parent; up != nullptr; up = up->parent) {
    if (up->tagName == tag) return &up->props;
  }
  return nullptr;
}

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
    // Billed in three because the fold's CONTRACT is bag in, bag out, and that is a different cost
    // from the fold's own work: both conversions walk every key of the node whatever the fold reads.
    // If the conversions dominate, the fix is to narrow the contract; if the call does, the fix is to
    // not have a fold. The split is the only thing that can say which.
    auto startedAt = ISteadyClock::now();
    jsi::Value argument = jsi::valueFromDynamic(runtime, props);
    walkCost_.foldToJsNs += nanosSince(startedAt);

    startedAt = ISteadyClock::now();
    jsi::Value result = function->call(runtime, std::move(argument));
    walkCost_.foldCallNs += nanosSince(startedAt);

    startedAt = ISteadyClock::now();
    folly::dynamic folded = boundedDynamicFrom(
        runtime, std::move(result), [] { return std::string("the payloadFold result"); });
    walkCost_.foldFromJsNs += nanosSince(startedAt);
    return folded;
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
    compactChildren(node);
    for (const auto &child : node.children) {
      appendRenderable(
          runtime, uiManager, out, owners, *child, hasTextAncestor, surfaceId, fabricParent);
    }
    // Walked, so its flags clear here — `materialize` never sees it. See `markDirty`.
    node.selfDirty = false;
    node.pathDirty = false;
    return;
  }
  if (node.kind == kKindVoid) {
    // Unlike an anchor, a void node's children are NOT recursed into — they contribute nothing,
    // recursively, which is the whole point (`InputAccessoryView.js`'s Android `return null`). Its
    // own flags clear the same way an anchor's do, so `materialize` never sees it either.
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

// Take back the children Fabric kept, as `adoptYogaChild` swaps in clones behind our `committed`
// An orphan would make every child differ on the next commit, so the walks descend the whole tree
void adoptLandedChildren(Node &node, const std::vector<Node *> &owners) {
  // The generation every owner is attached under, for all of them as clone paths never append
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
  compactChildren(node);
  for (const auto &child : node.children) {
    if (child->kind == kKindAnchor) {
      collectRenderableOwners(*child, owners);
      continue;
    }
    // A void node contributes no owners of its own AND none of its children's — the same asymmetry
    // with the anchor branch above as `appendRenderable`'s.
    if (child->kind == kKindVoid) continue;
    if (isEmptyRawText(*child)) continue;
    owners.push_back(child.get());
  }
}

// Re-point the retained tree at the nodes Fabric committed, as it swaps in clones in the commit
// O(changed): an identical pointer means an identical subtree, so the descent stops there
void adoptCommitted(Node &node, const std::shared_ptr<const react::ShadowNode> &landed) {
  if (node.committed == nullptr || landed == nullptr) return;
  // A stranger is not adopted: a cancelled commit leaves the previous revision
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
  // Текстовый контекст липкий, кроме вью: у RN `View.js` отдаёт детям `TextAncestorContext` false
  const bool childHasTextAncestor =
      node.isText || (hasTextAncestor && node.viewName != kViewViewName);
  // BUMPED BEFORE THE CHILDREN ARE WALKED, which is the whole trick: the create branch below has
  // not run yet, so a child asking about its parent's family has to be told what it is ABOUT to be.
  // Same condition that branch tests — a node with no committed form is minting its first family,
  // which is a rebuild from a child's point of view exactly as a re-creation is.
  if (node.committed == nullptr || needsFreshFamily) node.familyGeneration += 1;
  compactChildren(node);
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
    IPayloadFold fold = foldFor(runtime, node);
    walkCost_.foldLookupNs += nanosSince(startedAt);
    if (fold) walkCost_.foldsFound += 1;

    startedAt = ISteadyClock::now();
    // The parent's props, for the rules that are DERIVED from the node above (ScrollView's content
    // view takes `collapsableChildren` from the scroller). A pointer hop, because the tree is here —
    // the same question cost a JS closure and a crossing while the fold lived on the other side.
    std::vector<std::string> varReads;
    folly::dynamic payload = fabricProps(
        node.viewName,
        node.tagName,
        node.props,
        fold,
        ownerOf(node),
        selfOf(node, hasTextAncestor),
        IAncestorLookup{&ancestorPropsOf, &node},
        firstChildOf(node),
        recordingLookup(node, surfaceId, varReads));
    trackVarReads(node, varReads);
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
      IPayloadFold fold = foldFor(runtime, node);
      walkCost_.foldLookupNs += nanosSince(startedAt);
      if (fold) walkCost_.foldsFound += 1;

      startedAt = ISteadyClock::now();
      std::vector<std::string> varReads;
      next = fabricProps(
          node.viewName,
          node.tagName,
          node.props,
          fold,
          ownerOf(node),
          selfOf(node, hasTextAncestor),
          IAncestorLookup{&ancestorPropsOf, &node},
          firstChildOf(node),
          recordingLookup(node, surfaceId, varReads));
      trackVarReads(node, varReads);
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
      // A child list is not a free argument: handing it over re-adopts and re-clones every child
      // An empty object is not an empty `RawProps`, it re-parses props and makes the differ emit
      // an `Update`
      auto rawProps = node.selfDirty && !payload.empty() ? react::RawProps(std::move(payload))
                                                         : react::RawProps();
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
        // The last guard needs the clone, as `completeClone` dirties a measurable node
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
        auto cloned = uiManager.cloneNode(*node.committed, handedChildren, std::move(rawProps));
        if (hasReorderedChildren(node.committedChildren, *children)) dirtyLayoutOf(*cloned);
        node.committed = std::move(cloned);
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

// Container first show

// Consumers whose variants arrived and that no commit hook pass has styled yet
std::vector<std::weak_ptr<Node>> pendingConsumers_;
// One parse per envelope text, shared by every node of a class
std::unordered_map<std::string, std::shared_ptr<const ContainerVariants>> variantsByEnvelope_;

std::shared_ptr<const ContainerVariants> variantsOf(const std::string &envelope) {
  const auto known = variantsByEnvelope_.find(envelope);
  if (known != variantsByEnvelope_.end()) return known->second;
  std::optional<ContainerVariants> parsed = parseContainerVariants(envelope);
  std::shared_ptr<const ContainerVariants> shared = parsed.has_value()
      ? std::make_shared<const ContainerVariants>(std::move(*parsed))
      : nullptr;
  variantsByEnvelope_.emplace(envelope, shared);
  return shared;
}

// The last value `key` takes in a style slot, which is an object or an array of slots
const folly::dynamic *styleValue(const folly::dynamic &style, const char *key) {
  if (style.isObject()) return style.get_ptr(key);
  if (!style.isArray()) return nullptr;
  const folly::dynamic *found = nullptr;
  for (const folly::dynamic &slot : style) {
    if (const folly::dynamic *value = styleValue(slot, key)) found = value;
  }
  return found;
}

// The words of a `container-name`, without the keyword `none`
std::vector<std::string> containerNamesIn(const folly::dynamic *declared) {
  std::vector<std::string> names;
  if (declared == nullptr || !declared->isString()) return names;
  const std::string &text = declared->getString();
  const auto isSpace = [&](size_t at) { return std::isspace(static_cast<unsigned char>(text[at])) != 0; };
  size_t at = 0;
  while (at < text.size()) {
    while (at < text.size() && isSpace(at)) at += 1;
    const size_t start = at;
    while (at < text.size() && !isSpace(at)) at += 1;
    if (at > start && text.compare(start, at - start, "none") != 0) {
      names.emplace_back(text, start, at - start);
    }
  }
  return names;
}

struct ContainerDeclaration {
  std::vector<std::string> names;
  bool isWidthOpen = false;
  bool isHeightOpen = false;
};

bool isFixedLength(const folly::dynamic *value) {
  if (value == nullptr || value->isNull()) return false;
  return !(value->isString() && value->getString() == "auto");
}

// An axis is fixed by its own length, a flex or an aspect ratio, never by what the node holds
// Only `size` contains the height, so an `inline-size` container is asked for its width alone
void markOpenAxes(const folly::dynamic &style, bool containsHeight, ContainerDeclaration &declaration) {
  for (const char *key : {"flex", "flexGrow", "flexBasis", "aspectRatio"}) {
    if (isFixedLength(styleValue(style, key))) return;
  }
  declaration.isWidthOpen = !isFixedLength(styleValue(style, "width"));
  declaration.isHeightOpen = containsHeight && !isFixedLength(styleValue(style, "height"));
}

// `nullopt` for a node that makes no container, else its names and the axes it leaves open
std::optional<ContainerDeclaration> containerDeclarationOf(const Node &node) {
  const folly::dynamic *style = node.props.get_ptr("style");
  if (style == nullptr) return std::nullopt;
  const folly::dynamic *type = styleValue(*style, "containerType");
  if (type == nullptr || !type->isString()) return std::nullopt;
  if (type->getString() != "size" && type->getString() != "inline-size") return std::nullopt;
  ContainerDeclaration declaration;
  declaration.names = containerNamesIn(styleValue(*style, "containerName"));
  markOpenAxes(*style, type->getString() == "size", declaration);
  return declaration;
}

// The frame size `root` laid the node out at, `nullopt` when the node is not in that tree
std::optional<ContainerSize> laidOutSize(const Node &node, const react::RootShadowNode &root) {
  if (node.committed == nullptr) return std::nullopt;
  const react::ShadowNode::AncestorList ancestors = node.committed->getFamily().getAncestors(root);
  if (ancestors.empty()) return std::nullopt;
  const auto &[parent, index] = ancestors.back();
  const auto *layoutable = dynamic_cast<const react::LayoutableShadowNode *>(
      parent.get().getChildren().at(static_cast<size_t>(index)).get());
  if (layoutable == nullptr) {
    SYMBIOTE_DLOG(std::string("container consumer has no layout: ") + node.committed->getComponentName());
    return std::nullopt;
  }
  const react::Size size = layoutable->getLayoutMetrics().frame.size;
  return ContainerSize{size.width, size.height};
}

// The nearest container above the consumer that carries the asked name, as the JS side finds it
ContainerLookup containerLookupFor(const Node &consumer, const react::RootShadowNode &root) {
  return [&consumer, &root](const std::optional<std::string> &name) -> std::optional<ContainerSize> {
    for (const Node *above = consumer.parent; above != nullptr; above = above->parent) {
      const std::optional<ContainerDeclaration> declared = containerDeclarationOf(*above);
      if (!declared.has_value()) continue;
      const std::vector<std::string> &names = declared->names;
      const bool isNamed = !name.has_value() || std::find(names.begin(), names.end(), *name) != names.end();
      if (!isNamed) continue;
      std::optional<ContainerSize> size = laidOutSize(*above, root);
      if (size.has_value()) {
        size->isWidthOpen = declared->isWidthOpen;
        size->isHeightOpen = declared->isHeightOpen;
      }
      return size;
    }
    return std::nullopt;
  };
}

// Slot 0 of `style` is the class style, which is what a variant replaces
void applyVariantStyle(Node &node, const folly::dynamic &variant) {
  folly::dynamic *style = node.props.get_ptr("style");
  if (style != nullptr && style->isArray() && !style->empty()) {
    (*style)[0] = variant;
    return;
  }
  node.props["style"] = style == nullptr ? folly::dynamic::array(variant)
                                         : folly::dynamic::array(variant, *style);
}

// The props `fabricProps` builds for the node as it stands, the same call a first create makes
folly::dynamic payloadOf(jsi::Runtime &runtime, Node &node, react::SurfaceId surfaceId) {
  IPayloadFold fold = foldFor(runtime, node);
  std::vector<std::string> varReads;
  folly::dynamic payload = fabricProps(
      node.viewName,
      node.tagName,
      node.props,
      fold,
      ownerOf(node),
      selfOf(node, node.committedTextAncestor),
      IAncestorLookup{&ancestorPropsOf, &node},
      firstChildOf(node),
      recordingLookup(node, surfaceId, varReads));
  trackVarReads(node, varReads);
  return payload;
}

struct ConsumerChange {
  NodePtr node;
  folly::dynamic payload;
};

// Styles consumers by the size of their container inside the commit, after a first layout pass
// The size containers have is fixed by their own style, so one pass settles them without a cycle
class ContainerCommitHook : public react::UIManagerCommitHook {
 public:
  void commitHookWasRegistered(const react::UIManager &) noexcept override {}
  void commitHookWasUnregistered(const react::UIManager &) noexcept override {}

  react::RootShadowNode::Unshared shadowTreeWillCommit(
      const react::ShadowTree &shadowTree,
      const react::RootShadowNode::Shared &,
      const react::RootShadowNode::Unshared &newRoot,
      const react::ShadowTreeCommitOptions &) noexcept override {
    if (runtime_ == nullptr || shadowTree.getSurfaceId() != surfaceId_) return newRoot;
    try {
      return styleConsumers(newRoot);
    } catch (...) {
      return newRoot;
    }
  }

  void arm(jsi::Runtime &runtime, react::UIManager &uiManager, react::SurfaceId surfaceId) {
    runtime_ = &runtime;
    uiManager_ = &uiManager;
    surfaceId_ = surfaceId;
  }

  void disarm() { runtime_ = nullptr; }

 private:
  // What the node must now send, `nullopt` when its container sizes ask for the plain style
  std::optional<ConsumerChange> restyle(const NodePtr &node, const react::RootShadowNode &root) {
    const ContainerVariants &variants = *node->containerVariants;
    const uint32_t mask = holdingMask(variants, containerLookupFor(*node, root));
    const std::optional<std::string> styleJson = styleJsonForMask(variants, mask);
    if (!styleJson.has_value()) return std::nullopt;
    applyVariantStyle(*node, folly::parseJson(*styleJson));
    folly::dynamic next = payloadOf(*runtime_, *node, surfaceId_);
    folly::dynamic payload = diffProps(node->committedProps, next);
    node->committedProps = std::move(next);
    if (payload.empty()) return std::nullopt;
    return ConsumerChange{node, std::move(payload)};
  }

  react::RootShadowNode::Unshared withPayload(
      const react::RootShadowNode::Unshared &root,
      const ConsumerChange &change) {
    const auto cloned = root->cloneTree(
        change.node->committed->getFamily(), [&](const react::ShadowNode &standing) {
          return uiManager_->cloneNode(
              standing,
              react::ShadowNodeFragment::childrenPlaceholder(),
              react::RawProps(change.payload));
        });
    return cloned == nullptr ? root : std::static_pointer_cast<react::RootShadowNode>(cloned);
  }

  react::RootShadowNode::Unshared styleConsumers(const react::RootShadowNode::Unshared &newRoot) {
    newRoot->layoutIfNeeded();
    std::vector<ConsumerChange> changes;
    std::vector<std::weak_ptr<Node>> waiting;
    for (const std::weak_ptr<Node> &entry : pendingConsumers_) {
      const NodePtr node = entry.lock();
      if (node == nullptr || node->containerVariants == nullptr) continue;
      if (!laidOutSize(*node, *newRoot).has_value()) {
        waiting.push_back(entry);
        continue;
      }
      if (std::optional<ConsumerChange> change = restyle(node, *newRoot)) {
        changes.push_back(std::move(*change));
      }
    }
    pendingConsumers_ = std::move(waiting);
    react::RootShadowNode::Unshared root = newRoot;
    for (const ConsumerChange &change : changes) root = withPayload(root, change);
    return root;
  }

  jsi::Runtime *runtime_ = nullptr;
  react::UIManager *uiManager_ = nullptr;
  react::SurfaceId surfaceId_ = 0;
};

// One hook per runtime, never freed: the UIManager keeps it by reference for as long as it lives
// The marker on the global tells a fresh runtime at a reused address from the one hooked already
ContainerCommitHook &hookFor(jsi::Runtime &runtime, react::UIManager &uiManager) {
  static std::unordered_map<const jsi::Runtime *, ContainerCommitHook *> hooks;
  constexpr const char *kMarker = "__symbioteContainerHook";
  jsi::Object global = runtime.global();
  const auto known = hooks.find(&runtime);
  if (known != hooks.end() && global.hasProperty(runtime, kMarker)) return *known->second;
  auto *hook = new ContainerCommitHook();
  uiManager.registerCommitHook(*hook);
  global.setProperty(runtime, kMarker, true);
  hooks[&runtime] = hook;
  return *hook;
}

// Arms the hook for the one commit that follows, when a consumer is waiting to be styled
class ContainerHookScope {
 public:
  ContainerHookScope(jsi::Runtime &runtime, react::UIManager &uiManager, react::SurfaceId surfaceId) {
    if (pendingConsumers_.empty()) return;
    hook_ = &hookFor(runtime, uiManager);
    hook_->arm(runtime, uiManager, surfaceId);
  }
  ~ContainerHookScope() {
    if (hook_ != nullptr) hook_->disarm();
  }
  ContainerHookScope(const ContainerHookScope &) = delete;
  ContainerHookScope &operator=(const ContainerHookScope &) = delete;

 private:
  ContainerCommitHook *hook_ = nullptr;
};

} // namespace

jsi::Value Tree::applyOps(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 5) {
    throw jsi::JSError(
        runtime,
        "symbiote engine: expected applyOps(ops, strings, values, instanceHandles, handles)");
  }

  const auto applyStartedAt = ISteadyClock::now();
  walkCost_.applyCalls += 1;
  auto &uiManager = uiManagerFor(runtime, "applyOps");

  size_t opsLength = 0;
  const int32_t *ops = int32ArrayData(runtime, arguments[0], opsLength);
  // `getObject`/`getArray` and never the checking pair, which was 2.8 us of a 4.4 us entry. Why
  // that is safe: `symbiote-engine-op-application` skill, "The prologue"
  auto strings = arguments[1].getObject(runtime).getArray(runtime);
  auto values = arguments[2].getObject(runtime).getArray(runtime);
  auto instanceHandles = arguments[3].getObject(runtime).getArray(runtime);
  auto handles = arguments[4].getObject(runtime).getArray(runtime);
  const size_t slotCount = handles.size(runtime);

  // Slot -> node, resolved at most ONCE per batch and usually not at all. See the skill,
  // "The three per-batch tables"
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
    object.setNativeState(runtime, node);
    walkCost_.nativeStateNs += nanosSince(stateStartedAt);
    bySlot[at] = std::move(node);
    walkCost_.publishNs += nanosSince(publishStartedAt);
  };

  // Decoded ONCE per batch, not once per op that names a string. The 8.0x this turns on, and what
  // is not measurable headless: the skill, "The three per-batch tables"
  std::vector<std::string> decodedStrings;
  {
    const auto stringsStartedAt = ISteadyClock::now();
    const size_t count = strings.size(runtime);
    decodedStrings.reserve(count);
    for (size_t at = 0; at < count; ++at) {
      decodedStrings.push_back(
          strings.getValueAtIndex(runtime, at).asString(runtime).utf8(runtime));
    }
    walkCost_.stringDecodeNs += nanosSince(stringsStartedAt);
  }

  // Prop VALUES, converted at most once per entry per batch, and LAZILY unlike the strings above.
  // Why lazily, and what that costs a thrown conversion: the skill, "The three per-batch tables"
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

  // `auto &&describe` and not a `std::function`: the description must stay a lambda the compiler
  // can inline away. See `boundedDynamicFrom`, and the skill for the 48.8% behind it
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
      case kOpCreateVoid: {
        auto node = std::make_shared<Node>();
        node->kind = kKindVoid;
        publish(ops[at + 1], std::move(node));
        break;
      }
      case kOpAppendChild: {
        const auto structureStartedAt = ISteadyClock::now();
        const auto &parent = nodeAt(ops[at + 1]);
        auto child = nodeAt(ops[at + 2]);
        detachFromParent(child);
        child->parent = parent.get();
        const auto holdStartedAt = ISteadyClock::now();
        holdHandle(runtime, *child);
        walkCost_.holdHandleNs += nanosSince(holdStartedAt);
        // A HINT the detach path reads back, and appending past a hole is harmless: the hole keeps
        // its place until the next read compacts
        child->slotInParent = parent->children.size();
        parent->children.push_back(std::move(child));
        markDirty(*parent);
        walkCost_.structureNs += nanosSince(structureStartedAt);
        break;
      }
      case kOpInsertBefore: {
        const auto &parent = nodeAt(ops[at + 1]);
        auto child = nodeAt(ops[at + 2]);
        const auto &before = nodeAt(ops[at + 3]);
        // A MOVE WITHIN THE SAME PARENT ERASES RATHER THAN PUNCHING A HOLE, 2.4x better on a
        // 4 000-row reorder. See the skill, "Child-vector maintenance"
        if (child->parent == parent.get()) {
          auto &standing = parent->children;
          const size_t hinted = child->slotInParent;
          auto at = hinted < standing.size() && standing[hinted] == child
              ? standing.begin() + static_cast<std::ptrdiff_t>(hinted)
              : std::find(standing.begin(), standing.end(), child);
          if (at != standing.end()) standing.erase(at);
          child->parent = nullptr;
          markDirty(*parent);
        } else {
          detachFromParent(child);
        }
        child->parent = parent.get();
        holdHandle(runtime, *child);
        // An insert has to land at a POSITION and a hole is not one. Free when the parent is dense,
        // which after the branch above it is in the move-within-a-parent case.
        compactChildren(*parent);
        auto &siblings = parent->children;
        const size_t hinted = before->slotInParent;
        const size_t index = hinted < siblings.size() && siblings[hinted] == before
            ? hinted
            : static_cast<size_t>(
                  std::find(siblings.begin(), siblings.end(), before) - siblings.begin());
        siblings.insert(siblings.begin() + static_cast<std::ptrdiff_t>(index), std::move(child));
        siblings[index]->slotInParent = index;
        // THE TAIL'S HINTS ARE NOW ONE TOO LOW AND ARE LEFT THAT WAY: renumbering was five times
        // worse on a 4 000-row reorder. See the skill, "Child-vector maintenance"
        markDirty(*parent);
        break;
      }
      case kOpRemoveChild: {
        const auto &parent = nodeAt(ops[at + 1]);
        auto child = nodeAt(ops[at + 2]);
        // The child's OWN parent pointer, which is the truth even when the adapter names a stale
        // one. See the skill, "Child-vector maintenance"
        if (child->parent == parent.get()) {
          detachFromParent(child);
          // Released HERE and not inside `detachFromParent`, which the attach ops also call to
          // spell a MOVE. Why that window would matter: the skill
          child->attachedHandle.reset();
        }
        break;
      }
      // Writing a value the node already holds returns before `markDirty`, т.к. the MARK is what
      // costs: it strips every ancestor of the reuse fast path. Why the guard is here and not in
      // JS, and the one asymmetry with the TS applier: the skill, "The two guards"
      case kOpSetProp: {
        const auto setPropStartedAt = ISteadyClock::now();
        const auto &node = nodeAt(ops[at + 1]);
        const auto &key = stringAt(ops[at + 2]);
        if (ops[at + 3] == kNoValue) {
          // An absent key is not a key holding null, and a vanished one goes out as an explicit
          // null. See the skill, "The two guards"
          if (node->props.get_ptr(key) == nullptr) {
            walkCost_.deletesOfAbsent += 1;
            break;
          }
          node->props.erase(key);
        } else {
          const auto &value = valueAt(ops[at + 3], [&] {
            return "prop \"" + key + "\" on <" + node->viewName + ">";
          });
          const auto *existing = node->props.get_ptr(key);
          if (existing != nullptr && *existing == value) {
            walkCost_.writesOfUnchanged += 1;
            break;
          }
          // A COPY and not a move: the entry is shared by every node the same object was handed to
          node->props[key] = value;
        }
        // Only a style JS flagged, or one that held declarations before, can change them
        if (key == "style" && (ops[at + 4] != 0 || !node->varDecls.empty())) {
          refreshDeclarations(*node);
        }
        markDirty(*node);
        walkCost_.setPropNs += nanosSince(setPropStartedAt);
        walkCost_.setProps += 1;
        break;
      }
      // The one op that changes what a node IS rather than what it holds, and `materialize`'s
      // `needsFreshFamily` covers the consequence. `TextInput`'s `multiline` flip is why it exists
      case kOpSetComponent: {
        const auto &node = nodeAt(ops[at + 1]);
        const auto &viewName = stringAt(ops[at + 2]);
        if (node->viewName == viewName) break;
        node->viewName = viewName;
        markDirty(*node);
        break;
      }
      // No `markDirty`: this arrives at `createElement`, before the node's first commit, so there
      // is no payload yet. The table of which ops mark and why is in the skill
      case kOpSetTag: {
        const auto &node = nodeAt(ops[at + 1]);
        node->tagName = stringAt(ops[at + 2]);
        break;
      }
      // No `markDirty` either: the mark changes no payload, only which nodes a teardown visits
      case kOpSetReleaseMark: {
        nodeAt(ops[at + 1])->releaseMarked = true;
        break;
      }
      // The `:root` table belongs to no node, so only the readers of a changed name are dirtied
      case kOpSetGlobalVariable: {
        const auto &name = stringAt(ops[at + 1]);
        const std::optional<std::string> before = GlobalVariables::instance().get(name);
        if (ops[at + 2] == kNoValue) {
          GlobalVariables::instance().erase(name);
        } else {
          GlobalVariables::instance().set(name, stringAt(ops[at + 2]));
        }
        if (before != GlobalVariables::instance().get(name)) markVarReaders(name);
        break;
      }
      // Same shape as the `:root` case, for one surface: only its own readers are dirtied
      case kOpSetVariable: {
        const auto surface = static_cast<react::SurfaceId>(ops[at + 1]);
        const auto &name = stringAt(ops[at + 2]);
        auto &table = SurfaceVariables::instance();
        const std::optional<std::string> before = table.get(surface, name);
        if (ops[at + 3] == kNoValue) {
          table.erase(surface, name);
        } else {
          table.set(surface, name, stringAt(ops[at + 3]));
        }
        if (before != table.get(surface, name)) markSurfaceVarReaders(surface, name);
        break;
      }
      // No `markDirty`: the variants change no payload, the commit hook styles the node from them
      case kOpSetContainerVariants: {
        const auto &node = nodeAt(ops[at + 1]);
        node->containerVariants =
            ops[at + 2] == kNoValue ? nullptr : variantsOf(stringAt(ops[at + 2]));
        if (node->containerVariants != nullptr) pendingConsumers_.push_back(node);
        break;
      }
      // `markDirty`, unlike `kOpSetTag`, т.к. a listener can flip at any point in a screen's life
      // and the key it decides is committed by then. See the skill
      case kOpSetOwnedListener: {
        const auto &node = nodeAt(ops[at + 1]);
        // Only the names a platform rule actually reads. Anything else is a JS-side concern that
        // happened to cross, and dropping it here costs one comparison.
        const uint8_t bit = pressListenerBit(stringAt(ops[at + 2]));
        if (bit == 0) break;
        const uint8_t next = ops[at + 3] != 0 ? uint8_t(node->pressListeners | bit)
                                              : uint8_t(node->pressListeners & ~bit);
        if (node->pressListeners == next) break;
        node->pressListeners = next;
        markDirty(*node);
        break;
      }
      // A gesture-rate flip, so it marks dirty like the listener op and unlike `kOpSetTag`: the
      // payload it invalidates is already committed by the time a finger lands.
      case kOpSetUnderlayShown: {
        const auto &node = nodeAt(ops[at + 1]);
        const bool shown = ops[at + 2] != 0;
        if (node->underlayShown == shown) break;
        node->underlayShown = shown;
        markDirty(*node);
        // AND THE CHILD, т.к. the bit drives a rule on BOTH (`foldTouchableHighlightChild`), and
        // the FIRST child is the whole population since RN takes `React.Children.only`
        if (!node->children.empty()) {
          compactChildren(*node);
          if (!node->children.empty() && node->children.front() != nullptr)
            markDirty(*node->children.front());
        }
        break;
      }
      case kOpSetText: {
        const auto &node = nodeAt(ops[at + 1]);
        const auto &text = stringAt(ops[at + 2]);
        const auto *existing = node->props.get_ptr("text");
        if (existing != nullptr && existing->isString() && existing->asString() == text) break;
        // Read BEFORE the write, and only a FLIP to or from `''` marks the parent, т.к. that is
        // what moves the node in or out of its parent's renderable list. See the skill
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
        // The surface NODE is contributed, not its children, and `nullptr` stands for the root
        // child set т.к. it is not a node. What that costs a cross-surface move: the skill
        IOwnerTally rootOwners;
        // THE ONE TIMER THAT IS NOT PER NODE, т.к. the walk is recursive and a timer inside
        // `materialize` would count every ancestor again for every descendant
        const auto walkStartedAt = ISteadyClock::now();
        appendRenderable(
            runtime, uiManager, *childSet, rootOwners, *surface, false, surfaceId, nullptr);
        walkCost_.walkNs += nanosSince(walkStartedAt);
        // SKIPPED when the root child set comes back identical, which is what makes the JS side's
        // commit fan-out free. See the skill, "kOpCommit"
        if (surface->hasCommittedRenderable &&
            sameNodes(surface->committedRenderable, *childSet)) {
          break;
        }
        surface->committedRenderable = *childSet;
        surface->hasCommittedRenderable = true;
        // `completeSurface` runs `ShadowTree::commit` with a lambda that REPLACES the root's
        // children, so a retained pending root is not needed. The hook is only for container styles
        const ContainerHookScope hookScope(runtime, uiManager, surfaceId);
        uiManager.completeSurface(
            surfaceId,
            childSet,
            {.enableStateReconciliation = true,
             .mountSynchronously = false,
             .source = react::ShadowTree::CommitSource::React});
        uiManager.getShadowTreeRegistry().visit(
            surfaceId, [&rootOwners](const react::ShadowTree &shadowTree) {
              // THE REPAIR, here and not in `materialize` т.к. substitution happens INSIDE the
              // commit. See `adoptCommitted`
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

  walkCost_.applyNs += nanosSince(applyStartedAt);
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
  compactChildren(*node->parent);
  const auto &siblings = node->parent->children;
  auto at = std::find_if(siblings.begin(), siblings.end(), [&](const NodePtr &sibling) {
    return sibling.get() == node.get();
  });
  if (at == siblings.end() || std::next(at) == siblings.end()) {
    return jsi::Value::undefined();
  }
  return handleOf(runtime, **std::next(at));
}

/**
 * The first live child, anchors included.
 *
 * WHY IT IS ITS OWN CALL, and it is `nextSiblingOf`'s argument one door along. The JS spelling was
 * `childrenOf(node)[0]`, and `solid-js/universal`'s `cleanChildren` empties a parent with
 * `while (removed = getFirstChild(parent)) removeNode(parent, removed)` — so a list of N children
 * was read N times, each read building and discarding the whole remaining list. Measured on a
 * 2 000-row `Clear` before this existed: **2 001 001 handles** crossed the boundary to remove two
 * thousand children, which is N(N+1)/2 to the unit, and the step cost 435 ms against stock's 14.
 *
 * SKIPS A DEAD HANDLE rather than answering `undefined` on one, exactly as `childrenOf` does. The
 * two must agree element for element or a caller that switches between them sees a different tree —
 * and `cleanChildren`'s loop terminates on `undefined`, so answering it early would orphan every
 * child behind the dead one.
 */
jsi::Value Tree::firstChildOf(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected firstChildOf(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "firstChildOf");
  compactChildren(*node);
  for (const auto &child : node->children) {
    auto handle = handleOf(runtime, *child);
    if (!handle.isUndefined()) return handle;
  }
  return jsi::Value::undefined();
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
  compactChildren(*node);
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

// A node whose handle is gone contributes neither itself nor its descendants, as the JS walk did
void collectSubtree(jsi::Runtime &runtime, const NodePtr &node, std::vector<jsi::Value> &into) {
  auto handle = handleOf(runtime, *node);
  if (handle.isUndefined()) return;
  into.push_back(std::move(handle));
  compactChildren(*node);
  for (const auto &child : node->children) collectSubtree(runtime, child, into);
}

// The same walk narrowed to a root, a tagged node or an ancestor of one, as only those tear down
// Returns whether the node earned its place, so its parent keeps its own
bool collectTeardownSubtree(
    jsi::Runtime &runtime,
    const NodePtr &node,
    std::vector<jsi::Value> &into,
    bool isRoot) {
  auto handle = handleOf(runtime, *node);
  if (handle.isUndefined()) return false;
  const size_t reserved = into.size();
  into.push_back(std::move(handle));
  bool isWanted = isRoot || !node->tagName.empty() || node->releaseMarked;
  compactChildren(*node);
  for (const auto &child : node->children) {
    if (collectTeardownSubtree(runtime, child, into, false)) isWanted = true;
  }
  if (!isWanted) into.resize(reserved);
  return isWanted;
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

// Shared by `subtreesOf` and `teardownSubtreesOf`, which differ only in which nodes the walk keeps.
jsi::Value Tree::collectRoots(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count,
    const char *what,
    bool narrowToTeardown) {
  if (count < 1) {
    throw jsi::JSError(runtime, std::string("symbiote engine: expected ") + what + "(roots)");
  }
  const auto readStartedAt = ISteadyClock::now();
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
        nodeFrom(runtime, roots.getValueAtIndex(runtime, at).asObject(runtime), what);
    if (narrowToTeardown) collectTeardownSubtree(runtime, root, flat, true);
    else collectSubtree(runtime, root, flat);
  }

  auto out = jsi::Array(runtime, flat.size());
  for (size_t at = 0; at < flat.size(); at += 1) {
    out.setValueAtIndex(runtime, at, std::move(flat[at]));
  }
  walkCost_.hostReadNs += nanosSince(readStartedAt);
  walkCost_.hostReadHandles += flat.size();
  return out;
}

jsi::Value Tree::subtreesOf(jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  return collectRoots(runtime, arguments, count, "subtreesOf", false);
}

jsi::Value Tree::teardownSubtreesOf(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  return collectRoots(runtime, arguments, count, "teardownSubtreesOf", true);
}

jsi::Value Tree::committedRecordOf(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected committedRecordOf(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "committedRecordOf");
  // `undefined` before the first commit is an ordinary answer: an adapter wiring an imperative call
  // at lifecycle time runs before the commit, and every caller defers or logs
  if (node->committed == nullptr) return jsi::Value::undefined();

  auto record = jsi::Object(runtime);
  // The PLACEHOLDER, not the `ShadowNode`: the imperative five below accept this object, a wrapper
  // over the node itself comes from `shadowNodeWrapperOf`
  record.setProperty(runtime, "handle", jsi::Value(runtime, arguments[0]));
  record.setProperty(runtime, "tag", jsi::Value(static_cast<double>(node->tag)));
  record.setProperty(
      runtime, "rootTag", jsi::Value(static_cast<double>(node->committedSurfaceId)));
  record.setProperty(
      runtime, "familyGeneration", jsi::Value(static_cast<double>(node->familyGeneration)));
  return record;
}

jsi::Value Tree::shadowNodeOf(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected shadowNodeOf(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "shadowNodeOf");
  if (node->committed == nullptr) return jsi::Value::undefined();
  return react::valueFromShadowNode(runtime, node->committed);
}

jsi::Value Tree::committedPayloadOf(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 1) {
    throw jsi::JSError(runtime, "symbiote engine: expected committedPayloadOf(handle)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "committedPayloadOf");
  // Before the first commit there is no payload, and that is an ANSWER rather than an error — the
  // same shape `committedRecordOf` gives for the same state.
  if (node->committed == nullptr) return jsi::Value::undefined();
  return jsi::valueFromDynamic(runtime, node->committedProps);
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

jsi::Value Tree::getBoundingClientRect(jsi::Runtime &runtime, const jsi::Value *, size_t) {
  throw jsi::JSError(runtime, "symbiote engine: getBoundingClientRect is not built on this platform");
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

// No callback, unlike its siblings above - the JS caller (imperative.ts) expects a direct return.
// `undefined` (no revision yet) reads the same as an uncommitted node to that caller.
jsi::Value Tree::getBoundingClientRect(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 2) {
    throw jsi::JSError(
        runtime, "symbiote engine: expected getBoundingClientRect(handle, includeTransform)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "getBoundingClientRect");
  const bool includeTransform = arguments[1].getBool();

  auto revision = node->committed == nullptr
      ? nullptr
      : uiManagerFor(runtime, "getBoundingClientRect")
            .getShadowTreeRevisionProvider()
            ->getCurrentRevision(node->committed->getSurfaceId());
  if (revision == nullptr) {
    return jsi::Value::undefined();
  }

  auto rect = react::dom::getBoundingClientRect(revision, *node->committed, includeTransform);
  auto result = jsi::Object(runtime);
  result.setProperty(runtime, "x", jsi::Value(rect.x));
  result.setProperty(runtime, "y", jsi::Value(rect.y));
  result.setProperty(runtime, "width", jsi::Value(rect.width));
  result.setProperty(runtime, "height", jsi::Value(rect.height));
  return result;
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

jsi::Value Tree::readGlobalVariable(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 1 || !arguments[0].isString()) {
    throw jsi::JSError(runtime, "symbiote engine: expected readGlobalVariable(name)");
  }
  const auto value = GlobalVariables::instance().get(arguments[0].asString(runtime).utf8(runtime));
  if (!value.has_value()) {
    return jsi::Value::undefined();
  }
  return jsi::String::createFromUtf8(runtime, *value);
}

jsi::Value Tree::readVariable(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 2 || !arguments[1].isString()) {
    throw jsi::JSError(runtime, "symbiote engine: expected readVariable(handle, name)");
  }
  const auto node = nodeFrom(runtime, arguments[0].asObject(runtime), "readVariable");
  // The computed value, as a `var()` on the node would read it: references substituted, typed
  VarResolver resolver = registryResolver([&node](std::string_view name, VarScope from) {
    return lookupVar(IVarQuery{*node, node->committedSurfaceId, name}, from);
  });
  const auto value = resolver.computed(arguments[1].asString(runtime).utf8(runtime));
  if (!value.has_value()) {
    return jsi::Value::undefined();
  }
  return jsi::String::createFromUtf8(runtime, *value);
}

jsi::Value Tree::registerProperty(
    jsi::Runtime &runtime,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 4 || !arguments[0].isString() || !arguments[1].isString() || !arguments[2].isBool()) {
    throw jsi::JSError(
        runtime, "symbiote engine: expected registerProperty(name, syntax, inherits, initialValue)");
  }
  const std::string name = arguments[0].asString(runtime).utf8(runtime);
  std::optional<std::string> initialValue;
  if (arguments[3].isString()) initialValue = arguments[3].asString(runtime).utf8(runtime);
  RegisteredProperties::instance().setColorParser(parseColorToken);
  const RegisterOutcome outcome = RegisteredProperties::instance().add(
      name, arguments[1].asString(runtime).utf8(runtime), arguments[2].getBool(), initialValue);
  if (outcome == RegisterOutcome::kRegistered) markVarReaders(name);
  return jsi::Value(static_cast<int>(outcome));
}

jsi::Value Tree::unregisterProperty(
    jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  if (count < 1 || !arguments[0].isString()) {
    throw jsi::JSError(runtime, "symbiote engine: expected unregisterProperty(name)");
  }
  const std::string name = arguments[0].asString(runtime).utf8(runtime);
  const bool wasRegistered = RegisteredProperties::instance().remove(name);
  if (wasRegistered) markVarReaders(name);
  return jsi::Value(wasRegistered);
}

jsi::Value Tree::clearRegisteredProperties(
    jsi::Runtime &runtime, const jsi::Value *arguments, size_t count) {
  RegisteredProperties::instance().clear();
  return jsi::Value::undefined();
}

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
  result.setProperty(runtime, "foldLookupMs", millis(walkCost_.foldLookupNs));
  result.setProperty(runtime, "foldToJsMs", millis(walkCost_.foldToJsNs));
  result.setProperty(runtime, "foldCallMs", millis(walkCost_.foldCallNs));
  result.setProperty(runtime, "foldFromJsMs", millis(walkCost_.foldFromJsNs));
  result.setProperty(
      runtime, "foldsFound", static_cast<double>(walkCost_.foldsFound));
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
      runtime,
      "deletesOfAbsent",
      jsi::Value(static_cast<double>(walkCost_.deletesOfAbsent)));
  result.setProperty(
      runtime,
      "writesOfUnchanged",
      jsi::Value(static_cast<double>(walkCost_.writesOfUnchanged)));
  result.setProperty(
      runtime, "valueEntries", jsi::Value(static_cast<double>(walkCost_.valueEntries)));
  result.setProperty(
      runtime, "valueConversions", jsi::Value(static_cast<double>(walkCost_.valueConversions)));
  result.setProperty(runtime, "applyMs", millis(walkCost_.applyNs));
  // NOT DRAINED ON READ, unlike every counter around it: this is a level rather than a total, and a
  // level that zeroed itself when read would answer about nothing. `retention-after-clear.itest.ts`
  // reads it across cycles.
  result.setProperty(runtime, "liveNodes", jsi::Value(static_cast<double>(Node::live)));
  result.setProperty(runtime, "stringDecodeMs", millis(walkCost_.stringDecodeNs));
  result.setProperty(runtime, "structureMs", millis(walkCost_.structureNs));
  result.setProperty(runtime, "holdHandleMs", millis(walkCost_.holdHandleNs));
  result.setProperty(runtime, "hostReadMs", millis(walkCost_.hostReadNs));
  result.setProperty(
      runtime, "hostReadHandles", jsi::Value(static_cast<double>(walkCost_.hostReadHandles)));
  result.setProperty(
      runtime, "applyCalls", jsi::Value(static_cast<double>(walkCost_.applyCalls)));
  walkCost_ = IWalkCost{};
  return result;
}

} // namespace symbiote

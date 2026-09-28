// Per-tag behavior on an engine node — lets a primitive's state machine live below the framework
// instead of inside a framework component, which would otherwise charge it a per-instance cost in
// every framework touching element subtrees (see .claude/rules/host-primitive-tier.md, tier 2).

// A registry, not a direct import: components depends on engine and never the reverse, so the
// engine cannot import createPressHandlers directly. The inversion is forced, not chosen.

// The registration call itself is the hazard: Metro's inlineRequires makes a barrel re-export
// lazy, so a module whose only job is registerHostBehavior() never evaluates in release unless
// it's a bare side-effect import (`import '../register'`), never re-exported — see packages/slider.

// registerHostBehavior emits a dlog so DEBUG=1 answers "did my registration run" before anyone
// starts debugging the behavior itself.

import { parentsOf, teardownSubtreesOf } from './host-access';
import { recordSetTag } from './mutation-buffer';
import { dlog } from './debug';
import type { ISymbioteNode } from './node';

// A pure props -> props mapping a behavior applies on the way to the Fabric payload — a tag has
// no component body, and a wrapper's body is where per-primitive prop folds used to live
// (TextInput's W3C aliases, Pressable's disabled -> accessibilityState).

// Not a hook on setProp (the engine's hottest path) — runs once per node per payload build, only
// for a node whose behavior supplied one. Must be pure and must not mutate its input.
export type IPayloadFold = (
  props: Readonly<Record<string, unknown>>,
) => Record<string, unknown>;

// What an owner does with a child it claims. See `IHostBehavior.claimedChildren`.
export type IClaimMode = 'beside' | 'wrap';

export interface IHostBehavior {
  // Listener names this behavior owns on its tag — engine event names, not `onX` props (`press`,
  // `startShouldSetResponder`, ...). setEventListener stashes an app listener for an owned name
  // instead of writing it into node.listeners, so the machine's dispatcher keeps the slot.

  // Without this the two collide and the last writer wins silently: node.listeners is a
  // single-slot Map, so the app's own onPress would evict the gesture machine from the same keys.
  // A wrapper used to mediate this by destructuring the app's callbacks out; a tag has none.
  readonly ownedListeners?: readonly string[];
  // Props the app writes on the OWNER that belong to the SLOT, as owner name -> slot name — the
  // prop twin of childHost. `contentContainerStyle` on a ScrollView styles its content view; a
  // wrapper used to render that onto its inner node, a tag has none, so the engine does.

  // A rename, not a plain redirect, since the names differ by design (`contentContainerStyle` on
  // the owner is `style` on the slot). Goes through the slot's own routeProp, so it inherits style
  // merging, class merging and the already-published guard for free.

  // Composing a constant with the redirected value is the slot's own payloadFold's job, not this
  // field's — keeping them apart is what lets the rename stay a pure redirect and precedence live
  // in the fold, not the routing.
  readonly slotProps?: Readonly<Record<string, string>>;
  // The complement of slotProps: every prop not named here routes to the slot under its own name
  // (slotProps still wins where both could answer). ActivityIndicator hands the spinner
  // `...restProps`, keeping only onLayout/style on its wrapper — the set that moves is open.

  // It is a redirect, so nothing needs marking dirty afterwards: the write lands on the slot and
  // marks it directly, which is why this isn't a slotDerived wildcard instead.
  readonly slotPropsExcept?: readonly string[];
  // The value a redirected prop lands with, under its SLOT name. For the one rule the C++ host
  // cannot express: Button's Android title is `title.toUpperCase()` (Button.js:352), JavaScript's
  // full-Unicode uppercase — the host has no ICU. Runs per redirected write, never per commit.
  readonly slotValueFor?: (slotKey: string, value: unknown) => unknown;
  // The slot is a built sibling, not a container: the app's children stay on the owner and land
  // after it. childHost normally answers both "which node redirects a prop" and "which node takes
  // children" the same way; ImageBackground's absolutely-filled Image answers them differently.

  // Not a JSX preference upstream could have collapsed: Android's Image is not a ViewGroup, so a
  // child mounted inside it is an addView crash — the reason ImageBackground exists at all.

  // Read only where childHost already decides placement (hostFor/indexFor in node.ts), so a
  // primitive without a slot pays nothing and one with an ordinary slot pays a probe already made.
  readonly slotTakesNoChildren?: boolean;
  // Owner prop names the slot's payload is derived from. Writing one marks the slot's props dirty
  // — neither a rename (slotProps) nor a constant (the slot's own payloadFold) can express a
  // derived value like collapsableChildren, computed from props that stay on the owner.

  // Names rather than a hook, so the fold stays pure and the engine keeps deciding when payloads
  // build. Read from setProp past its identity guard, so a re-render writing the same value
  // dirties nothing; node.childHost turns away every slotless node before the registry is touched.

  // SLOT_DERIVED_ALL is the fourth case: a cloneElement owner re-clones on every render whatever
  // changed, so naming keys is only an optimisation, one traded for staying in step with a
  // matching rule in SymbioteFabricProps.cpp rather than risking a silently stale clone.
  readonly slotDerived?: readonly string[];
  // Children the owner takes out of the ordinary flow, by Fabric component name — the child twin
  // of slotProps. ScrollView's RefreshControl is a sibling before the content view on iOS but the
  // scroll view's own parent on Android, since an Android ScrollView takes exactly one child.

  // By Fabric name, unlike the registry itself, because a claim is per-parent: keying the registry
  // that way would attach the press machine to every plain View (Pressable resolves to RCTView
  // too). A claim only asks for children of one owner, so the name is unambiguous there.
  readonly claimedChildren?: Readonly<Record<string, IClaimMode>>;
  // Runs after an app child has been placed under this node — the counterpart of buildStructure,
  // for a primitive whose real target doesn't exist yet at attach because it's the framework's
  // child, not the behavior's own (RN's TouchableNativeFeedback clones props onto its one child).

  // The node is placed by the time this runs, so a behavior may adopt it as node.childHost (which
  // is what makes slotDerived reach it) and write on it through the ordinary mutation API.

  // Fires for every app child, so a behavior taking only the first says so itself — one WeakMap
  // probe per append, beside the WeakSet probe reattachHostBehaviors already pays there.
  onChildInserted?(node: ISymbioteNode, child: ISymbioteNode): void;
  // Builds the primitive's own internal subtree once, and returns the node the app's children
  // belong under (or undefined for the host itself). foldPayload gives a tag its wrapper's prop
  // mapping; this gives it the wrapper's composition — a ScrollView wrapping a content view.

  // Runs before attach, so a machine can see its own slot — this is the node's shape, not its
  // runtime.

  // Runs exactly once, at attachHostBehavior, never from reattachSubtree: a parked subtree's
  // internal children travel with it, so rebuilding would duplicate them and change the slot's
  // identity under app children still pointing at the old one. attach restarts; structure doesn't.

  // Builds through the ordinary mutation API (createElement + appendChild), so internal nodes are
  // engine nodes like any other and the commit walk needs to know nothing about them.
  buildStructure?(node: ISymbioteNode): ISymbioteNode | undefined;
  // Runs at createElement, before any prop is routed — the node has its component and nothing
  // else. Put the per-node runtime here (timers, flags, a listener installed via
  // setEventListener); read props at event time, not now.
  attach(node: ISymbioteNode): void;
  // Runs after the commit that first gives the node a Fabric tag — the half attach cannot do.
  // Pressable never needs it (its machine only reacts to later events), but TextInput's autoFocus,
  // TouchableOpacity's useNativeDriver and ScrollView's sticky path all need a committed tag now.

  // React commits synchronously so that code would work there by accident; Vue/Solid/Angular
  // commit a tick later, so the same code would silently no-op — dead on device, headless-green.

  // Optional, and the engine owns its lifecycle: registered by attachHostBehavior, dropped by
  // detachSubtree, re-armed by reattachSubtree — removing the footgun of a hand-rolled
  // whenCommitted call whose cancel in detach is easy to forget.
  attachAfterCommit?(node: ISymbioteNode): void;
  // A prior `onWrapChange` hook is gone: ScrollView's Android split (foldScrollViewProps /
  // foldRefreshWrapperProps) now reads the wrapped child through IFirstChild in C++ instead, so
  // nothing needs telling when the wrap shape changes. Re-add only for a genuine wrap event.

  // Runs when the app wires or unwires one of ownedListeners, never on a re-render handing the
  // same name a fresh closure. `wired` is the new state.

  // Not afterCommit: a listener flip alone changes no payload, so that commit is a no-op and
  // afterCommit's drain never runs — this hook exists for behaviors (ScrollView's onLayout) whose
  // payload depends on a listener's mere presence. Runs synchronously, before the first commit.
  onOwnedListenerChange?(
    node: ISymbioteNode,
    name: string,
    wired: boolean,
  ): void;
  // Runs after every commit while the node is attached, not just the first — for a controlled
  // TextInput, where a prop change (app's `value` diverging from native) must trigger a command,
  // and a tag has no render to re-run the way a component would.

  // Not a setProp hook: setProp is the engine's hottest path, so a per-node registry lookup there
  // is too costly. This costs a Set iteration per commit, only over nodes whose behavior asked.

  // Runs even when a behavior's own fold stripped the prop and made the commit byte-identical
  // (TouchableOpacity's disabled, Button's title/color) — see runCommittedHooks for how that drain
  // stays separate from the tag-dependent one gated on reaching Fabric.
  afterCommit?(node: ISymbioteNode): void;
  // Runs once the node is known to have left the tree for good. Must release everything `attach`
  // took — a timer left behind outlives the tree that owned it.
  detach(node: ISymbioteNode): void;
  // This primitive's own prop folds (see IPayloadFold). No production behavior declares one any
  // more — platform rules moved to SymbioteFabricProps.cpp.

  // Kept as the JS arm tag-rule-cost.itest.ts compares against, and the seam a third-party
  // behavior (no C++ access) would extend. Read SymbioteFabricProps.h before reaching for this.
  readonly foldPayload?: IPayloadFold;
  // Resolve source/defaultSource/loadingIndicatorSource on the way in — Image's, and only Image's
  // (see image-source-write.ts). A flag, not a function: routeProp is the hottest path in the
  // engine and can only afford a boolean read on the node, not a call into a behavior.
  readonly resolvesImageSources?: boolean;
  // Flips `id`/`nativeID` precedence to nativeID-over-id — TouchableWithoutFeedback's, and only
  // its. See routeIdAlias in node.ts for why the flip exists.
  readonly nativeIdWinsOverId?: boolean;
}

const behaviors = new Map<string, IHostBehavior>();

// Nodes that `removeChild` unlinked and that may or may not be coming back. See
// `sweepDetachedBehaviors` for why the answer is not known until commit.
const detachCandidates = new Set<ISymbioteNode>();

// A node the sweep has torn down carries node.isTornDown — it can still be re-inserted (see
// reattachHostBehaviors), and the bit tells an insert whether it must walk at all, so the common
// case (building a fresh tree) never walks anything. A field, since both readers are per-node.

// The behavior a node actually got lives on the node, as node.hostBehavior, remembered from its
// one and only registry lookup — a field rather than a WeakMap, since a probe is the dearest way
// to ask a question whose answer is almost always "none".

// The registry is keyed by intrinsic tag, and the node is not: node.component is the resolved
// Fabric view name (`view` arrives as `RCTView`), and keying by that would attach the press
// machine to every plain View. The tag alphabet is used exactly once, at attachHostBehavior.

// The gate: createElement and removeChild are the engine's hottest paths, so neither may pay a
// Set insert for a feature no app uses yet. While this is false both cost one boolean read.
let hasBehaviors = false;
// See `hasAttachedBehaviors`. A behavior TYPE existing and a behavior being ON a node are different
// questions, and the teardown sweep was asking the first one.
let hasAttached = false;

export function registerHostBehavior(
  component: string,
  behavior: IHostBehavior,
): void {
  dlog(`registerHostBehavior: ${component}`);
  behaviors.set(component, behavior);
  hasBehaviors = true;
}

// Read access to the registry, so an audit can derive what a behavior owns rather than restating
// it — a name in ownedListeners is only reachable if routeProp also treats it as a registered
// event, and owned-listeners-are-routable.test.ts checks that gap stays empty.
export function hostBehaviorFor(tag: string): IHostBehavior | undefined {
  return behaviors.get(tag);
}

export function hasHostBehaviors(): boolean {
  return hasBehaviors;
}

// Has a behavior ever attached to a node, as opposed to a behavior type having been registered?
// hasBehaviors answers the second and is on from module load in every app — correct for gating
// createElement's attach probe, wrong (and costly) for gating the teardown sweep.

// Nothing the sweep does can matter before the first attach: every collection it touches is
// written only from inside a behavior branch, and the only other effect (marking isTornDown) has
// nothing to re-arm yet either.

// Monotone, deliberately: turns on and never off, so it needs no accounting on a destructor-less
// WeakMap. Being late is the only way it can be wrong, and it cannot be late.
export function hasAttachedBehaviors(): boolean {
  return hasAttached;
}

// What an owner prop is called on the slot, or undefined when it belongs to the owner after all.
// Called from routeProp only for a node that has a slot, which keeps a WeakMap probe off the hot
// path — every other node is turned away by one field read, the same gate payloadFold uses.
export function slotPropNameFor(
  node: ISymbioteNode,
  key: string,
): string | undefined {
  const behavior = node.hostBehavior;
  if (behavior === undefined) return undefined;
  const named = behavior.slotProps?.[key];
  if (named !== undefined) return named;
  const except = behavior.slotPropsExcept;
  if (except !== undefined && !except.includes(key)) return key;
  return undefined;
}

// Does this owner's slot host the app's children, or is it a built sibling they land beside? See
// `slotTakesNoChildren`. Same `node.childHost` gate as every other probe here: the two callers ask
// only after the field said there is a slot at all.
export function slotTakesChildren(node: ISymbioteNode): boolean {
  return node.hostBehavior?.slotTakesNoChildren !== true;
}

// Nodes a behavior built that are NOT the slot, and whose payloads derive from the owner's props.
// slotDerived marks only node.childHost, which is one hop — not enough for Button's view > text >
// raw text chain, whose deeper nodes would otherwise freeze at their mount values.

// A WeakMap rather than a field: this exists only for the handful of nodes a composed behavior
// built, and a field would cost a shape transition on every node in every app.
const derived = new WeakMap<ISymbioteNode, ISymbioteNode[]>();

// Called from `buildStructure` for each node past the slot. Not idempotent-checked: structure is
// built exactly once (`attachHostBehavior`, never `reattachSubtree`), so a second call would be a
// bug worth seeing rather than one worth absorbing.
export function addDerivedNode(
  owner: ISymbioteNode,
  node: ISymbioteNode,
): void {
  const existing = derived.get(owner);
  if (existing === undefined) derived.set(owner, [node]);
  else existing.push(node);
}

export function derivedNodesOf(
  owner: ISymbioteNode,
): readonly ISymbioteNode[] | undefined {
  return derived.get(owner);
}

// Called from `setEventListener` on a PRESENCE flip of an owned name, and only there — the caller
// has already established that this node owns the name, so the WeakMap probe is one it just paid.
export function notifyOwnedListenerChange(
  node: ISymbioteNode,
  name: string,
  wired: boolean,
): void {
  node.hostBehavior?.onOwnedListenerChange?.(node, name, wired);
}

// Called from the two inserts once the child is in place. See `onChildInserted`.
export function notifyChildInserted(
  node: ISymbioteNode,
  child: ISymbioteNode,
): void {
  node.hostBehavior?.onChildInserted?.(node, child);
}

// What this owner does with a child of that Fabric component, or undefined when it does not claim
// it at all. See `claimedChildren`.
export function claimModeFor(
  node: ISymbioteNode,
  component: string,
): IClaimMode | undefined {
  return node.hostBehavior?.claimedChildren?.[component];
}

// Every owner key feeds the slot — the spelling for a cloneElement primitive, whose slot isn't
// derived from a named set at all (see IHostBehavior.slotDerived). A sentinel in the same array
// rather than a second field, so slotDerivesFrom stays one lookup.
export const SLOT_DERIVED_ALL = '*';

// Does this owner key feed the slot's payload? See `slotDerived`. Same `node.childHost` gate as
// above keeps the WeakMap probe off every node that has no slot.
export function slotDerivesFrom(node: ISymbioteNode, key: string): boolean {
  const names = node.hostBehavior?.slotDerived;
  if (names === undefined) return false;
  return names.includes(SLOT_DERIVED_ALL) || names.includes(key);
}

// The app's listeners for names a behavior owns, per node. Not on the node: this exists only for
// nodes carrying a behavior, and adding a field for it would pay a shape transition on every node
// in every app for a feature almost none of them use.
const stashed = new WeakMap<ISymbioteNode, Map<string, unknown>>();

// Takes the NODE, not a component string: the caller (`setEventListener`) has only the Fabric name
// by then, which is not the registry's alphabet. Reads the same map `attachHostBehavior` wrote.
export function ownsListener(node: ISymbioteNode, name: string): boolean {
  return node.hostBehavior?.ownedListeners?.includes(name) === true;
}

export function stashAppListener(
  node: ISymbioteNode,
  name: string,
  listener: unknown,
): void {
  let bag = stashed.get(node);
  if (bag === undefined) {
    bag = new Map();
    stashed.set(node, bag);
  }
  if (listener === undefined) bag.delete(name);
  else bag.set(name, listener);
}

// What the app wrote for an owned event name — the behavior's OUTPUT target. Undefined when the
// app wired nothing, which is an ordinary case, not an error.
export function appListenerFor(node: ISymbioteNode, name: string): unknown {
  return stashed.get(node)?.get(name);
}

// `tag` is the intrinsic tag the adapter started from, not the resolved Fabric name on the node —
// callers default it to node.component for an adapter not yet taught to pass it, which costs one
// harmless failed lookup since no behavior is registered under a Fabric name.
export function attachHostBehavior(node: ISymbioteNode, tag: string): void {
  const behavior = behaviors.get(tag);
  if (behavior === undefined) return;
  node.hostBehavior = behavior;
  hasAttached = true;
  // The tag itself, over the wire, so the host can resolve its platform props without a trip back
  // into JS. Here rather than in createElement, since here is where a tag is known to name a rule
  // the host actually has — an app's own arbitrary tag would pay an op for nothing.
  recordSetTag(node, tag);
  // BEFORE `attach` and before any prop is routed, which is the whole point: it changes how a
  // WRITE is stored, so a source written to this node must never arrive ahead of it.
  if (behavior.resolvesImageSources === true) node.resolvesImageSources = true;
  if (behavior.nativeIdWinsOverId === true) node.nativeIdWinsOverId = true;
  // A field rather than a lookup at payload-build time: `fabricProps` runs per node per commit and
  // must not pay a Map probe to discover that almost nothing has a fold.
  node.payloadFold = behavior.foldPayload;
  // Shape before runtime: `attach` may want to read `node.childHost`, and nothing in `attach`'s
  // contract depends on the node being childless. Deliberately NOT repeated in `reattachSubtree` —
  // see `buildStructure`.
  if (behavior.buildStructure !== undefined) {
    node.childHost = behavior.buildStructure(node);
  }
  behavior.attach(node);
  if (behavior.attachAfterCommit !== undefined) awaitingCommit.add(node);
  if (behavior.afterCommit !== undefined) {
    committedEachTime.add(node);
    node.hasCommitHook = true;
    // Armed from the start, so the commit that first lands this node gives it a beat — a freshly
    // created node has had no setProp write yet, so nothing else would arm it.
    noteCommitHookNodeChanged(node);
  }
}

// Nodes whose behavior declared `afterCommit`. Separate from `awaitingCommit` because the two have
// opposite lifetimes: one empties as its nodes commit, this one holds until teardown.
const committedEachTime = new Set<ISymbioteNode>();

// Nodes whose behavior declared `attachAfterCommit` and whose first commit has not happened yet.
// A plain Set rather than a call into whenCommitted: commit.ts already imports this module, so
// reaching back for it would close an import cycle (see this file's own registration comment).
const awaitingCommit = new Set<ISymbioteNode>();

// Run the deferred half of every behavior whose node has now been committed, called right after
// completeRoot assigns fresh Fabric tags. `isCommitted` is passed in for the same no-cycle reason.
// A still-uncommitted node stays in the set until its commit lands, or detachSubtree drops it.
export function runDeferredAttaches(
  isCommitted: (node: ISymbioteNode) => boolean,
): void {
  // The gate: an app registering no behavior pays one Set-size read per commit, matching the
  // discipline `hasBehaviors` sets for `createElement`.
  if (awaitingCommit.size === 0) return;
  for (const node of awaitingCommit) {
    if (!isCommitted(node)) continue;
    awaitingCommit.delete(node);
    // Worth recording, not just acting on: runCommittedHooks asks the same isCommitted question
    // right after, and that crosses to the host — a node with both hooks would otherwise pay two
    // crossings for one fact on the commit that landed it.
    everCommitted.add(node);
    node.hostBehavior?.attachAfterCommit?.(node);
  }
}

// The recurring beat, split from runDeferredAttaches: attachAfterCommit needs a fresh Fabric tag
// and must not run on a no-op commit; afterCommit needs only "props were published", which a
// no-op commit (a fold that stripped a prop, making the commit byte-identical) satisfies too.

// Setup still runs before the beat on the first commit — a node carrying both hooks has
// attachAfterCommit seed the mirrors afterCommit compares against, preserved by calling this after
// runDeferredAttaches on the changed path only.

// Nodes with a recurring hook whose props were written since the last beat — narrowing the
// population the beat runs over, since the hook body itself (TextInput reading its native mirror)
// is where the real cost is, not the loop deciding whether to run it.
const commitHookNodesChanged = new Set<ISymbioteNode>();

// Arm a node's recurring hook for the next commit. Called from setProp, gated on node.hasCommitHook
// (a boolean field beside hasAriaAlias on the same hidden class), so a node without a recurring
// hook pays one load and one branch per write and never reaches this.
export function noteCommitHookNodeChanged(node: ISymbioteNode): void {
  commitHookNodesChanged.add(node);
}

export function runCommittedHooks(
  isCommitted: (node: ISymbioteNode) => boolean,
): void {
  if (commitHookNodesChanged.size === 0) return;
  const changed = [...commitHookNodesChanged];
  commitHookNodesChanged.clear();
  for (const node of changed) {
    // Still in the set, i.e. still mounted with its behavior attached: `detachOne` removes a node
    // from `committedEachTime`, and a write that armed it before it was torn down must not reach a
    // hook whose `detach` has already run.
    if (!committedEachTime.has(node)) continue;
    if (!everCommitted.has(node)) {
      // Armed but not yet committed — put it back. A node is armed at createElement, before it is
      // in anyone's tree, so dropping it here would mean the commit that finally lands it never
      // gives it a beat.
      if (!isCommitted(node)) {
        commitHookNodesChanged.add(node);
        continue;
      }
      everCommitted.add(node);
    }
    node.hostBehavior?.afterCommit?.(node);
  }
}

// Nodes of committedEachTime that have reached Fabric at least once. Asked once per node, not
// once per node per commit — isCommitted crosses to the host, and the loop above used to pay that
// crossing for every mounted node with afterCommit, on every commit of any surface.

// Sound because within committedEachTime it is monotone: a node enters when its behavior attaches,
// leaves in detachOne when torn down, and a committed live node keeps its Fabric record — so the
// bit only ever goes true for a node still in the set. A WeakSet, since nothing else reads it.
const everCommitted = new WeakSet<ISymbioteNode>();

// removeChild is NOT the destroy signal — a framework can spell a move as remove-then-reinsert
// (Solid's replaceNode does), so tearing down here would kill the machine of a node that comes
// back alive later in the same batch. Removal only nominates; the commit sweep decides.
export function markDetachCandidate(node: ISymbioteNode): void {
  detachCandidates.add(node);
}

// Commit is where a removal is cheapest to distinguish from a move — reinserted before the commit,
// a node is back in the tree by now. Not a proof of death either: Svelte parks live nodes offscreen
// across commits (a pending `{#if}`/snippet) fully intending to bring them back.

// So a sweep can and does tear down a node that returns, which is why attach is re-runnable
// (reattachHostBehaviors) rather than the sweep trying to be cleverer. The subtree walk lives here
// rather than at removal, so only nodes that actually left are walked.

// onDetached runs for every node of a genuinely-removed subtree, behavior or not — it's how other
// per-node lifetime state (an Animated subscription) gets the same "did it really leave" answer.

// Whether the sweep has anything to do, asked before its arguments are built: the sweep's own
// first line already returns on an empty candidate set, but its caller passes surface.children, a
// getter that crosses to the host and allocates — evaluated before the guard can decline.
export function hasDetachCandidates(): boolean {
  return detachCandidates.size > 0;
}

export function sweepDetachedBehaviors(
  topLevel: readonly ISymbioteNode[],
  onDetached: (node: ISymbioteNode) => void,
): void {
  if (detachCandidates.size === 0) return;
  // Two crossings for the whole sweep, whatever it is sweeping — one for the parents, one for the
  // subtrees. Asked per node instead, a large clear pays one crossing per candidate instead.
  const candidates = [...detachCandidates];
  const parents = parentsOf(candidates);
  // A surface's top-level nodes carry parent === undefined by design, and commitChildren re-lists
  // them without going through appendChild — so the parent check alone would report them as gone.
  const left = candidates.filter(
    (node, at) => parents[at] === undefined && !topLevel.includes(node),
  );
  // Narrowed, and it is the sweep's whole cost: what crosses is a handle per node, and most
  // candidates are plain views the sweep marks and does nothing else with.
  for (const node of teardownSubtreesOf(left)) detachOne(node, onDetached);
  detachCandidates.clear();
}

// Tear a subtree down unconditionally — the surface teardown path, where disposeRoot drops the
// root container and every node under it has left for good. The sweep above can't answer this: it
// only sees nodes removeChild nominated, and an unmount removes nothing.
export function teardownSubtree(
  node: ISymbioteNode,
  onDetached: (node: ISymbioteNode) => void,
): void {
  // Narrowed for the same reason the sweep is, and with more to gain: this path tears down a whole
  // surface, so the subtree is the screen.
  for (const each of teardownSubtreesOf([node])) detachOne(each, onDetached);
}

// isTornDown guards two overlaps: a removed parent and descendant both nominated in one call, and
// a node the sweep released that disposeRoot then walks again on an ordinary unmount. The mark is
// raised right below the guard, so a second arrival takes the same early return.

// The subtree arrives flat, in one host read, instead of a childrenOf recursion — both this walk
// and reattachSubtree mark or unmark a whole subtree at once, so descendants are marked too and
// each takes the same early return below.
function detachOne(
  node: ISymbioteNode,
  onDetached: (node: ISymbioteNode) => void,
): void {
  if (node.isTornDown) return;
  onDetached(node);
  // Marked whether or not this node carries a behavior: the mark tells a later insert to walk, and
  // the node re-inserted is usually a plain container whose descendant holds the machine.
  node.isTornDown = true;
  // The rest of the body is the behavior's, so a node without one leaves here — nine of every ten
  // nodes in a removed subtree are plain views, and the mark above is the whole of what they owe.
  const behavior = node.hostBehavior;
  if (behavior === undefined) return;
  // Drops a deferral the node never got to run. isCommitted already stops it from firing, so this
  // changes no observable behavior — without it, a node torn down within one tick would stay in
  // the Set forever, holding a strong reference to a dead subtree (a leak, not a wrong result).
  awaitingCommit.delete(node);
  // The recurring hook stops with the node — without this a torn-down node would keep being asked
  // to reconcile props against a subtree that has left the tree, on every commit, forever.
  committedEachTime.delete(node);
  behavior.detach(node);
}

// Re-arms a node the sweep tore down but that the framework put back. A WeakSet miss (no walk at
// all) for every node in a freshly built tree, the common path on every create.
export function reattachHostBehaviors(node: ISymbioteNode): void {
  if (!node.isTornDown) return;
  reattachSubtree(node);
}

// Flat, like the detach walk, and with nothing to reconcile — always descends into every child.
function reattachSubtree(root: ISymbioteNode): void {
  // Narrowed like the teardown that marked them: reattachOne acts only on a node the sweep marked.
  for (const node of teardownSubtreesOf([root])) reattachOne(node);
}

function reattachOne(node: ISymbioteNode): void {
  if (node.isTornDown) {
    node.isTornDown = false;
    const behavior = node.hostBehavior;
    behavior?.attach(node);
    // Re-arms the deferred half too, keeping attach and attachAfterCommit a pair — restoring only
    // one would leave a split-setup behavior half-initialised on return.
    if (behavior?.attachAfterCommit !== undefined) awaitingCommit.add(node);
    if (behavior?.afterCommit !== undefined) {
      committedEachTime.add(node);
      node.hasCommitHook = true;
      // A returning node may not have had a prop written since, so arm it once to guarantee the
      // next commit still gives it a beat.
      noteCommitHookNodeChanged(node);
    }
  }
}

// Test-only. A registry is module state, so a suite that registers a behavior leaks it into every
// later test in the same file unless it is cleared.
export function clearHostBehaviors(): void {
  behaviors.clear();
  detachCandidates.clear();
  awaitingCommit.clear();
  committedEachTime.clear();
  hasBehaviors = false;
  hasAttached = false;
}

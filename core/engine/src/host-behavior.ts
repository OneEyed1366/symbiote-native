// Per-TAG behavior on an engine node — the seam that lets a primitive's state machine live BELOW
// the framework instead of inside a framework component.
//
// WHY IT EXISTS. Vue, Svelte, Solid and Angular all optimize element subtrees and stop at a
// component boundary, so a primitive shipped as a component is charged a per-instance price in
// each framework's own currency (an instance, a props Proxy, anchor nodes, an LView). A primitive
// whose state the TEMPLATE never reads does not need to be a component at all — its machine only
// needs a per-node home, and the engine node is one. `.claude/rules/host-primitive-tier.md` has
// the tier model; this module is the tier-2 half of it.
//
// WHY A REGISTRY RATHER THAN A DIRECT IMPORT. `@symbiote-native/components` depends on
// `@symbiote-native/engine`, never the reverse, so the engine cannot import `createPressHandlers`
// and friends. CLAUDE.md's preferred answer to a registration problem — delete the indirection —
// is therefore unavailable here; the inversion is forced, not chosen.
//
// WHICH MEANS THE REGISTRATION ITSELF IS THE HAZARD, and it is the one CLAUDE.md spells out:
// Metro turns on `inlineRequires` for production only, moving a `require` down to the first place
// its binding is used as a VALUE, and a barrel's `export { X } from './x'` compiles to a lazy
// getter. A module whose only job is to call `registerHostBehavior` is never named as a value, so
// re-exporting it from a barrel means it NEVER EVALUATES in a release build — dev is perfect,
// release silently has no behavior. The one shape that works is a bare side-effect import that is
// never re-exported from that barrel, the pattern in
// `packages/slider/src/{react,vue,svelte,angular}/index.ts`:
//
//     import '../register';     // in the adapter entry — NOT `export * from '../register'`
//
// `registerHostBehavior` emits a `dlog` precisely so `DEBUG=1` answers "did my registration run at
// all" before anyone starts debugging the behavior itself.

import { dlog } from './debug';
import type { ISymbioteNode } from './node';

/**
 * A pure props -> props mapping a behavior applies on the way to the Fabric payload.
 *
 * It exists because a lowered element has no component body, and a wrapper's body is where the
 * per-primitive prop FOLDS live — TextInput's W3C aliases (`inputMode` -> `keyboardType`,
 * `readOnly` -> `editable`), Pressable's `disabled` -> `accessibilityState`. Every one of those was
 * silently dropped the moment the primitive lowered: the raw alias reached Fabric as a key no
 * ViewConfig declares, so nothing threw and nothing rendered differently in a headless test —
 * only the device showed a numeric keyboard that never appeared.
 *
 * NOT a hook on `setProp`, for the same reason `afterCommit` is not: `setProp` is the hottest path
 * in the engine. This runs once per node per payload build, and only for a node whose behavior
 * supplied one.
 *
 * MUST be pure and MUST NOT mutate its input — `node.props` is the live bag, and the folds beside
 * this one return their input by identity when there is nothing to do.
 */
export type IPayloadFold = (
  props: Readonly<Record<string, unknown>>,
) => Record<string, unknown>;

export interface IHostBehavior {
  // Listener names this behavior OWNS on its tag — engine event names, not `onX` props
  // ('press', 'startShouldSetResponder', ...). `setEventListener` stashes an app listener for an
  // owned name instead of writing it into `node.listeners`, so the behavior's own dispatcher keeps
  // the slot and the app's callback stays reachable beside it.
  //
  // Without this the two collide and the LAST writer wins, silently: `node.listeners` is a
  // single-slot Map, `press`/`pressIn`/`pressOut` are base ViewConfig events, and
  // `RESPONDER_EVENTS` makes `startShouldSetResponder`/`responderMove` listeners on any node at
  // all — so the app's own `onPress` would evict the machine from the very keys the gesture starts
  // on. The component wrapper used to mediate that pair by destructuring the app's callbacks out
  // before they reached the node; lowering removes the mediator, and this replaces it.
  readonly ownedListeners?: readonly string[];
  // Builds the primitive's OWN internal subtree, once, and returns the node the app's children
  // belong under — or undefined when they belong directly on the host.
  //
  // WHY IT EXISTS. `foldPayload` gave a lowered primitive its wrapper's prop mapping; this gives it
  // the wrapper's COMPOSITION. A ScrollView is a scroll view wrapping a content view, an
  // ImageBackground is a view holding an absolutely-filled image; in a component that second node
  // is built by the wrapper's body, and the wrapper's body is exactly the per-instance cost
  // lowering deletes. Until this seam existed a composed primitive could not be lowered at all,
  // whatever its props did — which is why the tier audit reads "state the template never reads" and
  // still leaves the composed primitives out.
  //
  // RUNS BEFORE `attach`, so a machine can see its own slot. It is the node's shape, not its
  // runtime, and `attach`'s "the node has its component and nothing else" is about PROPS.
  //
  // RUNS EXACTLY ONCE, at `attachHostBehavior` — never from `reattachSubtree`. A parked subtree
  // comes back with its internal children intact (they are ordinary `node.children` and travel
  // with it), so rebuilding would duplicate them, and the slot's IDENTITY would change under app
  // children still pointing at the old one. `attach` is re-runnable because a machine must restart;
  // structure is not, because it never stopped.
  //
  // Builds through the ordinary mutation API — `createElement` + `appendChild` — so the internal
  // nodes are engine nodes like any other and the commit walk needs to know nothing about them.
  buildStructure?(node: ISymbioteNode): ISymbioteNode | undefined;
  // Runs at createElement, before any prop is routed — the node has its component and nothing
  // else. Put the per-node runtime here (timers, flags, a listener installed via
  // setEventListener); read props at event time, not now.
  attach(node: ISymbioteNode): void;
  // Runs after the commit that first gives the node a Fabric tag — the half `attach` CANNOT do.
  //
  // WHY IT IS SEPARATE. `Pressable` never needed it: its machine only reacts to events that arrive
  // long after commit, so a tagless node at `attach` is enough. Every other lowering candidate needs
  // a committed tag AT SETUP TIME — TextInput's `autoFocus` dispatches a view command at mount,
  // TouchableOpacity's `useNativeDriver: true` connects an Animated node to a view, ScrollView's
  // sticky path calls `attachNativeEvent`. React commits synchronously, so those would work there by
  // accident; Vue, Solid and Angular commit a tick later, so the same code silently no-ops —
  // lowered on paper, dead on device, with the headless suite green.
  //
  // Optional, and the ENGINE owns its lifecycle: registered by `attachHostBehavior`, dropped by
  // `detachSubtree`, re-armed by `reattachSubtree`. A behavior can equally call `whenCommitted` by
  // hand from `attach` — `animated/event.ts` does — but it then owes its own cancel in `detach`, and
  // forgetting that leaks a waiter pointed at a dead node. This exists to remove that footgun.
  attachAfterCommit?(node: ISymbioteNode): void;
  // Runs after EVERY commit while the node is attached, not just the first.
  //
  // WHY IT IS NOT `attachAfterCommit` REPEATED. `Pressable`'s machine is driven entirely by events,
  // so it never needs to look at a prop it was not handed. A controlled `TextInput` does: RN's
  // contract is that when the app's `value` diverges from what native last reported, JS commands
  // the text back down — and that comparison is triggered by a PROP CHANGE, not by an event. In a
  // component the render is what re-runs it; a lowered element has no render, so the commit is the
  // only equivalent beat.
  //
  // A prop-write hook on `setProp` was the obvious alternative and is the wrong shape: `setProp` is
  // the hottest path in the engine (32 001 writes on one benchmark create) and would need a per-node
  // registry lookup on every one of them. This costs a Set iteration per commit over ONLY the nodes
  // whose behavior asked for it — zero for every app that registers none.
  //
  // Reads `node.props`, which by here holds the values this commit published.
  afterCommit?(node: ISymbioteNode): void;
  // Runs once the node is known to have left the tree for good. Must release everything `attach`
  // took — a timer left behind outlives the tree that owned it.
  detach(node: ISymbioteNode): void;
  // The wrapper-body prop folds this primitive owes its lowered form. See IPayloadFold.
  readonly foldPayload?: IPayloadFold;
}

const behaviors = new Map<string, IHostBehavior>();

// Nodes that `removeChild` unlinked and that may or may not be coming back. See
// `sweepDetachedBehaviors` for why the answer is not known until commit.
const detachCandidates = new Set<ISymbioteNode>();

// Nodes the sweep has torn down. A torn-down node can still be re-inserted — see
// `reattachHostBehaviors` — and this is what tells an insert whether it must walk at all, so the
// common case (building a fresh tree) never walks anything.
const tornDown = new WeakSet<ISymbioteNode>();

// The behavior a node actually got, remembered from its one and only registry lookup.
//
// THE REGISTRY IS KEYED BY INTRINSIC TAG AND THE NODE IS NOT. `node.component` is the FABRIC view
// name: every adapter resolves the tag through `descriptorFor` before calling `createElement`, so
// `symbiote-view` arrives as `RCTView`. Keying the registry by Fabric name instead is not an
// option — a pressable resolves to `RCTView` like any other view, so the press machine would
// attach to every plain `View` in the app. So the tag alphabet is used EXACTLY ONCE, at
// `attachHostBehavior`, where the caller still holds it; every later lookup reads this map.
//
// Found by a peer session probing the installed shape, not by a unit test: the tests built their
// subject with `createElement(PRESSABLE_TAG)`, which passes the tag AS the Fabric name and makes
// the key match by accident. No adapter constructs a node that way, so the registration could
// never have fired in an app while all six break-tests kept failing correctly on their own axes.
const attached = new WeakMap<ISymbioteNode, IHostBehavior>();

// The gate. `createElement` and `removeChild` are the two hottest paths in the engine (9 002 and
// ~1 000 calls on one benchmark row set), so neither may pay a Set insert for a feature no app
// uses yet. While this is false both paths cost one boolean read, the same discipline as `isDebug`.
let hasBehaviors = false;

export function registerHostBehavior(
  component: string,
  behavior: IHostBehavior,
): void {
  dlog(`registerHostBehavior: ${component}`);
  behaviors.set(component, behavior);
  hasBehaviors = true;
}

// Read access to the registry, so an audit can DERIVE what a behavior owns instead of restating it.
// The one that matters: a name in `ownedListeners` is only reachable if `routeProp` also treats it
// as a registered event — otherwise the app's callback lands in `node.props` and the machine, which
// reads the stash, never sees it. That set difference is a test
// (`core/components/src/behaviors/owned-listeners-are-routable.test.ts`) and it needs this to stay
// derived rather than becoming another hand-written list.
export function hostBehaviorFor(tag: string): IHostBehavior | undefined {
  return behaviors.get(tag);
}

export function hasHostBehaviors(): boolean {
  return hasBehaviors;
}

// The app's listeners for names a behavior owns, per node. Not on the node: this exists only for
// nodes carrying a behavior, and adding a field for it would pay a shape transition on every node
// in every app for a feature almost none of them use.
const stashed = new WeakMap<ISymbioteNode, Map<string, unknown>>();

// Takes the NODE, not a component string: the caller (`setEventListener`) has only the Fabric name
// by then, which is not the registry's alphabet. Reads the same map `attachHostBehavior` wrote.
export function ownsListener(node: ISymbioteNode, name: string): boolean {
  return attached.get(node)?.ownedListeners?.includes(name) === true;
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

// `tag` is the INTRINSIC tag the adapter started from, not the resolved Fabric name it put on the
// node. Defaulted to `node.component` so an adapter that has not been taught to pass it keeps
// working for a behavior registered under a Fabric name — no adapter registers one, so in practice
// the default simply never matches and costs one failed lookup.
export function attachHostBehavior(node: ISymbioteNode, tag: string): void {
  const behavior = behaviors.get(tag);
  if (behavior === undefined) return;
  attached.set(node, behavior);
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
  if (behavior.afterCommit !== undefined) committedEachTime.add(node);
}

// Nodes whose behavior declared `afterCommit`. Separate from `awaitingCommit` because the two have
// opposite lifetimes: one empties as its nodes commit, this one holds until teardown.
const committedEachTime = new Set<ISymbioteNode>();

// Nodes whose behavior declared `attachAfterCommit` and whose first commit has not happened yet.
//
// A plain Set rather than a call into `whenCommitted`: `commit.ts` already imports this module, so
// reaching back for it would close an import cycle. Metro's `inlineRequires` has made module
// evaluation order a real hazard here rather than a theoretical one (see this file's own
// registration comment), so the dependency stays one-directional and commit DRAINS this instead.
const awaitingCommit = new Set<ISymbioteNode>();

/**
 * Run the deferred half of every behavior whose node has now been committed. Called from the commit
 * path immediately after `completeRoot`, where fresh Fabric tags have just been assigned.
 *
 * `isCommitted` is passed in for the same no-cycle reason — `committedOf` lives in `commit.ts`. A
 * still-uncommitted node stays in the set: a create superseded before it ever reached Fabric waits
 * for the commit that lands it, and `detachSubtree` drops it if that commit never comes.
 */
export function runDeferredAttaches(
  isCommitted: (node: ISymbioteNode) => boolean,
): void {
  // The gate: an app registering no behavior pays two Set-size reads per commit, matching the
  // discipline `hasBehaviors` sets for `createElement`.
  if (awaitingCommit.size === 0 && committedEachTime.size === 0) return;
  // SETUP BEFORE THE RECURRING BEAT, and the order is load-bearing on the FIRST commit, where a
  // node carrying both hooks is drained by both. `attachAfterCommit` is where a behavior seeds the
  // mirrors that `afterCommit` then compares against; run them the other way round and the first
  // beat compares against nothing and commands a redundant write down to native.
  for (const node of awaitingCommit) {
    if (!isCommitted(node)) continue;
    awaitingCommit.delete(node);
    attached.get(node)?.attachAfterCommit?.(node);
  }
  for (const node of committedEachTime) {
    if (!isCommitted(node)) continue;
    attached.get(node)?.afterCommit?.(node);
  }
}

// `removeChild` is NOT the destroy signal, and reading it as one is the bug this indirection
// exists to avoid. Engine-side it looks like one — a reorder goes through `detach` inside
// appendChild/insertBefore and never lands in removeChild — but a FRAMEWORK can spell a move as
// remove-then-reinsert. Solid does, in `solid-js/universal`: `replaceNode` (universal.cjs:186) is
// `insertNode` + `removeNode`, and `reconcileArrays` calls it at :157 for a node that IS in the
// new array and is needed at a later index. Its sibling call at :130 is guarded by
// `if (!map || !map.has(a[aStart]))` and removes only genuinely absent nodes — one guarded call
// and one not, which is why a quick read of that file says "removeChild means gone".
//
// Tearing down there would kill the machine of a node that returns alive a few operations later,
// in the same batch: long-press silently stops working after certain list reorders, on device
// only, with nothing red. So removal only nominates.
export function markDetachCandidate(node: ISymbioteNode): void {
  detachCandidates.add(node);
}

// Commit is where a removal is CHEAPEST to distinguish from a move — a node unlinked and
// reinserted before the commit is back in the tree by now, which covers Solid's replaceNode. It is
// NOT a proof of death, and the earlier version of this comment claimed it was. Svelte parks LIVE
// nodes offscreen across commits and sometimes across seconds: `detachFromParent`
// (adapters/svelte/src/dom-shim/shim-node.ts) moves a node into a DocumentFragment that has no
// engine node, calls engineRemoveChild AND requestCommit, and Svelte fully intends to bring it
// back — from a parked `{#if}` branch, from `each.js`'s destroy_effects, and worst, from
// boundary.js's move_effect while a pending snippet shows, which returns when async work resolves.
// So a sweep can and does tear down a node that comes back, which is why `attach` is re-runnable
// (reattachHostBehaviors) rather than why the sweep tries to be cleverer. The machine RESTARTS on
// re-insert instead of surviving an arbitrary absence; a parked subtree is offscreen, so nobody is
// mid-gesture in it, and teardown staying unconditional means there is no leak mode.
//
// The subtree walk lives here rather than at removal, and is cheaper for it: only the nodes that
// actually left are walked.
export function sweepDetachedBehaviors(
  topLevel: readonly ISymbioteNode[],
): void {
  if (detachCandidates.size === 0) return;
  // A surface's top-level nodes carry `parent === undefined` by design (surface.ts), and
  // `commitChildren` re-lists them without going through appendChild — so for those the parent
  // check alone would report a live node as gone.
  const seen = new Set<ISymbioteNode>();
  for (const node of detachCandidates) {
    if (node.parent !== undefined || topLevel.includes(node)) continue;
    detachSubtree(node, seen);
  }
  detachCandidates.clear();
}

// `seen` guards the one overlap the candidate set can contain: a removed parent and a removed
// descendant of it are both nominated, and without it the descendant is detached twice.
function detachSubtree(node: ISymbioteNode, seen: Set<ISymbioteNode>): void {
  if (seen.has(node)) return;
  seen.add(node);
  // Marked whether or not THIS node carries a behavior: the mark is what tells a later insert to
  // walk, and the node re-inserted is usually a plain container whose DESCENDANT holds the
  // machine. Gating the mark on `behaviors.has` made the row wrapper unmarked and the whole walk
  // skip — the first version of the parked-node test caught exactly that.
  tornDown.add(node);
  // Drop a deferral the node never got to run. NO TEST CAN SEE THIS, and it is kept anyway —
  // stated rather than left as apparent coverage. The `isCommitted` predicate in the drain already
  // stops such a node from firing, so removing this line changes no observable behaviour; what it
  // changes is that a node created and torn down inside one tick stays in the Set forever, holding
  // a strong reference to a dead subtree. A leak, not a wrong result, and this file's break-test
  // discipline correctly reports it as unfalsifiable.
  awaitingCommit.delete(node);
  // The recurring hook stops with the node, and unlike the deferral above this one has a visible
  // consequence if forgotten: a torn-down node would keep being asked to reconcile props against a
  // subtree that has left the tree, on every commit, forever.
  // The recurring hook stops with the node, and unlike the deferral above this one has a visible
  // consequence if forgotten: a torn-down node would keep being asked to reconcile props against a
  // subtree that has left the tree, on every commit, forever.
  committedEachTime.delete(node);
  // The map, not the registry: by here only the Fabric name is left on the node.
  attached.get(node)?.detach(node);
  for (const child of node.children) detachSubtree(child, seen);
}

// Re-arms a node the sweep tore down but that the framework put back. Called from appendChild and
// insertBefore, and it is a WeakSet miss — no walk at all — for every node in a freshly built
// tree, which is the path that runs ~9 000 times per benchmark create.
export function reattachHostBehaviors(node: ISymbioteNode): void {
  if (!tornDown.has(node)) return;
  reattachSubtree(node);
}

function reattachSubtree(node: ISymbioteNode): void {
  if (tornDown.has(node)) {
    tornDown.delete(node);
    const behavior = attached.get(node);
    behavior?.attach(node);
    // Re-arm the deferred half too. A parked node usually returns with its tag intact, so this
    // fires on the next drain — but re-arming is what keeps `attach` and `attachAfterCommit` a
    // PAIR. Restore only one and a behavior that splits its setup across the two comes back
    // half-initialised, which is the failure this seam exists to prevent.
    if (behavior?.attachAfterCommit !== undefined) awaitingCommit.add(node);
    if (behavior?.afterCommit !== undefined) committedEachTime.add(node);
  }
  for (const child of node.children) reattachSubtree(child);
}

// Test-only. A registry is module state, so a suite that registers a behavior leaks it into every
// later test in the same file unless it is cleared.
export function clearHostBehaviors(): void {
  behaviors.clear();
  detachCandidates.clear();
  awaitingCommit.clear();
  committedEachTime.clear();
  hasBehaviors = false;
}

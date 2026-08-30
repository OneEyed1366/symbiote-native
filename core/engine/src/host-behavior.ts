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
  // Runs at createElement, before any prop is routed — the node has its component and nothing
  // else. Put the per-node runtime here (timers, flags, a listener installed via
  // setEventListener); read props at event time, not now.
  attach(node: ISymbioteNode): void;
  // Runs once the node is known to have left the tree for good. Must release everything `attach`
  // took — a timer left behind outlives the tree that owned it.
  detach(node: ISymbioteNode): void;
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
  behavior.attach(node);
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
    attached.get(node)?.attach(node);
  }
  for (const child of node.children) reattachSubtree(child);
}

// Test-only. A registry is module state, so a suite that registers a behavior leaks it into every
// later test in the same file unless it is cleared.
export function clearHostBehaviors(): void {
  behaviors.clear();
  detachCandidates.clear();
  hasBehaviors = false;
}

// Host access — the READ half of a DOM, which Fabric does not ship.
//
// Mostly navigation, plus the two value reads a seam needs (`textOf`, `propOf`). Named for the
// whole rather than for navigation alone: this is the surface an adapter is allowed to ask a node
// about, and keeping value reads out of it would only push them back to raw field access, which is
// the thing being removed.
//
// Four of five framework renderer seams navigate the host on their hot paths, and it is their
// contract, not our choice: Solid's nodeOps declare getParentNode / getFirstChild / getNextSibling,
// Vue's RendererOptions declare parentNode / nextSibling, Angular's Renderer2 declares the same
// pair, and Svelte's compiled output reaches firstChild / nextSibling as real prototype getters.
// React is the only one that needs none, because it navigates its own fibers.
//
// In a browser the DOM answers these. Fabric cannot: `nativeFabricUIManager` exposes no structural
// read at all, and RN's `NativeDOM` (which does expose getChildNodes / getParentNode) answers
// against the CURRENT REVISION — so a node that is created, moved or removed but not yet committed
// answers empty or null. A reconciler navigates the tree it is mid-way through BUILDING, which is
// exactly the state no committed revision holds. See the `symbiote-fabric-cxx-surface` skill, §1a
// and §7b.
//
// So these accessors exist to give adapters the navigation their seams require WITHOUT handing them
// the node's fields. There are no fields left to hand them: since 2026-09-08 every one of these is a
// read into the TREE HOST (`tree-host.ts`) — native on device, the TypeScript applier headlessly —
// because JS holds no tree at all. The historical note: every seam used to read `node.parent` /
// `node.children` directly (8 reads in Solid's renderer, 12 in Vue's, 13 in Angular's), which
// couples each adapter to a shape that no longer exists on this side of the wire.
//
// Each read FLUSHES the mutation buffer first. A reconciler navigates the tree it is mid-way through
// BUILDING, so the host has to be told about the ops recorded since the last commit before it can
// answer. That is what `flushOps` is for, and it is why these are not simply the host's own methods.
//
// A survey of the three adapters that navigate (Vue, Angular, Solid) confirmed none can answer from
// state it already holds — Vue's `RendererOptions` callbacks cannot see the vnode tree, Solid's
// `universal.js` deliberately re-derives from the host rather than trust its own record, and Angular
// calls `parentNode` exactly where its TNode/LView does not know. Pushing this into the adapters
// would build three JS trees instead of the one being removed.

import { flushOps, settleBeforeFlush, treeHost } from './tree-host';
import { hasPendingPlacement } from './mutation-buffer';
import { hasAnimatedBindings } from './animated/host-binding';
import {
  functionPropOf,
  functionPropsOf,
  isSymbioteNode,
  RAW_TEXT_COMPONENT,
  SURFACE_COMPONENT,
  type ISymbioteNode,
} from './node';
import type { SymbioteSurface } from './surface';

// One frozen empty list rather than a fresh `[]`, because the fast path in `childrenOf` is the
// common answer during a build: solid asks 2 000 times on a 1 000-row create and every answer is
// this.
const NO_CHILDREN: readonly ISymbioteNode[] = [];

/**
 * The node's parent, or `undefined` for a node that sits directly under a surface.
 *
 * A top-level node answers `undefined` even though a surface IS a node in the host's tree, and the
 * three adapters depend on that exact miss: Angular reads `null` as "defer, `<ng-content>` will place
 * this", while Vue and Solid spell `?? surface` at their call sites and compare the result against
 * the `SymbioteSurface` object, which the surface's anchor node is not. `SURFACE_COMPONENT` is the
 * sentinel that stops the answer there.
 *
 * So `undefined` is not the same question as "is this node attached".
 *
 * IT DOES NOT ALWAYS DRAIN, unlike its neighbours. A node's parent link changes only through an op
 * that names it as the CHILD, so a node the pending batch has not placed already has its final
 * answer standing in the host — see `hasPendingPlacement`. Angular's 1 000-row create asks this
 * 1 000 times (its `addLViewToLContainer` calls `renderer.parentNode` once per embedded view) and
 * exactly ONE of those reads was about a node the batch had touched.
 */
export function parentOf(node: ISymbioteNode): ISymbioteNode | undefined {
  // Asked FIRST and outside the gate: an adapter holding a coalesced write has ops that are not in
  // the buffer yet, so the gate cannot judge this node until they are. A listener that re-places
  // this very node lands it in `hasPendingPlacement` below, which is then read after the fact.
  settleBeforeFlush();
  if (hasPendingPlacement(node)) flushOps();
  const parent = treeHost()?.parentOf(node);
  // A runtime guard, not a cast: the host stores handles as bare objects, and the brand is what says
  // one of them is ours. It also refuses anything a foreign host might hand back.
  if (!isSymbioteNode(parent)) return undefined;
  return parent.component === SURFACE_COMPONENT ? undefined : parent;
}

/**
 * The node's children, INCLUDING anchors.
 *
 * Anchors are structural bookkeeping — the commit skips them — but they are not invisible to
 * traversal, and hiding them here would desync a framework runtime from the tree it built:
 * solid-js/universal keeps its own record of what it inserted and re-derives positions through these
 * lookups, so a node it placed must be a node it can find.
 */
export function childrenOf(node: ISymbioteNode): readonly ISymbioteNode[] {
  // A READ IS A BATCH BOUNDARY, which is what makes this guard worth a field. `flushOps` below
  // drains the buffer into the host, so a question whose answer is EMPTY still cuts the op stream
  // in two and costs a crossing. Measured on solid's 1 000-row create: 2 000 child-list reads, every
  // one returning zero handles, and 2 002 drains of a buffer that should have crossed twice.
  //
  // `mayHaveChildren` is raised by the two structural recorders in `node.ts` and never lowered, so
  // FALSE is a certainty and TRUE only means "ask". See its declaration for why it is not a tree.
  if (!node.mayHaveChildren) return NO_CHILDREN;
  flushOps();
  return treeHost()?.childrenOf(node).filter(isSymbioteNode) ?? [];
}

/**
 * Every node's parent, positionally, in ONE crossing — `parentOf` for a list.
 *
 * Engine-internal, like `subtreesOf` below, and for the same reason: what a framework seam needs is
 * the singular form, one step at a time. These two answer the question only TEARDOWN asks, and
 * teardown is the one lifecycle event whose size is the tree's (see `ITreeHost`).
 *
 * A `SURFACE_COMPONENT` parent reads as `undefined` here exactly as it does in `parentOf`, so the
 * two agree element for element.
 */
export function parentsOf(
  nodes: readonly ISymbioteNode[],
): readonly (ISymbioteNode | undefined)[] {
  flushOps();
  const parents = treeHost()?.parentsOf(nodes);
  if (parents === undefined) return nodes.map(() => undefined);
  return parents.map(parent => {
    if (!isSymbioteNode(parent)) return undefined;
    return parent.component === SURFACE_COMPONENT ? undefined : parent;
  });
}

/** Each root and every descendant, pre-order, anchors included — all of it in ONE crossing. */
export function subtreesOf(
  roots: readonly ISymbioteNode[],
): readonly ISymbioteNode[] {
  flushOps();
  // The `.filter` is the type NARROWING, not a defensive check, and it costs ~0.6 ms of the 5.5 ms
  // a thousand-row clear spends in the engine — measured on `build-release` by returning the host's
  // array unnarrowed (`teardown-sweep-cost.itest.ts`, rest of the sweep 2.75 -> 2.16 ms). It stays,
  // because removing it means either an `as` or declaring `ITreeHost.subtreesOf` to hand back our
  // own type, and a pluggable host is exactly what that `object` boundary is for.
  return treeHost()?.subtreesOf(roots).filter(isSymbioteNode) ?? [];
}

/**
 * The same walk narrowed to what a teardown must visit — see `ITreeHost.teardownSubtreesOf`.
 *
 * The gate is the ANIMATED one, not a behavior one: a binding is per node and carries no tag, so an
 * app that animates needs every node back and gets the full walk. Nothing else narrows, because
 * nothing else is charged per node of a removed subtree.
 */
export function teardownSubtreesOf(
  roots: readonly ISymbioteNode[],
): readonly ISymbioteNode[] {
  if (hasAnimatedBindings()) return subtreesOf(roots);
  flushOps();
  return treeHost()?.teardownSubtreesOf(roots).filter(isSymbioteNode) ?? [];
}

/**
 * The node and every ancestor above it, deepest first, in ONE crossing.
 *
 * `parentOf` per level is a crossing per level, and the event path needs this chain for every
 * event — capture reads it reversed, bubble forward — plus again on every frame of a drag, for the
 * responder's scope. Measured at 18 crossings per event on a depth-8 chain before the two phases
 * shared a walk, 9 after, and 1 through here.
 *
 * Surfaces are dropped the same way `parentOf` drops them, by component, so a caller sees the same
 * chain it would have built by walking.
 */
export function ancestorsOf(node: ISymbioteNode): readonly ISymbioteNode[] {
  flushOps();
  const chain = treeHost()?.ancestorsOf(node) ?? [];
  const out: ISymbioteNode[] = [];
  for (const each of chain) {
    // The same runtime guard `parentOf` applies, for the same two reasons: the host stores handles
    // as bare objects, and a surface ends the chain rather than appearing in it.
    if (!isSymbioteNode(each) || each.component === SURFACE_COMPONENT) break;
    out.push(each);
  }
  return out;
}

/**
 * The first child, anchors included, or `undefined` for a leaf.
 *
 * ONE HOST CALL, not `childrenOf(node)[0]`, and the difference is a complexity class rather than a
 * constant. `solid-js/universal`'s `cleanChildren` empties a parent with
 * `while (removed = getFirstChild(parent)) removeNode(parent, removed)` — so the old spelling read a
 * list of N, then N-1, then N-2, building and discarding every handle each time. Measured on a
 * 2 000-row Solid `Clear` (`solid-clear-scaling.itest.tsx`): **2 001 001 handles** crossed to remove
 * two thousand children, N(N+1)/2 to the unit, against the ~2 000 the work needs.
 *
 * The `mayHaveChildren` fast path is kept for the same reason `childrenOf` has it: FALSE is a
 * certainty, so a leaf answers without a drain and without a crossing.
 */
export function firstChildOf(node: ISymbioteNode): ISymbioteNode | undefined {
  if (!node.mayHaveChildren) return undefined;
  flushOps();
  const child = treeHost()?.firstChildOf(node);
  return isSymbioteNode(child) ? child : undefined;
}

/**
 * The next sibling, or `undefined` at the end of the list.
 *
 * `_surface` is no longer read (see the inline comment below) and answers a top-level node
 * unconditionally through the host — it stays in the signature only because three adapters
 * still pass it, so a caller with one active surface can keep passing it unconditionally.
 */
export function nextSiblingOf(
  node: ISymbioteNode,
  _surface?: SymbioteSurface,
): ISymbioteNode | undefined {
  // ONE host call, not `parentOf` plus a whole child list.
  //
  // The previous spelling built every sibling to read one of them, and a keyed patch calls this
  // once per row: measured on vue, appending 1 000 rows to 1 000 standing crossed 1 002 001 handles
  // and removing them 2 002 002 — quadratic in the list, with every handle a host object built,
  // filtered and discarded. The host holds the list and can scan it in place.
  //
  // `surface` is no longer read and stays in the signature because three adapters pass it: a
  // top-level node's parent IS the surface node in the host's tree, so the host answers that case
  // without being told which surface. The old code needed it only because `parentOf` masks a
  // surface parent to `undefined` and there was then nothing left to ask.
  flushOps();
  const sibling = treeHost()?.nextSiblingOf(node);
  return isSymbioteNode(sibling) ? sibling : undefined;
}

/**
 * Whether the node is a TEXT CONTAINER (`<Text>`), not whether it holds a string.
 *
 * The distinction is load-bearing for adapters that ask "can I write a string into this": a raw
 * text node answers FALSE here, and an anchor does too. Use `isRawTextNode` for that question.
 */
export function isTextContainer(node: ISymbioteNode): boolean {
  return node.isText;
}

/**
 * Whether the node is a RAW TEXT node — one a string can be written into.
 *
 * This is the question `solid-js/universal`'s `insertExpression` actually asks before calling
 * replaceText, and answering it with `isTextContainer` would be wrong in both directions: a
 * `<Text>` is a container that holds no string of its own, and the empty-string ANCHOR that
 * cleanChildren leaves to hold a position is not writable either. An anchor is excluded here by
 * construction, since its component is the `#anchor` sentinel.
 */
export function isRawTextNode(node: ISymbioteNode): boolean {
  return node.component === RAW_TEXT_COMPONENT;
}

/**
 * The Fabric view name this node currently resolves to (`RCTView`, `RCTText`, `RCTRawText`, the
 * `#anchor` sentinel …). Exposed because two seams branch on it — Solid to answer `isTextNode`,
 * Angular to recognise its own anchor hosts — and both read `node.component` directly today.
 *
 * NOT stable across a node's life: a primitive whose native view depends on a prop (`TextInput`'s
 * `multiline`) changes view without changing identity. Read it, never cache it.
 */
export function componentOf(node: ISymbioteNode): string {
  return node.component;
}

/**
 * The string a raw-text node currently holds, or `undefined` for any other node.
 *
 * Exists for the DIAGNOSTIC path rather than the render path: a seam that rejects a bare string
 * outside a `<Text>` wants to name the offending text in its error, and reading `node.props.text`
 * to do so is the last thing keeping that seam coupled to the node's shape. Vue's
 * `setElementText` reads the same value for a real reason, so this is not a one-caller accessor.
 */
export function textOf(node: ISymbioteNode): string | undefined {
  if (node.component !== RAW_TEXT_COMPONENT) return undefined;
  flushOps();
  const text = treeHost()?.propOf(node, 'text');
  return typeof text === 'string' ? text : undefined;
}

/**
 * The value currently standing on a prop, `undefined` if none is set.
 *
 * The one accessor here that reads a VALUE rather than the tree, and it earns its place from a
 * real caller: Vue's `v-model` shim has to compose with whatever `onValueChange` the author
 * already bound, so it must read the standing handler before writing its own. Without this the
 * shim reaches for `el.props`, which is the last field read keeping a non-seam file coupled to the
 * node's shape.
 *
 * Deliberately NOT a general property bag escape hatch: it answers what is on the node, which for
 * `style` after a class merge is the `[classStyle, explicitStyle]` ARRAY rather than the author's
 * object. `getExplicitStyle` exists for that question and this is not a substitute for it.
 */
const NO_PROPS: Readonly<Record<string, unknown>> = {};

/**
 * Every prop standing on the node, function props included.
 *
 * The bag a payload fold reads. Two sources, because a function never crossed the wire (`writeProp`,
 * node.ts): the host holds the values it could take, JS holds the callbacks it could not, and a fold
 * asking for `onPress` must see the one the app wrote rather than the `undefined` the host was
 * handed in its place.
 *
 * A COPY when anything was stashed, the host's own object when nothing was — which is nearly every
 * node. Same caveat as `propOf`: `style` after a class merge is the `[classStyle, explicitStyle]`
 * array, not the author's object.
 */
export function propsOf(
  node: ISymbioteNode,
): Readonly<Record<string, unknown>> {
  flushOps();
  const stored = treeHost()?.propsOf(node) ?? NO_PROPS;
  const stashed = functionPropsOf(node);
  if (stashed === undefined) return stored;
  const merged: Record<string, unknown> = { ...stored };
  for (const [key, value] of stashed) merged[key] = value;
  return merged;
}

/**
 * A TEST read: the PAYLOAD the last commit handed Fabric for this node, `undefined` before one.
 *
 * `propsOf` above is the props AS THE OPS NAMED THEM — what the adapter said. This is what the
 * payload builder MADE of them, after the aria fold, the behavior's own fold, the component-keyed
 * folds and the style hoist. The two answer different questions and a test has to pick: "did the
 * adapter write `inputMode`" is `propsOf`, and "did that reach native as `keyboardType`" is this.
 *
 * Only the native host can answer it — see `ITreeHost.committedPayloadOf`. Under the recording host
 * it throws, on purpose, naming the itest suite as where the question belongs.
 */
export function committedPayloadOf(
  node: ISymbioteNode,
): Readonly<Record<string, unknown>> | undefined {
  flushOps();
  return treeHost()?.committedPayloadOf(node);
}

export function propOf(node: ISymbioteNode, key: string): unknown {
  // Before the host, because a function prop never reached it — see `writeProp`. Cheap enough to be
  // unconditional: this runs at gesture and lifecycle rate, never on a commit path.
  const stashed = functionPropOf(node, key);
  if (stashed !== undefined) return stashed;
  flushOps();
  return treeHost()?.propOf(node, key);
}

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

import { flushOps, treeHost } from './tree-host';
import {
  functionPropOf,
  isSymbioteNode,
  RAW_TEXT_COMPONENT,
  SURFACE_COMPONENT,
  type ISymbioteNode,
} from './node';
import type { SymbioteSurface } from './surface';

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
 */
export function parentOf(node: ISymbioteNode): ISymbioteNode | undefined {
  flushOps();
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
  flushOps();
  return treeHost()?.childrenOf(node).filter(isSymbioteNode) ?? [];
}

/** The first child, anchors included, or `undefined` for a leaf. */
export function firstChildOf(node: ISymbioteNode): ISymbioteNode | undefined {
  return childrenOf(node)[0];
}

/**
 * The next sibling, or `undefined` at the end of the list.
 *
 * `surface` is required to answer for a TOP-LEVEL node, which has no parent to read the sibling
 * list from — the surface owns that list instead. Passing it for a parented node is harmless and
 * ignored, so a caller with one active surface can pass it unconditionally.
 */
export function nextSiblingOf(
  node: ISymbioteNode,
  surface?: SymbioteSurface,
): ISymbioteNode | undefined {
  // One lookup held in a const rather than two calls plus a cast: `parentOf` is a host read now, so
  // asking twice is two crossings, and the binding narrows without an `as`.
  const parent = parentOf(node);
  const siblings =
    parent !== undefined ? childrenOf(parent) : surface?.children;
  if (siblings === undefined) return undefined;
  const index = siblings.indexOf(node);
  return index < 0 ? undefined : siblings[index + 1];
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
export function propOf(node: ISymbioteNode, key: string): unknown {
  // Before the host, because a function prop never reached it — see `writeProp`. Cheap enough to be
  // unconditional: this runs at gesture and lifecycle rate, never on a commit path.
  const stashed = functionPropOf(node, key);
  if (stashed !== undefined) return stashed;
  flushOps();
  return treeHost()?.propOf(node, key);
}

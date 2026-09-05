// Host navigation — the half of a DOM that Fabric does not ship.
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
// the node's fields. Today every seam reads `node.parent` / `node.children` directly (8 reads in
// Solid's renderer, 12 in Vue's, 13 in Angular's), which couples each adapter to the retained
// tree's shape and blocks any change to it. Routing them here is what makes the representation
// ours to change — the whole point of the contract in that skill's §9.

import { RAW_TEXT_COMPONENT, type ISymbioteNode } from './node';
import type { SymbioteSurface } from './surface';

/**
 * The node's parent, or `undefined` for a node that sits directly under a surface.
 *
 * A top-level node deliberately carries `parent === undefined` (surface.ts sets it), so this
 * answering `undefined` is not the same question as "is this node attached".
 */
export function parentOf(node: ISymbioteNode): ISymbioteNode | undefined {
  return node.parent;
}

/**
 * The node's children, INCLUDING anchors.
 *
 * Anchors are retained-tree bookkeeping — the commit walk skips them — but they are not invisible
 * to traversal, and hiding them here would desync a framework runtime from the tree it built:
 * solid-js/universal keeps its own record of what it inserted and re-derives positions through
 * these lookups, so a node it placed must be a node it can find.
 */
export function childrenOf(node: ISymbioteNode): readonly ISymbioteNode[] {
  return node.children;
}

/** The first child, anchors included, or `undefined` for a leaf. */
export function firstChildOf(node: ISymbioteNode): ISymbioteNode | undefined {
  return node.children[0];
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
  const siblings =
    node.parent !== undefined ? node.parent.children : surface?.children;
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
  const text = node.props.text;
  return typeof text === 'string' ? text : undefined;
}

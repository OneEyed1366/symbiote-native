// Host access — the read half of a DOM, which Fabric does not ship. Mostly navigation, plus the
// two value reads a seam needs (textOf, propOf) — named for the whole because this is the surface
// an adapter may ask a node about, and keeping value reads out would push them back to raw fields.

// Four of five framework renderer seams navigate the host on their hot paths, and it's their
// contract, not our choice: Solid, Vue and Angular all declare parent/sibling navigation
// callbacks. Only React needs none — it navigates its own fibers.

// In a browser the DOM answers these; Fabric cannot. nativeFabricUIManager exposes no structural
// read, and RN's NativeDOM answers against the current revision — a node created, moved or removed
// but not yet committed answers empty or null, exactly the state a mid-build reconciler is in.

// So these accessors give adapters the navigation their seams require without handing them the
// node's fields: every one reads into the tree host (tree-host.ts) — native on device, a
// TypeScript applier headlessly — because JS holds no tree at all.

// Each read flushes the mutation buffer first: a reconciler navigates the tree it is mid-way
// through building, so the host must be told about ops recorded since the last commit before it
// can answer — that's what flushOps is for.

// None of the three navigating adapters (Vue, Angular, Solid) can answer from state they already
// hold on their own side — pushing this into the adapters would build three JS trees instead of
// the one being removed.

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

// The node's parent, or undefined for a node that sits directly under a surface. A top-level node
// answers undefined even though a surface IS a node in the host's tree — three adapters depend on
// that exact miss, comparing the result against the SymbioteSurface object it is not.

// Does not always drain, unlike its neighbours: a node's parent link changes only through an op
// that names it as the child, so a node the pending batch hasn't placed already has its final
// answer standing in the host (see hasPendingPlacement).
export function parentOf(node: ISymbioteNode): ISymbioteNode | undefined {
  // Asked first and outside the gate: an adapter holding a coalesced write has ops not in the
  // buffer yet, so the gate can't judge this node until they are. A listener re-placing this very
  // node lands it in hasPendingPlacement below, read after the fact.
  settleBeforeFlush();
  if (hasPendingPlacement(node)) flushOps();
  const parent = treeHost()?.parentOf(node);
  // A runtime guard, not a cast: the host stores handles as bare objects, and the brand is what
  // says one of them is ours. It also refuses anything a foreign host might hand back.
  if (!isSymbioteNode(parent)) return undefined;
  return parent.component === SURFACE_COMPONENT ? undefined : parent;
}

// The node's children, including anchors. Anchors are structural bookkeeping (the commit skips
// them) but not invisible to traversal — solid-js/universal re-derives positions through these
// lookups, so a node it placed must be a node it can find.
export function childrenOf(node: ISymbioteNode): readonly ISymbioteNode[] {
  // A read is a batch boundary, which is what makes this guard worth a field: flushOps below
  // drains the buffer into the host, so a question whose answer is empty still cuts the op stream
  // in two and costs a crossing.

  // mayHaveChildren is raised by the two structural recorders in node.ts and never lowered, so
  // false is a certainty and true only means "ask". See its declaration for why it's not a tree.
  if (!node.mayHaveChildren) return NO_CHILDREN;
  flushOps();
  return treeHost()?.childrenOf(node).filter(isSymbioteNode) ?? [];
}

// Every node's parent, positionally, in one crossing — parentOf for a list. Engine-internal, like
// subtreesOf below: a framework seam only ever needs the singular form, one step at a time. These
// two answer the question only teardown asks, whose size is the tree's (see ITreeHost).

// A SURFACE_COMPONENT parent reads as undefined here exactly as it does in parentOf, so the two
// agree element for element.
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
  // The .filter is type narrowing, not a defensive check, and it stays: removing it means either
  // an `as` or declaring ITreeHost.subtreesOf to hand back our own type, and a pluggable host is
  // exactly what that object boundary is for.
  return treeHost()?.subtreesOf(roots).filter(isSymbioteNode) ?? [];
}

// The same walk narrowed to what a teardown must visit — see ITreeHost.teardownSubtreesOf. The
// gate is the animated one, not a behavior one: a binding is per node and carries no tag, so an
// app that animates needs every node back and gets the full walk.
export function teardownSubtreesOf(
  roots: readonly ISymbioteNode[],
): readonly ISymbioteNode[] {
  if (hasAnimatedBindings()) return subtreesOf(roots);
  flushOps();
  return treeHost()?.teardownSubtreesOf(roots).filter(isSymbioteNode) ?? [];
}

// The node and every ancestor above it, deepest first, in one crossing. parentOf per level is a
// crossing per level, and the event path needs this chain for every event (capture reversed,
// bubble forward), plus again on every drag frame for the responder's scope.

// Surfaces are dropped the same way parentOf drops them, by component, so a caller sees the same
// chain it would have built by walking.
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

// The first child, anchors included, or undefined for a leaf. One host call, not
// childrenOf(node)[0] — that spelling is quadratic: solid-js/universal's cleanChildren empties a
// parent in a loop, so reading the list to take its head crosses a handle per remaining child.

// The mayHaveChildren fast path is kept for the same reason childrenOf has it: false is a
// certainty, so a leaf answers without a drain and without a crossing.
export function firstChildOf(node: ISymbioteNode): ISymbioteNode | undefined {
  if (!node.mayHaveChildren) return undefined;
  flushOps();
  const child = treeHost()?.firstChildOf(node);
  return isSymbioteNode(child) ? child : undefined;
}

// The next sibling, or undefined at the end of the list. `_surface` stays in the signature only
// because three adapters still pass it, though it's no longer read (see below).
export function nextSiblingOf(
  node: ISymbioteNode,
  _surface?: SymbioteSurface,
): ISymbioteNode | undefined {
  // One host call, not parentOf plus a whole child list — the old spelling built every sibling to
  // read one of them, quadratic on a keyed patch calling this once per row. The host holds the
  // list and can scan it in place.

  // `surface` is unread because a top-level node's parent IS the surface node in the host's tree,
  // so the host answers without being told which surface — needed only because parentOf masks a
  // surface parent to undefined, leaving nothing else to ask.
  flushOps();
  const sibling = treeHost()?.nextSiblingOf(node);
  return isSymbioteNode(sibling) ? sibling : undefined;
}

// Whether the node is a text container (<Text>), not whether it holds a string. Load-bearing for
// "can I write a string into this": a raw text node answers false here, and so does an anchor —
// use isRawTextNode for that question.
export function isTextContainer(node: ISymbioteNode): boolean {
  return node.isText;
}

// Whether the node is a raw text node — one a string can be written into. The question
// solid-js/universal's insertExpression actually asks before replaceText: isTextContainer would
// answer wrong both ways, since a <Text> holds no string of its own and an anchor isn't writable.
export function isRawTextNode(node: ISymbioteNode): boolean {
  return node.component === RAW_TEXT_COMPONENT;
}

// The Fabric view name this node currently resolves to (RCTView, RCTText, RCTRawText, the #anchor
// sentinel...). Exposed because Solid and Angular both branch on it directly.

// Not stable across a node's life — a primitive whose native view depends on a prop changes view
// without changing identity, so read it, never cache it.
export function componentOf(node: ISymbioteNode): string {
  return node.component;
}

// The string a raw-text node currently holds, or undefined for any other node. Exists for the
// diagnostic path rather than the render path: a seam rejecting a bare string outside a <Text>
// wants to name the offending text without coupling to node.props.text's shape.
export function textOf(node: ISymbioteNode): string | undefined {
  if (node.component !== RAW_TEXT_COMPONENT) return undefined;
  flushOps();
  const text = treeHost()?.propOf(node, 'text');
  return typeof text === 'string' ? text : undefined;
}

// The value currently standing on a prop, undefined if none is set. The one accessor here that
// reads a value rather than the tree: Vue's v-model shim must read the standing onValueChange
// handler before composing its own, without coupling to el.props's shape.

// Deliberately not a general property bag escape hatch: it answers what is on the node, which for
// style after a class merge is the [classStyle, explicitStyle] array, not the author's object —
// getExplicitStyle exists for that question and this is not a substitute for it.
const NO_PROPS: Readonly<Record<string, unknown>> = {};

// Every prop standing on the node, function props included — the bag a payload fold reads. Two
// sources, since a function never crossed the wire: the host holds values, JS holds the callbacks
// it couldn't, and a fold asking for onPress must see what the app wrote, not host-side undefined.

// A copy when anything was stashed, the host's own object when nothing was (nearly every node).
// Same caveat as propOf: style after a class merge is the array, not the author's object.
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

// A test read: the payload the last commit handed Fabric for this node, undefined before one.
// propsOf above is the props as the ops named them — what the adapter said. This is what the
// payload builder made of them, after every fold and the style hoist.

// Only the native host can answer it — see ITreeHost.committedPayloadOf. Under the recording host
// it throws, on purpose, naming the itest suite as where the question belongs.
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

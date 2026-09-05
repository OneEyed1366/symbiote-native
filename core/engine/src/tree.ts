// The ONE place that answers or changes the DESIRED structure — "what the adapter has built so
// far", as opposed to the COMMITTED structure Fabric holds.
//
// ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────────────────────────
//
// The engine holds the tree shape TWICE, and both copies are on the way out
// (`symbiote-fabric-cxx-surface` §9):
//
//   DESIRED     node.children / node.parent        this module        -> replaced by the edit buffer
//   COMMITTED   record.children / record.parent    the IMirror        -> replaced by NativeDOM's
//                                                                        getChildNodes / getParentNode
//
// They are replaced by DIFFERENT things, and that is forced rather than chosen. `NativeDOM` reads
// the CURRENT REVISION only (its own spec: a node not present in an active shadow tree answers
// empty), so C++ can answer the committed shape and can NEVER answer the pending one — a reconciler
// navigates the tree it is midway through building. The pending delta therefore has to live in the
// buffer, and the committed base in C++. Neither alone is sufficient; together they are complete:
//
//   parentOf(node)    = the buffer's pending parent for it, else getParentNode(node)
//   childrenOf(node)  = getChildNodes(node) with this tick's ops for that parent replayed
//
// ── WHAT THIS CUT DOES, AND WHAT IT DOES NOT ─────────────────────────────────────────────────────
//
// This is the SEAM, not the replacement. Every read and write of the desired structure now goes
// through here, and the backing is still the two fields. Nothing observable changes.
//
// It is worth its own commit because the swap is otherwise a 57-site edit with no guard: measured
// 2026-09-05 by a type-aware census (grep cannot do it — `.parent` is also an animated-graph field
// and an event field, and most textual hits are comments). With the seam, the swap is one file, and
// `tests/engine-structure-seam.test.ts` fails the moment anything else reaches for a field again.
//
// ── THE RESIDUE THIS CUT MAKES VISIBLE: ANCHORS ──────────────────────────────────────────────────
//
// An anchor has no Fabric node — it is flattened away at commit and never committed — so
// `getChildNodes` will never return one and `getParentNode` on one answers null. It is purely ours.
// So the committed backing cannot hold anchors at all, and they are the one part of the desired
// structure with nowhere to go: not to C++, and not to a per-tick buffer either, because an adapter
// holds an anchor across commits and appends to it later.
//
// That is the open question this seam is meant to surface early rather than discover mid-swap. The
// shape that resolves it is to stop treating an anchor as a NODE and start treating it as a
// POSITION — a marker the engine resolves to (renderable parent, index) at mutation time — but that
// is a design change to `createAnchor`'s contract, not a backing swap, and it is not attempted here.

import type { ISymbioteNode } from './node';

// ── READS ────────────────────────────────────────────────────────────────────────────────────────

/**
 * This node's desired children, in order.
 *
 * Returned BY REFERENCE, deliberately and with a cost attached: several callers rely on the array
 * identity (`reconcile` stores it in the committed record and `recordStructureEdit` compares
 * identity to decide whether it owes a copy-on-write). A defensive copy here would be one array per
 * node per commit — the exact allocation copy-on-write was introduced to remove. The contract is
 * therefore that a caller MUST NOT mutate what it gets back; the write helpers below are the only
 * supported way to change a child list.
 */
export function childrenOf(node: ISymbioteNode): readonly ISymbioteNode[] {
  return node.children;
}

/** This node's desired parent, or undefined for a top-level node and for a detached one. */
export function parentOf(node: ISymbioteNode): ISymbioteNode | undefined {
  return node.parent;
}

// ── WRITES ───────────────────────────────────────────────────────────────────────────────────────
//
// Four primitives, matching what the mutation API in node.ts actually needs. They do NOT mark: the
// pending-edit record is the caller's business, and the ordering rule (mark BEFORE the list moves,
// so `recordStructureEdit` can still read the committed list) only makes sense where the caller can
// see both halves. Folding the mark in here would hide that ordering behind a function name.

/** Append `child` to `parent`'s desired children. Caller has already detached and marked. */
export function linkAppend(parent: ISymbioteNode, child: ISymbioteNode): void {
  child.parent = parent;
  parent.children.push(child);
}

/**
 * Insert `child` before `beforeChild`. A `beforeChild` that is not present appends, which is what
 * every framework's `insertBefore(…, null)` means and what the previous inline code did.
 */
export function linkBefore(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode,
): void {
  child.parent = parent;
  const index = parent.children.indexOf(beforeChild);
  parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
}

/** Remove `child` from `parent`'s desired children. A no-op when it is not there. */
export function unlink(parent: ISymbioteNode, child: ISymbioteNode): void {
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
  child.parent = undefined;
}

/**
 * Replace a node's whole child list at once — the synthetic root container's own path.
 *
 * Deliberately does NOT set `parent` on the incoming children, and that asymmetry against
 * `linkAppend` is by design rather than an oversight: a surface's top-level nodes carry
 * `parent === undefined` (surface.ts sets it), so the container is the one parent whose children do
 * not point back at it. Every mark that would bubble from one of them therefore stops at the node
 * itself, which is exactly why `commitContainer` marks the container unconditionally at its entry.
 */
export function replaceChildren(
  parent: ISymbioteNode,
  children: readonly ISymbioteNode[],
): void {
  parent.children = children.slice();
}

/**
 * Cut a node's parent link without naming the parent — the surface's own detach path, where a
 * top-level node legitimately has none.
 */
export function unlinkFromParent(child: ISymbioteNode): void {
  child.parent = undefined;
}

// ── THE BACKING SEAM ─────────────────────────────────────────────────────────────────────────────
//
// Everything above reads and writes `node.children` / `node.parent`. That is the ONLY code in the
// engine allowed to, and the guard test asserts it. Swapping to the buffer + `getChildNodes`
// backing is a change to this file and to nothing else.

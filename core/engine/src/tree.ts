// The ONE place that answers or changes the DESIRED structure — "what the adapter has built so
// far", as opposed to the COMMITTED structure Fabric holds.
//
// ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────────────────────────
//
// The engine used to hold the tree shape TWICE (`symbiote-fabric-cxx-surface` §9):
//
//   DESIRED     node.children / node.parent        this module
//   COMMITTED   record.children / record.parent    the IMirror
//
// `node.children` is GONE as of 2026-09-06 (item 4c-3). A node's desired children are DERIVED here
// from the record it last published plus the ops recorded against it since, so the desired copy is
// no longer a thing the mutation API maintains — it is a reading of the committed record and the
// buffer, which is exactly the pair item 8 makes native. `node.parent` is the back-edge and is next.
//
// ── CORRECTED 2026-09-05 against `symbiote-fabric-cxx-surface`, which had already ruled out the
// design this header first named. Recorded because the wrong one is the intuitive one. ────────────
//
// The first version said the committed copy is replaced by RN's `NativeDOM.getChildNodes` /
// `getParentNode`. It is NOT, on two counts the skill states outright:
//
//   §1a  NativeDOM reads the CURRENT REVISION only, and the skill's own conclusion is that it is
//        "unusable for RECONCILIATION, because a reconciler navigates the tree it is mid-way
//        through building".
//   §6a  "Marshalling children back over JSI per commit is O(n) where holding one handle is O(1) —
//        strictly worse than today." Reading children over the wire per commit is the ONE thing
//        that section tells you never to do.
//
// The route the skill actually chose (§7b, design 2) is OUR OWN native module retaining a
// `pendingRoot_` per surface and answering navigation from it — not RN's read-only DOM API. Those
// are different mechanisms and only the second is on the table.
//
// AND THE BUFFER STAYS THE SOURCE OF TRUTH EVEN THEN, which is what makes the ops half mandatory
// rather than an optimisation. `ShadowTree::commit` is a RETRIED transaction (§5): a `pendingRoot_`
// built against an older root must be rebased when another writer lands first, and the only way to
// rebase is to re-apply the command log inside the lambda. So `pendingRoot_` is a MEMO of the
// buffer, never a replacement for it — and a buffer that holds only WHICH nodes were touched has
// nothing to re-apply.
//
// ── WHY IT WAS WORTH A SEAM FIRST ────────────────────────────────────────────────────────────────
//
// The swap would otherwise have been a 57-site edit with no guard: measured 2026-09-05 by a
// type-aware census (grep cannot do it — `.parent` is also an animated-graph field and an event
// field, and most textual hits are comments). With the seam it was one file, and
// `tests/engine-structure-seam.test.ts` fails the moment anything else reaches for a field again.
//
// ── THE RESIDUE, AND WHERE IT WENT: ANCHORS ──────────────────────────────────────────────────────
//
// An anchor never becomes a Fabric node — it is flattened away at commit — so no native structure,
// ours or RN's, can hold one. It is purely ours, and it was the one part of the desired structure
// with nowhere to go: not into a C++ `pendingRoot_`, and not into a per-tick buffer either, because
// an adapter holds an anchor across commits and appends to it later.
//
// It has a home now: `IContribution` (node.ts), a per-anchor record the commit publishes exactly as
// it publishes a mirror for a real node — the renderable nodes the anchor put in its parent's list,
// the children it hid, and its own desired children. So an anchor is answered by the same
// record-plus-log derivation as everything else, and `IContribution` is the one record item 8 does
// NOT take away, because it is the one with no native counterpart.

import type { ISymbioteNode } from './node';
// A CYCLE, and a deliberate one: this module answers the desired structure and the buffer is where
// the unpublished half of it lives, while the buffer's own bubble needs `parentOf`. Both sides only
// call each other from function BODIES and every export is a hoisted function declaration, so
// neither reaches a binding before it is initialised. Written down because the shape looks like a
// mistake and the alternative — a third module holding two accessors — buys nothing.
import { pendingChildOps, type IEditOp } from './edit-buffer';

// ── READS ────────────────────────────────────────────────────────────────────────────────────────

const NO_CHILDREN: readonly ISymbioteNode[] = [];

/**
 * This node's desired children, in order — DERIVED, since 2026-09-06, from the record it last
 * published plus the ops recorded against it since.
 *
 * There is no `node.children` any more. The base is whichever record the node currently holds —
 * `committed.desired` for a node Fabric has seen, `contributed.desired` for a skipped anchor, and
 * neither for one that has never published, whose op log is therefore its whole child list. At most
 * one of the two exists at a time: the flatten drops `committed` when it hides a node, and the
 * commit drops `contributed` when it publishes a real record.
 *
 * Returned BY REFERENCE when nothing was recorded this cycle, which is the overwhelming case and
 * costs no allocation. Callers MUST NOT mutate what they get back — nothing in the engine does, and
 * that is what makes it safe for a record's `children` and `desired` to be the same array.
 */
export function childrenOf(node: ISymbioteNode): readonly ISymbioteNode[] {
  const base =
    node.committed?.desired ?? node.contributed?.desired ?? NO_CHILDREN;
  const ops = pendingChildOps(node);
  if (ops === undefined || ops.length === 0) return base;
  return replayDesired(base, ops);
}

/**
 * Replay a node's ops onto its published base — the DESIRED-space replay, and the plain twin of
 * `replayChildOps` (commit.ts), which does the same job in RENDERABLE space and needs three refusals
 * to do it.
 *
 * This one can never refuse: an op says exactly what it did to the desired list. It must stay a
 * line-for-line mirror of the writes below, and the two properties that matter are that an insert
 * DETACHES first (which `appendChild` performs as its own op, so the pre-remove is normally a no-op)
 * and that a `before` the list does not hold APPENDS.
 */
function replayDesired(
  base: readonly ISymbioteNode[],
  ops: readonly IEditOp[],
): ISymbioteNode[] {
  const out = base.slice();
  for (const op of ops) {
    const at = out.indexOf(op.child);
    if (at >= 0) out.splice(at, 1);
    if (op.remove) continue;
    // `before` is TYPED as a node and is not always one — Solid's `insertNode` lets a `null` through
    // (see `replayChildOps`, which paid 30 red tests for this). `indexOf(null)` is -1, so it appends,
    // which is the same answer the old `linkBefore` gave.
    const before = op.before ?? undefined;
    const found = before === undefined ? -1 : out.indexOf(before);
    out.splice(found < 0 ? out.length : found, 0, op.child);
  }
  return out;
}

/** This node's desired parent, or undefined for a top-level node and for a detached one. */
export function parentOf(node: ISymbioteNode): ISymbioteNode | undefined {
  return node.parent;
}

// ── WRITES ───────────────────────────────────────────────────────────────────────────────────────
//
// What is left of them. Each used to splice `parent.children`; the child list is derived now, and
// the OP the caller recorded a line earlier is the whole record of the change. So these carry only
// the back-edge, and the ordering rule they used to serve (mark BEFORE the list moves) is now
// unconditional rather than a convention: `linkBefore` no longer resolves a position at all, so an
// op recorded late would be the only thing wrong and nothing would notice.
//
// They are kept as named calls rather than inlined so the mutation API in node.ts still reads as
// "record the op, then link", and so 4c-4 — which removes the parent field the same way — is a
// change to this file and to nothing else.

/** Append `child` to `parent`. The caller has already detached it and recorded the op. */
export function linkAppend(parent: ISymbioteNode, child: ISymbioteNode): void {
  child.parent = parent;
}

/** Insert `child` before `beforeChild`; the position lives in the op the caller recorded. */
export function linkBefore(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode,
): void {
  void beforeChild;
  child.parent = parent;
}

/** Remove `child` from `parent`. A no-op when it is not there. */
export function unlink(parent: ISymbioteNode, child: ISymbioteNode): void {
  void parent;
  child.parent = undefined;
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

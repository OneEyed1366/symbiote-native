// The pending-edit buffer: what the adapter told us, held until the commit consumes it.
//
// This replaces three boolean fields on every node — `dirty`, `propsDirty`, `structureDirty` — with
// three sets held here. The mechanics are deliberately IDENTICAL (see each writer below); what
// changes is where the record lives, and that is the point rather than a side effect:
//
//   - a node carries less. The target shape is an ADDRESS plus whatever the framework already
//     allocated, and every field removed from `ISymbioteNode` is a step toward it
//     (`symbiote-fabric-cxx-surface` §9).
//   - the commit reads a RECORD instead of re-deriving one. A walk cannot be handed to a native
//     module; a drained buffer can, which is what makes §9's step 2 reachable at all.
//
// It is step ONE of two, and the honest boundary is worth stating: this buffer holds WHICH nodes
// were touched, not WHAT the edit was. Carrying the edits themselves — key, value, index — is step
// two, and it is what a C++ drain would actually consume. Nothing here is vestigial in the
// meantime: all three sets are read by the commit on every pass.
//
// NOT per-surface, and that is safe rather than sloppy. A node belongs to exactly one surface and
// the commit only ever asks about nodes it is already visiting, so entries for another surface are
// invisible to it and are cleared when that surface commits. Threading a surface down here would
// mean every mutation site knowing its root, which no adapter can supply from `node.ts`'s side —
// a top-level node deliberately carries `parent === undefined`.

import type { ISymbioteNode } from './node';
import { childrenOf, parentOf } from './tree';

// ── WHY ALL THREE ARE WEAK ───────────────────────────────────────────────────────────────────────
//
// They were a Set, a Set and a Map, and the one thing a buffer owed that a per-node boolean did not
// was RECLAMATION: a boolean died with its node, and a strong collection PINS it. That was paid for
// with a nominate-then-sweep pass — `nominateDroppedEdits` on every removal, `sweepDroppedEdits`
// walking each nominee's subtree at commit — and the sweep was deleted 2026-09-06 in favour of the
// language doing it.
//
// The reason is not tidiness. Every access here is `has` / `get` / `set` / `delete`, so the weak
// form is mechanically identical — and the sweep was WRONG in a way that only becomes visible when
// the desired child list stops being a field:
//
//   what the sweep reclaimed   a node created and discarded before it ever committed. A node that
//                              HAS committed had its entries drained at that commit, and removal
//                              records an op on the PARENT, so it holds nothing to reclaim.
//   what that node holds       its op log, which for a never-committed node is its ENTIRE child
//                              list — the only place its structure exists once `node.children` goes
//                              (`symbiote-fabric-cxx-surface` §8, 4c).
//
// So the sweep's target set and the set whose structure must survive are the SAME set, and no
// fold-before-drop repair separates them. It also silently dropped a pending PROP write from a
// subtree parked across commits, which frameworks do (Svelte parks live subtrees; Solid spells a
// move as remove-then-reinsert) — the sweep's own comment protects the same-tick case and not that
// one. Both are closed by never dropping: a detached node keeps its entries, and when it is
// genuinely dead the whole subtree is collected with them.
//
// The cost is that nothing can COUNT what is pending, so the process-wide `pendingEditCount` is
// gone. Every row that used it now asks the question of a NODE (`hasPendingWork`,
// `pendingChildOps`), which is the better oracle anyway — a global count is satisfied or defeated by
// whatever an unrelated earlier test left behind. What is no longer testable is that a dead node is
// reclaimed, and that is a guarantee of the language rather than of this file.

// "This node, or something under it, has pending work." The subtree question the commit walk asks
// before descending, and the one `commitTargeted` asks before taking its short route.
let pendingPath = new WeakSet<ISymbioteNode>();

// "THIS node's own Fabric payload may differ from what the mirror holds." Strictly narrower than
// the above, which is also raised by a descendant's change bubbling up.
let pendingProps = new WeakSet<ISymbioteNode>();

// "This node's CHILD LIST changed", and — since 2026-09-05 — WHAT changed, in order.
//
// The ordered op log per parent. It is not a second record beside a Set: it IS the record, which is
// what keeps it from being an unread symbol (`symbiote-fabric-cxx-surface` §8 — "an ordered op log
// that nothing drains").
//
// THREE things read it, and the third is why it stopped being nullable (see `unreplayable` below).
// The commit REPLAYS it onto the committed renderable list instead of re-deriving that list. Item
// 8's native drain re-applies it inside a retried commit lambda to rebase a `pendingRoot_` (§7b,
// §5) — a buffer holding only "which nodes were touched" has nothing to re-apply, which is why the
// log is required under BOTH design branches. And `childrenOf` (tree.ts) replays it onto the node's
// published base to answer what its DESIRED children are, which is what removed the field.
let pendingStructure = new WeakMap<ISymbioteNode, IEditOp[]>();

/**
 * One child-list operation, at the level the adapter issued it.
 *
 * `before === undefined` on an insert means APPEND, which is what every framework's
 * `insertBefore(…, null)` means and what `linkBefore` already does with a `beforeChild` it cannot
 * find. A remove carries no position: replay finds the child by identity, exactly as `unlink` does.
 */
export interface IEditOp {
  readonly child: ISymbioteNode;
  readonly before: ISymbioteNode | undefined;
  readonly remove: boolean;
}

/**
 * Record that `node` or something beneath it needs work, bubbling to the root.
 *
 * The walk STOPS at the first ancestor already carrying the mark, and that early exit is
 * load-bearing for cost — but it also means a descendant's mark can be the only thing keeping an
 * ancestor chain from being skipped. Any code that clears a mark without publishing the descendant
 * strands it permanently (`.claude/rules/engine-mutations-must-mark-dirty.md`). Preserved exactly,
 * because a set membership test and a boolean field answer the same question.
 */
export function recordSubtreeEdit(node: ISymbioteNode): void {
  let current: ISymbioteNode | undefined = node;
  while (current !== undefined && !pendingPath.has(current)) {
    pendingPath.add(current);
    current = parentOf(current);
  }
}

/**
 * Record a write to this node's own props, then bubble.
 *
 * The two are recorded INDEPENDENTLY rather than one implying the other: the bubble stops at the
 * first already-marked ancestor, so a node marked a moment ago by a child's change would otherwise
 * have its own prop write silently dropped. Recording the prop edit first, unconditionally, is what
 * makes that ordering safe.
 */
export function recordPropEdit(node: ISymbioteNode): void {
  pendingProps.add(node);
  recordSubtreeEdit(node);
}

// `snapshotCommittedChildren` lived here until 2026-09-06, and it is worth one note that it is
// GONE rather than moved. It de-aliased `record.children` from `node.children`, which the record
// held by reference for any parent with no skipped child — so the first structural op of a cycle
// had to copy the committed list out of the way before the live one was spliced. There is no live
// one now: every list the engine holds is published by a commit and never mutated in place, so an
// alias between two of them is safe by construction and there is nothing to copy.

// "This node's RENDERABLE child list moved in a way no sequence of child ops describes."
//
// SPLIT OUT OF `pendingStructure` 2026-09-06, and the split is a correctness fix rather than a
// tidy-up. The two facts were one field — a `null` log meant "unreplayable" AND destroyed the ops —
// which was harmless only while `node.children` was the source of truth. It is not: both callers
// poison a parent whose DESIRED list did not change at all,
//
//   the anchor climb     an edit under an anchor changes the RENDERABLE list of the node above it,
//                        at a position no op names (`markStructureDirty`, node.ts)
//   a skipped-ness flip  a child leaves or joins the RENDERABLE list with no child op at all
//                        (`markPresenceIfFlipped`, node.ts)
//
// so `appendChild(P, x)` followed by an edit under an anchor child of P used to throw away the `+x`
// op. With the desired list derived from (record + ops), that loses `x` outright.
let unreplayable = new WeakSet<ISymbioteNode>();

/**
 * Record that `parent`'s RENDERABLE child list changed in a way no sequence of child ops describes.
 *
 * Says the renderable list moved and refuses to say how, so the commit re-derives it. Deliberately
 * does NOT touch the op log: the ops describe the DESIRED list, which this says nothing about.
 */
export function recordStructureEdit(parent: ISymbioteNode): void {
  unreplayable.add(parent);
  recordSubtreeEdit(parent);
}

/**
 * Record ONE child-list operation on `parent`, in issue order.
 *
 * MUST be called BEFORE the list is mutated: `linkBefore` resolves its position against the list as
 * it stands, so an op recorded afterwards would name a `before` that has already moved.
 */
export function recordChildOp(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  before: ISymbioteNode | undefined,
  remove: boolean,
): void {
  const existing = pendingStructure.get(parent);
  if (existing === undefined) {
    pendingStructure.set(parent, [{ child, before, remove }]);
  } else {
    existing.push({ child, before, remove });
  }
  recordSubtreeEdit(parent);
}

/**
 * This parent's ordered op log, or `undefined` when nothing was recorded against it this cycle.
 *
 * The DESIRED-side reader: `childrenOf` (tree.ts) replays these onto the node's published base, so
 * it wants the ops whatever the renderable list is doing.
 */
export function pendingChildOps(
  parent: ISymbioteNode,
): readonly IEditOp[] | undefined {
  return pendingStructure.get(parent);
}

/**
 * The same log for the RENDERABLE replay, which additionally refuses when the list moved in a way
 * the ops cannot describe — `null`, the shape `replayChildOps` (commit.ts) already reads.
 */
export function renderableChildOps(
  parent: ISymbioteNode,
): readonly IEditOp[] | null | undefined {
  if (unreplayable.has(parent)) return null;
  return pendingStructure.get(parent);
}

/**
 * Record a freshly constructed node: all three questions answered YES.
 *
 * A node that has never committed must never take a fast path built on "the mirror already agrees
 * with me", and there is no mirror at all yet. Written as its own entry rather than three calls at
 * the construction site so the reason lives here, next to what it seeds — and because the bubble is
 * a no-op for a node whose `parent` is still undefined, which is every node at construction.
 */
export function recordNewNode(node: ISymbioteNode): void {
  pendingPath.add(node);
  pendingProps.add(node);
  // An EMPTY log, not `null`: a node that has never committed starts from no children at all, so
  // its whole child list is whatever ops arrive after this — replayable from empty by construction,
  // which is what lets the create path stop reading `node.children`.
  pendingStructure.set(node, []);
}

/** Whether this node or anything beneath it has pending work. */
export function hasPendingWork(node: ISymbioteNode): boolean {
  return pendingPath.has(node);
}

/** Whether this node's OWN props were written since its last commit. */
export function hasPendingProps(node: ISymbioteNode): boolean {
  return pendingProps.has(node);
}

/**
 * Whether this node's CHILD LIST changed since its last commit — EITHER way it can change.
 *
 * Both halves, because the commit asks one question here and the split above answers two: a node
 * with ops needs its renderable list rebuilt, and so does one whose renderable list moved with no op
 * against it at all (an edit under an anchor, a skipped-ness flip). Reading only the log would let
 * the second class through, which is the attribution hole the fuzzer's ORACLE 5 exists for.
 */
export function hasPendingStructure(node: ISymbioteNode): boolean {
  return pendingStructure.has(node) || unreplayable.has(node);
}

/** Whether any direct child of `node` carries pending work — `commitTargeted`'s descendant bail. */
export function hasPendingChild(node: ISymbioteNode): boolean {
  return childrenOf(node).some(child => pendingPath.has(child));
}

/**
 * Consume this node's entry. Called by the commit as it publishes each node.
 *
 * Deliberately three deletes rather than one: `pendingPath` is the subtree question and the other
 * two are self questions, so a caller that publishes a node's own payload without descending
 * (`commitTargeted`) must be able to clear them separately from the path.
 */
export function clearPendingProps(node: ISymbioteNode): void {
  pendingProps.delete(node);
}

export function clearPendingStructure(node: ISymbioteNode): void {
  pendingStructure.delete(node);
  unreplayable.delete(node);
}

export function clearPendingWork(node: ISymbioteNode): void {
  pendingPath.delete(node);
}

/**
 * Test-only reset. A leaked entry from one test silently changes the next one's commit.
 *
 * REPLACES the collections rather than clearing them, because a weak collection has no `clear`. The
 * old instances go with whatever still references their keys, which is the same reclamation the
 * sweep used to perform by hand.
 */
export function resetEditBuffer(): void {
  pendingPath = new WeakSet<ISymbioteNode>();
  pendingProps = new WeakSet<ISymbioteNode>();
  pendingStructure = new WeakMap<ISymbioteNode, IEditOp[]>();
  unreplayable = new WeakSet<ISymbioteNode>();
}

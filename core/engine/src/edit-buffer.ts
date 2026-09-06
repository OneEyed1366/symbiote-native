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
// The value is the ordered op log for that parent, or `null` for a change no sequence of child ops
// describes (see `recordStructureEdit`). Membership alone answers `hasPendingStructure`, so the log
// is not a second record beside a Set: it IS the record, which is what keeps it from being an
// unread symbol (`symbiote-fabric-cxx-surface` §8 — "an ordered op log that nothing drains").
//
// Two things read it. The commit REPLAYS it onto the committed renderable list instead of
// re-deriving that list from `node.children`, which is what takes the last structural read out of
// the walk. And item 8's native drain re-applies it inside a retried commit lambda to rebase a
// `pendingRoot_` (§7b, §5) — a buffer holding only "which nodes were touched" has nothing to
// re-apply, which is why the log is required under BOTH design branches and not only this one.
let pendingStructure = new WeakMap<ISymbioteNode, IEditOp[] | null>();

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

/**
 * De-alias the committed child list from the live one, ONCE per parent per cycle.
 *
 * `reconcile` stores the reconciled child list in the committed record BY REFERENCE, so for a
 * parent holding no skipped children the record ALIASES `parent.children`. The first structural
 * change of a cycle is the last moment that list can still be read as the COMMITTED one, and both
 * readers need it intact: the commit diffs against it, and the replay below uses it as the base.
 *
 * The identity test keeps it honest: a record whose `children` is not `parent.children` either
 * already holds this cycle's copy or holds the private array `renderableChildren` built to flatten
 * anchors away, and nobody mutates either.
 *
 * MEASURED 2026-09-05 and it is why this moved behind a "first op of the cycle" gate. It used to
 * run on EVERY structural mutation, so appending 1 000 rows read `parent.children` 2 001 times to
 * answer an identity question that can only be true once. Gating it on the map entry being absent
 * makes it once per parent per cycle: 2 001 -> 2 on the same append.
 */
function snapshotCommittedChildren(parent: ISymbioteNode): void {
  const record = parent.committed;
  if (record === undefined) return;
  const kids = childrenOf(parent);
  if (record.children === kids) record.children = kids.slice();
}

/**
 * Record that `parent`'s child list changed in a way NO sequence of child ops describes.
 *
 * The unreplayable form, and the honest default: it says the list moved and refuses to say how, so
 * the commit re-derives from `node.children` exactly as it always did. Three callers need it and
 * each has a reason the ops cannot express —
 *
 *   the anchor climb        an edit under an anchor changes the RENDERABLE list of the node above
 *                           it, at a position no op names (`markStructureDirty`, node.ts)
 *   a skipped-ness flip     a child leaves or joins the renderable list with no child op at all
 *                           (`markPresenceIfFlipped`, node.ts)
 *   replaceChildren         a surface hands its whole top-level list over at once (commitChildren)
 *
 * MUST be called BEFORE the list is mutated, for `snapshotCommittedChildren`'s reason above.
 */
export function recordStructureEdit(parent: ISymbioteNode): void {
  if (!pendingStructure.has(parent)) snapshotCommittedChildren(parent);
  pendingStructure.set(parent, null);
  recordSubtreeEdit(parent);
}

/**
 * Record ONE child-list operation on `parent`, in issue order.
 *
 * Appends to the parent's log, unless the log has already been poisoned to `null` by an
 * unreplayable change this cycle — in which case there is nothing to append to and nothing that
 * would read it. MUST be called BEFORE the list is mutated, same as above.
 */
export function recordChildOp(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  before: ISymbioteNode | undefined,
  remove: boolean,
): void {
  const existing = pendingStructure.get(parent);
  if (existing === undefined) {
    snapshotCommittedChildren(parent);
    pendingStructure.set(parent, [{ child, before, remove }]);
  } else if (existing !== null) {
    existing.push({ child, before, remove });
  }
  recordSubtreeEdit(parent);
}

/**
 * This parent's ordered op log, `null` when the change is unreplayable, `undefined` when its
 * structure is not pending at all. Read by the commit; see the `pendingStructure` comment for the
 * second reader this exists for.
 */
export function pendingChildOps(
  parent: ISymbioteNode,
): readonly IEditOp[] | null | undefined {
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

/** Whether this node's CHILD LIST changed since its last commit. */
export function hasPendingStructure(node: ISymbioteNode): boolean {
  return pendingStructure.has(node);
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
  pendingStructure = new WeakMap<ISymbioteNode, IEditOp[] | null>();
}

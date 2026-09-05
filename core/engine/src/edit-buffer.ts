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

// "This node, or something under it, has pending work." The subtree question the commit walk asks
// before descending, and the one `commitTargeted` asks before taking its short route.
const pendingPath = new Set<ISymbioteNode>();

// "THIS node's own Fabric payload may differ from what the mirror holds." Strictly narrower than
// the above, which is also raised by a descendant's change bubbling up.
const pendingProps = new Set<ISymbioteNode>();

// "This node's CHILD LIST changed." Raised on the parent, never on the moved child.
const pendingStructure = new Set<ISymbioteNode>();

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
 * Record that `parent`'s child list changed.
 *
 * MUST be called BEFORE the list is mutated, and that ordering is load-bearing rather than
 * stylistic: `reconcile` stores the reconciled child list in the committed record BY REFERENCE, so
 * for a parent holding no anchors the record ALIASES `parent.children`. This call is the last
 * moment the committed list can still be read, and taking the copy here means it is taken once per
 * changed parent per cycle instead of once per node per commit.
 *
 * The identity test keeps it honest: a record whose `children` is not `parent.children` either
 * already holds this cycle's copy or holds the private array `renderableChildren` built to flatten
 * anchors away, and nobody mutates either.
 */
export function recordStructureEdit(parent: ISymbioteNode): void {
  const record = parent.committed;
  const kids = childrenOf(parent);
  if (record !== undefined && record.children === kids) {
    record.children = kids.slice();
  }
  pendingStructure.add(parent);
  recordSubtreeEdit(parent);
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
  pendingStructure.add(node);
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

// ── DROPPED NODES ────────────────────────────────────────────────────────────────────────────────
// The one thing a buffer owes that a per-node boolean did not: a boolean died with its node, and a
// Set PINS it. Without the sweep below, `Clear` on a thousand ten-node rows leaks ten thousand nodes
// for the life of the process — every one of them recorded by `recordNewNode` and never drained,
// because the commit walk only ever reaches nodes that are still in a tree.
//
// It cannot be done at removal, for the reason host-behavior.ts's own sweep exists: an adapter
// spells a MOVE as remove-then-reinsert (Solid's replaceNode, Svelte parking a subtree), so a
// removal is not a death. And clearing a moved child's entries is not merely premature, it is the
// silent-stale-UI bug this whole file is careful about — a node with a pending prop write, removed
// and re-appended to the SAME parent in one tick, would come back with `committed.parent` matching
// and `viewName` matching, and reconcile would reuse it with the write lost. Removal nominates;
// commit decides, once the tick's mutations are all in.
const droppedCandidates = new Set<ISymbioteNode>();

/** Nominate a node whose parent link was just cut. Not a claim that it is dead — see above. */
export function nominateDroppedEdits(node: ISymbioteNode): void {
  droppedCandidates.add(node);
}

/**
 * Drop the entries of every nominee that did not come back, and of everything beneath it.
 *
 * The liveness test is host-behavior.ts's, for its reason: a surface's top-level nodes carry
 * `parent === undefined` by design (surface.ts), so the parent check alone reports a live one as
 * gone.
 *
 * The subtree is walked unconditionally rather than stopping at the first node holding no entry.
 * The bubble makes that early exit LOOK safe — a pending descendant implies a pending ancestor — but
 * the invariant is broken mid-walk by design, since `reconcile` drains a node before descending into
 * it. Only the removed subtree is walked either way, so the guard would buy little and could be
 * wrong; deletes are idempotent, so an overlapping nominee costs a second pass and nothing else.
 */
export function sweepDroppedEdits(topLevel: readonly ISymbioteNode[]): void {
  if (droppedCandidates.size === 0) return;
  for (const node of droppedCandidates) {
    if (parentOf(node) !== undefined || topLevel.includes(node)) continue;
    dropSubtree(node);
  }
  droppedCandidates.clear();
}

function dropSubtree(node: ISymbioteNode): void {
  pendingPath.delete(node);
  pendingProps.delete(node);
  pendingStructure.delete(node);
  for (const child of childrenOf(node)) dropSubtree(child);
}

/**
 * Diagnostic only. The buffer is process-wide, so this counts every surface's pending work at once
 * and is meaningless as a per-commit figure — it exists so a test can assert the buffer DRAINS
 * rather than growing without bound, which no other observable would catch.
 */
export function pendingEditCount(): {
  path: number;
  props: number;
  structure: number;
} {
  return {
    path: pendingPath.size,
    props: pendingProps.size,
    structure: pendingStructure.size,
  };
}

/** Test-only reset. A leaked entry from one test silently changes the next one's commit. */
export function resetEditBuffer(): void {
  pendingPath.clear();
  pendingProps.clear();
  pendingStructure.clear();
  droppedCandidates.clear();
}

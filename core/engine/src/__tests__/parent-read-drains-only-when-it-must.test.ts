// What a `parentOf` COSTS, and the rule that decides it.
//
// A READ IS A BATCH BOUNDARY — `parentOf` drains the buffer before answering, because a pending op
// could have re-parented the node it is asked about. That is correct and it was unconditional, so
// every read cut the op stream in two whether or not anything pending could have changed the answer.
// The string and value tables intern PER BATCH, so a cut is not just a crossing: it also stops the
// next batch folding a value the last one already carried.
//
// Measured on Angular's 1 000-row create (`adapters/angular/src/read-fragmentation.probe.test.ts`):
// 1 002 drains, caused by exactly 1 000 `parentOf` calls — Angular's own
// `addLViewToLContainer` asks `renderer.parentNode(lContainer[NATIVE])` once per embedded view
// (`@angular/core` 22.0.8). Of those 1 000 reads, ONE asked about a node the pending batch had
// actually re-parented. The other 999 flushed for nothing.
//
// THE RULE, and it is airtight rather than a heuristic: a node's parent link changes only through an
// op that NAMES that node as the child. So if the pending batch does not name it, the host's answer
// is already the current one and there is nothing to publish first.
//
// `namesPendingParentChange` is the buffer's own bookkeeping, not a tree — it answers about the
// BUFFER ("is this node's placement unpublished"), which is why it does not violate the standing
// rule that JS holds no parent links (`node.ts:2`). Creation counts: a node the host has never
// heard of has no answer to give.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  parentOf,
  removeChild,
  setProp,
  type ISymbioteNode,
} from '../index';
import { setTreeHost, treeHost } from '../tree-host';

const fabric = installRecordingFabric();

/** Counts `applyOps` entries — the drain itself, which `trackHostCrossings` deliberately skips. */
function countDrains(): { readonly count: () => number } {
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  let drains = 0;
  setTreeHost({
    ...base,
    applyOps: batch => {
      drains += 1;
      base.applyOps(batch);
    },
  });
  return { count: () => drains };
}

/** A parent standing in the HOST, with nothing about it left pending. */
function settledParentWith(child: ISymbioteNode): ISymbioteNode {
  const parent: ISymbioteNode = createElement('RCTView');
  appendChild(parent, child);
  // Any read drains, so this is what "published" is spelled as from here.
  parentOf(parent);
  return parent;
}

beforeEach(() => {
  fabric.reset();
  vi.restoreAllMocks();
});

describe('asking for a node parent', () => {
  // why: THE COST CLAIM. 999 of Angular's 1 000 create-path reads are this shape — the node asked
  // about is settled and the pending ops belong to other nodes entirely. Each one used to cost a
  // crossing plus a fresh intern table.
  it('publishes nothing when the pending work cannot have moved it', () => {
    const child: ISymbioteNode = createElement('RCTView');
    const parent = settledParentWith(child);

    const drains = countDrains();

    // Work that names OTHER nodes — the rest of the row Angular is mid-way through building.
    for (let at = 0; at < 5; at += 1) {
      const other: ISymbioteNode = createElement('RCTView');
      appendChild(parent, other);
    }

    expect(parentOf(child)).toBe(parent);
    expect(drains.count(), 'the settled node needed no publish').toBe(0);
  });

  // why: THE TWO-SIDED HALF, and without it the case above is satisfied by a `parentOf` that never
  // drains and answers from a stale host. A move recorded and not yet published must still be
  // visible to the very next read — that is the invariant `flushOps` was there for.
  it('publishes first when the pending work moved this very node', () => {
    const child: ISymbioteNode = createElement('RCTView');
    const first = settledParentWith(child);
    const second: ISymbioteNode = createElement('RCTView');
    appendChild(second, child);
    parentOf(second);

    const drains = countDrains();

    removeChild(second, child);
    appendChild(first, child);

    expect(
      parentOf(child),
      'the unpublished move is what the read reports',
    ).toBe(first);
    expect(drains.count(), 'it had to publish to answer that').toBeGreaterThan(
      0,
    );
  });

  // why: the OTHER way a read can outrun the host. A node created and appended in the same pending
  // batch has never been named to the host at all, so answering from the host without publishing
  // would be answering about a node it does not hold.
  it('publishes first for a node the host has never been told about', () => {
    const parent: ISymbioteNode = createElement('RCTView');
    parentOf(parent);

    const drains = countDrains();

    const fresh: ISymbioteNode = createElement('RCTView');
    appendChild(parent, fresh);

    expect(parentOf(fresh)).toBe(parent);
    expect(drains.count()).toBeGreaterThan(0);
  });

  // why: a node created and never placed is the case a naive "has the host heard of it" check gets
  // wrong in the other direction — there is no parent to report, and reporting one would be worse
  // than the crossing saved.
  it('reports no parent for a node that was created and never placed', () => {
    const orphan: ISymbioteNode = createElement('RCTView');

    expect(parentOf(orphan)).toBe(undefined);
  });

  // why: A PROP WRITE IS NOT A MOVE. This is the one that says the gate reads the node's PLACEMENT
  // rather than "is this node mentioned anywhere in the batch" — the cheap spelling, and the one
  // that would still have flushed on all 999 of Angular's reads, since the row being built writes
  // props on nodes near the one asked about.
  it('publishes nothing when the only pending work on it is a prop write', () => {
    const child: ISymbioteNode = createElement('RCTView');
    const parent = settledParentWith(child);

    const drains = countDrains();

    setProp(child, 'testID', 'still-here');

    expect(parentOf(child)).toBe(parent);
    expect(drains.count()).toBe(0);
  });
});

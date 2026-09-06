// The pending-edit buffer (`../edit-buffer.ts`), and specifically the properties no other suite in
// this repo can observe: what it HOLDS and what it DRAINS, per node.
//
// Everything else about the buffer is covered from the outside — `dirty-marking.test.ts` proves
// every mutator's change survives a commit, `commit-fuzz.test.ts` proves the walk agrees with an
// independent oracle over generated programs. Both would stay green if the buffer held the wrong
// thing between commits, because an entry that is never consumed is indistinguishable, in committed
// output, from one that was.
//
// ── REWRITTEN 2026-09-06, WHEN THE MECHANISM THREE OF ITS ROWS GUARDED WAS DELETED ───────────────
//
// The buffer used to be a Set, a Set and a Map, and it paid for reclamation with a
// nominate-then-sweep pass (`nominateDroppedEdits` on every removal, `sweepDroppedEdits` walking
// each nominee's subtree at commit). Three rows here pinned that sweep, through a process-wide
// `pendingEditCount`. The collections are weak now and the sweep is gone — see edit-buffer.ts's
// header for why it was also WRONG, which is the part that mattered: the only nodes it reclaimed
// were nodes that had never committed, and a never-committed node's op log is its entire child list.
//
// So the rows changed subject rather than being deleted. Where one asserted that a detached node's
// entries are DROPPED, it now asserts they are KEPT — the behaviour `parked-subtree-revival.test.ts`
// depends on — and every count is asked of a NODE instead of the process. That is the better oracle
// either way: a global count is satisfied or defeated by whatever an unrelated earlier test left
// behind, which is why the old rows needed before/after deltas to say anything at all.
//
// Break-tested per MECHANISM, and the row sets are disjoint, which is what says none of these is
// standing behind another (`.claude/rules/test-harness-false-greens.md` §20):
//
//   clearPendingWork at reconcile                 many   the drain row, plus every counter probe
//                                                        and three of the fuzzer's five oracles
//   publishContribution's clearPendingStructure      2   the anchor-log row, and
//                                                        replay-child-ops' detached-anchor row
//   removal drops the STRUCTURE log                  2   parked-subtree-revival's never-committed
//                                                        row, and the fuzzer
//   removal drops PENDING PROPS                      1   the moved-node row
//
// The last two are the SAME arm split in half, deliberately: dropping all three at once (which is
// what the old sweep did, one commit later) reddens about thirty rows and tells you nothing about
// which row pins what. Each half named above is the narrowest break that reaches its row.
//
// `parked-subtree-revival`'s OTHER row — a node that had committed and gained a child while
// detached — stays green under every arm here, and that is honest rather than a gap: while the
// desired list is still a FIELD, nothing the buffer does can lose it. That row is a forward guard
// for the switch, and it says so.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  createSurface,
  removeChild,
  setProp,
  type ISymbioteNode,
} from '../index';
import {
  hasPendingProps,
  hasPendingStructure,
  hasPendingWork,
  pendingChildOps,
} from '../edit-buffer';

installFabric();
const ROOT_TAG = 8801;
const surface = createSurface(ROOT_TAG);

function row(testID: string): ISymbioteNode {
  const node = createElement('RCTView');
  setProp(node, 'testID', testID);
  for (let index = 0; index < 3; index += 1) {
    const child = createElement('RCTView');
    setProp(child, 'testID', `${testID}-${index}`);
    appendChild(node, child);
  }
  return node;
}

/** Every question the buffer answers about ONE node, which is the only scope it answers in. */
function pendingFor(node: ISymbioteNode): string {
  return [
    hasPendingWork(node) ? 'path' : '',
    hasPendingProps(node) ? 'props' : '',
    hasPendingStructure(node) ? 'structure' : '',
  ]
    .filter(Boolean)
    .join('+');
}

describe('the edit buffer drains', () => {
  it('holds nothing for a mounted subtree once it has committed', () => {
    const node = row('committed-row');
    // The surface's own appendChild, not node.ts's — a top-level node keeps `parent === undefined`.
    surface.appendChild(node);
    // Four fresh nodes, each seeded by `recordNewNode` into all three collections.
    expect(pendingFor(node)).toBe('path+props+structure');

    surface.commit();

    // The commit walked all four, so every one of them is drained. A single stranded entry is the
    // silent stale-UI bug this file exists for: `markDirty` stops at the first already-recorded
    // ancestor, so one node left pending swallows every later mark from its subtree.
    for (const each of [node, ...node.children]) {
      expect(pendingFor(each), each.props.testID as string).toBe('');
    }
  });

  it('KEEPS the entries of a node removed before it ever committed', () => {
    const leaf = createElement('RCTView');
    setProp(leaf, 'testID', 'never-committed');
    surface.appendChild(leaf);
    surface.removeChild(leaf);
    surface.commit();

    // The commit never walks this node — it is not in the container's child list — and nothing
    // reclaims it by hand any more. That is deliberate: its op log is the only place its structure
    // exists, so a buffer that discarded it would lose the subtree of anything parked this way
    // (`parked-subtree-revival.test.ts`). Reclamation is the weak collections' job now, and a dead
    // node takes its entries with it.
    expect(pendingFor(leaf)).toBe('path+props+structure');
  });

  it('KEEPS a moved node pending across the tick that moves it', () => {
    const from = row('move-from');
    const to = row('move-to');
    surface.appendChild(from);
    surface.appendChild(to);
    surface.commit();

    const moved = from.children[0];
    // A prop write and a move in ONE tick, which is how every adapter spells a reorder.
    setProp(moved, 'testID', 'moved-and-written');
    removeChild(from, moved);
    appendChild(to, moved);

    // THE DECIDING ASSERTION, and it has to be about the buffer rather than about what commits.
    // Under this move the committed output is correct EITHER WAY: the node arrives under a new
    // parent, so `committed.parent !== renderableParent` sends reconcile down the fresh-family path,
    // which rebuilds the payload from `node.props` and never consults the buffer at all. So the
    // output cannot distinguish a kept entry from a dropped one — only the entry can.
    expect(hasPendingProps(moved)).toBe(true);

    // Positive control, and it passes under both arms by the paragraph above — it is here to prove
    // the move itself landed, so a red on the line above is about the buffer and not about a
    // harness that mounted nothing (`.claude/rules/test-harness-false-greens.md` §13).
    surface.commit();
    expect(moved.committed?.props.testID).toBe('moved-and-written');
  });
});

describe('the op log does not grow for a node the commit never reconciles', () => {
  // A SKIPPED node is never reconciled, so `clearPendingStructure` is never reached for it through
  // the normal path and its ops would accumulate for the life of the process. An anchor is that
  // node, and an adapter that mounts one per composed component (Angular) has one per component.
  //
  // The log used to be TRUNCATED by `renderableChildren` — discarded, because nothing consumed it.
  // Since 4c-1 it is CONSUMED by `publishContribution` (commit.ts), which is what makes an anchor's
  // contribution replayable from its own record instead of re-derived from its children.
  //
  // Asked of THIS anchor rather than of a process-wide op count, which is what this row used before
  // the collections went weak. The per-node form is strictly stronger: a global count is flat when
  // some other node's log shrinks by exactly as much as this one grows.
  it('drains a SKIPPED node log at every commit that drops it', () => {
    const surface = createSurface(9401);
    const parent = createElement('RCTView');
    const anchor = createAnchor();
    appendChild(parent, anchor);
    surface.appendChild(parent);
    surface.commit();

    const held: number[] = [];
    for (let round = 0; round < 20; round += 1) {
      const child = createElement('RCTView');
      appendChild(anchor, child);
      removeChild(anchor, child);
      surface.commit();
      held.push(pendingChildOps(anchor)?.length ?? 0);
    }

    // Zero every round, not merely bounded: one round's worth of retention already compounds, and a
    // bound like `< 100` would pass on twenty rounds of growth.
    expect(new Set(held), `ops held per round: ${held.join(',')}`).toEqual(
      new Set([0]),
    );
  });
});

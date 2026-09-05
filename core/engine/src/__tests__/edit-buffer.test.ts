// The pending-edit buffer (`../edit-buffer.ts`), and specifically the ONE property no other suite
// in this repo can observe: that it DRAINS.
//
// Everything else about the buffer is already covered from the outside — `dirty-marking.test.ts`
// proves every mutator's change survives a commit, `commit-fuzz.test.ts` proves the walk agrees
// with an independent oracle over twelve mutation programs. Both would stay green if the buffer
// grew without bound, because an entry that is never removed is indistinguishable, in committed
// output, from one that was consumed. The output is identical; only the memory differs.
//
// That failure mode is NEW with the buffer and is the whole reason `pendingEditCount` exists: a
// boolean field died with its node, and a Set PINS it. Ten nodes a row times a thousand rows is
// the size of the leak a missing sweep produces, and nothing on screen would show it.
//
// Structure follows the other engine suites: one process-global `installFabric()` at module scope
// (`getSlot()` caches the first slot, so a per-test install is silently ignored), each block
// building its own subtree.
//
// Break-tested per MECHANISM rather than per file, because three separate things have to hold and
// two of them are breaks of the same function (`.claude/rules/test-harness-false-greens.md` §20):
//
//   A  sweepDroppedEdits returns early, always      2 red   the leaf row AND the subtree row
//   B  dropSubtree does not recurse                 1 red   the subtree row only
//   C  removal DROPS instead of nominating          1 red   the moved-node row only
//
// A and B are not disjoint and are not meant to be: B is a strictly weaker break of the same
// mechanism, and the LEAF row exists only so the two can be told apart — with a four-node subtree
// there, both arms redden both rows and no row separates them. C is disjoint from both, which is
// what says the nominate-then-decide half is independently pinned.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  removeChild,
  setProp,
  type ISymbioteNode,
} from '../index';
import { hasPendingProps, pendingEditCount } from '../edit-buffer';

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

// The buffer is process-wide, so an absolute count would be a fact about every test that ran
// before this one. Only the DELTA across an operation is meaningful, which is also why
// `pendingEditCount`'s own comment refuses to call it a per-commit figure.
function totalPending(): number {
  const counts = pendingEditCount();
  return counts.path + counts.props + counts.structure;
}

describe('the edit buffer drains', () => {
  it('holds nothing extra once a mounted subtree has committed', () => {
    const before = totalPending();
    const node = row('committed-row');
    // The surface's own appendChild, not node.ts's — a top-level node keeps `parent === undefined`.
    surface.appendChild(node);
    surface.commit();

    // 4 nodes went in, the commit walked all 4, so the buffer is back where it started. A single
    // stranded entry here is the leak, and it would be silent everywhere else.
    expect(totalPending()).toBe(before);
  });

  // Deliberately ONE node, where the row below uses four. The two breaks this file guards against
  // are "the sweep does not run" and "the sweep does not descend", and a multi-node subtree here
  // would redden on both — leaving no row that separates them. A leaf isolates the first.
  it('drops the entries of a LEAF removed before it ever committed', () => {
    const before = totalPending();
    const leaf = createElement('RCTView');
    setProp(leaf, 'testID', 'never-committed');
    surface.appendChild(leaf);
    // One fresh node, seeded by recordNewNode into all three sets.
    expect(totalPending()).toBeGreaterThan(before);

    surface.removeChild(leaf);
    surface.commit();

    // The commit never walks this node — it is not in the container's child list — so the sweep is
    // the ONLY thing that can reclaim it. Without `sweepDroppedEdits` this stays elevated forever
    // and every assertion in this repo still passes.
    expect(totalPending()).toBe(before);
  });

  it('drops a subtree removed from inside the tree, descendants included', () => {
    const parent = row('keeper');
    surface.appendChild(parent);
    surface.commit();
    const before = totalPending();

    const doomed = row('doomed');
    appendChild(parent, doomed);
    setProp(doomed.children[0], 'testID', 'doomed-touched');
    expect(totalPending()).toBeGreaterThan(before);

    removeChild(parent, doomed);
    surface.commit();

    // `doomed` and its three children all leave. The sweep walks the removed subtree rather than
    // only the nominee, which is what this row pins: a nominee-only sweep leaves the three
    // children behind and the count stays above `before`.
    expect(totalPending()).toBe(before);
  });

  it('KEEPS a moved node pending — removal nominates, it does not drop', () => {
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
    // output cannot distinguish nominate from drop — only the entry can.
    //
    // Asked of THIS node, not of `pendingEditCount()`: the count is process-wide, so a global
    // "greater than zero" is satisfied by any unrelated node any earlier test left pending.
    expect(hasPendingProps(moved)).toBe(true);

    // Positive control, and it passes under both arms by the paragraph above — it is here to prove
    // the move itself landed, so a red on the line above is about the buffer and not about a
    // harness that mounted nothing (`.claude/rules/test-harness-false-greens.md` §13).
    surface.commit();
    expect(moved.committed?.props.testID).toBe('moved-and-written');
  });
});

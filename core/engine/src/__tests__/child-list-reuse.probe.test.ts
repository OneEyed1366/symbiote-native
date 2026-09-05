// Prices the record-reuse path: on a Select-shaped commit over a 1 000-row list, how much of the
// walk still re-derives a renderable child list it could have read off the mirror.
//
// Not an assertion about wall time — this is V8, and the repo's own rule is that a headless bench
// ranks nothing for Hermes (`perf-claims-need-numbers`). It counts WORK: `childScans` is
// invocations of the flatten, `childListsReused` is nodes that skipped it. The pair is the whole
// claim, and the counters are what a device run reads too.
//
// SYMBIOTE_REUSE_PROBE_OUT=<path> writes the reading to a file. Opt-in, because a test that writes
// into the CWD by default is `.claude/rules/test-harness-false-greens.md` §15.

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  createSurface,
  readCommitProfile,
  setProp,
} from '../index';

installFabric();

const ROWS = 1000;

describe('a Select-shaped commit reads the child list instead of re-deriving it', () => {
  it('reuses the record for every node whose structure nothing recorded', () => {
    const surface = createSurface(7301);
    const list = createElement('RCTView');
    const rows: ReturnType<typeof createElement>[] = [];
    for (let index = 0; index < ROWS; index += 1) {
      const row = createElement('RCTView');
      setProp(row, 'testID', `row-${index}`);
      const label = createElement('RCTView');
      appendChild(row, label);
      appendChild(list, row);
      rows.push(row);
    }
    surface.appendChild(list);
    surface.commit();
    readCommitProfile();

    // Select: one prop on one row of a thousand. The clone-bubble is row -> list -> container, so
    // three nodes legitimately change and everything else is a sibling the walk must not rebuild.
    const target = rows[500];
    expect(target).toBeDefined();
    if (target === undefined) return;
    setProp(target, 'testID', 'row-500-selected');
    surface.commit();

    const profile = readCommitProfile();
    const line =
      `visited=${profile.nodesVisited} childScans=${profile.childScans} ` +
      `childListsReused=${profile.childListsReused} ` +
      `propsBuilt=${profile.propsBuilt} propsReused=${profile.propsReused}`;
    const out = process.env.SYMBIOTE_REUSE_PROBE_OUT;
    if (out !== undefined) writeFileSync(out, `${line}\n`);

    // ONE scan, and naming which one is the whole assertion. `commitChildren` marks the synthetic
    // container structurally dirty at every entry (a surface hands its top-level children over as a
    // whole array), so the container always re-derives. Every other node on this shape reads its
    // list off the record. A second scan means a node whose structure nothing recorded rebuilt its
    // list anyway — which is the reuse silently switching itself off.
    expect(profile.childScans, line).toBe(1);
    expect(profile.childListsReused, line).toBe(2);

    // MEASURED 2026-09-05, and recorded because the numbers are smaller than the intuition and the
    // intuition is what gets acted on. The walk was NEVER re-deriving a list per visited node: its
    // early exit returns before the child block, so a Select over 1 000 rows scanned THREE lists,
    // not 1 003. This change takes that 3 to 1.
    //
    //   childScans          3 -> 1
    //   childListsReused    0 -> 2
    //   childrenOf() calls  7 -> 5      counted at the tree.ts seam
    //
    // The five that remain are all the container's own entry bookkeeping — `markStructureDirty`'s
    // copy-on-write check, the two sweeps, the `dlog`, and the container's own re-derive — and NOT
    // ONE of them is inside the walk. That is the property this change is for
    // (`symbiote-fabric-cxx-surface` §9, step 2: the commit consumes the record rather than
    // re-deriving one), and it is the reason the assertion above is about `childScans` rather than
    // about time. The JS saving on this shape is a rounding error; what moved is what the walk
    // READS.
  });
});

describe('a create builds its child lists from the op log, not from node.children', () => {
  // The acceptance criterion `symbiote-fabric-cxx-surface` §8 states for item 4b, asserted through
  // the counters rather than through the seam, because the counters are what a device run reads
  // too. `childScans` is the flatten actually running; `childListsReplayed` is the op log serving
  // the list instead.
  //
  // MEASURED at the tree.ts seam on the same shapes, and this is the number the item is FOR:
  //
  //             childrenOf() calls per commit      before 4b   after 4b
  //   create 1000 rows, no anchors                     2005          4
  //   append 1000 rows, no anchors                     4006          6
  //
  // The append row is the mutation side rather than the walk: `recordStructureEdit` used to read
  // `parent.children` on EVERY structural mutation to answer a copy-on-write identity question that
  // can only be true once. Gated to the first op of the cycle, that is 2 001 -> 2.
  function buildRows(
    list: ReturnType<typeof createElement>,
    count: number,
    from: number,
    anchored: boolean,
  ): void {
    for (let index = from; index < from + count; index += 1) {
      const row = createElement('RCTView');
      setProp(row, 'testID', `row-${index}`);
      appendChild(row, createElement('RCTView'));
      if (anchored) {
        const anchor = createAnchor();
        appendChild(anchor, createElement('RCTView'));
        appendChild(row, anchor);
      }
      appendChild(list, row);
    }
  }

  it('replays every node of a flat create except the container', () => {
    const surface = createSurface(7302);
    const list = createElement('RCTView');
    buildRows(list, ROWS, 0, false);
    surface.appendChild(list);
    readCommitProfile();
    surface.commit();

    const profile = readCommitProfile();
    const line = `scans=${profile.childScans} replayed=${profile.childListsReplayed}`;
    // The ONE scan is the synthetic container: `commitChildren` hands its whole top-level list over
    // at once, which no sequence of child ops describes, so its log is poisoned and it re-derives.
    expect(profile.childScans, line).toBe(1);
    expect(profile.childListsReplayed, line).toBe(2 * ROWS + 1);
  });

  it('REFUSES to replay a parent holding an anchor, and says so in the counters', () => {
    // The negative half, and it is not a wart — it is `symbiote-fabric-cxx-surface` §8's own
    // prediction that a JS drain "handles anchors exactly as the walk does today", which is what
    // item 5 exists to change. A parent whose renderable list is not its desired list cannot have a
    // desired-space op replayed onto it: the fuzzer found that as ORACLE 1 when the refusal was
    // per-op instead of per-parent (an insert positioned before an anchor's FLATTENED grandchild
    // appends in one list and inserts mid-way in the other).
    //
    // So the row asserts the split rather than a win: the rows re-derive, everything below them
    // still replays. Angular mounts an anchor per composed component and is the adapter this
    // describes.
    const surface = createSurface(7303);
    const list = createElement('RCTView');
    buildRows(list, ROWS, 0, true);
    surface.appendChild(list);
    readCommitProfile();
    surface.commit();

    const profile = readCommitProfile();
    const line = `scans=${profile.childScans} replayed=${profile.childListsReplayed}`;
    // TWO per row, not one: the row refuses, and the flatten then RECURSES into the anchor to hoist
    // its children, which is a scan of its own. Plus the container. The first version of this row
    // expected `ROWS + 1` and the count said 2001 — worth keeping as the arithmetic, because a
    // reader pricing anchors will make the same omission.
    expect(profile.childScans, line).toBe(2 * ROWS + 1);
    expect(profile.childListsReplayed, line).toBe(2 * ROWS + 1);
  });
});

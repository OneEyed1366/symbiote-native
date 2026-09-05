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

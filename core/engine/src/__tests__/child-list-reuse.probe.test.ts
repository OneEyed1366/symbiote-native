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
  removeChild,
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

    // ZERO scans, and the zero is the point. This read ONE until 4c-3: the surface handed the
    // container its whole top-level list at once, which no sequence of child ops described, so the
    // container re-derived on every commit forever. It arrives as ops now
    // (`replaceContainerChildren`, commit.ts) and replays like anything else — so on this shape the
    // commit reads no child list at all. ANY scan here is a node whose structure nothing recorded
    // rebuilding its list anyway, which is the reuse silently switching itself off.
    expect(profile.childScans, line).toBe(0);
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

  it('replays EVERY node of a flat create, the container included', () => {
    const surface = createSurface(7302);
    const list = createElement('RCTView');
    buildRows(list, ROWS, 0, false);
    surface.appendChild(list);
    readCommitProfile();
    surface.commit();

    const profile = readCommitProfile();
    const line = `scans=${profile.childScans} replayed=${profile.childListsReplayed}`;
    // ZERO, and the container is why this row was renamed. Its whole top-level list arrives from the
    // surface at once, which used to be recorded as "changed, somehow" — so it re-derived on every
    // commit for the life of the app. It arrives as ops now, so nothing on this shape reads a child
    // list at all.
    expect(profile.childScans, line).toBe(0);
    expect(profile.childListsReplayed, line).toBe(2 * ROWS + 2);
  });

  it("replays a parent holding an anchor, reading only the ANCHOR's own list", () => {
    // The negative half of 4b, turned positive by item 5. It used to assert a REFUSAL, on 4b's own
    // reasoning that "a JS drain handles anchors exactly as the walk does today": a parent whose
    // renderable list is not its desired list could not have a desired-space op replayed onto it.
    //
    // That was true of the op-per-NODE replay and is not true of the op-per-CONTRIBUTION one. A
    // skipped child's effect on the renderable list is its contribution — nothing for a marker, its
    // flattened subtree for a hoisting anchor — so the ops splice contributions and the parent
    // replays. Angular mounts an anchor per composed component and is the adapter this is for.
    //
    // MEASURED on this shape, 1 000 rows, and the FOUR numbers are the whole claim — the first is
    // the one the item is for and the last is what says the other three are not an accounting trick:
    //
    //                          4b     item 5    4c-1    4c-3
    //   childrenOf() calls    2004      1004       4       —    counted at the tree.ts seam
    //   childScans            2001      1001       1       0    nothing reads a child list
    //   childFlattens         1000         0       0       0    the derivation is not reached
    //   childListsReplayed    2001      3001    3001    3002    the container replays too
    //
    // Item 5 left one desired-tree read standing — `flattenPure(anchor)`, once per anchor, to learn
    // what the anchor contributes. `flattenContribution` closed it: an anchor has an op log like any
    // other node, and on a create that log is its whole child list, so it replays from empty. 4c-3
    // then deleted `node.children` outright, so `childrenOf` is itself the replay and the column has
    // no meaning any more — what is left to count is `childScans`, and it is zero.
    const surface = createSurface(7303);
    const list = createElement('RCTView');
    buildRows(list, ROWS, 0, true);
    surface.appendChild(list);
    readCommitProfile();
    surface.commit();

    const profile = readCommitProfile();
    const line =
      `scans=${profile.childScans} replayed=${profile.childListsReplayed} ` +
      `contribReplayed=${profile.contributionsReplayed} ` +
      `contribDerived=${profile.contributionsDerived}`;
    // ZERO. The container was the last holdout and its list arrives as ops now, so on the shape
    // Angular emits — one anchor per composed component — a create reads no child list anywhere.
    expect(profile.childScans, line).toBe(0);
    // And none of it is the flatten proper: `flattenPure` is a read, `renderableChildren` is a read
    // plus a drain plus an allocation, and the second one no longer runs on this shape at all.
    // Asserted separately because `childScans` alone cannot tell the two apart.
    expect(profile.childFlattens, line).toBe(0);
    expect(profile.childListsReplayed, line).toBe(3 * ROWS + 2);
    // The pair that says the anchors were ANSWERED rather than skipped. A `contributionsDerived`
    // above zero here is the residual coming back — `childScans` would report it too, but only this
    // pair says which of the two mechanisms served each anchor.
    expect(profile.contributionsReplayed, line).toBe(ROWS);
    expect(profile.contributionsDerived, line).toBe(0);
  });

  it('REFUSES when an op names a child the parent HIDES — with the control beside it', () => {
    // The one refusal that survives item 5, and the only one that is not about a position. A hidden
    // child occupies a BLOCK of the renderable list whose extent the replay does not hold, and
    // recomputing it is unsound — an anchor detached from this parent can be edited afterwards with
    // nothing left to poison the parent's log. See `replayChildOps`.
    //
    // FOUND BY THE DIFFERENTIAL over 40 000 generated programs; this is the enumerated twin, so the
    // shape is readable without running the fuzzer.
    const surface = createSurface(7304);
    const list = createElement('RCTView');
    const row = createElement('RCTView');
    const anchor = createAnchor();
    appendChild(anchor, createElement('RCTView'));
    appendChild(row, anchor);
    appendChild(list, row);
    surface.appendChild(list);
    surface.commit();

    // THE CONTROL, and it runs FIRST so a `refuse` below cannot be read as "this shape never
    // replays". Same row, still holding the anchor, and an ordinary child removed from it: the
    // parent's renderable list is NOT its desired list and it replays anyway, which is exactly what
    // item 5 is for and what the 4b precondition forbade.
    const plain = createElement('RCTView');
    appendChild(row, plain);
    surface.commit();
    readCommitProfile();
    removeChild(row, plain);
    surface.commit();

    const control = readCommitProfile();
    const controlLine = `scans=${control.childScans} replayed=${control.childListsReplayed}`;
    // TWO replays — the row and the container, which stopped re-deriving in 4c-3 — and NO scan.
    expect(control.childListsReplayed, controlLine).toBe(2);
    expect(control.childScans, controlLine).toBe(0);

    // And now the refusal: the same row, the same commit shape, one op naming the ANCHOR.
    removeChild(row, anchor);
    surface.commit();

    const profile = readCommitProfile();
    const line = `scans=${profile.childScans} replayed=${profile.childListsReplayed}`;
    // ONE replay — the container — and ONE scan, which is the row that refused. Both numbers moved
    // by one in 4c-3 and they moved for the same reason: the container replays now, so it is no
    // longer a scan and it is a replay. What the row asserts is unchanged, and the control above is
    // what says so: `replayed` fell 2 -> 1 and `scans` rose 0 -> 1, which is exactly one parent
    // crossing from one column to the other.
    expect(profile.childListsReplayed, line).toBe(1);
    // No FLATTEN — by the time the walk reaches the row the anchor is already gone from its list, so
    // the probe finds no skipped child. That is what makes `childScans` and not `childFlattens` the
    // counter this row can be pinned on.
    expect(profile.childScans, line).toBe(1);
    expect(profile.childFlattens, line).toBe(0);
  });
});

// Where do the UNNAMED milliseconds of `applyOps` go?
//
// why: `raw-fabric-vs-engine.itest.ts` prints `applyMs=48.1 walk=24.7 decode=3.9 setProp=1.2
// strings=0.2 structure=1.2` and those subtract to 16.8 ms with no name on it — a third of our C++
// half, and a third of the ~50 ms the device projection says has to come out of a create (§17 of the
// measurement skill). **The 16.8 ms turned out to be Fabric's own commit**, which that line reports
// separately while it sits INSIDE `applyMs`; the subtraction, not the engine, was the defect.
// `tree-host.ts` says of the walk that "a subtraction gives a budget, not an address" — this file is
// what an address looks like, and the books close to 99 ns.
//
// It is kept because the attribution is worth standing: of the ~4.3 us a created node costs inside
// `applyOps`, about 1.0 us is OURS and about 3.3 us is Fabric's `createNode`, `ShadowTree::commit`
// and Yoga. There is no 50 ms hiding in the op loop, and a future reader reaching for one should be
// stopped here rather than after a day of it.
//
// The method is §7's: read a FACTOR, not a millisecond. Each kind is applied at two widths in one
// process and the SLOPE between them is the per-node cost — which cancels the fixed prologue
// (1.5-4.4 us, `small-batch-crossing-cost.itest.ts`) instead of trying to subtract it, and cancels
// whatever else is constant per batch.
//
// RUN ON `build-release` (`pnpm run bench:itest`). The assert build's list append is O(N^2).

import {
  appendChild,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const NARROW = 2_000;
const WIDE = 8_000;

type IPhases = {
  applyMs: number;
  decodeMs: number;
  setPropMs: number;
  structureMs: number;
  walkMs: number;
  // FABRIC'S OWN HALF, and leaving it out is how the first run of this file read a phantom
  // microsecond per node: `completeSurface` is called from inside `kOpCommit`, so `ShadowTree::commit`
  // and the Yoga pass are both INSIDE `applyMs` while being reported on their own counters. A
  // subtraction that forgets them bills the platform's commit to our op loop.
  commitMs: number;
  layoutMs: number;
};

function phasesOf(label: string): IPhases {
  const telemetry = readSurfaceTelemetry(ROOT_TAG);
  if (telemetry === undefined) throw new Error(`no telemetry after ${label}`);
  return {
    applyMs: telemetry.applyMs,
    decodeMs: telemetry.decodeMs,
    setPropMs: telemetry.setPropMs,
    structureMs: telemetry.structureMs,
    walkMs: telemetry.walkMs,
    commitMs: telemetry.commitMs,
    layoutMs: telemetry.layoutMs,
  };
}

/** `applyOps` with everything it can already account for taken off — the unnamed part. */
function unnamed(phases: IPhases): number {
  return (
    phases.applyMs -
    phases.decodeMs -
    phases.setPropMs -
    phases.structureMs -
    phases.walkMs -
    // `commitMs` ONLY, and `layoutMs` deliberately not: the Yoga pass runs INSIDE
    // `ShadowTree::commit` (`layoutIfNeeded`), so the two are nested and subtracting both drove the
    // unnamed remainder to -854 ns per node — a negative cost being the tell that a phase was
    // counted twice.
    phases.commitMs
  );
}

type IOpKind = 'create' | 'create-1v' | 'append' | 'setProp';

/**
 * Apply `count` ops of one kind in a single commit and return what the host spent.
 *
 * Every arm commits a tree of the SAME SHAPE — one container under the surface — so the walk and the
 * Fabric commit at the end are a constant the slope removes. Only the op count varies.
 */
function applyOps(kind: IOpKind, count: number): IPhases {
  const surface = createSurface(ROOT_TAG);
  const container = createElement('RCTView');
  routeProp(container, 'nativeID', 'container');
  surface.appendChild(container);

  // The nodes a `setProp` arm writes to have to EXIST before the timed batch, or the batch carries
  // creates as well and the slope is a blend of two kinds.
  const standing = [];
  if (kind === 'setProp') {
    for (let at = 0; at < count; at += 1) {
      const node = createElement('RCTView');
      routeProp(node, 'nativeID', `standing-${at}`);
      appendChild(container, node);
      standing.push(node);
    }
  }
  surface.commit();
  mounted();
  // Drained, so the setup commit is not billed to the one below.
  readSurfaceTelemetry(ROOT_TAG);

  if (kind === 'setProp') {
    for (const node of standing) routeProp(node, 'accessibilityLabel', 'x');
  } else {
    for (let at = 0; at < count; at += 1) {
      const node = createElement('RCTView');
      // ONE SHARED VALUE against a distinct one per node, and that is the whole of `create-1v`:
      // `mutation-buffer.ts` interns prop values, so a distinct id gives the batch one value-table
      // entry per node and a shared one gives it exactly one. If the unnamed cost follows the entry
      // count rather than the node count, it is the table's conversion and not the op loop.
      routeProp(
        node,
        'nativeID',
        kind === 'create-1v' ? 'same' : `fresh-${at}`,
      );
      // A `create` arm still has to attach its nodes or they never reach the host — the two kinds
      // differ by the SECOND op per node, which is what the pair of slopes separates.
      if (kind === 'append') appendChild(container, node);
      else surface.appendChild(node);
    }
  }
  surface.commit();
  return phasesOf(`${kind}@${count}`);
}

/** Per-op nanoseconds, from the slope between two widths. */
function slopeNs(narrow: number, wide: number): number {
  return ((wide - narrow) * 1_000_000) / (WIDE - NARROW);
}

function report1(kind: IOpKind): void {
  const narrow = applyOps(kind, NARROW);
  const wide = applyOps(kind, WIDE);

  print(
    `DEBUG ${kind.padEnd(8)} apply ${narrow.applyMs.toFixed(1)} -> ${wide.applyMs.toFixed(1)} ms · ` +
      `unnamed ${unnamed(narrow).toFixed(1)} -> ${unnamed(wide).toFixed(1)} · ` +
      `walk ${narrow.walkMs.toFixed(1)} -> ${wide.walkMs.toFixed(1)}`,
  );
  // EVERY phase, so the books close. A slope printed for `applyMs` and one other number is a
  // subtraction again, and the whole point of this file is to stop doing that.
  print(
    `DEBUG ${kind.padEnd(8)} PER NODE apply=${slopeNs(narrow.applyMs, wide.applyMs).toFixed(0)} ` +
      `= walk ${slopeNs(narrow.walkMs, wide.walkMs).toFixed(0)} ` +
      `+ decode ${slopeNs(narrow.decodeMs, wide.decodeMs).toFixed(0)} ` +
      `+ setProp ${slopeNs(narrow.setPropMs, wide.setPropMs).toFixed(0)} ` +
      `+ structure ${slopeNs(narrow.structureMs, wide.structureMs).toFixed(0)} ` +
      `+ fabric ${slopeNs(narrow.commitMs, wide.commitMs).toFixed(0)} ` +
      `(of which yoga ${slopeNs(narrow.layoutMs, wide.layoutMs).toFixed(0)}) ` +
      `+ UNNAMED ${slopeNs(unnamed(narrow), unnamed(wide)).toFixed(0)} ns`,
  );
}

describe('what one op costs the host, by kind', () => {
  // why: the cheapest op there is — a placeholder recorded against a slot, with no parent and no
  // props to convert. Whatever this costs is the floor every other kind pays on top of.
  it('prices a create op', () => {
    report1('create');
    expect(NARROW).toBeLessThan(WIDE);
  });

  // why: THE DISCRIMINATOR. Identical to the arm above in nodes, ops and structure; the only
  // difference is that every node writes the SAME prop value, so the batch's value table holds one
  // entry instead of one per node. A cost that follows the entry count is the table's; a cost that
  // follows the node count is the op loop's.
  it('prices a create op whose prop value is shared by every node', () => {
    report1('create-1v');
  });

  // why: the same create plus an attach, so the difference against the arm above is the structure
  // op alone — and `structureMs` already claims to name it, which makes this a check on that claim
  // as much as a measurement.
  it('prices a create-and-append pair', () => {
    report1('append');
  });

  // why: a write to a node that already stands, which is the only kind that has to resolve a slot
  // back to a node through `handles.getValueAtIndex` — the per-element JSI read §18 is about. If any
  // kind carries a microsecond, the prior says it is this one.
  it('prices a setProp op on a standing node', () => {
    report1('setProp');
  });
});

report();

// Does a surface that built and cleared a thousand rows give the memory back?
//
// FOUND BY READING THE SAME TRACKER AS §18j. octanejs/octane#1007 did not turn on elapsed time in
// the end — it turned on two rows of its table that no instrument here could produce:
//
//   Live JS after GC       54.10 MB   against the other renderer's  0.37 MB
//   Live JS after unmount   0.22 MB                                 0.23 MB
//
// Live-after-unmount matched; live-after-GC did not. The renderer was holding a tree it had been
// told to drop, and only a heap reading says so — a wall clock on a create cannot, and neither can
// a mutation count, because the platform WAS told to delete the views.
//
// It is a fair suspicion for us specifically, and facebook/hermes#982 names the mechanism: the
// collector sees a `HostObject` as a small JS object and has no idea what native memory hangs off
// it. Our handles are exactly that — JS objects carrying `NativeState` that points at C++ nodes in
// `SymbioteTree`. If JS drops a row and C++ does not, the JS heap looks clean while the native side
// grows, and nothing in this directory would notice.
//
// So this file asserts a CONTRACT rather than printing a number: **a surface that has built and
// cleared a thousand rows holds no more than it did before.** Repeated over several cycles, because
// a leak of one row list is a slope and not a step — one cycle cannot tell a leak from a high-water
// mark.
//
// BOTH HALVES ARE READ. The heap answers for JS; `liveNodes` — a level the C++ tree keeps and the
// one counter `readSurfaceTelemetry` does not drain on read — answers for the other side. Ownership
// makes the second follow from the first (a node lives while a parent holds it or while JS names it
// through `NativeState`), but "follows from" is an inference, and the shape it would miss is exactly
// the one software-mansion/react-native-reanimated#10527 describes: a container keyed by surface
// that nothing empties, holding a root alive after the surface is gone.
//
// HERMES ONLY — JavaScriptCore reports an empty heap map by jsi's own default, so the case skips.
//
// RUN ON `bench:itest`.

import {
  appendChild,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
} from '@symbiote-native/engine';

import {
  collectGarbage,
  committedTags,
  describe,
  expect,
  heapInfo,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;
const CYCLES = 4;

// A leak of one row list is ~3 MB at the engine's measured 3 175 bytes/node (§18j), so a budget an
// order of magnitude under that separates "gave it back" from "kept a list" without turning into a
// noise gate.
const DRIFT_BUDGET = 512 * 1024;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };

/** Live bytes after a full collection, or undefined on an engine that reports none. */
function liveAfterGc(): number | undefined {
  collectGarbage();
  return heapInfo().hermes_allocatedBytes;
}

/**
 * Build `ROWS` rows into a fresh surface, commit, then clear it and commit again.
 *
 * BREAK-TESTED by pushing every node into a module-scope array here: live went
 * 1.06 -> 1.43 -> 1.79 -> 2.18 MB, a clean ~370 KB per cycle, and the case failed with an assertion
 * rather than a throw. A leak has the shape of a slope, which is why the reading is cycle over cycle.
 */
function buildAndClear(): void {
  const surface = createSurface(ROOT_TAG);
  const list = createElement('RCTView');
  routeProp(list, 'style', { flex: 1 });
  for (let at = 0; at < ROWS; at += 1) {
    const node = createElement('RCTView');
    routeProp(node, 'style', ROW_STYLE);
    appendChild(list, node);
  }
  surface.appendChild(list);
  surface.commit();
  mounted();

  surface.clear();
  surface.commit();
  mounted();
}

describe('what a surface holds after it has been cleared', () => {
  // why: THE CONTRACT. A cleared surface is one an app has navigated away from, and a renderer that
  // keeps its rows keeps them on a device where the heap is a tenth of this one's. The read is
  // cycle over cycle rather than before/after, because a single pair cannot tell a leak from the
  // high-water mark a first build legitimately leaves behind.
  it('gives the memory back, cycle after cycle', () => {
    // DISCARDED: the first cycle in a process pays module state, lazy registries and the surface's
    // own container, none of which is a leak and all of which lands in a before/after pair.
    buildAndClear();

    const floor = liveAfterGc();
    if (floor === undefined) {
      print('DEBUG RETENTION SKIPPED — this engine reports no heap info');
      return;
    }

    const live: number[] = [];
    const nodes: number[] = [];
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      buildAndClear();
      const after = liveAfterGc();
      if (after === undefined) throw new Error('the heap stopped reporting');
      live.push(after);
      // READ AFTER THE COLLECTION, not before: a node is released when its last owner goes, and the
      // JS handle is one of the two owners. Asking first reads the tree before the GC has let go.
      nodes.push(readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1);
    }

    const last = live[CYCLES - 1];
    const first = live[0];
    if (last === undefined || first === undefined) {
      throw new Error('a cycle produced no reading');
    }
    print(
      `DEBUG RETENTION floor ${(floor / 1_048_576).toFixed(2)} MB · ` +
        live.map(bytes => `${(bytes / 1_048_576).toFixed(2)}`).join(' -> ') +
        ` MB · drift ${((last - first) / 1_024).toFixed(0)} KB over ${CYCLES - 1} cycles`,
    );

    // THE TREE IS ACTUALLY EMPTY, asserted before the bytes mean anything: a `clear` that quietly
    // failed would leave the rows standing, the heap would climb for a correct reason, and the case
    // would report a leak that is really a broken fixture (§1 — read the counters first).
    expect(committedTags().length).toBeLessThan(ROWS);

    // The drift across cycles, not the absolute live heap: a renderer is allowed a high-water mark,
    // it is not allowed to grow one per cycle.
    expect(last - first).toBeLessThan(DRIFT_BUDGET);

    // THE NATIVE HALF, and it is a harder claim than the heap's: nodes are counted rather than
    // sampled, so the tree must hold FEWER than one cycle's worth after a cycle that cleared. A
    // container keyed by surface that nothing empties would show up here as a straight staircase.
    const lastNodes = nodes[CYCLES - 1];
    const firstNodes = nodes[0];
    if (lastNodes === undefined || firstNodes === undefined) {
      throw new Error('a cycle produced no node count');
    }
    // EMPTY CYCLES LAST, and they are what tell a LAG from retention. The count above sits at a
    // fixed number of lists on every cycle, which has two readings: the tree keeps them forever, or
    // it keeps the LAST ones until something supersedes them. Opening empty surfaces distinguishes
    // them, and only the first reading would be a defect.
    //
    // MORE THAN ONE, and the reason is a real difference between the two ways this file gets run.
    // On `-O0` — which is what `evaluateJavaScript` compiles, so what the harness did for its whole
    // life — the tree settles to 1 after a single empty surface. On `hermesc -O`, the shape a device
    // runs (`SYMBIOTE_ITEST_BYTECODE=1`), it holds TWO lists per cycle instead of one and needs a
    // second empty surface: the optimizer keeps a local alive across the collection that `-O0` had
    // already dropped. Flat either way, which is the claim; the number of steps is not.
    let settled = -1;
    for (let empty = 0; empty < 3; empty += 1) {
      createSurface(ROOT_TAG).commit();
      mounted();
      liveAfterGc();
      settled = readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1;
      if (settled < ROWS) break;
    }

    print(
      `DEBUG RETENTION liveNodes ${nodes.join(' -> ')} · after an empty surface ${settled}`,
    );
    expect(lastNodes - firstNodes).toBeLessThan(ROWS);
    // The tree gives the LAST lists back too, once surfaces that do not need them exist. The loop
    // above stops the moment it does, so a tree that really kept them fails here rather than being
    // given unlimited attempts.
    expect(settled).toBeLessThan(ROWS);
  });
});

report();

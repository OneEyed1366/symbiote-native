// Is Solid's `Clear` quadratic in the width of the list?
//
// why: it is the largest single anomaly this project has measured. The bench suite reports
// `clear=402-426 ms` against stock's 14, and the engine's own halves read `walk=0.1 apply=13.8
// fabric=2.1` — sixteen milliseconds of a four-hundred-millisecond step, with `created=0 cloned=2`.
// So ~410 ms is Solid's own JS above the engine, and nothing says what shape it has.
//
// A FACTOR, NOT A MILLISECOND, which is the right instrument for a complexity claim and the one
// `child-list-scaling.itest.ts` already uses here: linear work doubles when the list doubles,
// quadratic quadruples. A single wall clock at one width cannot tell those apart, and a four-hundred
// millisecond step is exactly the size where "it is just slow" and "it is O(N squared)" look the same.
//
// A FRESH LIST PER WIDTH, and per sample. A cleared list has nothing left to remove, so re-timing the
// same one reports a beautifully flat curve for the wrong reason — the trap `child-list-scaling`
// records having paid for.
//
// RUN ON `build-release` (`pnpm run bench:itest`). The assert build compiles in Yoga's consistency
// checks, which are themselves O(N) per append — measuring a complexity claim there would report a
// quadratic that does not exist off this harness.

import { For, type JSX } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';

import { setTreeHost, treeHost } from '@symbiote-native/engine';
import { mount } from '@symbiote-native/solid';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  type IBenchRow,
} from './bench-suite';
import {
  committedTags,
  describe,
  expect,
  flushTimers,
  it,
  mounted,
  print,
  report,
} from './harness';

/** The device row, ten nodes — the same one every arm of the suite builds. */
function Row(props: { row: IBenchRow }): JSX.Element {
  return (
    <view style={ROW_STYLE} testID={`row-${props.row.id}`}>
      <text ellipsizeMode="tail">{String(props.row.id)}</text>
      <view style={CELL_STYLE}>
        <text ellipsizeMode="tail">{props.row.label}</text>
      </view>
      <view style={CELL_STYLE}>
        <text ellipsizeMode="tail">x</text>
      </view>
      <text-input style={INPUT_STYLE} text={props.row.label} />
    </view>
  );
}

const [state, setState] = createStore<{ rows: readonly IBenchRow[] }>({
  rows: [],
});

function Screen(): JSX.Element {
  return (
    <view style={{ flex: 1 }}>
      <For each={state.rows}>{entry => <Row row={entry} />}</For>
    </view>
  );
}

let nextId = 1;
function buildRows(count: number): IBenchRow[] {
  const rows: IBenchRow[] = [];
  for (let index = 0; index < count; index += 1) {
    rows.push({ id: nextId, label: `row ${nextId}` });
    nextId += 1;
  }
  return rows;
}

// ── WHAT THE CLEAR ASKS THE HOST ─────────────────────────────────────────────────────────────────
//
// A wall clock says a step is slow; a call count says what shape it is. Wrapping the installed host
// works here exactly as it does under the recording one — `setTreeHost` takes whatever it is given,
// and the native host is just an object.

type ICounts = {
  parentOf: number;
  childrenOf: number;
  /**
   * HOW MANY HANDLES those child-list reads returned, which is the number that decides the shape.
   *
   * A call count can be linear while the work is quadratic: `firstChildOf` is spelled
   * `childrenOf(node)[0]`, so emptying a list one child at a time reads a shrinking list N times and
   * crosses N²/2 handles to use N of them. `nextSiblingOf` had exactly this and was given its own
   * host member for it; this is the same measurement for the same reason.
   */
  childHandles: number;
  nextSiblingOf: number;
  applyOps: number;
  subtreesOf: number;
};

const counts: ICounts = {
  parentOf: 0,
  childrenOf: 0,
  childHandles: 0,
  nextSiblingOf: 0,
  applyOps: 0,
  subtreesOf: 0,
};

function countHostReads(): void {
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  setTreeHost({
    ...base,
    parentOf: handle => {
      counts.parentOf += 1;
      return base.parentOf(handle);
    },
    childrenOf: handle => {
      counts.childrenOf += 1;
      const children = base.childrenOf(handle);
      counts.childHandles += children.length;
      return children;
    },
    nextSiblingOf: handle => {
      counts.nextSiblingOf += 1;
      return base.nextSiblingOf(handle);
    },
    subtreesOf: roots => {
      counts.subtreesOf += 1;
      return base.subtreesOf(roots);
    },
    applyOps: batch => {
      counts.applyOps += 1;
      base.applyOps(batch);
    },
  });
}

function takeCounts(): ICounts {
  const taken = { ...counts };
  counts.parentOf = 0;
  counts.childrenOf = 0;
  counts.childHandles = 0;
  counts.nextSiblingOf = 0;
  counts.applyOps = 0;
  counts.subtreesOf = 0;
  return taken;
}

const NODES_PER_ROW = 10;
/** The root, the container `createSurface` puts under it, and the screen's own wrapper. */
const CHROME = 3;
const WIDTHS = [250, 500, 1_000, 2_000] as const;
const SAMPLES = 3;

describe('what Solid Clear costs as the list widens', () => {
  it('reads the doubling factor of a full clear', () => {
    const surface = mount(ROOT_TAG, Screen);
    flushTimers();
    surface.commit();
    mounted();
    countHostReads();

    const fill = (rows: readonly IBenchRow[]): void => {
      setState(reconcile({ rows }, { key: 'id' }));
      flushTimers();
      surface.commit();
      mounted();
    };

    const clearMs: number[] = [];
    const handles: number[] = [];
    let clearCounts: ICounts | undefined;
    for (const width of WIDTHS) {
      const samples: number[] = [];
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        // A FRESH list every sample: a cleared list has nothing left to remove.
        fill(buildRows(width));
        // THE ORACLE, before the clock: a step that built nothing clears instantly.
        expect(committedTags().length).toBe(width * NODES_PER_ROW + CHROME);

        takeCounts();
        const startedAt = performance.now();
        setState(reconcile({ rows: [] }, { key: 'id' }));
        flushTimers();
        surface.commit();
        samples.push(performance.now() - startedAt);
        clearCounts = takeCounts();
        mounted();

        expect(committedTags().length).toBe(CHROME);
      }
      // TIMING NOISE IS ONE-SIDED — it only ever ADDS — so the minimum of several runs is the
      // closest reading to the work itself, while a mean carries every interruption into the ratio.
      const best = Math.min(...samples);
      clearMs.push(best);
      print(
        `DEBUG clear ${String(width).padStart(5)} rows  best=${best.toFixed(1).padStart(7)} ms ` +
          `of [${samples.map(one => one.toFixed(1)).join(' ')}] · host reads: ` +
          `parentOf=${clearCounts?.parentOf ?? 0} children=${clearCounts?.childrenOf ?? 0} ` +
          `childHandles=${clearCounts?.childHandles ?? 0} ` +
          `sibling=${clearCounts?.nextSiblingOf ?? 0} subtrees=${clearCounts?.subtreesOf ?? 0} ` +
          `applyOps=${clearCounts?.applyOps ?? 0}`,
      );
      handles.push(clearCounts?.childHandles ?? 0);
    }

    const factors = clearMs
      .slice(1)
      .map((each, at) => (each / clearMs[at]).toFixed(2));
    print(
      `DEBUG FACTOR  clear doubling = ${factors.join(' ')} ` +
        `(linear ~2.0 · quadratic ~4.0)`,
    );

    print(
      `DEBUG HANDLES childHandles per width = ${handles.join(' ')} ` +
        `for widths ${WIDTHS.join(' ')}`,
    );

    // why: emptying a list is N removals, so the host should hand JS about N handles to do it — one
    // per child it is asked for. Reading the whole remaining list to take its first element crosses
    // N²/2 instead, and that is the entire shape of this step. The bound is generous (4x the row
    // count) so it fails on the quadratic and passes on any sane linear spelling.
    const widest = WIDTHS[WIDTHS.length - 1];
    expect(handles[handles.length - 1] < widest * 4).toBe(true);
  });
});

report();

// @symbiote-platform-extensions
//
// THE CONTROL for the standing-tree finding: does a big tree slow REACT'S OWN renderer too?
//
// why: `surface-width-cost.itest.ts` found that 50 000 already-standing nodes make an identical
// thousand-row create 35-44% slower on our engine, while 800 untouched siblings cost nothing — the
// first mechanism with the right shape for the headless-versus-device gap, because a fixture starts
// empty and an app never does. That finding is only OURS if the same load does not do the same thing
// to the baseline. A cost both stacks pay is the platform's and explains no gap at all.
//
// So this is the same experiment on the stock renderer: a thousand rows appended to a container that
// already stands beside 0 and beside 5 000 rows, with the standing block MEMOISED so React bails out
// of it exactly as our commit skips nodes nothing touched. Whatever separates the two arms is what a
// big tree costs React.
//
// RUN ON `build-release` (`pnpm run bench:itest`). A development React cannot drive
// `ReactFabric-prod`.

import { createElement as h, memo, type ReactNode } from 'react';

import { describe, expect, flushTimers, it, print, report } from './harness';
import { loadStockRenderer } from './stock-renderer';

const ROOT_TAG = 1;
const ROWS = 1_000;
const STANDING_ROWS = 5_000;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };

/** The suite's row through the stock renderer: three views, three texts, three raw texts. */
function row(id: number): ReactNode {
  const label = (text: string): ReactNode =>
    h('RCTText', { ellipsizeMode: 'tail' }, text);

  return h(
    'RCTView',
    { key: id, style: ROW_STYLE, nativeID: `row-${id}` },
    label(String(id)),
    h('RCTView', { style: CELL_STYLE }, label(`row ${id}`)),
    h('RCTView', { style: CELL_STYLE }, label('x')),
  );
}

/**
 * The standing block, MEMOISED with no props so React bails out of it on the second render.
 *
 * Without the memo this arm would be measuring React reconciling five thousand unchanged rows, which
 * is a real cost but a different question — our own arm's standing rows are never visited by the
 * mutation that appends beside them, so the control has to give React the same exemption.
 */
const Standing = memo(function StandingView(): ReactNode {
  const rows = [];
  for (let id = 0; id < STANDING_ROWS; id += 1) rows.push(row(1_000_000 + id));
  return h('RCTView', { style: CELL_STYLE }, ...rows);
});

function timeArm(label: string, withStanding: boolean): number {
  const renderer = loadStockRenderer();

  const screen = (fresh: readonly ReactNode[]): ReactNode =>
    h(
      'RCTView',
      { style: { flex: 1 } },
      withStanding ? h(Standing, { key: 'standing' }) : null,
      h('RCTView', { key: 'list', style: { flex: 1 } }, ...fresh),
    );

  // Standing and committed before the clock, exactly as the engine arm does it.
  renderer.render(screen([]), ROOT_TAG, null, null);
  flushTimers();

  const fresh = [];
  for (let id = 0; id < ROWS; id += 1) fresh.push(row(id));

  const startedAt = performance.now();
  renderer.render(screen(fresh), ROOT_TAG, null, null);
  flushTimers();
  const wall = performance.now() - startedAt;

  print(`DEBUG ${label.padEnd(9)} wall=${wall.toFixed(1)} ms`);

  // Empties the fiber tree so the next arm starts from nothing rather than diffing against this one.
  renderer.render(null, ROOT_TAG, null, null);
  flushTimers();
  return wall;
}

// `__DEV__` is the runner's own define and it tracks the build. See `stock-text-input-cost.itest.tsx`
// for why a development React cannot host this at all, and why the failure would be silent.
declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

const SKIP_NOTE =
  'DEBUG stock standing-heap cost SKIPPED — needs the bench build (pnpm run bench:itest)';

let empty: number | undefined;

describe('what a standing tree costs React own renderer', () => {
  // why: the baseline — a thousand rows appended to a container with nothing beside it.
  it('appends a thousand rows with nothing standing', () => {
    if (!canHostStock) {
      print(SKIP_NOTE);
      return;
    }
    empty = timeArm('empty', false);
    expect(empty).toBeGreaterThan(0);
  });

  // why: the same append with 50 000 nodes already standing and memoised out of the render. Our
  // engine pays 35-44% for this; the question is whether React does.
  it('appends the same thousand rows with 50 000 nodes standing', () => {
    if (!canHostStock) {
      print(SKIP_NOTE);
      return;
    }
    const loaded = timeArm('loaded', true);

    if (empty === undefined) throw new Error('the empty arm did not run');

    const delta = loaded - empty;
    print(
      `DEBUG HEAP      empty=${empty.toFixed(1)} loaded=${loaded.toFixed(1)} ms · ` +
        `${STANDING_ROWS * 10} standing nodes cost React ${delta.toFixed(1)} ms ` +
        `(${((delta / empty) * 100).toFixed(0)}%) — ours pays 35-44%`,
    );
  });
});

report();

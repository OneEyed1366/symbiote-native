// What OUR two pressable cells cost, against the plain views the headless arms use in their place.
//
// why: the mirror of `stock-row-components-cost.itest.tsx`, and it exists so that correction does not
// become a one-sided one. Both DEVICE benchmark screens put a `<Pressable>` in each of the row's two
// cells (`examples/react/screens/BenchmarkScreen.tsx:396`, `examples/bare-rn:404`); both headless
// arms put a plain view there. So the suite is internally consistent — every arm builds the same
// three views, three texts and one input — while NEITHER side is the row its own example ships.
//
// That gap is priced on the stock side already: RN's two `<Pressable>`s cost ~68 ms per thousand
// rows, ~34 us each. This is the same question asked of ours, and it is the half that decides
// whether correcting only stock flattered us. A `pressable` tag is not free here either: it reaches
// a host behavior that attaches a press machine, which `reconciler-floor.itest.tsx` prices at
// 15-17 us for a tagged primitive.
//
// RUN ON `build-release` (`pnpm run bench:itest`). The assert build makes list append O(N^2).

import { createElement as h, memo } from 'react';

import { mount } from '@symbiote-native/react';

import { CELL_STYLE, INPUT_STYLE, ROOT_TAG, ROW_STYLE } from './bench-suite';
import {
  committedShape,
  describe,
  expect,
  flushTimers,
  it,
  print,
  report,
} from './harness';

const ROWS = 1_000;

/** Every committed view name and how many of each — the comparability check, before any clock. */
function census(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of committedShape().matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)\(/g,
  )) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return counts;
}

function censusText(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}=${count}`)
    .join(' ');
}

const noop = (): void => {};

/**
 * The row, with the two CELLS left to the caller. Everything else is `react-suite.itest.tsx`'s row
 * verbatim — a different row would be a different workload, which is the mistake this directory
 * records three times in its own headers.
 */
function makeRow(cellTag: string): ReturnType<typeof memo> {
  return memo(function RowView({ id }: { id: number }): ReturnType<typeof h> {
    const label = (text: string): ReturnType<typeof h> =>
      h('text', { ellipsizeMode: 'tail' }, text);
    const cellProps =
      cellTag === 'pressable'
        ? { style: CELL_STYLE, onPress: noop }
        : { style: CELL_STYLE };

    return h(
      'view',
      { style: ROW_STYLE, testID: `row-${id}` },
      label(String(id)),
      h(cellTag, cellProps, label(`row ${id}`)),
      h(cellTag, cellProps, label('x')),
      h('text-input', { style: INPUT_STYLE, text: `row ${id}` }),
    );
  });
}

function timeArm(
  label: string,
  cellTag: string,
): { wall: number; census: string; nodes: number } {
  const Row = makeRow(cellTag);
  const rows = [];
  for (let id = 0; id < ROWS; id += 1) rows.push(h(Row, { key: id, id }));

  const startedAt = performance.now();
  const surface = mount(ROOT_TAG, h('view', { style: { flex: 1 } }, ...rows));
  flushTimers();
  surface.commit();
  const wall = performance.now() - startedAt;

  const counts = census();
  let nodes = 0;
  for (const count of counts.values()) nodes += count;
  print(
    `DEBUG ${label.padEnd(10)} census :: ${censusText(counts)} (${nodes} nodes)`,
  );
  print(`DEBUG ${label.padEnd(10)} wall=${wall.toFixed(1)} ms`);
  return { wall, census: censusText(counts), nodes };
}

let views: ReturnType<typeof timeArm> | undefined;

describe('what the row pays for pressable cells instead of plain views', () => {
  // why: exactly the cell every headless arm builds today — a plain `view` tag, no behavior above it.
  it('builds the row with plain view cells, as every suite arm does', () => {
    views = timeArm('view', 'view');
  });

  // why: the cell both example screens actually ship. A `pressable` reaches a host behavior that
  // attaches a press machine, and the question is whether ours costs more per instance than RN's
  // ~34 us — which is what would make a device row diverge from a headless one on our side and not
  // on stock's.
  it('builds the same row with pressable cells, as both example screens do', () => {
    const pressables = timeArm('pressable', 'pressable');

    if (views === undefined) throw new Error('the view arm did not run');

    const delta = pressables.wall - views.wall;
    print(
      `DEBUG COST       view=${views.wall.toFixed(1)} pressable=${pressables.wall.toFixed(1)} ms · ` +
        `two pressable cells cost ${delta.toFixed(1)} ms per ${ROWS} rows ` +
        `= ${((delta * 1_000) / (ROWS * 2)).toFixed(1)} us each · RN's own is ~34`,
    );

    // THE COMPARABILITY GATE. A pressable commits one view exactly as a plain view does, so the two
    // rows are one workload and the delta above is the behavior and nothing else. If this ever
    // fails, the tag started emitting a different tree and the clock above means nothing.
    expect(pressables.census).toBe(views.census);
    expect(pressables.nodes).toBe(views.nodes);
  });
});

report();

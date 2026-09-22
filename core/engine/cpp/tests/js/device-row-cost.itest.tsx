// The device screen's OWN row, built headless, so the residual between the two rulers is a number
// rather than an estimate.
//
// why: seven structural candidates for the headless-versus-device gap have been priced and
// eliminated one at a time (see the measurement skill). Each was measured in isolation — the
// components, the class path, the pressable cells, the screen's width. This builds the row
// `examples/react/screens/BenchmarkScreen.tsx:390-406` actually ships, ALL of it at once: class
// names instead of style objects, two `pressable` cells carrying handlers, the input written the way
// that screen writes it. Against the suite's row in the same process, on one ruler.
//
// What it buys: the device measured 230.2 ms for this row's create. Whatever this file reads is the
// part of that a JavaScriptCore test host can account for, and the difference is the part that
// belongs to the device runtime and to nothing else. An eliminated candidate says what the gap is
// NOT; this says how big what is left actually is.
//
// RUN ON `build-release` (`pnpm run bench:itest`). The assert build's list append is O(N^2).

import { createElement as h, memo } from 'react';

import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { mount } from '@symbiote-native/react';

import { ROOT_TAG } from './bench-suite';
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

// The screen's own stylesheet, as classes — `examples/react/screens/BenchmarkScreen.css`. Values
// matter only in that they are the same ones the suite's row writes inline, so the two arms resolve
// to the same payload and differ in the WRITE path alone.
const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

const CLASS_RULES = [
  {
    tokens: ['bench-row'],
    specificity: [0, 1, 0] as const,
    order: 0,
    style: ROW_STYLE,
  },
  {
    tokens: ['bench-row-id'],
    specificity: [0, 1, 0] as const,
    order: 1,
    style: CELL_STYLE,
  },
  {
    tokens: ['flex1'],
    specificity: [0, 1, 0] as const,
    order: 2,
    style: CELL_STYLE,
  },
  {
    tokens: ['bench-row-label'],
    specificity: [0, 1, 0] as const,
    order: 3,
    style: CELL_STYLE,
  },
  {
    tokens: ['bench-row-remove'],
    specificity: [0, 1, 0] as const,
    order: 4,
    style: CELL_STYLE,
  },
  {
    tokens: ['bench-row-remove-text'],
    specificity: [0, 1, 0] as const,
    order: 5,
    style: CELL_STYLE,
  },
  {
    tokens: ['bench-row-input'],
    specificity: [0, 1, 0] as const,
    order: 6,
    style: INPUT_STYLE,
  },
];

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

// `react-suite.itest.tsx:28-49` verbatim: style objects, plain `view` cells, no handlers.
const SuiteRow = memo(function SuiteRowView({
  id,
}: {
  id: number;
}): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h('text', { ellipsizeMode: 'tail' }, text);

  return h(
    'view',
    { style: ROW_STYLE, testID: `row-${id}` },
    label(String(id)),
    h('view', { style: CELL_STYLE }, label(`row ${id}`)),
    h('view', { style: CELL_STYLE }, label('x')),
    h('text-input', { style: INPUT_STYLE, text: `row ${id}` }),
  );
});

// `examples/react/screens/BenchmarkScreen.tsx:390-406` verbatim, minus the selected-row branch: the
// class names it writes, the two pressables it mounts, the handlers they carry, the controlled input.
const DeviceRow = memo(function DeviceRowView({
  id,
}: {
  id: number;
}): ReturnType<typeof h> {
  return h(
    'view',
    { className: 'bench-row' },
    h('text', { className: 'bench-row-id' }, String(id)),
    h(
      'pressable',
      { className: 'flex1', onPress: noop },
      h('text', { className: 'bench-row-label' }, `row ${id}`),
    ),
    h(
      'pressable',
      { className: 'bench-row-remove', onPress: noop },
      h('text', { className: 'bench-row-remove-text' }, '×'),
    ),
    h('text-input', { className: 'bench-row-input', value: `row ${id}` }),
  );
});

function timeArm(
  label: string,
  Row: typeof SuiteRow,
): { wall: number; census: string; nodes: number } {
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
    `DEBUG ${label.padEnd(11)} census :: ${censusText(counts)} (${nodes} nodes)`,
  );
  print(`DEBUG ${label.padEnd(11)} wall=${wall.toFixed(1)} ms`);
  return { wall, census: censusText(counts), nodes };
}

// What `examples/react` measured for this very row on the iOS 26.5 simulator, Release, three
// sittings. Quoted so the residual below is computed against a recorded number rather than a
// remembered one.
const DEVICE_WALL_MS = 230.2;

let suite: ReturnType<typeof timeArm> | undefined;

describe('the device screen row against the suite row, on one ruler', () => {
  // why: the baseline every published headless number is made of.
  it('builds the suite row', () => {
    suite = timeArm('suite row', SuiteRow);
  });

  // why: the row the device actually commits — classes, pressables, handlers and all. The point is
  // not which is faster but how much of the device's 230 ms this host can account for.
  it('builds the device row', () => {
    registerRules(CLASS_RULES);
    const device = timeArm('device row', DeviceRow);

    if (suite === undefined) throw new Error('the suite arm did not run');

    const residual = DEVICE_WALL_MS - device.wall;
    print(
      `DEBUG RESIDUAL  suite=${suite.wall.toFixed(1)} device-row-here=${device.wall.toFixed(1)} ` +
        `device-measured=${DEVICE_WALL_MS} ms · this host accounts for ` +
        `${((device.wall / DEVICE_WALL_MS) * 100).toFixed(0)}%, leaving ${residual.toFixed(1)} ms ` +
        `to the device runtime`,
    );

    // THE COMPARABILITY GATE: both rows commit the same ten nodes, so the delta between them is the
    // write path and the press machines, and the residual above is not hiding a bigger tree.
    expect(device.census).toBe(suite.census);
    clearGlobalStyles();
  });
});

report();

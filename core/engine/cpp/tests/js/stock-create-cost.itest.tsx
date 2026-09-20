// @symbiote-platform-extensions
//
// A thousand rows built by React's OWN Fabric renderer — the headline metric, against stock, without
// a simulator.
//
// why: "how fast are we against stock React Native" is the first number anyone reads and the only
// one this project has never been able to take headlessly. `adapter-create-cost.itest.tsx` has the
// engine's own mutation API, React through our adapter and Vue through ours, all on one ten-node
// row; the column they are all read against has only ever come off a device. Now that
// `ReactFabric-prod` stands up in this harness (`stock-renderer-probe.itest.tsx`), it can be a
// fixture.
//
// ONE FILE PER ARM, and that is the methodology rather than convenience: the runner spawns a process
// per file, so two arms share a machine and a build but not a heap. That removes the ~3%-per-arm
// contamination this directory has measured, and removes the question of whether two renderers can
// hold the harness's single surface (`kSurfaceId = 1`) at once.
//
// WHAT MAKES IT COMPARABLE, checked before any millisecond is read: the same ten nodes per row, and
// the census asserts them by absolute count. This directory has twice paid for reading ms off columns
// that turned out to be different workloads — a missing `TextInput` read as 1.31x, and Angular's flat
// row agreed on every structural counter while 19% of the prop keys were absent.
//
// RUN ON `build-release` (`pnpm run bench:itest`), and here that is not a preference: a development
// React cannot drive `ReactFabric-prod` at all. See `isBenchBuild` in `scripts/run-itests.mjs`.

import { createElement as h } from 'react';

import {
  committedShape,
  describe,
  expect,
  flushTimers,
  it,
  mounted,
  print,
  report,
} from './harness';
import { loadStockRenderer } from './stock-renderer';

const ROOT_TAG = 1;
const ROWS = 1_000;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

/** The ten-node row `adapter-create-cost.itest.tsx` builds, in React Native's own host names. */
function row(id: number): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h('RCTText', { ellipsizeMode: 'tail' }, text);

  return h(
    'RCTView',
    { key: id, style: ROW_STYLE, nativeID: `row-${id}` },
    label(String(id)),
    h('RCTView', { style: CELL_STYLE }, label(`row ${id}`)),
    h('RCTView', { style: CELL_STYLE }, label('x')),
    h('RCTSinglelineTextInputView', {
      style: INPUT_STYLE,
      text: `input ${id}`,
    }),
  );
}

/** How many of each view name the committed SHADOW tree holds. */
function census(shape: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of shape.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(/g)) {
    const name = match[1];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

// `__DEV__` is the runner's own define and it tracks the build. See `stock-swap-cost.itest.tsx`.
declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

describe('what a create costs through stock React Native', () => {
  it('builds 1 000 rows of ten nodes', () => {
    if (!canHostStock) {
      print(
        'DEBUG stock create SKIPPED — needs the bench build (pnpm run bench:itest)',
      );
      return;
    }

    // A failing stock render is SILENT — React retries and reports through RN's error dialog into
    // `console.error`, leaving a component that ran and a surface holding `RootView()`. Surfaced
    // permanently, because a create measured against an empty tree reads near zero and passes any
    // comparison that only checks before against after.
    const console_ = (globalThis as Record<string, unknown>).console;
    if (typeof console_ === 'object' && console_ !== null) {
      const bag = console_ as Record<string, unknown>;
      bag.error = (...args: unknown[]) => {
        print(
          `DEBUG stock console.error: ${args.map(String).join(' ')}`.slice(
            0,
            300,
          ),
        );
      };
      bag.warn = bag.error;
    }

    const { render } = loadStockRenderer();
    const rows = [];
    for (let id = 0; id < ROWS; id += 1) rows.push(row(id));

    const startedAt = performance.now();
    render(h('RCTView', { style: { flex: 1 } }, ...rows), ROOT_TAG);
    flushTimers();
    const wall = performance.now() - startedAt;
    mounted();

    const built = census(committedShape());
    print(
      `DEBUG stock create wall=${wall.toFixed(1)} :: ${[...built.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => `${name}=${count}`)
        .join(' ')}`,
    );

    // THE ORACLE, and it comes before the number means anything: the ten-node row, by absolute count.
    // The shadow names are not the element names — `RCTText` commits as `Paragraph`, its string child
    // as `RawText`, `RCTSinglelineTextInputView` as `TextInput`.
    expect(built.get('View')).toBe(3 * ROWS + 1);
    expect(built.get('Paragraph')).toBe(3 * ROWS);
    expect(built.get('RawText')).toBe(3 * ROWS);
    expect(built.get('TextInput')).toBe(ROWS);
  });
});

report();

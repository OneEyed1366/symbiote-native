// @symbiote-platform-extensions
//
// The whole benchmark screen through REACT'S OWN Fabric renderer — the baseline column, headless.
//
// why, the step definitions, the oracle and the one-file-per-arm rule: `bench-suite.ts`. This is the
// arm every other one is read against, and until `stock-renderer-probe.itest.tsx` stood
// `ReactFabric-prod` up in this harness it could only be taken on a device.
//
// The row is `memo`'d and carries RN's own host names, so it is the same ten nodes and the same
// workload `examples/bare-rn/screens/BenchmarkScreen.tsx` commits.
//
// The engine telemetry on every line reads zero, and correctly: stock drives
// `nativeFabricUIManager` itself, so none of our walk or apply is in the path. Only the wall clock
// is comparable here.
//
// RUN ON `build-release` (`pnpm run bench:itest`) — a development React cannot drive
// `ReactFabric-prod` at all. See `isBenchBuild` in `scripts/run-itests.mjs`.

import { createElement as h, memo } from 'react';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
  runBenchSuite,
  type IBenchRow,
} from './bench-suite';
import { describe, flushTimers, it, mounted, print, report } from './harness';
import { loadStockRenderer } from './stock-renderer';

const Row = memo(function RowView({
  row,
  isSelected,
}: {
  row: IBenchRow;
  isSelected: boolean;
}): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h('RCTText', { ellipsizeMode: 'tail' }, text);

  return h(
    'RCTView',
    {
      style: isSelected ? SELECTED_ROW_STYLE : ROW_STYLE,
      nativeID: `row-${row.id}`,
    },
    label(String(row.id)),
    h('RCTView', { style: CELL_STYLE }, label(row.label)),
    h('RCTView', { style: CELL_STYLE }, label('x')),
    h('RCTSinglelineTextInputView', { style: INPUT_STYLE, text: row.label }),
  );
});

// `__DEV__` is the runner's own define and it tracks the build. See `stock-create-cost.itest.tsx`.
declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

describe('the benchmark screen through stock React Native', () => {
  it('runs the eight device steps', async () => {
    if (!canHostStock) {
      print(
        'DEBUG stock suite SKIPPED — needs the bench build (pnpm run bench:itest)',
      );
      return;
    }

    // A failing stock render is SILENT — React retries and reports through RN's error dialog into
    // `console.error`, leaving a surface holding `RootView()`. A suite measured against an empty
    // tree reads near zero on every step and would fail only on the oracle, which is the point of
    // having one; this makes the CAUSE visible too.
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
    render(h('RCTView', { style: { flex: 1 } }), ROOT_TAG);
    flushTimers();
    mounted();

    await runBenchSuite({
      name: 'stock',
      // The root and the screen's own wrapper. One fewer than every adapter arm, because
      // `ReactFabric.render` mounts straight into the root where `createSurface` puts a container
      // under it — the same one-node difference `CLAUDE.md` records as `createNode 10001 vs 10000`.
      chrome: 2,
      apply: state => {
        render(
          h(
            'RCTView',
            { style: { flex: 1 } },
            ...state.rows.map(row =>
              h(Row, {
                key: row.id,
                row,
                isSelected: row.id === state.selectedId,
              }),
            ),
          ),
          ROOT_TAG,
        );
        flushTimers();
      },
    });
  });
});

report();

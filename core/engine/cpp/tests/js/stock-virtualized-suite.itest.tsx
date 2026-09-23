// @symbiote-platform-extensions
//
// The benchmark screen's VIRTUALIZED mode through React Native's own `FlatList` and renderer — the
// reference the adapter FlatList arms are read against. Same row, same eight steps as
// `stock-suite.itest.tsx`; the rows sit in a `FlatList` with `getItemLayout` inside the device
// screen's 420-point viewport, so a step mounts the window rather than all thousand rows.
//
// The ROW census (`VROWS`) is what makes the arms comparable: an adapter that mounts a different
// number of rows is running a different window, not a faster list. See `bench-suite.ts`.
//
// RUN ON `build-release` with `SYMBIOTE_ITEST_BYTECODE=1`.

import { createElement as h, memo } from 'react';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
  VIEWPORT_HEIGHT,
  announceListLayout,
  readFabricTelemetry,
  rowItemLayout,
  runBenchSuite,
  type IBenchRow,
  type IBenchState,
} from './bench-suite';
import { describe, flushTimers, it, mounted, print, report } from './harness';
import { loadStockRenderer } from './stock-renderer';

// Required in the body, by path — see `stock-suite.itest.tsx` for both reasons.
/* eslint-disable @typescript-eslint/no-require-imports */
const TextInput =
  require('react-native/Libraries/Components/TextInput/TextInput').default;
const View = require('react-native/Libraries/Components/View/View').default;
const Text = require('react-native/Libraries/Text/Text').default;
const FlatList = require('react-native/Libraries/Lists/FlatList').default;
/* eslint-enable @typescript-eslint/no-require-imports */

const Row = memo(function RowView({
  row,
  isSelected,
}: {
  row: IBenchRow;
  isSelected: boolean;
}): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h(Text, { ellipsizeMode: 'tail' }, text);

  return h(
    View,
    { style: isSelected ? SELECTED_ROW_STYLE : ROW_STYLE },
    label(String(row.id)),
    h(View, { style: CELL_STYLE }, label(row.label)),
    h(View, { style: CELL_STYLE }, label('x')),
    h(TextInput, { style: INPUT_STYLE, value: row.label }),
  );
});

const keyOf = (row: IBenchRow): string => String(row.id);

declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

describe('the virtualized benchmark screen through stock React Native', () => {
  it('runs the eight device steps', async () => {
    if (!canHostStock) {
      print(
        'DEBUG stock virtualized suite SKIPPED — needs the bench build (pnpm run bench:itest)',
      );
      return;
    }
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
    const draw = (state: IBenchState): void => {
      render(
        h(
          'RCTView',
          { style: { flex: 1 } },
          h(FlatList, {
            style: { height: VIEWPORT_HEIGHT },
            data: state.rows,
            keyExtractor: keyOf,
            getItemLayout: rowItemLayout,
            renderItem: ({ item }: { item: IBenchRow }) =>
              h(Row, { row: item, isSelected: item.id === state.selectedId }),
          }),
        ),
        ROOT_TAG,
      );
      flushTimers();
    };

    draw({ rows: [], selectedId: undefined });
    mounted();
    announceListLayout();
    flushTimers();

    await runBenchSuite({
      name: 'stock-v',
      readTelemetry: readFabricTelemetry,
      drivesEngine: false,
      chrome: 2,
      virtualized: true,
      apply: state => {
        draw(state);
        announceListLayout();
        flushTimers();
      },
    });
  });
});

report();

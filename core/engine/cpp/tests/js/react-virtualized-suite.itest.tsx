// The benchmark screen's VIRTUALIZED mode through the React adapter's `FlatList`. Read against
// `stock-virtualized-suite.itest.tsx`; the row census (`VROWS`) must match stock's.
//
// RUN ON `build-release` with `SYMBIOTE_ITEST_BYTECODE=1`.

import { createElement as h, memo, useState } from 'react';
import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { FlatList, mount } from '@symbiote-native/react';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
  VIEWPORT_HEIGHT,
  announceListLayout,
  rowItemLayout,
  runBenchSuite,
  type IBenchRow,
  type IBenchState,
} from './bench-suite';
import { describe, flushTimers, it, mounted, report } from './harness';

const Row = memo(function RowView({
  row,
  isSelected,
}: {
  row: IBenchRow;
  isSelected: boolean;
}): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h('text', { ellipsizeMode: 'tail' }, text);
  return h(
    'view',
    { style: isSelected ? SELECTED_ROW_STYLE : ROW_STYLE },
    label(String(row.id)),
    h('view', { style: CELL_STYLE }, label(row.label)),
    h('view', { style: CELL_STYLE }, label('x')),
    h('text-input', { style: INPUT_STYLE, value: row.label }),
  );
});

const keyOf = (row: IBenchRow): string => String(row.id);

let setState: ((next: IBenchState) => void) | undefined;

function Screen(): ReturnType<typeof h> {
  const [state, setStateHook] = useState<IBenchState>({
    rows: [],
    selectedId: undefined,
  });
  setState = setStateHook;
  return h(
    'view',
    { style: { flex: 1 } },
    h(FlatList<IBenchRow>, {
      style: { height: VIEWPORT_HEIGHT },
      data: state.rows,
      keyExtractor: keyOf,
      getItemLayout: rowItemLayout,
      renderItem: ({ item }) =>
        h(Row, { row: item, isSelected: item.id === state.selectedId }),
    }),
  );
}

describe('the virtualized benchmark screen through the React adapter', () => {
  it('runs the eight device steps', async () => {
    const surface = mount(ROOT_TAG, h(Screen));
    flushTimers();
    surface.commit();
    mounted();
    announceListLayout();
    flushTimers();
    surface.commit();

    if (setState === undefined) throw new Error('the screen never rendered');
    const apply = setState;

    await runBenchSuite({
      name: 'react-v',
      chrome: 3,
      virtualized: true,
      readTelemetry: () => readSurfaceTelemetry(ROOT_TAG),
      apply: next => {
        apply(next);
        flushTimers();
        surface.commit();
        announceListLayout();
        flushTimers();
        surface.commit();
      },
    });
  });
});

report();

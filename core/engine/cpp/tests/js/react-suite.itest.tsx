// The whole benchmark screen through the React adapter — all eight device steps, headless.
//
// why, the step definitions, the oracle and the one-file-per-arm rule: `bench-suite.ts`.
//
// The row is `memo`'d because BOTH benchmark screens memo theirs (`examples/react/screens/
// BenchmarkScreen.tsx:387`, `examples/bare-rn/screens/BenchmarkScreen.tsx:395`). A plain row is a
// different workload — `adapter-swap-cost.itest.tsx` measures it at 76 ms against 24.5 — and reading
// one against the device table is the mistake that file records paying for.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import { createElement as h, memo, useState } from 'react';

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount } from '@symbiote-native/react';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
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
    {
      style: isSelected ? SELECTED_ROW_STYLE : ROW_STYLE,
      testID: `row-${row.id}`,
    },
    label(String(row.id)),
    h('view', { style: CELL_STYLE }, label(row.label)),
    h('view', { style: CELL_STYLE }, label('x')),
    h('text-input', { style: INPUT_STYLE, text: row.label }),
  );
});

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
    ...state.rows.map(row =>
      h(Row, { key: row.id, row, isSelected: row.id === state.selectedId }),
    ),
  );
}

describe('the benchmark screen through the React adapter', () => {
  it('runs the eight device steps', async () => {
    const surface = mount(ROOT_TAG, h(Screen));
    flushTimers();
    surface.commit();
    mounted();

    if (setState === undefined) throw new Error('the screen never rendered');
    const apply = setState;

    await runBenchSuite({
      name: 'react',
      // The root, the container `createSurface` puts under it, and the screen's own wrapper.
      chrome: 3,
      readTelemetry: () => readSurfaceTelemetry(ROOT_TAG),
      apply: state => {
        apply(state);
        flushTimers();
        surface.commit();
      },
    });
  });
});

report();

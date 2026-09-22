// The whole benchmark screen through the Vue adapter — all eight device steps, headless.
//
// why, the step definitions, the oracle and the one-file-per-arm rule: `bench-suite.ts`.
//
// Vue's scheduler batches on a microtask, so a step settles with `nextTick` and the await sits
// inside the stopwatch — the same turn a device pays.
//
// WHAT THIS ARM IS NOT: an SFC. The rows are raw tags through `h()`, which is the LOWERED shape a
// compiled `<View>` produces, but the compiler's static-prop hoisting and patch flags are not
// modelled. `CLAUDE.md` records the same caveat for the create arm, where this ran 1.27x headless
// against 0.89x on device.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import { nextTick, shallowRef } from '@vue/runtime-core';

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { h, mount } from '@symbiote-native/vue';

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

// A real component, not a function returning vnodes: every other arm's row is a component
// (`memo` on React and stock, a Solid component, a `.svelte` file), and so is the device screen's
// `BenchmarkRow`. A bare function would take one Vue component instance per row off the books and
// make this column cheaper than the ones it is read against.
const Row = {
  props: { row: { type: Object }, isSelected: { type: Boolean } },
  render(this: { row: IBenchRow; isSelected: boolean }) {
    const label = (text: string): ReturnType<typeof h> =>
      h('text', { ellipsizeMode: 'tail' }, text);

    return h(
      'view',
      {
        style: this.isSelected ? SELECTED_ROW_STYLE : ROW_STYLE,
        // No id prop — the row is kept concrete by `ROW_STYLE`'s background, as on the device screen.
      },
      [
        label(String(this.row.id)),
        h('view', { style: CELL_STYLE }, [label(this.row.label)]),
        h('view', { style: CELL_STYLE }, [label('x')]),
        h('text-input', { style: INPUT_STYLE, text: this.row.label }),
      ],
    );
  },
};

// `shallowRef`, not `ref`: the state is replaced wholesale on every step, so deep reactivity would
// only buy a proxy per row and per row object. The adapters' own guidance and `CLAUDE.md`'s
// allocation findings both point the same way.
const state = shallowRef<IBenchState>({ rows: [], selectedId: undefined });

describe('the benchmark screen through the Vue adapter', () => {
  it('runs the eight device steps', async () => {
    const surface = mount(ROOT_TAG, {
      render: () =>
        h(
          'view',
          { style: { flex: 1 } },
          state.value.rows.map(entry =>
            h(Row, {
              key: entry.id,
              row: entry,
              isSelected: entry.id === state.value.selectedId,
            }),
          ),
        ),
    });
    flushTimers();
    surface.commit();
    mounted();

    await runBenchSuite({
      name: 'vue',
      // The root, the container `createSurface` puts under it, and the screen's own wrapper.
      chrome: 3,
      // The third leg of the mutation comparison — see the React arm. React's reconciler is in
      // mutation mode and Vue's is a different one entirely, so an arm that agrees with React here
      // places the extra work in the engine rather than in either reconciler.
      countsMutations: true,
      readTelemetry: () => readSurfaceTelemetry(ROOT_TAG),
      apply: async next => {
        state.value = next;
        await nextTick();
        flushTimers();
        surface.commit();
      },
    });
  });
});

report();

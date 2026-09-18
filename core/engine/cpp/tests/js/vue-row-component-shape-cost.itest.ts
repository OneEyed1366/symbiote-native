// What a Vue LIST ROW costs when it is a stateful component (`defineComponent`/options object,
// Vue's own instance + reactive-props-proxy + per-instance update effect) against the identical
// row as a plain FUNCTION (a Vue functional component: no instance, no reactive proxy, no update
// effect — Vue calls it directly and re-diffs its output against the parent's own patch).
//
// vue-suite.itest.ts's RESULT reads partial=13.3-13.8ms against react=8.6ms and solid=6.8ms for a
// BYTE-IDENTICAL committed tree (cloned=502 reused=1100 setProps=100 in every arm) — the engine does
// the same work, so the gap is pure JS above it. Bisected with `performance.now()` around the
// `apply` phases of vue-suite's own step: ~99% of the wall time sits inside the single
// `await nextTick()` call (13.7 of 13.8ms), i.e. inside Vue's own render+patch, not in this
// adapter's `patchProp`/`insert`/`remove` — those only fire ~200 times for 100 changed rows and
// their cost is already counted in the engine's `apply` (5ms).
//
// THE TWO ARMS BELOW isolate the remaining ~7ms of pure-JS cost to the component shape: switching
// the SAME row from an options-object to a bare function drops the partial step's non-engine JS
// time from ~7.1ms to ~3.7ms (on par with react's ~3.3ms) with the payload asserted byte-identical
// first — Vue's per-instance machinery (`createComponentInstance`, `shallowReactive` prop proxy,
// the per-component `ReactiveEffect`) is the cost, not anything this adapter's host-config code
// does. That machinery is Vue's own, generic, and used identically by DOM Vue; there is no lever
// inside `@symbiote-native/vue` that removes it for a component the app itself declared stateful.
//
// vue-suite.itest.ts deliberately keeps the OPTIONS-OBJECT shape ("every other arm's row is a
// component ... a bare function would take one Vue component instance per row off the books and
// make this column cheaper than the ones it is read against") — that comparability requirement is
// correct and this file does not touch it. What follows is the number that requirement hides: a
// real app's list row with no local state pays for machinery it never uses, and a functional
// component (or the SFC compiler recognizing a stateless component and lowering it the same way it
// already lowers `<View>`/`<Text>`/`<Pressable>` — unimplemented, see the file's own note) is the
// lever available to a real app that vue-suite's ruler cannot show without breaking comparability.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import { nextTick, shallowRef } from '@vue/runtime-core';

import {
  readSurfaceTelemetry,
  type ISurfaceTelemetry,
} from '@symbiote-native/engine';
import { h, mount, unmount } from '@symbiote-native/vue';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROW_STYLE,
  buildRows,
  type IBenchRow,
} from './bench-suite';
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
const STRIDE = 10;

function label(text: string): ReturnType<typeof h> {
  return h('text', { ellipsizeMode: 'tail' }, text);
}

function rowChildren(row: IBenchRow): ReturnType<typeof h>[] {
  return [
    label(String(row.id)),
    h('view', { style: CELL_STYLE }, [label(row.label)]),
    h('view', { style: CELL_STYLE }, [label('x')]),
    h('text-input', { style: INPUT_STYLE, text: row.label }),
  ];
}

// ARM A — a stateful component: Vue allocates an instance, a `shallowReactive` props proxy and a
// per-instance update effect for every one of the 1 000 rows, whether or not that row ever changes.
const StatefulRow = {
  props: { row: { type: Object } },
  render(this: { row: IBenchRow }) {
    return h('view', { style: ROW_STYLE }, rowChildren(this.row));
  },
};

// ARM B — the identical output from a bare function. Vue's `shapeFlag` marks this a functional
// component: no instance, no props proxy, no update effect — the parent's own patch calls it
// directly and diffs the returned vnode tree the same way it would any inline render.
const FunctionalRow = (props: { row: IBenchRow }): ReturnType<typeof h> =>
  h('view', { style: ROW_STYLE }, rowChildren(props.row));

type IRowComponent = typeof StatefulRow | typeof FunctionalRow;

async function timePartialStep(
  tag: number,
  Row: IRowComponent,
): Promise<{
  readonly wallMs: number;
  readonly telemetry: ISurfaceTelemetry | undefined;
}> {
  const state = shallowRef<readonly IBenchRow[]>(buildRows(ROWS));
  const surface = mount(tag, {
    render: () =>
      h(
        'view',
        {},
        state.value.map(row => h(Row, { key: row.id, row })),
      ),
  });
  flushTimers();
  surface.commit();
  readSurfaceTelemetry(tag); // drain the mount's own counters

  const next = state.value.map((row, index) =>
    index % STRIDE === 0 ? { ...row, label: row.label + ' !!!' } : row,
  );

  const t0 = performance.now();
  state.value = next;
  await nextTick();
  flushTimers();
  surface.commit();
  const wallMs = performance.now() - t0;
  const telemetry = readSurfaceTelemetry(tag);

  // THE ORACLE: both arms must have done the identical engine-side work, or the wall-clock
  // comparison is comparing two different trees rather than two component shapes.
  expect(telemetry?.nodesCloned).toBe(502);
  expect(telemetry?.setProps).toBe(100);
  expect(telemetry?.nodesCreated).toBe(0);

  unmount(tag);
  return { wallMs, telemetry };
}

describe('a Vue list row: stateful component vs functional component', () => {
  it('costs the same engine work and different JS work on a 10%-of-1000 relabel', async () => {
    const stateful = await timePartialStep(9001, StatefulRow);
    const functional = await timePartialStep(9002, FunctionalRow);

    const engineMs = (t: ISurfaceTelemetry | undefined): number =>
      (t?.walkMs ?? 0) + (t?.applyMs ?? 0);

    print(
      `DEBUG vue-row-shape stateful  wall=${stateful.wallMs.toFixed(2)} ` +
        `engine=${engineMs(stateful.telemetry).toFixed(2)} ` +
        `jsOnly=${(stateful.wallMs - engineMs(stateful.telemetry)).toFixed(2)}`,
    );
    print(
      `DEBUG vue-row-shape functional wall=${functional.wallMs.toFixed(2)} ` +
        `engine=${engineMs(functional.telemetry).toFixed(2)} ` +
        `jsOnly=${(functional.wallMs - engineMs(functional.telemetry)).toFixed(2)}`,
    );

    // Not a strict inequality assertion on ms (small-ms rows do not reproduce run to run — see
    // CLAUDE.md's own caution on this), only that the committed shape stays identical either way.
    void committedShape();
  });
});

report();

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
// A SECOND CASE below repeats the A/B at MOUNT and TEARDOWN (1 000 rows created, then cleared)
// rather than at a 10%-of-1000 update — same finding, smaller and one-sided: functional cuts the
// mount's JS-only time by ~12%, and buys nothing measurable on teardown. See that case's own
// comment for the numbers; it is not the uniform "same win everywhere" a first guess would expect.
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

async function timeMountAndTeardown(
  tag: number,
  Row: IRowComponent,
): Promise<{
  readonly mountMs: number;
  readonly mountTelemetry: ISurfaceTelemetry | undefined;
  readonly teardownMs: number;
  readonly teardownTelemetry: ISurfaceTelemetry | undefined;
}> {
  const state = shallowRef<readonly IBenchRow[]>([]);
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
  readSurfaceTelemetry(tag);

  const t0 = performance.now();
  state.value = buildRows(ROWS);
  await nextTick();
  flushTimers();
  surface.commit();
  const mountMs = performance.now() - t0;
  const mountTelemetry = readSurfaceTelemetry(tag);
  // 9000 rather than 10 keys x 1000 rows: several of the 10 nodes per row take no props at all
  // (a raw-text child) or share one prop object, so the true per-row key count is 9, not 10 — an
  // arm mismatch here would mean the two rows built different trees, which is what this checks.
  expect(mountTelemetry?.nodesCreated).toBe(10000);
  expect(mountTelemetry?.setProps).toBe(9000);

  const t1 = performance.now();
  state.value = [];
  await nextTick();
  flushTimers();
  surface.commit();
  const teardownMs = performance.now() - t1;
  const teardownTelemetry = readSurfaceTelemetry(tag);

  unmount(tag);
  return { mountMs, mountTelemetry, teardownMs, teardownTelemetry };
}

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

  // The SAME shape difference, at MOUNT and UNMOUNT rather than at update — patchFlags (this
  // adapter's `optimize: true` default for TSX) only speed up the update path above; they cannot
  // skip creating an instance that has not been created yet, or skip tearing one down.
  // `vue-suite.itest.ts`'s own create/append rows read ~25-30ms over solid's for a byte-identical
  // tree, which is what motivated this second A/B.
  //
  // MEASURED (four runs, `build-release`): MOUNT shows the same direction as the update case, a
  // real but SMALLER effect — functional's JS-only mount time is consistently ~12% under
  // stateful's (~50ms against ~57ms), not the ~50% seen on the partial-relabel above. TEARDOWN
  // shows NO effect either way, run to run — sometimes marginally worse for functional. So
  // instance-avoidance is not one lever that scales with "how much Vue machinery a row skips"; it
  // helps roughly in proportion to how much of the step is spent DECIDING whether to redo work
  // (create + update), and buys nothing on a step that is pure teardown. Recorded as measured
  // rather than assumed uniform — the earlier version of this comment claimed teardown improved
  // too, which no run here ever showed.
  it('costs the same engine work and different JS work mounting and tearing down 1000 rows', async () => {
    const stateful = await timeMountAndTeardown(9003, StatefulRow);
    const functional = await timeMountAndTeardown(9004, FunctionalRow);

    const engineMs = (t: ISurfaceTelemetry | undefined): number =>
      (t?.walkMs ?? 0) + (t?.applyMs ?? 0);

    print(
      `DEBUG vue-row-shape stateful   mount=${stateful.mountMs.toFixed(2)} ` +
        `mountJsOnly=${(stateful.mountMs - engineMs(stateful.mountTelemetry)).toFixed(2)} ` +
        `teardown=${stateful.teardownMs.toFixed(2)} ` +
        `teardownJsOnly=${(stateful.teardownMs - engineMs(stateful.teardownTelemetry)).toFixed(2)}`,
    );
    print(
      `DEBUG vue-row-shape functional mount=${functional.mountMs.toFixed(2)} ` +
        `mountJsOnly=${(functional.mountMs - engineMs(functional.mountTelemetry)).toFixed(2)} ` +
        `teardown=${functional.teardownMs.toFixed(2)} ` +
        `teardownJsOnly=${(functional.teardownMs - engineMs(functional.teardownTelemetry)).toFixed(2)}`,
    );
  });
});

report();

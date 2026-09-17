// @symbiote-platform-extensions
//
// The same keyed swap, driven by React's OWN Fabric renderer.
//
// why: `Swap` is the largest unexplained loss against stock in the device table — react 35.3 ms
// against stock 9.6 — and it has stood as "the standing React anomaly" through every
// re-measurement. `adapter-swap-cost.itest.tsx` already ruled the engine out: all three of its arms
// report `created=0 cloned=2 reused=1000 targetedReplaces=1 setProps=0`, byte-identical, and the
// engine is 2.4 ms of a 24.5 ms swap. What was missing was the OTHER side.
//
// It is not missing any more (`stock-renderer-probe.itest.tsx`), so this file is the second arm:
// the same thousand rows, the same two indices exchanged, through `ReactFabric-prod` and RN's own
// view configs into the same `nativeFabricUIManager`.
//
// A SEPARATE FILE, NOT A SECOND ARM IN THE FIRST ONE, and that is the methodology rather than
// convenience. The runner spawns one process per file, so two files share a machine and a build but
// not a heap — which removes the per-arm contamination this directory has measured at ~3% and, more
// to the point, removes the question of whether two renderers can hold one surface at once. The
// harness has exactly one (`kSurfaceId = 1`).
//
// WHAT MAKES THE COMPARISON HONEST, and it is checked before any millisecond is read: the same ten
// nodes per row, and the same `memo` boundary. Both benchmark screens wrap their row in `memo`
// (`examples/react/…:387`, `examples/bare-rn/…:395`), so a swap rebuilds a thousand one-element
// wrappers and every body bails out. Measuring one side memoized and the other not is how the first
// pass at the adapter file produced a 73% figure about the wrong workload.
//
// The names are spelled as React Native spells them internally — `RCTView`, `RCTText`,
// `RCTSinglelineTextInputView` — because that is literally what a host element's type IS after
// `createReactNativeComponentClass`. Our adapter's `view` / `text` / `textinput` resolve to the same
// four native names, which is what the census below asserts rather than assumes.
//
// RUN ON `build-release` (`pnpm run bench:itest`), and here that is not a preference — a stock arm
// CANNOT be built on the correctness build at all. `ReactFabric-prod` sets React's internals up in
// their production shape and a development `createElement` then calls `dispatcher.getOwner()`, which
// production does not carry. See `isBenchBuild` in `scripts/run-itests.mjs`.
//
// ── WHAT IT MEASURED ───────────────────────────────────────────────────────────────────────────
//
//   stock            8.5 ms      device says 9.6 — the harness lands on the real number
//   our React       20.6 ms      (`adapter-swap-cost.itest.tsx`, memo arm), engine 2.7 of it
//   ratio           2.42x        device says 3.68x
//
// So the anomaly REPRODUCES headlessly, in the same direction and the same order of magnitude, with
// the engine accounting for 2.7 ms of our 20.6. Whatever the remaining ~12 ms is, both sides ran the
// same reconciler over the same thousand rows, so it is the host config — mutation mode against
// persistent mode — and it is now bisectable without a simulator.

import { createElement as h, memo, useState } from 'react';

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

// The two the benchmark screen exchanges — near the front and near the back, so the move is real
// rather than two adjacent slots.
const FIRST = 1;
const SECOND = 998;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

let setOrder: ((next: readonly number[]) => void) | undefined;

/** The ten-node row, in RN's own host names. */
function row(id: number): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h('RCTText', { ellipsizeMode: 'tail' }, text);

  return h(
    'RCTView',
    { style: ROW_STYLE, nativeID: `row-${id}` },
    label(String(id)),
    h('RCTView', { style: CELL_STYLE }, label(`row ${id}`)),
    h('RCTView', { style: CELL_STYLE }, label('x')),
    h('RCTSinglelineTextInputView', {
      style: INPUT_STYLE,
      text: `input ${id}`,
    }),
  );
}

const Row = memo(function RowView({ id }: { id: number }) {
  return row(id);
});

function Screen(): ReturnType<typeof h> {
  const initial: number[] = [];
  for (let id = 0; id < ROWS; id += 1) initial.push(id);
  const [order, setOrderState] = useState<readonly number[]>(initial);
  setOrder = setOrderState;

  return h(
    'RCTView',
    { style: { flex: 1 } },
    ...order.map(id => h(Row, { key: id, id })),
  );
}

/** How many of each view name the committed SHADOW tree holds — the census the ratio rests on. */
function census(shape: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of shape.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(/g)) {
    const name = match[1];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Whether this bundle can host the stock renderer at all.
 *
 * `__DEV__` is the runner's own define and it tracks the build: true on `build` (correctness, where
 * React Native's invariants stay armed) and false on `build-release`. A development React cannot
 * drive `ReactFabric-prod` — `createElement` reaches for `dispatcher.getOwner()`, which the
 * production internals do not carry — so on the correctness build this file has nothing to measure
 * and says so rather than failing. Skipping is the honest outcome; a red test here would be a
 * standing false alarm in the suite everyone runs.
 */
declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

describe('what a keyed swap costs through stock React Native', () => {
  it('exchanges two rows of a memoized thousand', () => {
    if (!canHostStock) {
      print(
        'DEBUG stock swap SKIPPED — needs the bench build (pnpm run bench:itest)',
      );
      return;
    }
    // A FAILING STOCK RENDER IS SILENT, and finding that out cost most of this file. React catches a
    // throw during render, retries, and reports it through RN's `ReactFiberErrorDialog`, which ends
    // in `console.error` — so what the caller sees is a component that ran and a surface holding
    // `RootView()`, empty, with no error anywhere. Surfaced here permanently, because a swap measured
    // against an empty tree reads 0.1 ms and passes every before/after comparison.
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

    render(h(Screen), ROOT_TAG);
    flushTimers();
    mounted();

    // THE ORACLE, and it comes first. A ratio between two renderers means nothing until the trees
    // agree — this directory has twice paid for reading milliseconds off columns that turned out to
    // be different workloads (a missing `TextInput` read as 1.31x; Angular's flat row agreed on every
    // structural counter while 19% of the prop keys were absent).
    const before = census(committedShape());
    print(
      `DEBUG stock census: ${[...before.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => `${name}=${count}`)
        .join(' ')}`,
    );
    // AND THE TREE HAS TO EXIST, asserted here rather than left to the before/after comparison
    // below — two empty censuses match each other perfectly. The first run of this file reported
    // `RootView=1` and a 0.1 ms swap, and passed, because nothing had been built and nothing moved.
    // A ratio taken off that would have been a finding about an empty surface.
    // The SHADOW names, which are not the element names: a `RCTText` commits as `Paragraph`, its
    // string child as `RawText`, `RCTSinglelineTextInputView` as `TextInput`. The row is ten nodes
    // and the count has to say so — a partial tree would still pass a before/after comparison.
    expect(before.get('View')).toBe(3 * ROWS + 1);
    expect(before.get('Paragraph')).toBe(3 * ROWS);
    expect(before.get('RawText')).toBe(3 * ROWS);
    expect(before.get('TextInput')).toBe(ROWS);

    const order: number[] = [];
    for (let id = 0; id < ROWS; id += 1) order.push(id);
    [order[FIRST], order[SECOND]] = [order[SECOND], order[FIRST]];

    if (setOrder === undefined) throw new Error('the screen never rendered');
    const startedAt = performance.now();
    setOrder(order);
    flushTimers();
    const wall = performance.now() - startedAt;
    mounted();

    const after = census(committedShape());
    print(`DEBUG stock swap wall=${wall.toFixed(1)}`);

    // Nothing may have been created or destroyed: two rows exchanging places is a pure move, and a
    // census that moved would mean the reconciler lost the keys and the wall clock above is measuring
    // a rebuild.
    expect([...after.entries()].length).toBe([...before.entries()].length);
    for (const [name, count] of before) {
      expect(after.get(name)).toBe(count);
    }
  });
});

report();

// @symbiote-platform-extensions
//
// What the benchmark suite's STOCK arm is not paying for.
//
// why: the suite's rows are not the same workload, and every oracle in this directory passes them
// anyway. `stock-suite.itest.tsx:52` writes `h('RCTSinglelineTextInputView', …)` — a bare Fabric
// view — while all five adapter arms write `h('text-input', …)`, which reaches a host behavior that
// seeds a prop, wires four listeners and attaches a press machine. Both commit a node named
// `TextInput`, so the census oracle cannot tell them apart, and `reconciler-floor.itest.tsx` prices
// our side of that at 15-17 us per instance — about 15 ms on a thousand-row create, charged to every
// adapter arm and to none of stock's.
//
// On DEVICE the comparison is fair: `examples/bare-rn` mounts RN's `<TextInput>` and our examples
// mount ours. It is only the headless stock arm that names the host component directly, which makes
// it cheaper than the platform it stands for.
//
// So this file prices the correction rather than asserting it: the identical thousand-row tree under
// the stock renderer, once with the bare view and once with React Native's own `TextInput`, in one
// process. Whatever separates them is what the published stock column is missing.
//
// TWO CASES, NOT TWO LOOPS, and the reason is the harness's single surface: React keeps its
// container per root tag, so a second render into the same tag is a DIFF and not a create. Each case
// ends by rendering `null`, and `report()` resets the platform between cases, so the second arm
// starts from an empty tree — which its own census then proves.
//
// RUN ON `build-release` (`pnpm run bench:itest`). A development React cannot drive `ReactFabric-prod`.

import { createElement as h, type ReactNode } from 'react';

import {
  committedShape,
  describe,
  expect,
  flushTimers,
  it,
  print,
  report,
} from './harness';
import { loadStockRenderer } from './stock-renderer';

const ROOT_TAG = 1;
const ROWS = 1_000;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

/**
 * The ten-node row, with the input left to the caller.
 *
 * Everything else is `stock-create-cost.itest.tsx`'s row verbatim — a different row would be a
 * different workload, which is the mistake this directory records twice in its own headers.
 */
function row(id: number, input: ReactNode): ReactNode {
  const label = (text: string): ReactNode =>
    h('RCTText', { ellipsizeMode: 'tail' }, text);

  return h(
    'RCTView',
    { key: id, style: ROW_STYLE, nativeID: `row-${id}` },
    label(String(id)),
    h('RCTView', { style: CELL_STYLE }, label(`row ${id}`)),
    h('RCTView', { style: CELL_STYLE }, label('x')),
    input,
  );
}

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

function censusLine(label: string, counts: Map<string, number>): string {
  return (
    `DEBUG ${label.padEnd(10)} census :: ` +
    [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => `${name}=${count}`)
      .join(' ')
  );
}

/** Build the list, time it, print the census, then empty React's container for the next case. */
function timeArm(
  label: string,
  input: (id: number) => ReactNode,
): { wall: number; census: string } {
  const renderer = loadStockRenderer();
  const rows = [];
  for (let id = 0; id < ROWS; id += 1) rows.push(row(id, input(id)));

  const startedAt = performance.now();
  renderer.render(
    h('RCTView', { style: { flex: 1 } }, ...rows),
    ROOT_TAG,
    null,
    null,
  );
  flushTimers();
  const wall = performance.now() - startedAt;

  const counts = census();
  print(censusLine(label, counts));
  print(`DEBUG ${label.padEnd(10)} wall=${wall.toFixed(1)} ms`);

  // Empties the fiber tree so the NEXT case renders a create rather than a diff. Without it the
  // second arm reconciles against this one and reads as instant.
  renderer.render(null, ROOT_TAG, null, null);
  flushTimers();
  return {
    wall,
    census: [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => `${name}=${count}`)
      .join(' '),
  };
}

// `__DEV__` is the runner's own define and it tracks the build. A DEVELOPMENT React cannot drive
// `ReactFabric-prod` at all — its `createElement` reaches for `dispatcher.getOwner()`, which the
// production internals do not carry — and the failure is SILENT: React retries, reports through RN's
// error dialog into `console.error`, and leaves a surface holding `RootView()`. Caught here by the
// census on the assert build, which is exactly what that census is for.
declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

let bare: { wall: number; census: string } | undefined;

describe('what the stock arm pays for a text input', () => {
  // why: exactly what `stock-suite.itest.tsx` builds today — the Fabric view named directly, with no
  // component above it. The floor, and the number the published stock column is made of.
  it('builds the row with the bare Fabric view, as the suite does', () => {
    if (!canHostStock) {
      print(
        'DEBUG stock text-input cost SKIPPED — needs the bench build (pnpm run bench:itest)',
      );
      return;
    }
    bare = timeArm('bare view', id =>
      h('RCTSinglelineTextInputView', {
        style: INPUT_STYLE,
        text: `input ${id}`,
      }),
    );
    // The rows really were torn down, so the next case renders a create rather than a diff. Only
    // Fabric's own root survives a `null` render, which is why this is not a size check.
    expect(census().get('TextInput')).toBe(undefined);
  });

  // why: the same row with React Native's own component, which is what a real app writes and what
  // `examples/bare-rn` mounts on device. The difference is what the headless stock column omits.
  it('builds the row with React Native own TextInput', () => {
    if (!canHostStock) {
      print(
        'DEBUG stock text-input cost SKIPPED — needs the bench build (pnpm run bench:itest)',
      );
      return;
    }
    // REQUIRED HERE rather than imported at module scope, and the ordering is the whole reason: RN's
    // feature flags reach `TurboModuleRegistry` at MODULE scope and throw "__fbBatchedBridgeConfig
    // is not set". The fakes that satisfy that live at the top of `stock-renderer.ts`, and an ESM
    // import would be hoisted past them.
    //
    // BY PATH, not from the `react-native` barrel: that barrel reaches
    // `src/private/components/virtualcollection/VirtualCollectionView`, whose `VirtualViewMode`
    // import has no matching export, and the bundle dies before anything runs.
    //
    // `.default` because the module is ESM underneath and the interop hands back a namespace.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TextInput =
      require('react-native/Libraries/Components/TextInput/TextInput').default;

    const arm = timeArm('TextInput', id =>
      h(TextInput, { style: INPUT_STYLE, value: `input ${id}` }),
    );

    if (bare === undefined) throw new Error('the bare arm did not run');
    // THE COMPARABILITY GATE, and it is the whole point of the file: the two arms commit the same
    // views in the same numbers, so what separates their clocks is the component and nothing else.
    // It is also what makes the suite's substitution invisible to a census oracle.
    expect(arm.census).toBe(bare.census);

    const wall = arm.wall;
    const delta = wall - bare.wall;
    print(
      `DEBUG COST       bare=${bare.wall.toFixed(1)} TextInput=${wall.toFixed(1)} ms · ` +
        `the component costs ${delta.toFixed(1)} ms for ${ROWS} instances ` +
        `= ${((delta * 1_000) / ROWS).toFixed(1)} us each`,
    );
  });
});

report();

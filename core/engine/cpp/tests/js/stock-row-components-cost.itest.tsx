// @symbiote-platform-extensions
// @symbiote-count-fabric-calls
//
// The SECOND substitution in the stock arm's row, of exactly the class this directory already
// caught once.
//
// why: `stock-text-input-cost.itest.tsx` found the suite naming a Fabric view where the device
// mounts a component, priced it at 50-53 us per instance, and its header states the rule that
// follows — "when an arm names a HOST COMPONENT where its counterpart names a primitive, the two are
// not one workload however the census reads". The input was corrected. The other four were not:
// `stock-suite.itest.tsx` still writes `h('RCTView', …)` and `h('RCTText', …)` directly, while
// `examples/bare-rn/screens/BenchmarkScreen.tsx:402-413` mounts `<View>`, `<Text>` and two
// `<Pressable>`s — components with real bodies, prop folds and, in Pressable's case, a press machine.
//
// The device disagrees with this fixture about the tree itself, which is what makes it worth a file
// rather than a comment: measured 2026-09-21 on iOS 26.5, `examples/bare-rn` calls `createNode`
// 9 001 times for a thousand rows while our own arm calls it 10 000. Both screens declare ten native
// views per row. So either RN's components emit one node fewer than the intrinsics this fixture
// names, or the device screen does — and a headless census of the two rows side by side is the only
// thing that says which, without a second device build.
//
// The contract asserted below is the one every comparison in this directory rests on: the headless
// stock arm must commit the tree the DEVICE stock arm commits. If these two rows differ, the
// published stock column is priced against a tree no app builds.
//
// RUN ON `build-release` (`pnpm run bench:itest`). A development React cannot drive
// `ReactFabric-prod`.

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

function censusText(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}=${count}`)
    .join(' ');
}

/**
 * Fabric's `createNode` calls by view name — the headless twin of the instrument
 * `examples/*\/fabric-call-counter.ts` carries on a device, and the number this file exists to put
 * beside the device's.
 *
 * Installed by the runner's banner off `@symbiote-count-fabric-calls` on line 2, because a fixture
 * cannot install it itself: React destructures the binding before any test body runs. The counting
 * function is what React captured, so counting survives putting the real HostObject back — which has
 * to happen before C++ looks at the global, and is what `restoreFabric` below is for.
 */
type ICreateCounts = Record<string, number>;

function fabricCreates(): ICreateCounts {
  const counts = (globalThis as Record<string, unknown>)
    .__symbioteFabricCreates;
  if (typeof counts !== 'object' || counts === null) {
    throw new Error(
      'the fabric create counter is not installed — is the @symbiote-count-fabric-calls directive on line 2?',
    );
  }
  return { ...(counts as ICreateCounts) };
}

/** The real binding back in the global, before anything in C++ reads it. Idempotent. */
function restoreFabric(): void {
  const restore = (globalThis as Record<string, unknown>)
    .__symbioteRestoreFabric;
  if (typeof restore === 'function') restore();
}

function createsSince(before: ICreateCounts): {
  text: string;
  total: number;
} {
  const after = fabricCreates();
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  let total = 0;
  const parts: string[] = [];
  for (const name of names.sort()) {
    const delta = (after[name] ?? 0) - (before[name] ?? 0);
    if (delta === 0) continue;
    total += delta;
    parts.push(`${name}=${delta}`);
  }
  return { text: parts.join(' '), total };
}

/** Build the list, time it, print the census, then empty React's container for the next case. */
function timeArm(
  label: string,
  buildRow: (id: number) => ReactNode,
): {
  wall: number;
  census: string;
  nodes: number;
  creates: string;
  created: number;
} {
  const renderer = loadStockRenderer();
  // The HostObject goes back the moment React has captured the counting function, and BEFORE the
  // render below: `committedShape()` reaches C++, which casts the global back to a HostObject.
  restoreFabric();
  const rows = [];
  for (let id = 0; id < ROWS; id += 1) rows.push(buildRow(id));

  const before = fabricCreates();
  const startedAt = performance.now();
  renderer.render(
    h('RCTView', { style: { flex: 1 } }, ...rows),
    ROOT_TAG,
    null,
    null,
  );
  flushTimers();
  const wall = performance.now() - startedAt;

  const creates = createsSince(before);
  const counts = census();
  let nodes = 0;
  for (const count of counts.values()) nodes += count;
  print(
    `DEBUG ${label.padEnd(12)} census  :: ${censusText(counts)} (${nodes} nodes)`,
  );
  print(
    `DEBUG ${label.padEnd(12)} creates :: ${creates.text} (${creates.total} calls)`,
  );
  print(`DEBUG ${label.padEnd(12)} wall=${wall.toFixed(1)} ms`);

  // Empties the fiber tree so the NEXT case renders a create rather than a diff. Without it the
  // second arm reconciles against this one and reads as instant.
  renderer.render(null, ROOT_TAG, null, null);
  flushTimers();
  return {
    wall,
    census: censusText(counts),
    nodes,
    creates: creates.text,
    created: creates.total,
  };
}

// `__DEV__` is the runner's own define and it tracks the build. See `stock-text-input-cost.itest.tsx`
// for why a development React cannot host this at all, and why the failure would be silent.
declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

const SKIP_NOTE =
  'DEBUG stock row-components cost SKIPPED — needs the bench build (pnpm run bench:itest)';

let intrinsics: ReturnType<typeof timeArm> | undefined;

// Ten native views per row is what BOTH benchmark screens declare — `NATIVE_VIEWS_PER_ROW = 10` in
// `examples/react` and in `examples/bare-rn` alike — plus the list's own container view and Fabric's
// root, which no `createNode` mints.
const EXPECTED_NODES = ROWS * 10 + 2;

// AND THE NUMBER THE DEVICE CONTRADICTS. React's own renderer asks Fabric to create ten nodes per
// row plus the container — `RCTView=3001 RCTText=3000 RCTRawText=3000 RCTSinglelineTextInputView=1000`
// — and it does so identically for all three row shapes below, so no component in the row folds a
// node away. `examples/bare-rn` reported 9 001 on iOS 26.5, exactly one name-group short. The tree
// is not what differs; the DEVICE COUNTER is, and a stock column normalised by 9 001 nodes reads
// 10% cheaper per node than it is.
const EXPECTED_CREATES = ROWS * 10 + 1;

describe('what the stock arm pays for React Native own row components', () => {
  // why: exactly what `stock-suite.itest.tsx` builds today — Fabric view names written directly,
  // with nothing above them but the input. The floor, and what the published stock column is made of.
  it('builds the row from Fabric view names, as the suite does', () => {
    if (!canHostStock) {
      print(SKIP_NOTE);
      return;
    }
    /* eslint-disable @typescript-eslint/no-require-imports -- required rather than imported so it
       evaluates AFTER `stock-renderer`'s module-scope fakes; see that file's header */
    const TextInput =
      require('react-native/Libraries/Components/TextInput/TextInput').default;
    /* eslint-enable @typescript-eslint/no-require-imports */

    const label = (text: string): ReactNode =>
      h('RCTText', { ellipsizeMode: 'tail' }, text);

    intrinsics = timeArm('intrinsics', id =>
      h(
        'RCTView',
        { key: id, style: ROW_STYLE, nativeID: `row-${id}` },
        label(String(id)),
        h('RCTView', { style: CELL_STYLE }, label(`row ${id}`)),
        h('RCTView', { style: CELL_STYLE }, label('x')),
        h(TextInput, { style: INPUT_STYLE, value: `row ${id}` }),
      ),
    );

    // The rows really were torn down, so the next case renders a create rather than a diff. Only
    // Fabric's own root survives a `null` render, which is why this is not a size check.
    expect(census().get('View')).toBe(undefined);
    // Ten per row, because that is what the row spells: three views, three texts, three raw texts
    // and the input.
    expect(intrinsics.nodes).toBe(EXPECTED_NODES);
    expect(intrinsics.created).toBe(EXPECTED_CREATES);
  });

  // why: the same row as `examples/bare-rn` mounts it — RN's own `View`, `Text` and two `Pressable`s.
  // This is the tree the DEVICE baseline commits, so it is the tree the headless baseline owes.
  it('builds the row from React Native own components, as the device does', () => {
    if (!canHostStock) {
      print(SKIP_NOTE);
      return;
    }
    /* eslint-disable @typescript-eslint/no-require-imports -- see above */
    const TextInput =
      require('react-native/Libraries/Components/TextInput/TextInput').default;
    const View = require('react-native/Libraries/Components/View/View').default;
    const Text = require('react-native/Libraries/Text/Text').default;
    const Pressable =
      require('react-native/Libraries/Components/Pressable/Pressable').default;
    /* eslint-enable @typescript-eslint/no-require-imports */

    const noop = (): void => {};

    const arm = timeArm('components', id =>
      h(
        View,
        { key: id, style: ROW_STYLE, nativeID: `row-${id}` },
        h(Text, { style: CELL_STYLE }, String(id)),
        h(
          Pressable,
          { style: CELL_STYLE, onPress: noop },
          h(Text, { style: CELL_STYLE }, `row ${id}`),
        ),
        h(
          Pressable,
          { style: CELL_STYLE, onPress: noop },
          h(Text, { style: CELL_STYLE }, 'x'),
        ),
        h(TextInput, { style: INPUT_STYLE, value: `row ${id}` }),
      ),
    );

    if (intrinsics === undefined)
      throw new Error('the intrinsics arm did not run');

    const delta = arm.wall - intrinsics.wall;
    print(
      `DEBUG COST        intrinsics=${intrinsics.wall.toFixed(1)} components=${arm.wall.toFixed(1)} ms · ` +
        `the components cost ${delta.toFixed(1)} ms for ${ROWS} rows ` +
        `= ${((delta * 1_000) / ROWS).toFixed(1)} us each`,
    );

    // THE COMPARABILITY GATE, and the whole point of the file. Two rows that commit different views
    // in different numbers are not one workload, and no clock taken across them carries a verdict —
    // which is precisely how the text-input substitution survived a census oracle for a year.
    expect(arm.census).toBe(intrinsics.census);
    // ABSOLUTE, not just equal to the other arm: two arms that are both wrong by the same node
    // match each other perfectly, which is how a census oracle passes a substitution.
    expect(arm.nodes).toBe(EXPECTED_NODES);
    // And the CALLS, which is the assertion the device disagrees with. Ten per row plus the
    // container, by name — no component in this row folds a node away.
    expect(arm.created).toBe(EXPECTED_CREATES);
    expect(arm.creates).toBe(intrinsics.creates);
  });

  // why: the correction the SUITE would take, which is not the device's row. Every adapter arm in
  // this directory builds its two cells from a plain `view` tag, not from a pressable
  // (`react-suite.itest.tsx:46`), so the stock arm owes RN's `<View>` there and not `<Pressable>`.
  // Measuring the device's row and applying its delta to the suite would over-correct by whatever a
  // press machine costs, which is exactly the kind of borrowed number this directory exists to
  // refuse.
  it('builds the row from View and Text alone, as the suite would once corrected', () => {
    if (!canHostStock) {
      print(SKIP_NOTE);
      return;
    }
    /* eslint-disable @typescript-eslint/no-require-imports -- see above */
    const TextInput =
      require('react-native/Libraries/Components/TextInput/TextInput').default;
    const View = require('react-native/Libraries/Components/View/View').default;
    const Text = require('react-native/Libraries/Text/Text').default;
    /* eslint-enable @typescript-eslint/no-require-imports */

    const arm = timeArm('suite shape', id =>
      h(
        View,
        { key: id, style: ROW_STYLE, nativeID: `row-${id}` },
        h(Text, { style: CELL_STYLE }, String(id)),
        h(View, { style: CELL_STYLE }, h(Text, null, `row ${id}`)),
        h(View, { style: CELL_STYLE }, h(Text, null, 'x')),
        h(TextInput, { style: INPUT_STYLE, value: `row ${id}` }),
      ),
    );

    if (intrinsics === undefined)
      throw new Error('the intrinsics arm did not run');

    const delta = arm.wall - intrinsics.wall;
    print(
      `DEBUG CORRECTION intrinsics=${intrinsics.wall.toFixed(1)} suite-shape=${arm.wall.toFixed(1)} ms · ` +
        `the suite stock column is short by ${delta.toFixed(1)} ms per ${ROWS} rows ` +
        `= ${((delta * 1_000) / ROWS).toFixed(1)} us per row`,
    );

    expect(arm.census).toBe(intrinsics.census);
    expect(arm.nodes).toBe(EXPECTED_NODES);
  });
});

report();

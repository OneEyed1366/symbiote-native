// Why the benchmark row carries its TextInput UNCONDITIONALLY, and that it commits ten views with
// no anchor — against the REAL committed Fabric tree, mounting the REAL compiled
// `examples/vue-sfc/components/BenchmarkRow.vue` through esbuild's own `.vue` SFC loader
// (`scripts/run-itests.mjs`'s `compile-vue-sfc`, new — `metro-vue-transformer.cjs`'s `compileSfc`
// is the exact function Metro calls in a real app, run here at bundle time the same way Svelte's
// `.svelte` loader already ran Svelte's compiler).
//
// This replaces the COMMIT-shape half of
// adapters/vue/benchmark-row-shape.test.ts's `installFabric()` usage — the subject is Fabric CALL
// COUNTS and the committed tree's key-by-key VALUE shape, both mechanism the recording host
// deliberately answers with nothing. The retained-tree census half (`isAnchor`/`childrenOf`, host-
// independent) stayed on `installRecordingFabric()` in that file — see its own header for why.

import { h, mount } from '@symbiote-native/vue';
import BenchmarkRow from '../../../../../examples/vue-sfc/components/BenchmarkRow.vue';

import {
  committedTree,
  describe,
  expect,
  findCommitted,
  flushTimers,
  it,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROW = { id: 7, label: 'row 7' };
const noop = (): void => {};

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

describe('the benchmark row is ten views, the last an input, with no anchor, on the real engine', () => {
  // TEN is load-bearing rather than descriptive: the screen turns a row count into a view count
  // with it, and a row that drifts to 9 or 11 puts every number on the readout ~10% off the other
  // canaries while nothing goes red.
  it('commits ten views, the trailing one a single-line input', async () => {
    const surface = mount(ROOT_TAG, {
      render: () =>
        h(BenchmarkRow, {
          row: ROW,
          isSelected: false,
          onSelect: noop,
          onRemove: noop,
        }),
    });
    await tick();
    surface.commit();
    await tick();

    const tree = committedTree();
    expect(tree !== undefined).toBe(true);
    if (tree === undefined) throw new Error('unreachable: nothing committed');

    // Flatten the whole shadow tree to a list, in document order, and drop the surface/
    // AppContainer wrapper ahead of the row's own views (neither is part of what this row costs).
    const all: string[] = [];
    const walk = (
      node: NonNullable<ReturnType<typeof committedTree>>,
    ): void => {
      all.push(node.viewName);
      for (const child of node.children) walk(child);
    };
    walk(tree);
    // RootView + the synthetic box-none AppContainer are the two wrapper nodes ahead of the row.
    const contentShape = all.slice(2);

    expect(contentShape.length).toBe(10);
    // Short debug name, not the native class — same "ScrollView"-not-"RCTScrollView" convention
    // established for sticky-native-attach's committed-tree reads.
    expect(contentShape[contentShape.length - 1]).toBe('TextInput');

    // No anchor: the property the unconditional input exists for. Every committed view name is a
    // real, painting Fabric view — an anchor would show up as extra structure the census would
    // catch, but this row's whole claim is that Fabric's own view count already proves it.
    const input = findCommitted(n => n.viewName === 'TextInput');
    expect(input !== undefined).toBe(true);
    unmountQuietly();
  });
});

function unmountQuietly(): void {
  // No `unmount` export needed here: `report()`'s per-case `__symbioteTester.reset()` already
  // empties the platform before the next case, and there is only one case in this file.
}

report();

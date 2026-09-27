// @symbiote-platform-extensions
//
// The STOCK half of the allocation comparison. Its counterpart is `allocation-volume.itest.ts`.
//
// why it is a second file: the stock renderer needs this file's directive, and under it an
// `@symbiote-native/engine` import resolves RN's `Platform.ios.js`, reaches for a native module and
// kills the bundle. So the two halves run as two processes and are read side by side, the same split
// the row-payload oracle uses.
//
// why it matters that this arm exists at all: `allocation-volume.itest.ts` prices the engine against
// RAW, and RAW is the protocol FLOOR rather than stock — it keeps no tree and runs no reconciler.
// React allocates fibers, elements and props objects on top of the same `createNode` calls, so the
// only honest question is what a node costs REACT'S OWN renderer, measured the same way on the same
// engine.
//
// READ BY SLOPE, two widths (§7): the first arm in a process pays module warm-up and the first
// commit is dearer than the rest, and a slope cancels both.
//
// RUN ON `bench:itest` — a development React cannot drive `ReactFabric-prod`.

import { createElement as h } from 'react';

import {
  collectGarbage,
  describe,
  expect,
  flushTimers,
  heapInfo,
  it,
  mounted,
  print,
  report,
} from './harness';
import { loadStockRenderer } from './stock-renderer';

const ROOT_TAG = 1;
const NARROW = 1_000;
const WIDE = 4_000;

// The same style the engine half writes, so the two arms carry the same payload per node.
const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };

declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

type IHeap = { allocated: number; collections: number };

function heap(): IHeap | undefined {
  const info = heapInfo();
  const allocated = info.hermes_totalAllocatedBytes;
  const collections = info.hermes_numCollections;
  if (allocated === undefined || collections === undefined) return undefined;
  return { allocated, collections };
}

function build(count: number): void {
  /* eslint-disable @typescript-eslint/no-require-imports -- see `stock-suite.itest.tsx` for why
     these are requires rather than imports */
  const View = require('react-native/Libraries/Components/View/View').default;
  /* eslint-enable @typescript-eslint/no-require-imports */

  const rows = [];
  for (let at = 0; at < count; at += 1) {
    rows.push(h(View, { key: at, style: ROW_STYLE }));
  }
  const { render } = loadStockRenderer();
  render(h(View, { style: { flex: 1 } }, ...rows), ROOT_TAG, null, null);
  flushTimers();
  mounted();
}

/** Cumulative allocation across `build`, from a collected floor. */
function measure(count: number): IHeap | undefined {
  collectGarbage();
  const before = heap();
  if (before === undefined) return undefined;
  build(count);
  const after = heap();
  if (after === undefined) return undefined;
  return {
    allocated: after.allocated - before.allocated,
    collections: after.collections - before.collections,
  };
}

describe('what a node costs the collector through React own renderer', () => {
  it('prices a node in bytes on the stock renderer', () => {
    if (!canHostStock) {
      print('DEBUG STOCK  SKIPPED — needs the bench build (bench:itest)');
      return;
    }

    const narrow = measure(NARROW);
    const wide = measure(WIDE);
    if (narrow === undefined || wide === undefined) {
      print('DEBUG STOCK  SKIPPED — this engine reports no heap info');
      return;
    }

    const perNode = (wide.allocated - narrow.allocated) / (WIDE - NARROW);
    print(
      `DEBUG STOCK  ${NARROW} nodes ${(narrow.allocated / 1_048_576).toFixed(1)} MB ` +
        `(${narrow.collections} GCs) · ${WIDE} nodes ` +
        `${(wide.allocated / 1_048_576).toFixed(1)} MB (${wide.collections} GCs) · ` +
        `${perNode.toFixed(0)} bytes/node`,
    );

    // PRINTED, NOT BOUNDED — the comparison lives across two processes, so a number here can only be
    // read beside the engine half's. What is asserted is that the arm allocated at all.
    expect(perNode).toBeGreaterThan(0);
  });
});

report();

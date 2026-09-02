// Where a benchmark Select does and does not cost this adapter. Device 2026-09-01: wall 14.7 ms
// against stock's 7.3, reconcile window 1.6 ms, WRITES 2 — so the engine is clean and the ~13 ms
// sits in pass 1. The obvious suspect was the shim: a bag rebuilt for every row whose `class`
// expression re-runs, which would be 1 000 `foldHostBag` + `normalizeBagClasses` + diff cycles.
//
// Measured here, and it is REFUTED — Svelte narrows at the component-prop boundary:
//
//   isSelected expression re-evaluated   1 000   every row reads `selectedId`
//   row bag rebuilt                          1   only the row that changed
//   `set p` into the shim                    1
//
// So this adapter is touched ONCE per select and the residue is Svelte's own invalidation of
// 1 000 prop expressions. Headless prices that at ~1.4 ms per 1 000 rows, which does not account
// for the device's 13 ms — that part is unattributed and needs a device profile, not this file.
//
// The row shape is copied from examples/svelte/components/BenchmarkRow.svelte and
// BenchmarkScreen's `isSelected={row.id === selectedId}`; the counters are threaded through the
// compiled sources so they measure the real compiled output rather than a hand-built stand-in.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();
const ROW_OUT = join(__dirname, '.smoke-compiled-select-row.mjs');
const APP_OUT = join(__dirname, '.smoke-compiled-select-app.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

afterAll(() => {
  rmSync(ROW_OUT, { force: true });
  rmSync(APP_OUT, { force: true });
});

const ROW_SOURCE = [
  '<script>',
  '  let { row, isSelected } = $props();',
  '  const mark = () => { globalThis.__rowBagEvals = (globalThis.__rowBagEvals ?? 0) + 1; return true; };',
  '</script>',
  '',
  "<symbiote-view p={{ class: isSelected ? 'bench-row bench-row-selected' : 'bench-row', nativeID: (mark(), isSelected ? 'sel' : 'unsel'), testID: `row-${row.id}` }}>",
  '  <symbiote-text p={{ class: "bench-row-id" }}>{String(row.id)}</symbiote-text>',
  '</symbiote-view>',
].join('\n');

const APP_SOURCE = [
  '<script>',
  `  import Row from '${ROW_OUT}';`,
  '  let { rows, initial } = $props();',
  '  let selectedId = $state(initial);',
  '  globalThis.__selectRow = (id) => { selectedId = id; };',
  '</script>',
  '',
  '{#each rows as row (row.id)}',
  '  <Row {row} isSelected={(globalThis.__isSelEvals = (globalThis.__isSelEvals ?? 0) + 1, row.id === selectedId)} />',
  '{/each}',
].join('\n');

describe('a select-shaped update on a 1 000-row list', () => {
  it('counts how much of pass 1 runs per row', async () => {
    writeFileSync(
      ROW_OUT,
      compile(ROW_SOURCE, { ...COMPILE_OPTIONS, filename: 'Row.svelte' }).js
        .code,
    );
    writeFileSync(
      APP_OUT,
      compile(APP_SOURCE, { ...COMPILE_OPTIONS, filename: 'App.svelte' }).js
        .code,
    );

    // Count `set p` by instrumenting the prototype rather than the class body, so the shipped
    // code is untouched and the count is of the REAL setter.
    const { ShimElement } = await import('./dom-shim');
    const descriptor = Object.getOwnPropertyDescriptor(
      ShimElement.prototype,
      'p',
    );
    if (descriptor?.set === undefined) throw new Error('no p setter to count');
    const realSet = descriptor.set;
    let setPCalls = 0;
    Object.defineProperty(ShimElement.prototype, 'p', {
      ...descriptor,
      set(value: unknown) {
        setPCalls += 1;
        realSet.call(this, value);
      },
    });

    const rows = Array.from({ length: 1_000 }, (_unused, index) => ({
      id: index,
    }));
    const { default: App } = (await import(`file://${APP_OUT}?arm=1`)) as {
      default: Component;
    };
    mount(9_400, App, { rows, initial: -1 });
    await settle();

    const classOf = (testID: string): unknown => {
      const walk = (nodes: readonly unknown[]): unknown => {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null) continue;
          const props = (node as { props?: Record<string, unknown> }).props;
          if (props?.testID === testID) return props.nativeID ?? 'NO-NATIVE-ID';
          const kids = (node as { children?: unknown[] }).children;
          if (Array.isArray(kids)) {
            const hit = walk(kids);
            if (hit !== undefined) return hit;
          }
        }
        return undefined;
      };
      return walk(fabric.appRoot().children);
    };
    const before = JSON.stringify(classOf('row-500'));
    const select = (globalThis as { __selectRow?: (id: number) => void })
      .__selectRow;
    const hasSelect = typeof select === 'function';
    const afterMount = setPCalls;
    setPCalls = 0;
    const g = globalThis as {
      __rowBagEvals?: number;
      __isSelEvals?: number;
    };
    const bagEvalsAtMount = g.__rowBagEvals ?? 0;
    const isSelEvalsAtMount = g.__isSelEvals ?? 0;
    g.__rowBagEvals = 0;
    g.__isSelEvals = 0;
    const started = performance.now();
    select?.(500);
    await settle();
    const elapsed = performance.now() - started;

    // Snapshot BEFORE arm 2 mounts, or its 1 000 mount-time evaluations land in these counters.
    const bagEvalsOnSelect = g.__rowBagEvals ?? 0;
    const isSelEvalsOnSelect = g.__isSelEvals ?? 0;
    const after = JSON.stringify(classOf('row-500'));
    Object.defineProperty(ShimElement.prototype, 'p', descriptor);
    unmount(9_400);

    expect(hasSelect, 'the probe could drive a selection').toBe(true);
    expect(before, 'row 500 started unselected').toBe('"unsel"');
    expect(after, 'and the selection reached Fabric').toBe('"sel"');

    // THE FINDING. Svelte narrows 1 000 invalidations to ONE bag rebuild at the component-prop
    // boundary, so a select costs this adapter one `set p`, not a thousand.
    expect(bagEvalsOnSelect, 'exactly one row rebuilt its bag').toBe(1);
    expect(setPCalls, 'and reached the shim exactly once').toBe(1);
    // The other side of the same fact, and the reason the wall time is not free: the each-block's
    // own prop expression re-runs for EVERY row, because all 1 000 read `selectedId`.
    expect(
      isSelEvalsOnSelect,
      'while every row re-evaluated its own prop',
    ).toBe(1_000);
  });
});

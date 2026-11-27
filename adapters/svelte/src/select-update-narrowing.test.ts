// A select touches the adapter once: Svelte narrows at the component-prop boundary
// The residue is Svelte's own re-run of the per-row prop expressions, not the bag diff
// The counters sit in the compiled sources, the row copies the example's `BenchmarkRow`
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';
import symbioteRenderer from './symbiote-renderer';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const ROW_OUT = join(__dirname, '.smoke-compiled-select-row.mjs');
const APP_OUT = join(__dirname, '.smoke-compiled-select-app.mjs');
const ROOT_TAG = 9_400;
const ROW_COUNT = 1_000;
const SELECTED_ROW = 500;

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
  "<view p={{ class: isSelected ? 'bench-row bench-row-selected' : 'bench-row', nativeID: (mark(), isSelected ? 'sel' : 'unsel'), testID: `row-${row.id}` }}>",
  '  <text p={{ class: "bench-row-id" }}>{String(row.id)}</text>',
  '</view>',
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

function compileToFile(source: string, filename: string, out: string): void {
  writeFileSync(out, compile(source, { ...COMPILE_OPTIONS, filename }).js.code);
}

async function loadApp(): Promise<Component> {
  compileToFile(ROW_SOURCE, 'Row.svelte', ROW_OUT);
  compileToFile(APP_SOURCE, 'App.svelte', APP_OUT);
  const mod: unknown = await import(`file://${APP_OUT}?arm=1`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod))
    throw new Error('App.svelte produced no default export');
  const component: unknown = mod.default;
  if (typeof component !== 'function')
    throw new Error('App.svelte default export is not a component');
  return component;
}

function readCounter(name: string): number {
  const value: unknown = Reflect.get(globalThis, name);
  return typeof value === 'number' ? value : 0;
}

function resetCounter(name: string): void {
  Reflect.set(globalThis, name, 0);
}

function selectRow(id: number): void {
  const select: unknown = Reflect.get(globalThis, '__selectRow');
  if (typeof select !== 'function') throw new Error('the probe has no select');
  select(id);
}

// The class reaches Fabric folded into `nativeID`, so the read is the payload's and not the bag's
function nativeIdOf(testID: string): unknown {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  return hit?.payload.nativeID;
}

// Counts the bag writes on the renderer object itself, so the shipped code stays untouched
function countBagWrites(): { read: () => number; restore: () => void } {
  const realSetAttribute = symbioteRenderer.setAttribute;
  let calls = 0;
  symbioteRenderer.setAttribute = (element, key, value) => {
    if (key === 'p') calls += 1;
    realSetAttribute(element, key, value);
  };
  return {
    read: () => calls,
    restore: () => {
      symbioteRenderer.setAttribute = realSetAttribute;
    },
  };
}

describe('a select-shaped update on a 1 000-row list', () => {
  it('counts how much of pass 1 runs per row', async () => {
    const App = await loadApp();
    const bagWrites = countBagWrites();
    const rows = Array.from({ length: ROW_COUNT }, (_unused, id) => ({ id }));
    mount(ROOT_TAG, App, { rows, initial: -1 });
    await settle();
    expect(nativeIdOf(`row-${SELECTED_ROW}`), 'row starts unselected').toBe(
      'unsel',
    );

    const writesAtMount = bagWrites.read();
    resetCounter('__rowBagEvals');
    resetCounter('__isSelEvals');
    selectRow(SELECTED_ROW);
    await settle();

    const bagEvalsOnSelect = readCounter('__rowBagEvals');
    const propEvalsOnSelect = readCounter('__isSelEvals');
    const writesOnSelect = bagWrites.read() - writesAtMount;
    const selectedAfter = nativeIdOf(`row-${SELECTED_ROW}`);
    bagWrites.restore();
    unmount(ROOT_TAG);

    expect(selectedAfter, 'the selection reached Fabric').toBe('sel');
    // Svelte narrows 1 000 invalidations to one bag rebuild at the component-prop boundary
    expect(bagEvalsOnSelect, 'exactly one row rebuilt its bag').toBe(1);
    expect(writesOnSelect, 'and reached the renderer exactly once').toBe(1);
    // The wall time is not free: the each-block's prop expression re-runs for every row
    expect(propEvalsOnSelect, 'while every row re-evaluated its own prop').toBe(
      ROW_COUNT,
    );
  });
});

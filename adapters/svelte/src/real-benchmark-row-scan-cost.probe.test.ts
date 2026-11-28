// Scan cost of the each-block against the real `examples/svelte/components/BenchmarkRow.svelte`
// `each-append-scan-cost.probe.test.ts` uses a flat stand-in row, this one the production row shape

// A row with children snippets is anchor-bearing, so its subtree may push the each-block's anchor
// further from the end of the list than a flat row does
// Real source, real compiler, no mirror
import { afterEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';
import { countLongNodeScans } from './renderer-harness';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

installRecordingFabric();

const ROOT_TAG = 91_888;
const STANDING = 1_000;
const APPENDED = 200;
const TMP_DIR = join(__dirname, '../build/__smoke__/real-row-scan-cost');
const ROW_SOURCE_PATH = resolve(
  __dirname,
  '../../../examples/svelte/components/BenchmarkRow.svelte',
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function buildRows(
  start: number,
  count: number,
): { id: number; label: string }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: start + index,
    label: `row ${String(start + index)}`,
  }));
}

function compileToFile(source: string, name: string): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const file = join(TMP_DIR, `${name}.mjs`);
  writeFileSync(
    file,
    compile(source, {
      generate: 'client',
      filename: `${name}.svelte`,
      fragments: 'tree',
      css: 'external',
    }).js.code,
  );
  return file;
}

async function loadComponent(file: string): Promise<Component> {
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod))
    throw new Error(`${file} produced no default export`);
  const component: unknown = mod.default;
  if (typeof component !== 'function')
    throw new Error(`${file} default export is not a component`);
  return component;
}

function appendRows(more: unknown): void {
  const append: unknown = Reflect.get(globalThis, '__appendRows');
  if (typeof append !== 'function') throw new Error('the probe has no append');
  append(more);
}

function appSourceFor(rowFile: string): string {
  return [
    '<script>',
    `  import BenchmarkRow from '${rowFile}';`,
    '  let { rows: initialRows } = $props();',
    '  let rows = $state(initialRows);',
    '  globalThis.__appendRows = (more) => { rows = rows.concat(more); };',
    '  const noop = () => {};',
    '</script>',
    '',
    '{#each rows as row (row.id)}',
    '  <BenchmarkRow {row} isSelected={false} onSelect={noop} onRemove={noop} />',
    '{/each}',
  ].join('\n');
}

describe('real BenchmarkRow.svelte: linear node lookups under the production row shape', () => {
  it('appends 200 real rows onto 1000 standing without a scan of the list', async () => {
    const rowFile = compileToFile(
      readFileSync(ROW_SOURCE_PATH, 'utf8'),
      'BenchmarkRow',
    );
    const App = await loadComponent(
      compileToFile(appSourceFor(rowFile), 'App'),
    );

    const mountCounter = countLongNodeScans();
    mount(ROOT_TAG, App, { rows: buildRows(0, STANDING) });
    await settle();
    const mountScans = mountCounter.stop();

    const appendCounter = countLongNodeScans();
    appendRows(buildRows(STANDING, APPENDED));
    await settle();
    const appendScans = appendCounter.stop();

    expect(mountScans, 'building the list from empty').toBe(0);
    expect(appendScans, 'growing the standing list').toBe(0);
  });
});

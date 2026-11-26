// A keyed `{#each}` append must not look a node up by a linear scan of a standing list
// Such a scan is O(n) per insert, so the whole reconciler turns O(n squared)
import { afterEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { createAnchor } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';
import { countLongNodeScans } from './renderer-harness';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

installRecordingFabric();

const TMP_DIR = join(__dirname, '../build/__smoke__/each-append-scan-cost');

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

// The shape of the benchmark screen's keyed block over a growing array
// The row body is a bare tag, as this file prices the insertion mechanics and not row rendering
const APP_SOURCE = [
  '<script>',
  '  let { rows: initialRows } = $props();',
  '  let rows = $state(initialRows);',
  '  globalThis.__appendRows = (more) => { rows = rows.concat(more); };',
  '</script>',
  '',
  '{#each rows as row (row.id)}',
  '  <view p={{ testID: `row-${row.id}` }}>',
  '    <text p={{}}>{String(row.id)}</text>',
  '  </view>',
  '{/each}',
].join('\n');

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function buildRows(start: number, count: number): { id: number }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: start + index,
  }));
}

async function compileApp(rootTag: number): Promise<Component> {
  mkdirSync(TMP_DIR, { recursive: true });
  const file = join(TMP_DIR, `App-${String(rootTag)}.mjs`);
  writeFileSync(
    file,
    compile(APP_SOURCE, {
      generate: 'client',
      filename: 'App.svelte',
      fragments: 'tree',
      css: 'external',
    }).js.code,
  );
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod))
    throw new Error('App.svelte produced no default export');
  const component: unknown = mod.default;
  if (typeof component !== 'function')
    throw new Error('App.svelte default export is not a component');
  return component;
}

function appendRows(more: unknown): void {
  const append: unknown = Reflect.get(globalThis, '__appendRows');
  if (typeof append !== 'function') throw new Error('the probe has no append');
  append(more);
}

// A count of zero proves nothing if the counter cannot see a scan
describe('the node scan counter', () => {
  it('sees a linear lookup of a node in a long list', () => {
    const counter = countLongNodeScans();
    const standing = Array.from({ length: 200 }, () => createAnchor());
    standing.indexOf(standing[199]);

    expect(counter.stop()).toBe(1);
  });
});

// The append width stays fixed, so a scan that follows the standing count would grow
const WIDTHS = [200, 4_000];

describe('Svelte keyed {#each} append: linear node lookups', () => {
  for (const standing of WIDTHS) {
    const rootTag = 91_777 + standing;
    const appended = 200;

    it(`appends ${String(appended)} rows onto ${String(standing)} standing without a scan`, async () => {
      const App = await compileApp(rootTag);
      const mountCounter = countLongNodeScans();
      mount(rootTag, App, { rows: buildRows(0, standing) });
      await settle();
      const mountScans = mountCounter.stop();

      const appendCounter = countLongNodeScans();
      appendRows(buildRows(standing, appended));
      await settle();
      const appendScans = appendCounter.stop();
      unmount(rootTag);

      expect(mountScans, 'building the list from empty').toBe(0);
      expect(appendScans, 'growing the standing list').toBe(0);
    });
  }
});

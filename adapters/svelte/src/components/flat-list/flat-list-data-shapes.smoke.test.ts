// RN's FlatList takes `null` or a non-list as an empty list, the scroll view still mounts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_104;
const NUMBER_DATA = 123_456;
const LIST_OUT = join(
  __dirname,
  '..',
  'virtualized-list',
  '.smoke-compiled-virtualized-list-for-data-shapes.mjs',
);
const FLAT_OUT = join(__dirname, '.smoke-compiled-flat-data-shapes.mjs');
const ROOT_OUT = join(__dirname, '.smoke-compiled-flat-data-shapes-root.mjs');

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  for (const path of [LIST_OUT, FLAT_OUT, ROOT_OUT])
    rmSync(path, { force: true });
});

function compileToFile(source: string, filename: string, out: string): void {
  const result = compile(source, {
    generate: 'client',
    fragments: 'tree',
    css: 'external',
    filename,
  });
  writeFileSync(out, result.js.code);
}

async function loadRoot(): Promise<Component> {
  compileToFile(
    readFileSync(
      join(__dirname, '..', 'virtualized-list', 'index.svelte'),
      'utf8',
    ),
    'VirtualizedList.svelte',
    LIST_OUT,
  );
  const flatSource = readFileSync(
    join(__dirname, 'index.svelte'),
    'utf8',
  ).replace(
    "'../virtualized-list/index.svelte'",
    "'../virtualized-list/.smoke-compiled-virtualized-list-for-data-shapes.mjs'",
  );
  compileToFile(flatSource, 'FlatList.svelte', FLAT_OUT);
  compileToFile(
    `<script>
       import FlatList from './.smoke-compiled-flat-data-shapes.mjs';
       let { data, numColumns } = $props();
     </script>
     {#snippet cell({ item })}<text>{item}</text>{/snippet}
     <FlatList {data} {numColumns} item={cell} />`,
    'FlatListDataShapesRoot.svelte',
    ROOT_OUT,
  );
  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('FlatListDataShapesRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountWithData(data: unknown, numColumns: number): Promise<void> {
  mount(ROOT_TAG, await loadRoot(), { data, numColumns });
  await tick();
  await tick();
}

describe('Svelte FlatList with data that is not a list', () => {
  it.each([
    ['null', null],
    ['a number', NUMBER_DATA],
  ])('mounts an empty scroll view for %s', async (_name, data) => {
    await mountWithData(data, 1);

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
    ).toBeDefined();
  });

  it('renders an array-like object by index', async () => {
    await mountWithData({ length: 2, 0: 'a', 1: 'b' }, 1);

    const texts = fabric
      .findAll(node => node.viewName === 'RCTRawText')
      .map(node => node.props.text);
    expect(texts).toEqual(['a', 'b']);
  });

  it('mounts an empty scroll view for null in a multi column list', async () => {
    await mountWithData(null, 2);

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
    ).toBeDefined();
  });
});

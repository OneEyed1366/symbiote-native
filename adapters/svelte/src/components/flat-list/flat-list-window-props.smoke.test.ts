// `disableVirtualization` mounts every cell from the top down to the end of the window with no
// spacer, and `cellRenderer` stands in for the view around each cell
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_105;
const ITEM_HEIGHT = 100;
const ROW_COUNT = 20;
const NEAR_END_OFFSET = 1_800;
const BATCH_PERIOD_MS = 80;
const VIEWPORT = { width: 320, height: 100 };
const CONTENT = { width: 320, height: ITEM_HEIGHT * ROW_COUNT };
const DATA = Array.from({ length: ROW_COUNT }, (_unused, id) => `row-${id}`);
const LIST_OUT = join(
  __dirname,
  '..',
  'virtualized-list',
  '.smoke-compiled-virtualized-list-for-disable-virtualization.mjs',
);
const FLAT_OUT = join(__dirname, '.smoke-compiled-flat-disable-virt.mjs');
const ROOT_OUT = join(__dirname, '.smoke-compiled-flat-disable-virt-root.mjs');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createListHarness(fabric, live);
const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

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
    "'../virtualized-list/.smoke-compiled-virtualized-list-for-disable-virtualization.mjs'",
  );
  compileToFile(flatSource, 'FlatList.svelte', FLAT_OUT);
  compileToFile(
    `<script>
       import FlatList from './.smoke-compiled-flat-disable-virt.mjs';
       let { data, disableVirtualization, horizontal, hasWrapper } = $props();
       const layout = (_data, index) => ({ length: ${ITEM_HEIGHT}, offset: ${ITEM_HEIGHT} * index, index });
     </script>
     {#snippet cell({ item })}<text>{item}</text>{/snippet}
     {#snippet sep()}<text>sep</text>{/snippet}
     {#snippet wrapper(c)}
       <view p={{ testID: 'cell-' + c.cellKey + '-' + c.index + '-' + c.item, style: c.style,
         onLayout: c.onLayout, onFocus: c.onFocus }}>{@render c.children()}</view>
     {/snippet}
     <FlatList {data} {disableVirtualization} {horizontal} getItemLayout={layout}
       initialNumToRender={3} windowSize={1} item={cell} separator={sep}
       cellRenderer={hasWrapper ? wrapper : undefined} />`,
    'FlatListDisableVirtualizationRoot.svelte',
    ROOT_OUT,
  );
  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('the root component produced no default export');
  }
  return mod.default as Component;
}

async function shapeAfterScroll(
  disableVirtualization: boolean,
): Promise<string> {
  mount(ROOT_TAG, await loadRoot(), {
    data: DATA,
    disableVirtualization,
  });
  await wait(0);
  harness.simulateLayout({ viewport: VIEWPORT, content: CONTENT });
  harness.simulateScroll(NEAR_END_OFFSET);
  await wait(BATCH_PERIOD_MS);
  return harness.shape();
}

async function wrappedCells(horizontal: boolean) {
  mount(ROOT_TAG, await loadRoot(), {
    data: DATA,
    horizontal,
    hasWrapper: true,
  });
  await wait(0);
  return harness.contentView().children;
}

describe('Svelte FlatList cellRenderer', () => {
  it('wraps every cell and hands it the key, index and item', async () => {
    const cells = await wrappedCells(false);

    expect(cells.slice(0, 3).map(cell => cell.payload.testID)).toEqual([
      'cell-0-0-row-0',
      'cell-1-1-row-1',
      'cell-2-2-row-2',
    ]);
  });

  it('holds the item and the separator as its children', async () => {
    await wrappedCells(false);

    expect(live.texts(live.appRoot()).slice(0, 3)).toEqual([
      'row-0',
      'sep',
      'row-1',
    ]);
  });

  it('carries the axis style RN gives the cell', async () => {
    const cells = await wrappedCells(true);

    expect(cells.slice(0, 3).map(cell => cell.payload.flexDirection)).toEqual([
      'row',
      'row',
      'row',
    ]);
  });
});

describe('Svelte FlatList disableVirtualization', () => {
  it('mounts the rows from the top with no spacer', async () => {
    const shape = await shapeAfterScroll(true);

    expect(shape.startsWith('row-0 row-1 row-2')).toBe(true);
    expect(shape).not.toContain('[');
  });

  it('leaves a spacer between the rows when virtualized', async () => {
    expect(await shapeAfterScroll(false)).toContain('[');
  });
});

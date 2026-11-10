// `listItemComponent` это RN `ListItemComponent`: компонент рисует ячейку по item и index
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const ROOT_TAG = 91_105;
const LIST_OUT = join(
  __dirname,
  '..',
  'virtualized-list',
  '.smoke-compiled-virtualized-list-for-item-component.mjs',
);
const FLAT_OUT = join(__dirname, '.smoke-compiled-flat-item-component.mjs');
const ITEM_OUT = join(__dirname, '.smoke-compiled-list-item.mjs');
const ROOT_OUT = join(
  __dirname,
  '.smoke-compiled-flat-item-component-root.mjs',
);
const BOTH_PRESENT =
  'VirtualizedList: Both ListItemComponent and renderItem props are present. ListItemComponent will take precedence over renderItem.';

const DATA = [{ key: 'i1' }, { key: 'i2' }, { key: 'i3' }];

const fabric = installRecordingFabric();
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  warn.mockClear();
});
afterEach(() => {
  unmount(ROOT_TAG);
  for (const path of [LIST_OUT, FLAT_OUT, ITEM_OUT, ROOT_OUT])
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

async function loadRoot(withSnippet: boolean): Promise<Component> {
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
    "'../virtualized-list/.smoke-compiled-virtualized-list-for-item-component.mjs'",
  );
  compileToFile(flatSource, 'FlatList.svelte', FLAT_OUT);
  compileToFile(
    `<script>
       let { item, index } = $props();
     </script>
     <text>{\`\${index}:\${item.key}\`}</text>`,
    'ListItem.svelte',
    ITEM_OUT,
  );
  compileToFile(
    `<script>
       import FlatList from './.smoke-compiled-flat-item-component.mjs';
       import ListItem from './.smoke-compiled-list-item.mjs';
       let { data, numColumns } = $props();
     </script>
     ${withSnippet ? '{#snippet cell()}<text>from snippet</text>{/snippet}' : ''}
     <FlatList {data} {numColumns} listItemComponent={ListItem} ${withSnippet ? 'item={cell}' : ''} />`,
    'FlatListItemComponentRoot.svelte',
    ROOT_OUT,
  );
  // A module is cached by URL, the two roots differ only in the snippet
  const mod: unknown = await import(
    `file://${ROOT_OUT}?snippet=${withSnippet}`
  );
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('the root produced no default export');
  }
  return mod.default as Component;
}

async function textsOf(
  numColumns: number,
  withSnippet = false,
): Promise<unknown[]> {
  mount(ROOT_TAG, await loadRoot(withSnippet), { data: DATA, numColumns });
  await tick();
  await tick();
  return fabric
    .findAll(node => node.viewName === 'RCTRawText')
    .map(node => node.props.text);
}

describe('Svelte listItemComponent', () => {
  it('draws every item and hands it item and index', async () => {
    expect(await textsOf(1)).toEqual(['0:i1', '1:i2', '2:i3']);
  });

  it('draws every item of a multi column list with its own index', async () => {
    expect(await textsOf(2)).toEqual(['0:i1', '1:i2', '2:i3']);
  });

  it('lets the component win over the item snippet and warns', async () => {
    expect(await textsOf(1, true)).toEqual(['0:i1', '1:i2', '2:i3']);
    expect(warn).toHaveBeenCalledWith(BOTH_PRESENT);
  });
});

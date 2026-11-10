// RN hands a list's `innerViewRef` to its ScrollView through `...props`, compiled from real sources
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const ROOT_TAG = 91_103;
const LIST_OUT = join(
  __dirname,
  '..',
  'virtualized-list',
  '.smoke-compiled-virtualized-list-for-inner-view-ref.mjs',
);
const FLAT_OUT = join(__dirname, '.smoke-compiled-flat-inner-view-ref.mjs');
const ROOT_OUT = join(
  __dirname,
  '.smoke-compiled-flat-inner-view-ref-root.mjs',
);

installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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
    "'../virtualized-list/.smoke-compiled-virtualized-list-for-inner-view-ref.mjs'",
  );
  compileToFile(flatSource, 'FlatList.svelte', FLAT_OUT);
  compileToFile(
    `<script>
       import FlatList from './.smoke-compiled-flat-inner-view-ref.mjs';
       let { data, innerViewRef } = $props();
     </script>
     {#snippet cell()}{/snippet}
     <FlatList {data} item={cell} {innerViewRef} />`,
    'FlatListInnerViewRefRoot.svelte',
    ROOT_OUT,
  );
  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(
      'FlatListInnerViewRefRoot.svelte produced no default export',
    );
  }
  return mod.default as Component;
}

describe('Svelte FlatList innerViewRef', () => {
  it('receives the content node and null after unmount', async () => {
    const innerViewRef = vi.fn();
    mount(ROOT_TAG, await loadRoot(), { data: ['a', 'b'], innerViewRef });
    await tick();
    await tick();

    expect(innerViewRef).toHaveBeenCalledTimes(1);
    expect(innerViewRef).not.toHaveBeenCalledWith(null);

    unmount(ROOT_TAG);

    expect(innerViewRef).toHaveBeenLastCalledWith(null);
  });
});

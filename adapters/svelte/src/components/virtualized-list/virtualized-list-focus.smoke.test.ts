// RN keeps a viewport of cells around the last focused one mounted, so a focused input survives
// the window moving away. Compiles the real `index.svelte` like virtualized-list.smoke.test.ts

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_177;
const SCROLL_VIEW = 'RCTScrollView';
const ITEM_HEIGHT = 100;
const VIEWPORT_HEIGHT = 100;
const ROW_COUNT = 20;
const LIST_OUT = join(__dirname, '.smoke-compiled-focus-list.mjs');
const ROOT_OUT = join(__dirname, '.smoke-compiled-focus-root.mjs');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(LIST_OUT, { force: true });
  rmSync(ROOT_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(source: string, filename: string, out: string): void {
  writeFileSync(out, compile(source, { ...COMPILE_OPTIONS, filename }).js.code);
}

async function loadRoot(): Promise<Component> {
  compileToFile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    'VirtualizedList.svelte',
    LIST_OUT,
  );
  compileToFile(
    `<script>
       import VirtualizedList from './.smoke-compiled-focus-list.mjs';
       const data = Array.from({ length: ${ROW_COUNT} }, (_u, id) => id);
       function getItem(source, index) { return source[index]; }
       function getItemCount(source) { return source.length; }
       function getItemLayout(_source, index) {
         return { length: ${ITEM_HEIGHT}, offset: ${ITEM_HEIGHT} * index, index };
       }
     </script>
     {#snippet cell(info)}<text p={{}}>row-{info.item}</text>{/snippet}
     <VirtualizedList
       {data}
       {getItem}
       {getItemCount}
       {getItemLayout}
       initialNumToRender={2}
       windowSize={1}
       item={cell}
     />`,
    'FocusRoot.svelte',
    ROOT_OUT,
  );
  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('FocusRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

function scrollView(): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.viewName === SCROLL_VIEW,
  );
  if (found === undefined) throw new Error('no scroll view was committed');
  return found;
}

function scrollTo(offset: number): void {
  fabric.fireEvent(scrollView().instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: offset },
    contentSize: { width: 320, height: ITEM_HEIGHT * ROW_COUNT },
    layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
  });
}

// The node holding a row's text, its event bubbles up to the cell around it
function textNodeOf(row: string): ILiveNode {
  const found = live.findLive(live.appRoot(), node =>
    node.children.some(child => child.payload.text === row),
  );
  if (found === undefined) throw new Error(`no node holds ${row}`);
  return found;
}

async function openedAt(offset: number): Promise<void> {
  mount(ROOT_TAG, await loadRoot());
  await tick();
  fabric.fireEvent(scrollView().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
  });
  await tick();
  scrollTo(offset);
  await tick();
}

describe('Svelte VirtualizedList keeps the focused cell mounted', () => {
  it('holds a viewport around it after the window moves away', async () => {
    await openedAt(800);
    expect(live.texts(live.appRoot())).toContain('row-8');

    fabric.fireEvent(textNodeOf('row-8').instanceHandle, 'topFocus', {});
    await tick();
    scrollTo(1_500);
    await tick();

    const rows = live.texts(live.appRoot());
    expect(rows, 'the focused cell stays').toContain('row-8');
    expect(rows, 'a viewport either side stays').toContain('row-7');
    expect(rows, 'the rest of the old window goes').not.toContain('row-5');
  });

  it('retains nothing when no cell was ever focused', async () => {
    await openedAt(800);

    scrollTo(1_500);
    await tick();

    expect(live.texts(live.appRoot())).not.toContain('row-8');
  });
});

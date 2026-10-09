// RN wraps the header, footer and empty snippets with the list's counter-flip when inverted, and
// header and footer take their own style on that wrapper. Compiles the real `index.svelte`

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

const ROOT_TAG = 91_178;
const SCROLL_VIEW = 'RCTScrollView';
const VIEWPORT = 300;
const OPACITY = 0.5;
const LIST_OUT = join(__dirname, '.smoke-compiled-slots-list.mjs');
const ROOT_OUTS: string[] = [];

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(LIST_OUT, { force: true });
  for (const out of ROOT_OUTS) rmSync(out, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(source: string, filename: string, out: string): void {
  writeFileSync(out, compile(source, { ...COMPILE_OPTIONS, filename }).js.code);
}

// Node's ESM cache is keyed by URL, so each scenario compiles its root to a path of its own
async function open(listProps: string, slots: string): Promise<void> {
  const rootOut = join(
    __dirname,
    `.smoke-compiled-slots-root-${ROOT_OUTS.length}.mjs`,
  );
  ROOT_OUTS.push(rootOut);
  compileToFile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    'VirtualizedList.svelte',
    LIST_OUT,
  );
  compileToFile(
    `<script>
       import VirtualizedList from './.smoke-compiled-slots-list.mjs';
       function getItem(source, index) { return source[index]; }
       function getItemCount(source) { return source.length; }
     </script>
     {#snippet cell()}<text p={{}}>row</text>{/snippet}
     {#snippet head()}<text p={{}}>head</text>{/snippet}
     {#snippet foot()}<text p={{}}>foot</text>{/snippet}
     {#snippet nothing()}<text p={{}}>nothing</text>{/snippet}
     <VirtualizedList {getItem} {getItemCount} item={cell} ${listProps} ${slots} />`,
    'SlotsRoot.svelte',
    rootOut,
  );
  const mod: unknown = await import(`file://${rootOut}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('SlotsRoot.svelte produced no default export');
  }
  const root = mod.default as Component;
  mount(ROOT_TAG, root);
  await tick();
  const scroll = live.findLive(
    live.appRoot(),
    node => node.viewName === SCROLL_VIEW,
  );
  if (scroll === undefined) throw new Error('no scroll view was committed');
  fabric.fireEvent(scroll.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  await tick();
}

function wrapperOf(label: string): ILiveNode {
  const found = live.findLive(live.appRoot(), node =>
    node.children.some(child =>
      child.children.some(c => c.payload.text === label),
    ),
  );
  if (found === undefined) throw new Error(`no wrapper holds ${label}`);
  return found;
}

function flipsOf(node: ILiveNode): boolean {
  return JSON.stringify(node.payload).includes('-1');
}

const THREE = 'data={[1, 2, 3]}';
const NONE = 'data={[]}';

describe('Svelte list header, footer and empty snippets', () => {
  it('counter-flips header and footer of an inverted list', async () => {
    await open(`${THREE} inverted`, 'header={head} footer={foot}');

    expect(flipsOf(wrapperOf('head'))).toBe(true);
    expect(flipsOf(wrapperOf('foot'))).toBe(true);
  });

  it('counter-flips the empty snippet of an inverted list', async () => {
    await open(`${NONE} inverted`, 'empty={nothing}');

    expect(flipsOf(wrapperOf('nothing'))).toBe(true);
  });

  it('leaves the snippets upright when the list is not inverted', async () => {
    await open(THREE, 'header={head}');

    expect(flipsOf(wrapperOf('head'))).toBe(false);
  });

  it('applies listHeaderComponentStyle and listFooterComponentStyle', async () => {
    await open(
      `${THREE} listHeaderComponentStyle={{ opacity: ${OPACITY} }} listFooterComponentStyle={{ opacity: ${OPACITY} }}`,
      'header={head} footer={foot}',
    );

    expect(wrapperOf('head').payload.opacity).toBe(OPACITY);
    expect(wrapperOf('foot').payload.opacity).toBe(OPACITY);
  });
});

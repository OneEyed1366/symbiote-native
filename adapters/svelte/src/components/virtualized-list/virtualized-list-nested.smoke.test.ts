// A list in a cell of a list with the same orientation shares the outer scroll, as RN's does
// It renders a plain view, windows by the outer scroll, and gets the outer drag events
// Compiles the real `index.svelte` of the list and the modal like virtualized-list.smoke.test.ts

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { parentOf } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_178;
const OUTER_CELL = 300;
const INNER_ROW = 50;
const INNER_ROWS = 40;
const VIEWPORT = 400;
const INNER_CELL_INDEX = 1;
const LIST_OUT = join(__dirname, '.smoke-compiled-nested-list.mjs');
const MODAL_OUT = join(__dirname, '.smoke-compiled-nested-modal.mjs');
const ROOT_OUT = join(__dirname, '.smoke-compiled-nested-root.mjs');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The compiled root reads these off `globalThis`, a test sets them before it mounts
const probe: { dragStarts: string[]; isInsideModal: boolean } = {
  dragStarts: [],
  isInsideModal: false,
};
Object.assign(globalThis, { nestedProbe: probe });

beforeEach(() => {
  fabric.reset();
  probe.dragStarts = [];
  probe.isInsideModal = false;
});
afterEach(() => {
  unmount(ROOT_TAG);
  for (const out of [LIST_OUT, MODAL_OUT, ROOT_OUT])
    rmSync(out, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(source: string, filename: string, out: string): void {
  writeFileSync(out, compile(source, { ...COMPILE_OPTIONS, filename }).js.code);
}

const ROOT_SOURCE = `<script>
  import VirtualizedList from './.smoke-compiled-nested-list.mjs';
  import Modal from './.smoke-compiled-nested-modal.mjs';
  const probe = globalThis.nestedProbe;
  const rows = Array.from({ length: ${INNER_ROWS} }, (_u, id) => id);
  const cells = [0, 1, 2, 3, 4];
  const getItem = (source, index) => source[index];
  const getItemCount = source => source.length;
  const keyOf = prefix => item => prefix + item;
  const layoutOf = length => (_source, index) => ({
    length,
    offset: length * index,
    index,
  });
  const onDrag = () => probe.dragStarts.push('inner');
</script>
{#snippet row(info)}<text p={{}}>r-{info.item}</text>{/snippet}
{#snippet inner()}
  <VirtualizedList
    testID="inner"
    data={rows}
    {getItem}
    {getItemCount}
    keyExtractor={keyOf('r-')}
    getItemLayout={layoutOf(${INNER_ROW})}
    windowSize={1}
    initialNumToRender={2}
    onScrollBeginDrag={onDrag}
    item={row}
  />
{/snippet}
{#snippet cell(info)}
  {#if info.item === ${INNER_CELL_INDEX}}
    {#if probe.isInsideModal}
      <Modal visible={true}>{@render inner()}</Modal>
    {:else}
      {@render inner()}
    {/if}
  {:else}
    <text p={{}}>plain-{info.item}</text>
  {/if}
{/snippet}
<VirtualizedList
  testID="outer"
  data={cells}
  {getItem}
  {getItemCount}
  keyExtractor={keyOf('c-')}
  getItemLayout={layoutOf(${OUTER_CELL})}
  windowSize={3}
  item={cell}
/>`;

async function loadRoot(): Promise<Component> {
  compileToFile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    'VirtualizedList.svelte',
    LIST_OUT,
  );
  compileToFile(
    readFileSync(join(__dirname, '../modal/index.svelte'), 'utf8'),
    'Modal.svelte',
    MODAL_OUT,
  );
  compileToFile(ROOT_SOURCE, 'NestedRoot.svelte', ROOT_OUT);
  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('NestedRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

function handleFrom(node: IAuthoredNode | undefined): object {
  const handle = node?.instanceHandle;
  if (typeof handle !== 'object' || handle === null) {
    throw new Error('no node with an instance handle');
  }
  return handle;
}

function handleOf(testID: string): object {
  return handleFrom(fabric.find(node => node.props.testID === testID));
}

// The cell view the list wraps around the node with this `testID`
function cellHandleOf(testID: string): object {
  const inner = fabric.find(node => node.props.testID === testID);
  const cell = inner === undefined ? undefined : parentOf(inner.handle);
  return handleFrom(fabric.find(node => node.handle === cell));
}

function scrollOuter(offset: number): void {
  fabric.fireEvent(handleOf('outer'), 'topScroll', {
    contentOffset: { x: 0, y: offset },
    contentSize: { width: 320, height: OUTER_CELL * 5 },
    layoutMeasurement: { width: 320, height: VIEWPORT },
  });
}

// The inner list sits one outer cell down, as Yoga would report it relative to the outer scroll
async function openedAt(offset: number): Promise<void> {
  fabric.answerMeasureLayout(handle =>
    handle === handleOf('outer')
      ? undefined
      : {
          x: 0,
          y: OUTER_CELL * INNER_CELL_INDEX,
          width: 320,
          height: INNER_ROW * INNER_ROWS,
        },
  );
  mount(ROOT_TAG, await loadRoot());
  await tick();
  fabric.fireEvent(handleOf('outer'), 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  await tick();
  fabric.fireEvent(handleOf('inner'), 'topLayout', {
    layout: { x: 0, y: OUTER_CELL, width: 320, height: INNER_ROW * INNER_ROWS },
  });
  await tick();
  // The inner list laid out before the outer cell holding it, the order a real layout pass gives
  fabric.fireEvent(cellHandleOf('inner'), 'topLayout', {
    layout: { x: 0, y: OUTER_CELL, width: 320, height: OUTER_CELL },
  });
  await tick();
  scrollOuter(offset);
  await tick();
}

describe('a Svelte list nested in a list of the same orientation', () => {
  it('renders a plain view, only the outer list is a scroll view', async () => {
    await openedAt(0);

    const scrollViews = fabric.findAll(
      node => node.viewName === 'RCTScrollView',
    );

    expect(scrollViews).toHaveLength(1);
    expect(scrollViews[0].props.testID).toBe('outer');
  });

  it('windows by the outer scroll, relative to where it sits', async () => {
    await openedAt(OUTER_CELL + 400);

    const texts = live.texts(live.appRoot());

    expect(texts).toContain('r-8');
    expect(texts).not.toContain('r-30');
  });

  it('is a scroll view of its own inside a modal in the cell', async () => {
    probe.isInsideModal = true;
    await openedAt(0);

    const scrollViews = fabric.findAll(
      node => node.viewName === 'RCTScrollView',
    );

    expect(scrollViews.map(node => node.props.testID).sort()).toEqual([
      'inner',
      'outer',
    ]);
  });

  it('gets the outer drag events', async () => {
    await openedAt(0);

    fabric.fireEvent(handleOf('outer'), 'topScrollBeginDrag', {});

    expect(probe.dragStarts).toEqual(['inner']);
  });
});

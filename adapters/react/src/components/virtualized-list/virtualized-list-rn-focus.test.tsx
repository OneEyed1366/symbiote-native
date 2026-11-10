/** @jsxRuntime automatic */
// Focus cases ported from RN's VirtualizedList-test.js, which drives `_onCellFocusCapture`
// Here a `topFocus` on a cell's text does the same, and the sequence is the snapshot's

import { createElement, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 67;
const ITEM_HEIGHT = 10;
const VIEWPORT = { width: 10, height: 50 };

type IItem = { key: number };
type IListProps = Parameters<typeof VirtualizedList<IItem>>[0];

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

beforeEach(() => {
  fabric.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

const generateItems = (count: number): IItem[] =>
  Array.from({ length: count }, (_unused, key) => ({ key }));

function listProps(items: IItem[]): IListProps {
  return {
    data: items,
    getItem: (data, index) => (data as IItem[])[index],
    getItemCount: data => (data as IItem[]).length,
    renderItem: ({ item }) => createElement('text', {}, `cell-${item.key}`),
    getItemLayout: (_data, index) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    initialNumToRender: 1,
    windowSize: 1,
  };
}

const { simulateLayout, simulateScroll, ...harness } = createListHarness(
  fabric,
  live,
);
const shape = (): string => harness.shape().replaceAll('cell-', '');

const performAllBatches = (): Promise<unknown> => vi.runAllTimersAsync();

const realSetTimeout = globalThis.setTimeout;
const REACT_FLUSH_MS = 20;
const flushReact = (): Promise<void> =>
  new Promise(resolve => realSetTimeout(resolve, REACT_FLUSH_MS));

// The cell holding `index` is the text node the harness lists, its focus bubbles to the cell
function focusCell(index: number): void {
  const text = `cell-${index}`;
  const found = harness
    .cells()
    .find(cell => live.findLive(cell.handle, one => one.payload.text === text));
  const node =
    found ?? harness.cells().find(cell => cell.payload.text === text);
  if (node === undefined) throw new Error(`cell ${index} is not mounted`);
  fabric.fireEvent(node.instanceHandle, 'topFocus', {});
}

async function open(items: IItem[]): Promise<(next: IItem[]) => void> {
  const holder: { set: (next: IItem[]) => void } = { set: () => undefined };
  function Host(): ReactElement {
    const [current, setCurrent] = useState(items);
    holder.set = setCurrent;
    return createElement(VirtualizedList<IItem>, listProps(current));
  }
  mount(ROOT_TAG, createElement(Host));
  simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 200 } });
  await performAllBatches();
  return next => holder.set(next);
}

describe('RN VirtualizedList: the last focused cell', () => {
  it('keeps the viewport below the last focused cell rendered', async () => {
    await open(generateItems(20));
    focusCell(3);
    await flushReact();
    simulateScroll(150);
    await performAllBatches();

    expect(shape()).toBe('0 1 2 3 4 5 6 7 8 [50] 14 15 16 17 18 19');
  });

  it('virtualizes the last focused cell away when focus moves to a new cell', async () => {
    await open(generateItems(20));
    focusCell(3);
    await flushReact();
    simulateScroll(150);
    await performAllBatches();
    focusCell(17);
    await flushReact();

    expect(shape()).toBe('0 [110] 12 13 14 15 16 17 18 19');
  });

  it('keeps the viewport above the last focused cell rendered', async () => {
    await open(generateItems(20));
    focusCell(3);
    await flushReact();
    simulateScroll(150);
    await performAllBatches();
    focusCell(17);
    await flushReact();
    simulateScroll(0);
    await performAllBatches();

    expect(shape()).toBe('0 1 2 3 4 [70] 12 13 14 15 16 17 18 19');
  });

  it('virtualizes the last focused index away when its item is removed', async () => {
    const update = await open(generateItems(20));
    focusCell(3);
    await flushReact();
    simulateScroll(150);
    await performAllBatches();
    const items = generateItems(20);
    update([...items.slice(0, 3), ...items.slice(4)]);
    await flushReact();

    expect(shape()).toBe('0 [70] 9 10 11 12 13 14 15 16 17 18 19');
  });
});

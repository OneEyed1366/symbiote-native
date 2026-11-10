/** @jsxRuntime automatic */
// Windowing cases ported from RN's VirtualizedList-test.js, which asserts on snapshots
// Here each expectation is the snapshot's sequence: a cell is its key, a spacer is `[height]`

import { createElement, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 62;

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

// RN's `baseItemProps` + `fixedHeightItemLayoutProps`
function listProps(items: IItem[], height?: number): IListProps {
  return {
    data: items,
    getItem: (data, index) => (data as IItem[])[index],
    getItemCount: data => (data as IItem[]).length,
    renderItem: ({ item }) => createElement('text', {}, `cell-${item.key}`),
    ...(height === undefined
      ? {}
      : {
          getItemLayout: (_data: unknown, index: number) => ({
            length: height,
            offset: height * index,
            index,
          }),
        }),
  };
}

function render(props: IListProps): ReactElement {
  return createElement(VirtualizedList<IItem>, props);
}

const { simulateLayout, simulateContentLayout, simulateScroll, ...harness } =
  createListHarness(fabric, live);
const shape = (): string => harness.shape().replaceAll('cell-', '');

async function performAllBatches(): Promise<void> {
  await vi.runAllTimersAsync();
}

// React's scheduler holds the real `setImmediate`, so a state update needs a real macrotask
const realSetTimeout = globalThis.setTimeout;
const REACT_FLUSH_TICKS = 5;
async function flushReact(): Promise<void> {
  for (let tick = 0; tick < REACT_FLUSH_TICKS; tick += 1) {
    await new Promise(resolve => realSetTimeout(resolve, 0));
  }
}

describe('RN VirtualizedList: the render window', () => {
  it('initially renders nothing when initialNumToRender is 0', () => {
    mount(
      ROOT_TAG,
      render({ ...listProps(generateItems(10), 10), initialNumToRender: 0 }),
    );

    expect(shape()).toBe('[100]');
  });

  it('does not over-render when there are fewer cells than initialNumToRender', () => {
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(10), 10),
        initialScrollIndex: 4,
        initialNumToRender: 20,
      }),
    );

    expect(shape()).toBe('[40] 4 5 6 7 8 9');
  });

  it('retains the initial render if initialScrollIndex == 0', async () => {
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(20), 10),
        initialNumToRender: 5,
        initialScrollIndex: 0,
        windowSize: 1,
      }),
    );
    simulateLayout({
      viewport: { width: 10, height: 50 },
      content: { width: 10, height: 200 },
    });
    await performAllBatches();
    simulateScroll(150);
    await performAllBatches();

    expect(shape()).toBe('0 1 2 3 4 [90] 14 15 16 17 18 19');
  });

  it('discards the initial render if initialScrollIndex != 0', async () => {
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(20), 10),
        initialNumToRender: 5,
        initialScrollIndex: 5,
        windowSize: 1,
      }),
    );
    simulateLayout({
      viewport: { width: 10, height: 50 },
      content: { width: 10, height: 200 },
    });
    await performAllBatches();
    simulateScroll(150);
    await performAllBatches();

    expect(shape()).toBe('[140] 14 15 16 17 18 19');
  });

  describe('windowSize 3 over a 20dp viewport', () => {
    const open = async (): Promise<void> => {
      mount(
        ROOT_TAG,
        render({
          ...listProps(generateItems(10), 10),
          initialNumToRender: 1,
          maxToRenderPerBatch: 1,
          windowSize: 3,
        }),
      );
      simulateLayout({
        viewport: { width: 10, height: 20 },
        content: { width: 10, height: 100 },
      });
      await performAllBatches();
    };

    it('renders a viewport of overscan below the top', async () => {
      await open();
      await performAllBatches();

      expect(shape()).toBe('0 1 2 3 [60]');
    });

    it('renders a viewport of overscan on both sides in the middle', async () => {
      await open();
      simulateScroll(50);
      await performAllBatches();
      await performAllBatches();

      expect(shape()).toBe('0 [10] 2 3 4 5 6 7 8 [10]');
    });

    it('renders a viewport of overscan above the bottom', async () => {
      await open();
      simulateScroll(80);
      await performAllBatches();
      await performAllBatches();

      expect(shape()).toBe('0 [40] 5 6 7 8 9');
    });
  });

  describe('sticky headers every third cell, windowSize 1 over a 50dp viewport', () => {
    const STICKY_EVERY = 3;
    const open = async (count: number): Promise<void> => {
      mount(
        ROOT_TAG,
        render({
          ...listProps(generateItems(count), 10),
          stickyHeaderIndices: generateItems(count)
            .map(item => item.key)
            .filter(key => key % STICKY_EVERY === 0),
          initialNumToRender: 1,
          windowSize: 1,
        }),
      );
      simulateLayout({
        viewport: { width: 10, height: 50 },
        content: { width: 10, height: count * 10 },
      });
      await performAllBatches();
    };

    it('renders the viewport on a batched render', async () => {
      await open(10);

      expect(shape()).toBe('0 1 2 3 4 [50]');
    });

    it('keeps the closest sticky header above the viewport mounted', async () => {
      await open(20);
      simulateScroll(150);
      await performAllBatches();

      expect(shape()).toBe('0 [110] 12 [10] 14 15 16 17 18 19');
    });

    it('unmounts the sticky headers once they fall below the render area', async () => {
      await open(20);
      simulateScroll(150);
      await performAllBatches();
      simulateScroll(0);
      await performAllBatches();

      expect(shape()).toBe('0 1 2 3 4 [150]');
    });
  });

  describe('maintainVisibleContentPosition, 10dp cells over a 50dp viewport', () => {
    const PREPENDED = 10;
    const CELL = 10;
    const holder: { setItems: (items: IItem[]) => void } = {
      setItems: () => undefined,
    };
    const open = async (minIndexForVisible: number): Promise<IItem[]> => {
      const items = generateItems(20);
      function Host(): ReactElement {
        const [current, setCurrent] = useState(items);
        holder.setItems = setCurrent;
        return render({
          ...listProps(current, CELL),
          initialNumToRender: 1,
          windowSize: 1,
          maintainVisibleContentPosition: { minIndexForVisible },
        });
      }
      mount(ROOT_TAG, createElement(Host));
      simulateLayout({
        viewport: { width: 10, height: 50 },
        content: { width: 10, height: items.length * CELL },
      });
      await performAllBatches();
      return items;
    };

    // The window follows the anchor key, native MVCP moves the scroll over the cells it kept
    it('keeps the rendered cells when items are prepended', async () => {
      const items = await open(0);
      expect(shape()).toBe('0 1 2 3 4 [150]');

      const added = Array.from({ length: PREPENDED }, (_unused, index) => ({
        key: items.length + index,
      }));
      const next = [...added, ...items];
      holder.setItems(next);
      await flushReact();
      expect(shape()).toBe('20 [90] 0 1 2 3 4 [150]');

      simulateContentLayout({ width: 10, height: next.length * CELL });
      simulateScroll(PREPENDED * CELL);
      await performAllBatches();
      expect(shape()).toBe('20 [80] 29 0 1 2 3 4 [150]');
    });

    it('shifts the window when the anchor moves before minIndexForVisible', async () => {
      const items = await open(1);
      expect(shape()).toBe('0 1 2 3 4 [150]');

      holder.setItems(items.slice(1));
      await flushReact();
      expect(shape()).toBe('1 2 3 4 [150]');
    });
  });
});

// The five `disableVirtualization` cases of VirtualizedList-test.js: no spacer anywhere
describe('RN VirtualizedList: disableVirtualization', () => {
  const ITEM_HEIGHT = 10;
  const VIEWPORT = { width: 10, height: 50 };
  const CONTENT = { width: 10, height: 100 };

  function open(over: Partial<IListProps>): void {
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(10), ITEM_HEIGHT),
        disableVirtualization: true,
        ...over,
      }),
    );
  }

  it('renders initialNumToRender cells with no spacer', () => {
    open({ initialNumToRender: 5, initialScrollIndex: 1 });

    expect(shape()).toBe('1 2 3 4 5');
  });

  it('renders no spacer up to initialScrollIndex on the first render', () => {
    open({
      initialNumToRender: 2,
      initialScrollIndex: 4,
      maxToRenderPerBatch: 1,
    });

    expect(shape()).toBe('4 5');
  });

  it('renders the cells before initialScrollIndex on the first batch tick', async () => {
    open({
      initialNumToRender: 1,
      initialScrollIndex: 5,
      maxToRenderPerBatch: 1,
    });
    simulateLayout({ viewport: VIEWPORT, content: CONTENT });
    await vi.advanceTimersByTimeAsync(50);

    expect(shape()).toBe('0 1 2 3 4 5 6');
  });

  it('eventually renders every cell', async () => {
    open({
      initialNumToRender: 5,
      initialScrollIndex: 1,
      windowSize: 1,
      maxToRenderPerBatch: 10,
    });
    simulateLayout({ viewport: VIEWPORT, content: CONTENT });
    await performAllBatches();

    expect(shape()).toBe('0 1 2 3 4 5 6 7 8 9');
  });
});

// RN's `cellStyle`: the wrapper holding an item and its separator follows the list's axis
describe('RN VirtualizedList: the cell wrapper', () => {
  function directionsOf(over: Partial<IListProps>): unknown[] {
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(3), 10),
        initialNumToRender: 3,
        ...over,
      }),
    );
    return harness.cells().map(cell => cell.payload.flexDirection);
  }

  it('is a row in a horizontal list', () => {
    expect(directionsOf({ horizontal: true })).toEqual(['row', 'row', 'row']);
  });

  it('is a reversed column in an inverted list', () => {
    expect(directionsOf({ inverted: true })).toEqual([
      'column-reverse',
      'column-reverse',
      'column-reverse',
    ]);
  });

  it('is a reversed row in an inverted horizontal list', () => {
    expect(directionsOf({ inverted: true, horizontal: true })).toEqual([
      'row-reverse',
      'row-reverse',
      'row-reverse',
    ]);
  });

  it('has no direction in a plain vertical list', () => {
    expect(directionsOf({})).toEqual([undefined, undefined, undefined]);
  });
});

/** @jsxRuntime automatic */
// `initialScrollIndex` cases ported from RN's VirtualizedList-test.js, which asserts on snapshots
// Here each expectation is the snapshot's sequence: a cell is its key, a spacer is `[height]`

import { createElement, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 66;
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
  vi.restoreAllMocks();
});

const generateItems = (count: number): IItem[] =>
  Array.from({ length: count }, (_unused, key) => ({ key }));

function listProps(
  items: IItem[],
  layout?: IListProps['getItemLayout'],
): IListProps {
  return {
    data: items,
    getItem: (data, index) => (data as IItem[])[index],
    getItemCount: data => (data as IItem[]).length,
    renderItem: ({ item }) => createElement('text', {}, `cell-${item.key}`),
    ...(layout === undefined ? {} : { getItemLayout: layout }),
  };
}

const fixedHeight =
  (height: number): IListProps['getItemLayout'] =>
  (_data, index) => ({ length: height, offset: height * index, index });

function render(props: IListProps): ReactElement {
  return createElement(VirtualizedList<IItem>, props);
}

const { simulateLayout, simulateScroll, ...harness } = createListHarness(
  fabric,
  live,
);
const shape = (): string => harness.shape().replaceAll('cell-', '');

async function performAllBatches(): Promise<void> {
  await vi.runAllTimersAsync();
}

// React's scheduler holds the real `setImmediate`, so a state update needs a real macrotask
const realSetTimeout = globalThis.setTimeout;
const REACT_FLUSH_MS = 20;
const flushReact = (): Promise<void> =>
  new Promise(resolve => realSetTimeout(resolve, REACT_FLUSH_MS));

// Mounts a list whose props can be swapped, as RN's `component.update` does
function mountUpdatable(initial: IListProps): (next: IListProps) => void {
  const holder: { set: (next: IListProps) => void } = { set: () => undefined };
  function Host(): ReactElement {
    const [current, setCurrent] = useState(initial);
    holder.set = setCurrent;
    return render(current);
  }
  mount(ROOT_TAG, createElement(Host));
  return next => holder.set(next);
}

function scrollTargets(): number[][] {
  return fabric.commands
    .filter(command => command.commandName === 'scrollTo')
    .map(command => command.args.map(Number));
}

describe('RN VirtualizedList: initialScrollIndex bounds', () => {
  it('gracefully handles a negative initialScrollIndex', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(10), fixedHeight(ITEM_HEIGHT)),
        initialScrollIndex: -1,
        initialNumToRender: 4,
      }),
    );

    expect(warn).toHaveBeenCalledTimes(1);

    simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 100 } });
    await performAllBatches();

    expect(shape()).toBe('0 1 2 3 4 5 6 7 8 9');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('renders the offset cells in the initial render when initialScrollIndex is set', () => {
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(10), fixedHeight(ITEM_HEIGHT)),
        initialScrollIndex: 4,
        initialNumToRender: 4,
      }),
    );

    expect(shape()).toBe('[40] 4 5 6 7 [20]');
  });
});

describe('RN VirtualizedList: scrolling after content sizing', () => {
  const open = async (
    initialScrollIndex: number,
    layout?: IListProps['getItemLayout'],
  ): Promise<void> => {
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(10), layout),
        initialScrollIndex,
        initialNumToRender: 4,
      }),
    );
    simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 200 } });
    await performAllBatches();
  };

  const lastScrollY = (): number | undefined => scrollTargets().at(-1)?.[1];

  it('scrolls to an integer initialScrollIndex', async () => {
    await open(1, fixedHeight(ITEM_HEIGHT));

    expect(lastScrollY()).toBe(10);
  });

  it('scrolls a fraction of a cell for a near-zero initialScrollIndex', async () => {
    await open(0.0001, fixedHeight(ITEM_HEIGHT));

    expect(lastScrollY()).toBeCloseTo(0.001, 6);
  });

  it('scrolls almost to the end for a near-end initialScrollIndex', async () => {
    await open(9.9999, fixedHeight(ITEM_HEIGHT));

    expect(lastScrollY()).toBeCloseTo(99.999, 6);
  });

  it('scrolls halfway through a cell for a fractional index with getItemLayout', async () => {
    const heights = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    await open(1.5, (_data, index) => ({
      length: heights[index],
      offset: heights.slice(0, index).reduce((sum, height) => sum + height, 0),
      index,
    }));

    expect(lastScrollY()).toBe(2);
  });

  // RN reports the cells through the list instance, ours only measures what renders, and the
  // window starts at cell 1 for index 1.5, so cell 0 stays unmounted and unmeasured
  const openMeasured = (measured: number[], firstOffset: number): void => {
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(10)),
        initialScrollIndex: 1.5,
        initialNumToRender: 10,
      }),
    );
    let y = firstOffset;
    for (const index of measured) {
      const height = index + 1;
      const cell = harness.cells()[index - 1];
      fabric.fireEvent(cell.instanceHandle, 'topLayout', {
        layout: { x: 0, y, width: 10, height },
      });
      y += height;
    }
    simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 200 } });
  };

  it('scrolls to a fractional initialScrollIndex from the cached layout', async () => {
    openMeasured([1, 2, 3, 4, 5, 6, 7, 8, 9], 1);
    await performAllBatches();

    expect(lastScrollY()).toBe(2);
  });

  it('scrolls to a fractional initialScrollIndex from the layout estimation', async () => {
    openMeasured([5, 6, 7, 8, 9], 0);
    await performAllBatches();

    expect(lastScrollY()).toBe(12);
  });
});

describe('RN VirtualizedList: the render region when the data changes', () => {
  const props = (items: IItem[]): IListProps => ({
    ...listProps(items, fixedHeight(ITEM_HEIGHT)),
    initialNumToRender: 1,
    maxToRenderPerBatch: 1,
  });

  it('retains the initial render region when an item is appended', async () => {
    const update = mountUpdatable({
      ...props(generateItems(10)),
      initialNumToRender: 3,
      maxToRenderPerBatch: undefined,
    });
    update({
      ...props(generateItems(11)),
      initialNumToRender: 3,
      maxToRenderPerBatch: undefined,
    });
    await flushReact();

    expect(shape()).toBe('0 1 2 [80]');
  });

  it('constrains the batch render region when an item is removed', async () => {
    const update = mountUpdatable(props(generateItems(10)));
    simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 100 } });
    await performAllBatches();
    update(props(generateItems(5)));
    await flushReact();

    expect(shape()).toBe('0 1 2 3 4');
  });
});

describe('RN VirtualizedList: initialScrollIndex past the data', () => {
  it('warns once and scrolls to the end', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(
      ROOT_TAG,
      render({
        ...listProps(generateItems(10), fixedHeight(ITEM_HEIGHT)),
        initialScrollIndex: 15,
        initialNumToRender: 4,
      }),
    );

    expect(warn).toHaveBeenCalledTimes(1);

    simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 100 } });
    await performAllBatches();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(scrollTargets().at(-1)?.[1]).toBe(50);
  });
});

describe('RN VirtualizedList: the render area before and after layout', () => {
  const props = (items: IItem[], extra: Partial<IListProps>): IListProps => ({
    ...listProps(items, fixedHeight(ITEM_HEIGHT)),
    ...extra,
  });

  it('expands the render area by maxToRenderPerBatch on a tick', async () => {
    mount(
      ROOT_TAG,
      render(
        props(generateItems(20), {
          initialNumToRender: 5,
          maxToRenderPerBatch: 2,
        }),
      ),
    );
    simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 200 } });
    await vi.runOnlyPendingTimersAsync();

    expect(shape()).toBe('0 1 2 3 4 5 6 [130]');
  });

  // RN holds the 5 initial cells until the content reports a length, ours trusts the total of
  // `getItemLayout` at once, the two events land in one frame on a device
  it('grows the render area off getItemLayout before the content is laid out', async () => {
    mount(
      ROOT_TAG,
      render(
        props(generateItems(20), { initialNumToRender: 5, windowSize: 10 }),
      ),
    );
    fabric.fireEvent(harness.scrollView().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, ...VIEWPORT },
    });
    await performAllBatches();

    expect(shape()).toBe('0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 [50]');
  });

  it('does not move the render area while initialScrollIndex > 0 and the offset is unknown', async () => {
    mount(
      ROOT_TAG,
      render(
        props(generateItems(20), {
          initialNumToRender: 5,
          initialScrollIndex: 1,
          windowSize: 10,
        }),
      ),
    );
    simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 100 } });
    await performAllBatches();

    expect(shape()).toBe('[10] 1 2 3 4 5 [140]');
  });

  it('clamps the render area when items are removed before the scroll position is known', async () => {
    const initial = {
      initialNumToRender: 5,
      initialScrollIndex: 14,
      windowSize: 10,
    };
    const update = mountUpdatable(props(generateItems(20), initial));
    update(props(generateItems(15), initial));
    await flushReact();
    simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 100 } });
    await performAllBatches();

    expect(shape()).toBe('[40] 4 5 6 7 8 9 10 11 12 13 14');
  });

  it('expands the render area once initialScrollIndex was reached', async () => {
    mount(
      ROOT_TAG,
      render(
        props(generateItems(20), {
          initialNumToRender: 5,
          initialScrollIndex: 1,
          windowSize: 10,
          maxToRenderPerBatch: 10,
        }),
      ),
    );
    simulateLayout({ viewport: VIEWPORT, content: { width: 10, height: 200 } });
    simulateScroll(10);
    await performAllBatches();

    expect(shape()).toBe('0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 [50]');
  });

  it('renders the new items when data is updated with a non-zero initialScrollIndex', async () => {
    const extra = {
      initialNumToRender: 5,
      initialScrollIndex: 1,
      windowSize: 10,
      maxToRenderPerBatch: 10,
    };
    const update = mountUpdatable(props(generateItems(2), extra));
    simulateLayout({
      viewport: { width: 10, height: 20 },
      content: { width: 10, height: 20 },
    });
    await performAllBatches();
    update(props(generateItems(4), extra));
    await flushReact();
    await performAllBatches();

    expect(shape()).toBe('0 1 [20]');
  });
});

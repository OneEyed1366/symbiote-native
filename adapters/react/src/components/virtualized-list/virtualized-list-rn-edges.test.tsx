/** @jsxRuntime automatic */
// Edge callback cases ported from RN's VirtualizedList-test.js

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 64;
const CELL = 40;
const VIEWPORT = { width: 300, height: 600 };
const THRESHOLD = 1;

type IItem = { key: string };
type IListProps = Parameters<typeof VirtualizedList<IItem>>[0];

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createListHarness(fabric, live);
const onStartReached = vi.fn();
const onEndReached = vi.fn();

beforeEach(() => {
  fabric.reset();
  onStartReached.mockClear();
  onEndReached.mockClear();
  vi.useFakeTimers();
});
afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

const items = (count: number): IItem[] =>
  Array.from({ length: count }, (_unused, index) => ({ key: `key-${index}` }));

function listProps(data: IItem[]): IListProps {
  return {
    data,
    getItem: (source, index) => (source as IItem[])[index],
    getItemCount: source => (source as IItem[]).length,
    renderItem: ({ item }) => createElement('text', {}, item.key),
    initialNumToRender: 10,
  };
}

const withLayout = (props: IListProps): IListProps => ({
  ...props,
  windowSize: 10,
  getItemLayout: (_data, index) => ({
    length: CELL,
    offset: CELL * index,
    index,
  }),
});

const settle = (): Promise<void> =>
  vi.runAllTimersAsync().then(() => undefined);

async function openWithLayout(data: IItem[], extra: Partial<IListProps>) {
  mount(
    ROOT_TAG,
    createElement(VirtualizedList<IItem>, {
      ...withLayout(listProps(data)),
      ...extra,
    }),
  );
  harness.simulateLayout({
    viewport: VIEWPORT,
    content: { width: VIEWPORT.width, height: data.length * CELL },
  });
  await settle();
}

describe('RN VirtualizedList: edge callbacks', () => {
  it('calls onStartReached initially', async () => {
    await openWithLayout(items(40), {
      onStartReachedThreshold: THRESHOLD,
      onStartReached,
    });

    expect(onStartReached).toHaveBeenCalled();
  });

  it('calls onEndReached when near the end', async () => {
    const data = items(40);
    await openWithLayout(data, {
      onEndReachedThreshold: THRESHOLD,
      onEndReached,
    });
    expect(onEndReached).not.toHaveBeenCalled();

    harness.simulateScroll(CELL);
    await settle();
    expect(onEndReached).not.toHaveBeenCalled();

    harness.simulateScroll(data.length * CELL);
    await settle();
    expect(onEndReached).toHaveBeenCalled();
  });

  it('does not call onEndReached when the content size changes after the layout', async () => {
    const data = items(20);
    const initialContent = 10 * CELL;
    mount(
      ROOT_TAG,
      createElement(VirtualizedList<IItem>, {
        ...listProps(data),
        windowSize: 21,
        onEndReachedThreshold: 2,
        onEndReached,
      }),
    );
    harness.simulateLayout({
      viewport: VIEWPORT,
      content: { width: VIEWPORT.width, height: initialContent },
    });
    harness.simulateContentLayout({
      width: VIEWPORT.width,
      height: data.length * CELL,
    });
    await settle();
    expect(onEndReached).not.toHaveBeenCalled();

    harness.cells().forEach((cell, index) => {
      fabric.fireEvent(cell.instanceHandle, 'topLayout', {
        layout: { x: 0, y: index * CELL, width: 10, height: CELL },
      });
    });
    harness.simulateScroll(initialContent);
    await settle();

    expect(onEndReached).toHaveBeenCalled();
  });
});

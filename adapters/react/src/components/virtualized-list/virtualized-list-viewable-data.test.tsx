/** @jsxRuntime automatic */
// RN VirtualizedList-test: the viewable set follows the data, not stale indices, after a prepend

import { createElement, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VirtualizedList,
  mount,
  unmount,
  type IViewableItemsChangedInfo,
} from '@symbiote-native/react';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

type IItem = { key: string };

const ROOT_TAG = 63;
const ITEM_HEIGHT = 800;
const VIEWPORT = 600;
const WIDTH = 300;
const SECOND_SCROLL = 100;

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const reports: string[][] = [];
const setters: { data: (next: IItem[]) => void } = { data: () => undefined };

function App(): ReactElement {
  const [data, setData] = useState<IItem[]>([
    { key: 'i1' },
    { key: 'i2' },
    { key: 'i3' },
  ]);
  setters.data = setData;
  return createElement(VirtualizedList<IItem>, {
    data,
    getItem: (items: unknown, index: number) => (items as IItem[])[index],
    getItemCount: (items: unknown) => (items as IItem[]).length,
    keyExtractor: item => item.key,
    getItemLayout: (_items: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }) => createElement('text', {}, item.key),
    onViewableItemsChanged: (info: IViewableItemsChangedInfo<IItem>) => {
      reports.push(info.viewableItems.map(token => token.key));
    },
  });
}

function scrollView(): IAuthoredNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('no scroll view');
  return node;
}

function scrollTo(offset: number, itemCount: number): void {
  fabric.fireEvent(scrollView().instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: offset },
    contentSize: { width: WIDTH, height: itemCount * ITEM_HEIGHT },
    layoutMeasurement: { width: WIDTH, height: VIEWPORT },
  });
}

describe('VirtualizedList viewability after the data changes', () => {
  it('reports the item now under the viewport, not the old index', () => {
    reports.length = 0;
    mount(ROOT_TAG, <App />);
    fabric.fireEvent(scrollView().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: WIDTH, height: VIEWPORT },
    });
    fabric.fireEvent(scrollView().instanceHandle, 'topScrollBeginDrag', {});
    scrollTo(0, 3);

    expect(reports).toEqual([['i1']]);

    setters.data([{ key: 'i4' }, { key: 'i1' }, { key: 'i2' }, { key: 'i3' }]);
    scrollTo(SECOND_SCROLL, 4);

    expect(reports).toEqual([['i1'], ['i4']]);
  });
});

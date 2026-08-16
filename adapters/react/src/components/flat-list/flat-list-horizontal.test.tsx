// On iOS the scroll axis is decided by content overflow, so a horizontal list must
// (1) forward `horizontal` to the native RCTScrollView and (2) pin the content view to
// the full row width, else the content stays at the frame width, the row is clipped, and
// nothing scrolls. We assert both against the fake Fabric slot.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 32;
const ITEM_COUNT = 20;
const ITEM_WIDTH = 50;
const TOTAL_WIDTH = ITEM_COUNT * ITEM_WIDTH;
const VIEWPORT_WIDTH = 200;

interface IRow {
  id: string;
  index: number;
}

const data: IRow[] = Array.from({ length: ITEM_COUNT }, (_, index) => ({
  id: `row-${index}`,
  index,
}));

function App(): ReactElement {
  return createElement(FlatList<IRow>, {
    data,
    horizontal: true,
    keyExtractor: (item: IRow) => item.id,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_WIDTH,
      offset: ITEM_WIDTH * index,
      index,
    }),
    renderItem: ({ item }: { item: IRow; index: number }) =>
      createElement('symbiote-view', { key: item.id, style: { width: ITEM_WIDTH, height: 40 } }),
  });
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findCreated(viewName: string): IFakeNode {
  const node = fabric.find(n => n.viewName === viewName);
  expect(node, `${viewName} created`).toBeDefined();
  if (node === undefined) throw new Error(`unreachable: ${viewName} missing`);
  return node;
}

// No Negative group: `horizontal` is a plain boolean prop with no guard clause — every value
// it accepts is valid, so there is no reject path to assert against.
describe('horizontal FlatList (Positive — no throwing path)', () => {
  it('forwards horizontal to the native RCTScrollView', () => {
    // why: iOS decides the scroll axis from the native RCTScrollView's own `horizontal` prop,
    // so a dropped forward silently degrades a horizontal list back to vertical.
    mount(ROOT_TAG, createElement(App));
    const scrollView = findCreated('RCTScrollView');
    expect(scrollView.props.horizontal).toBe(true);
  });

  it('pins the content view to the full row width as a row', () => {
    // why: the content view must be pinned to the full row width, not the frame width — else
    // the row never overflows and the native scroll view has nothing to scroll.
    mount(ROOT_TAG, createElement(App));
    const content = findCreated('RCTScrollContentView');
    expect(content.props.width).toBe(TOTAL_WIDTH);
    expect(content.props.flexDirection).toBe('row');
  });

  it('registers an event handler that accepts a layout event', () => {
    // why: the windowing layout event must be wired through without throwing, or the list
    // never learns its viewport size and stays stuck on the initial bounded prefix.
    mount(ROOT_TAG, createElement(App));
    const scrollView = findCreated('RCTScrollView');
    expect(() =>
      fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
        layout: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: 40 },
      }),
    ).not.toThrow();
  });
});

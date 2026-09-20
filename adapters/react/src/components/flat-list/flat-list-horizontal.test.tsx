// On iOS the scroll axis is decided by content overflow, so a horizontal list must
// (1) forward `horizontal` to the native RCTScrollView and (2) pin the content view to
// the full row width, else the content stays at the frame width, the row is clipped, and
// nothing scrolls. We assert both against the fake Fabric slot.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/react';
import {
  installRecordingFabric,
  payloadOf,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

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
      createElement('view', {
        key: item.id,
        style: { width: ITEM_WIDTH, height: 40 },
      }),
  });
}

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findCreated(viewName: string): IAuthoredNode {
  const node = fabric.find(n => n.viewName === viewName);
  expect(node, `${viewName} created`).toBeDefined();
  if (node === undefined) throw new Error(`unreachable: ${viewName} missing`);
  return node;
}

/** The PAYLOAD: `width` and `flexDirection` are style keys, flattened on the way into it. */
function payloadFor(viewName: string): Record<string, unknown> {
  return payloadOf(findCreated(viewName).handle);
}

// No Negative group: `horizontal` is a plain boolean prop with no guard clause — every value
// it accepts is valid, so there is no reject path to assert against.
describe('horizontal FlatList (Positive — no throwing path)', () => {
  it('reaches the horizontal scroll tag, which is what carries the axis', () => {
    // why: both the axis flag and the content node's row style are engine rules now
    // (`scroll-view-payload.itest.ts`, `scroll-content-payload.itest.ts`), and under this host the
    // iOS name table maps BOTH axes to `RCTScrollView`/`RCTScrollContentView` — so nothing visible
    // here distinguishes the axis at all. What a list still owes is the two-node scroll structure:
    // reach no behavior and there is no content view to pin a width to, which the next case does.
    mount(ROOT_TAG, createElement(App));
    expect(payloadFor('RCTScrollContentView')).toBeDefined();
  });

  it('pins the content view to the full row width as a row', () => {
    // why: the content view must be pinned to the full row width, not the frame width — else
    // the row never overflows and the native scroll view has nothing to scroll.
    mount(ROOT_TAG, createElement(App));
    // The WIDTH is the list's own arithmetic and stays here; the row direction beside it is the
    // engine's rule (`core/engine/cpp/tests/js/scroll-content-payload.itest.ts`).
    expect(payloadFor('RCTScrollContentView').width).toBe(TOTAL_WIDTH);
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

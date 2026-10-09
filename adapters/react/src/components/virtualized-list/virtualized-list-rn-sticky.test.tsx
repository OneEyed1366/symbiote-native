/** @jsxRuntime automatic */
// The `stickyHeaderIndices` cases of RN's VirtualizedList-test.js, which snapshot the prop its
// scroll view receives. Here the oracle is the `sticky-header` wrapper each pinned cell gets

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import { STICKY_HEADER_TAG } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 68;
const ITEM_HEIGHT = 10;
const STICKY_EVERY = 3;

type IItem = { key: number; sticky: boolean };
type IListProps = Parameters<typeof VirtualizedList<IItem>>[0];

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const itemsWithStickyEveryN = (count: number): IItem[] =>
  Array.from({ length: count }, (_unused, key) => ({
    key,
    sticky: key % STICKY_EVERY === 0,
  }));

// RN's `baseItemProps`: the sticky indices come from the items that say so
function listProps(items: IItem[], over: Partial<IListProps>): IListProps {
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
    stickyHeaderIndices: items.flatMap((item, index) =>
      item.sticky ? [index] : [],
    ),
    ...over,
  };
}

function firstText(node: ILiveNode): string | undefined {
  if (typeof node.payload.text === 'string') return node.payload.text;
  for (const child of node.children) {
    const found = firstText(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

function stickyCells(): Array<string | undefined> {
  const cells: Array<string | undefined> = [];
  live.walkLive(live.appRoot(), node => {
    if (node.tagName === STICKY_HEADER_TAG) cells.push(firstText(node));
  });
  return cells;
}

describe('RN VirtualizedList: forwarding stickyHeaderIndices', () => {
  it('pins every sticky cell when all are in the initial render window', () => {
    mount(
      ROOT_TAG,
      createElement(
        VirtualizedList<IItem>,
        listProps(itemsWithStickyEveryN(10), { initialNumToRender: 10 }),
      ),
    );

    expect(stickyCells()).toEqual(['cell-0', 'cell-3', 'cell-6', 'cell-9']);
  });

  // RN counts the header as position 0, so the same indices pin the header and cells 2, 5 and 8,
  // ours reads them as item indices and leaves the header alone: a deliberate difference
  it('reads the indices as item indices with a ListHeaderComponent', () => {
    mount(
      ROOT_TAG,
      createElement(
        VirtualizedList<IItem>,
        listProps(itemsWithStickyEveryN(10), {
          initialNumToRender: 10,
          ListHeaderComponent: () => createElement('text', {}, 'Header'),
        }),
      ),
    );

    expect(stickyCells()).toEqual(['cell-0', 'cell-3', 'cell-6', 'cell-9']);
  });

  it('pins only the sticky cells inside a partial initial render window', () => {
    mount(
      ROOT_TAG,
      createElement(
        VirtualizedList<IItem>,
        listProps(itemsWithStickyEveryN(10), { initialNumToRender: 5 }),
      ),
    );

    expect(stickyCells()).toEqual(['cell-0', 'cell-3']);
  });
});

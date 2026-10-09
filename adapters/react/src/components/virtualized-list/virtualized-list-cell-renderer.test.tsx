/** @jsxRuntime automatic */
// RN's `CellRendererComponent` replaces the view around each cell and gets its key, index, item,
// style and the layout and focus handlers, with the item and its separator as children
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VirtualizedList,
  mount,
  unmount,
  type ICellRendererComponent,
} from '@symbiote-native/react';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 63;
const ITEM_HEIGHT = 10;
const COUNT = 3;

type IItem = { key: number };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createListHarness(fabric, live);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const DATA: IItem[] = Array.from({ length: COUNT }, (_unused, key) => ({
  key,
}));
const seen: Array<{ cellKey: string; index: number; item: IItem }> = [];

const Cell: ICellRendererComponent<IItem> = props => {
  seen.push({ cellKey: props.cellKey, index: props.index, item: props.item });
  return createElement(
    'view',
    {
      testID: `cell-${props.cellKey}`,
      style: props.style,
      onLayout: props.onLayout,
      onFocus: props.onFocus,
    },
    props.children,
  );
};

function open(over: Record<string, unknown> = {}): void {
  seen.length = 0;
  mount(
    ROOT_TAG,
    createElement(VirtualizedList<IItem>, {
      data: DATA,
      getItem: (data, index) => (data as IItem[])[index],
      getItemCount: data => (data as IItem[]).length,
      keyExtractor: item => `k-${item.key}`,
      getItemLayout: (_data, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      }),
      initialNumToRender: COUNT,
      renderItem: ({ item }) => createElement('text', {}, `row-${item.key}`),
      CellRendererComponent: Cell,
      ...over,
    }),
  );
}

describe('CellRendererComponent', () => {
  it('wraps every cell in the component', () => {
    open();

    expect(
      harness.contentView().children.map(cell => cell.payload.testID),
    ).toEqual(['cell-k-0', 'cell-k-1', 'cell-k-2']);
  });

  it('hands it the key, index and item of the cell', () => {
    open();

    expect(seen.slice(0, COUNT)).toEqual([
      { cellKey: 'k-0', index: 0, item: DATA[0] },
      { cellKey: 'k-1', index: 1, item: DATA[1] },
      { cellKey: 'k-2', index: 2, item: DATA[2] },
    ]);
  });

  it('holds the item and the separator as its children', () => {
    open({
      ItemSeparatorComponent: () => createElement('text', {}, 'sep'),
    });

    expect(live.texts(live.appRoot())).toEqual([
      'row-0',
      'sep',
      'row-1',
      'sep',
      'row-2',
    ]);
  });

  it('carries the axis style RN gives the cell', () => {
    open({ horizontal: true });

    expect(
      harness.contentView().children.map(cell => cell.payload.flexDirection),
    ).toEqual(['row', 'row', 'row']);
  });
});

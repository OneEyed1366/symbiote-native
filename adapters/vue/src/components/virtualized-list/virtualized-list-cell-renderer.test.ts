// RN's `CellRendererComponent` replaces the view around each cell and gets its key, index, item,
// style and the layout and focus handlers, with the item and its separator in its default slot
import {
  defineComponent,
  h,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/vue';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

// A generic component has a construct signature `h()` cannot resolve
const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 323;
const ITEM_HEIGHT = 10;
const COUNT = 3;

type IRow = { id: number };

const DATA: IRow[] = Array.from({ length: COUNT }, (_unused, id) => ({ id }));
const seen: Array<{ cellKey: string; index: number; item: IRow }> = [];

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createListHarness(fabric, live);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const Cell = defineComponent({
  props: ['cellKey', 'index', 'item', 'style', 'onLayout', 'onFocus'],
  setup(props, { slots }) {
    return () => {
      seen.push({
        cellKey: props.cellKey,
        index: props.index,
        item: props.item,
      });
      return h(
        'view',
        {
          testID: `cell-${props.cellKey}`,
          style: props.style,
          onLayout: props.onLayout,
          onFocus: props.onFocus,
        },
        slots.default?.(),
      );
    };
  },
});

async function open(over: Record<string, unknown> = {}): Promise<void> {
  seen.length = 0;
  const List = defineComponent({
    setup: () => () =>
      h(
        FlatListHost,
        {
          data: DATA,
          keyExtractor: (item: IRow) => `k-${item.id}`,
          getItemLayout: (_data: unknown, index: number) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          }),
          initialNumToRender: COUNT,
          cellRendererComponent: Cell,
          ...over,
        },
        {
          item: ({ item }: { item: IRow }) => [h('text', {}, `row-${item.id}`)],
          separator: () => [h('text', {}, 'sep')],
        },
      ),
  });
  mount(ROOT_TAG, h(List));
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('Vue cellRendererComponent', () => {
  it('wraps every cell in the component', async () => {
    await open();

    expect(
      harness.contentView().children.map(cell => cell.payload.testID),
    ).toEqual(['cell-k-0', 'cell-k-1', 'cell-k-2']);
  });

  it('hands it the key, index and item of the cell', async () => {
    await open();

    expect(seen.slice(0, COUNT)).toEqual([
      { cellKey: 'k-0', index: 0, item: DATA[0] },
      { cellKey: 'k-1', index: 1, item: DATA[1] },
      { cellKey: 'k-2', index: 2, item: DATA[2] },
    ]);
  });

  it('holds the item and the separator in its default slot', async () => {
    await open();

    expect(live.texts(live.appRoot())).toEqual([
      'row-0',
      'sep',
      'row-1',
      'sep',
      'row-2',
    ]);
  });

  it('carries the axis style RN gives the cell', async () => {
    await open({ horizontal: true });

    expect(
      harness.contentView().children.map(cell => cell.payload.flexDirection),
    ).toEqual(['row', 'row', 'row']);
  });
});

// RN's `CellRendererComponent` replaces the view around each cell and gets its key, index, item,
// style and the layout and focus handlers, with the item and its separator as children
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import '../../register';
import { FlatList } from './index';
import type { ICellRendererProps } from '../virtualized-list';

const ROOT_TAG = 827;
const ITEM_HEIGHT = 10;
const COUNT = 3;

type IRow = { id: number };

const DATA: IRow[] = Array.from({ length: COUNT }, (_unused, id) => ({ id }));
const seen: Array<{ cellKey: string; index: number; item: unknown }> = [];

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createListHarness(fabric, live);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function Cell(props: ICellRendererProps<unknown>) {
  seen.push({ cellKey: props.cellKey, index: props.index, item: props.item });
  return (
    <view
      testID={`cell-${props.cellKey}`}
      style={props.style}
      onLayout={props.onLayout}
      onFocus={props.onFocus}
    >
      {props.children}
    </view>
  );
}

async function open(horizontal = false): Promise<void> {
  seen.length = 0;
  mount(ROOT_TAG, () => (
    <FlatList<IRow>
      data={DATA}
      horizontal={horizontal}
      keyExtractor={item => `k-${item.id}`}
      getItemLayout={(_data, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      })}
      initialNumToRender={COUNT}
      CellRendererComponent={Cell}
      ItemSeparatorComponent={() => <text>sep</text>}
      renderItem={info => <text>{`row-${info().item.id}`}</text>}
    />
  ));
  await tick();
}

describe('Solid CellRendererComponent', () => {
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

  it('holds the item and the separator as its children', async () => {
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
    await open(true);

    expect(
      harness.contentView().children.map(cell => cell.payload.flexDirection),
    ).toEqual(['row', 'row', 'row']);
  });
});

// Группы `numColumns` и `getItemLayout` из `FlatList-itest` в RN, на настоящем Yoga

import { createElement } from 'react';

import { FlatList, mount } from '@symbiote-native/react';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  mounted,
  report,
} from './harness';

const ROOT_TAG = 1;
const ITEM_HEIGHT = 50;

type IItem = { key: string };

function cell(item: IItem) {
  return createElement('view', {
    testID: `item-${item.key}`,
    style: { height: ITEM_HEIGHT, flex: 1 },
    collapsable: false,
  });
}

function frameOf(key: string) {
  const view = findByTestId(`item-${key}`, mounted());
  if (view === undefined) throw new Error(`item ${key} is not mounted`);
  return view.layout;
}

describe('FlatList numColumns in real layout', () => {
  // Первые два элемента делят строку пополам, третий один в строке на всю ширину
  it('packs items into rows of equal cells', () => {
    mount(
      ROOT_TAG,
      createElement(FlatList<IItem>, {
        testID: 'list',
        data: [{ key: '1' }, { key: '2' }, { key: '3' }],
        numColumns: 2,
        renderItem: ({ item }) => cell(item),
      }),
    );
    flushTimers();

    const first = frameOf('1');
    const second = frameOf('2');
    const third = frameOf('3');
    expect(first.y).toBe(0);
    expect(second.y).toBe(0);
    expect(first.width).toBe(second.width);
    expect(second.x).toBe(first.width);
    expect(third.y).toBe(ITEM_HEIGHT);
    expect(third.x).toBe(0);
    expect(third.width).toBe(first.width * 2);
  });
});

describe('FlatList getItemLayout in real layout', () => {
  it('stacks the items by their real height', () => {
    mount(
      ROOT_TAG,
      createElement(FlatList<IItem>, {
        data: [{ key: '1' }, { key: '2' }],
        renderItem: ({ item }) => cell(item),
        getItemLayout: (_data, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        }),
      }),
    );
    flushTimers();

    expect(frameOf('1').y).toBe(0);
    expect(frameOf('2').y).toBe(ITEM_HEIGHT);
    expect(frameOf('1').height).toBe(ITEM_HEIGHT);
  });
});

report();

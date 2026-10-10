// Остальные группы `FlatList-itest` из RN, на настоящем движке

import { createElement } from 'react';

import { FlatList, mount } from '@symbiote-native/react';

import {
  committedTexts,
  describe,
  dispatchEvent,
  expect,
  findByTestId,
  flushTimers,
  it,
  mounted,
  report,
} from './harness';

const ROOT_TAG = 1;
const LIST_ID = 'list';
const ITEM_HEIGHT = 100;

type IItem = { key: string; title: string };

const titles = (count: number): IItem[] =>
  Array.from({ length: count }, (_unused, at) => ({
    key: String(at),
    title: `Item ${at + 1}`,
  }));

const text = (item: IItem) => createElement('text', {}, item.title);

const itemLayout = (_data: unknown, index: number) => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * index,
  index,
});

describe('FlatList separators', () => {
  it('renders one between each pair of items', () => {
    mount(
      ROOT_TAG,
      createElement(FlatList<IItem>, {
        data: titles(3),
        renderItem: ({ item }) => text(item),
        ItemSeparatorComponent: () =>
          createElement('view', { testID: 'sep', collapsable: false }),
      }),
    );
    flushTimers();

    expect(committedTexts()).toEqual(['Item 1', 'Item 2', 'Item 3']);
    const separators: string[] = [];
    const walk = (view: ReturnType<typeof mounted>): void => {
      if (view.props.testID === 'sep') separators.push('sep');
      view.children.forEach(walk);
    };
    walk(mounted());
    expect(separators.length).toBe(2);
  });
});

describe('FlatList extraData', () => {
  it('re-renders items when it changes', () => {
    let suffix = 'v1';
    const element = () =>
      createElement(FlatList<IItem>, {
        data: titles(1),
        extraData: suffix,
        renderItem: ({ item }) =>
          createElement('text', {}, `${item.title} ${suffix}`),
      });
    mount(ROOT_TAG, element());
    flushTimers();
    expect(committedTexts()).toEqual(['Item 1 v1']);

    suffix = 'v2';
    mount(ROOT_TAG, element());
    flushTimers();

    expect(committedTexts()).toEqual(['Item 1 v2']);
  });
});

describe('FlatList contentContainerStyle', () => {
  it('lands on the content view', () => {
    mount(
      ROOT_TAG,
      createElement(FlatList<IItem>, {
        testID: LIST_ID,
        data: titles(1),
        renderItem: ({ item }) => text(item),
        contentContainerStyle: { backgroundColor: 'red', padding: 10 },
      }),
    );
    flushTimers();

    const scroll = findByTestId(LIST_ID, mounted());
    expect(scroll?.children[0]?.props.backgroundColor).toBeDefined();
  });
});

describe('FlatList windowing', () => {
  it('renders fewer items than the data at first', () => {
    mount(
      ROOT_TAG,
      createElement(FlatList<IItem>, {
        data: titles(10),
        renderItem: ({ item }) => text(item),
        getItemLayout: itemLayout,
        initialNumToRender: 2,
      }),
    );
    flushTimers();

    expect(committedTexts()).toEqual(['Item 1', 'Item 2']);
  });

  it('renders more items after a scroll', () => {
    mount(
      ROOT_TAG,
      createElement(FlatList<IItem>, {
        testID: LIST_ID,
        data: titles(10),
        renderItem: ({ item }) => text(item),
        getItemLayout: itemLayout,
        initialNumToRender: 2,
      }),
    );
    flushTimers();
    const scroll = findByTestId(LIST_ID, mounted());
    if (scroll === undefined) throw new Error('the list did not mount');

    dispatchEvent(scroll.tag, 'scroll', {
      contentOffset: { x: 0, y: 100 },
      contentSize: { width: scroll.layout.width, height: 1_000 },
      layoutMeasurement: {
        width: scroll.layout.width,
        height: scroll.layout.height,
      },
    });
    flushTimers();

    expect(committedTexts().length).toBeGreaterThan(2);
  });

  it('calls onEndReached once the end is near', () => {
    const calls: number[] = [];
    mount(
      ROOT_TAG,
      createElement(FlatList<IItem>, {
        testID: LIST_ID,
        data: titles(10),
        renderItem: ({ item }) => text(item),
        getItemLayout: itemLayout,
        onEndReached: () => {
          calls.push(1);
        },
        onEndReachedThreshold: 0.5,
      }),
    );
    flushTimers();
    const scroll = findByTestId(LIST_ID, mounted());
    if (scroll === undefined) throw new Error('the list did not mount');

    dispatchEvent(scroll.tag, 'scroll', {
      contentOffset: { x: 0, y: 800 },
      contentSize: { width: scroll.layout.width, height: 1_000 },
      layoutMeasurement: {
        width: scroll.layout.width,
        height: scroll.layout.height,
      },
    });
    flushTimers();

    expect(calls.length).toBeGreaterThan(0);
  });
});

report();

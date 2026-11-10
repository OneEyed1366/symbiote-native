// Порт `FlatList-itest` (Fantom гоняет его на Android): точная форма смонтированного дерева

import { createElement, createRef, type ReactElement } from 'react';

import { FlatList, type IFlatListHandle } from '@symbiote-native/react';

import { createRoot, render, runTask } from './culling-fixture';
import {
  beforeEach,
  commands,
  committedTexts,
  describe,
  expect,
  it,
  mounted,
  report,
  shapeOf,
} from './harness';

type IItem = { key: string; title?: string };

const text = (item: IItem) => createElement('text', {}, item.title);

function list(props: Record<string, unknown>): ReactElement {
  return createElement(FlatList<IItem>, { data: null, ...props });
}

function shape(): string {
  return mounted().children.map(shapeOf).join('');
}

const SCROLL_EMPTY = 'ScrollView(View())';

describe('<FlatList> props', () => {
  beforeEach(() => createRoot(400, 600));

  it('renders data with renderItem', () => {
    render(
      list({
        data: [
          { title: 'Title Text', key: 'item1' },
          { title: 'Title Text 2', key: 'item2' },
        ],
        renderItem: ({ item }: { item: IItem }) => text(item),
      }),
    );

    expect(shape()).toBe('ScrollView(View(Paragraph()Paragraph()))');
    expect(committedTexts()).toEqual(['Title Text', 'Title Text 2']);
  });

  it('renders an empty content view for null data', () => {
    render(list({}));

    expect(shape()).toBe(SCROLL_EMPTY);
  });

  it('puts the horizontal content view under a horizontal list', () => {
    render(list({ horizontal: true }));

    expect(shape()).toBe('ScrollView(AndroidHorizontalScrollContentView())');
  });
});

describe('<FlatList> slots', () => {
  beforeEach(() => createRoot(400, 600));

  it('renders a header before the items', () => {
    render(
      list({
        data: [{ key: 'item1', title: 'Item 1' }],
        renderItem: ({ item }: { item: IItem }) => text(item),
        ListHeaderComponent: () => createElement('text', {}, 'Header'),
      }),
    );

    // RN keeps the header wrapper as a view (its `onLayout` forms one), ours is flattened: user
    // ruling 2026-10-06, `_headerLength` is written there and never read
    expect(shape()).toBe('ScrollView(View(Paragraph()Paragraph()))');
    expect(committedTexts()).toEqual(['Header', 'Item 1']);
  });

  it('renders a footer after the items', () => {
    render(
      list({
        data: [{ key: 'item1', title: 'Item 1' }],
        renderItem: ({ item }: { item: IItem }) => text(item),
        ListFooterComponent: () => createElement('text', {}, 'Footer'),
      }),
    );

    expect(shape()).toBe('ScrollView(View(Paragraph()Paragraph()))');
    expect(committedTexts()).toEqual(['Item 1', 'Footer']);
  });

  it('renders the empty component when data is empty', () => {
    render(
      list({
        data: [],
        renderItem: () => createElement('text', {}, 'should not render'),
        ListEmptyComponent: () => createElement('text', {}, 'No items'),
      }),
    );

    expect(shape()).toBe('ScrollView(View(Paragraph()))');
    expect(committedTexts()).toEqual(['No items']);
  });

  it('does not render the empty component when data has items', () => {
    render(
      list({
        data: [{ key: 'item1', title: 'Item 1' }],
        renderItem: ({ item }: { item: IItem }) => text(item),
        ListEmptyComponent: () => createElement('text', {}, 'No items'),
      }),
    );

    expect(shape()).toBe('ScrollView(View(Paragraph()))');
    expect(committedTexts()).toEqual(['Item 1']);
  });

  it('renders separators between items', () => {
    render(
      list({
        data: [
          { key: '1', title: 'First' },
          { key: '2', title: 'Second' },
          { key: '3', title: 'Third' },
        ],
        renderItem: ({ item }: { item: IItem }) => text(item),
        ItemSeparatorComponent: () =>
          createElement('view', { testID: 'separator' }),
      }),
    );

    expect(shape()).toBe(
      'ScrollView(View(Paragraph()View()Paragraph()View()Paragraph()))',
    );
    expect(committedTexts()).toEqual(['First', 'Second', 'Third']);
  });

  it('uses a custom keyExtractor for item keys', () => {
    render(
      list({
        data: [
          { id: 'custom-1', title: 'Item 1' },
          { id: 'custom-2', title: 'Item 2' },
        ],
        renderItem: ({ item }: { item: IItem }) => text(item),
        keyExtractor: (item: { id: string }) => item.id,
      }),
    );

    expect(shape()).toBe('ScrollView(View(Paragraph()Paragraph()))');
  });
});

describe('<FlatList> layout', () => {
  beforeEach(() => createRoot(400, 600));

  const cell = () =>
    createElement('view', {
      style: { height: 50, flex: 1 },
      collapsable: false,
    });

  function frames(): string[] {
    const [scroll] = mounted().children;
    const content = scroll?.children[0];
    const frame = (view: { layout: Record<string, number> } | undefined) => {
      const { x, y, width, height } = view?.layout ?? {};
      return `{x:${x},y:${y},width:${width},height:${height}}`;
    };
    return [
      frame(scroll),
      frame(content),
      ...(content?.children ?? []).map(frame),
    ];
  }

  it('lays out items in a grid when numColumns > 1', () => {
    render(
      list({
        data: [{ key: '1' }, { key: '2' }, { key: '3' }],
        numColumns: 2,
        renderItem: cell,
      }),
    );

    expect(frames()).toEqual([
      '{x:0,y:0,width:400,height:600}',
      '{x:0,y:0,width:400,height:100}',
      '{x:0,y:0,width:200,height:50}',
      '{x:200,y:0,width:200,height:50}',
      '{x:0,y:50,width:400,height:50}',
    ]);
  });

  it('uses getItemLayout to determine item positions', () => {
    render(
      list({
        data: [{ key: '1' }, { key: '2' }],
        renderItem: cell,
        getItemLayout: (_data: unknown, index: number) => ({
          length: 50,
          offset: 50 * index,
          index,
        }),
      }),
    );

    expect(frames()).toEqual([
      '{x:0,y:0,width:400,height:600}',
      '{x:0,y:0,width:400,height:100}',
      '{x:0,y:0,width:400,height:50}',
      '{x:0,y:50,width:400,height:50}',
    ]);
  });
});

const ITEM_HEIGHT = 50;
const DATA: IItem[] = Array.from({ length: 20 }, (_unused, at) => ({
  key: String(at),
  title: `Item ${at}`,
}));

describe('<FlatList> imperative methods', () => {
  beforeEach(() => createRoot(400, 600));

  // The commands the handle sends to the scroll view since the call began, as `name[args]`
  function mountList(extra: Record<string, unknown> = {}) {
    const listRef = createRef<IFlatListHandle>();
    render(
      list({
        ref: listRef,
        nativeID: 'flat-list',
        data: DATA,
        renderItem: () =>
          createElement('view', { style: { height: ITEM_HEIGHT } }),
        getItemLayout: (_data: unknown, index: number) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        }),
        ...extra,
      }),
    );
    const scrollTag = mounted().children[0]?.tag;
    return (run: (handle: IFlatListHandle) => void) => {
      const handle = listRef.current;
      if (handle === null) throw new Error('the list ref is not attached');
      const before = commands().length;
      runTask(() => run(handle));
      const sent = commands().slice(before);
      expect(sent.every(one => one.tag === scrollTag)).toBe(true);
      return sent.map(one => `${one.commandName}${JSON.stringify(one.args)}`);
    };
  }

  it('dispatches scrollTo for a vertical list', () => {
    const act = mountList();

    expect(
      act(handle => handle.scrollToOffset({ offset: 100, animated: false })),
    ).toEqual(['scrollTo[0,100,false]']);
  });

  it('dispatches scrollTo for a horizontal list', () => {
    const act = mountList({ horizontal: true });

    expect(
      act(handle => handle.scrollToOffset({ offset: 200, animated: false })),
    ).toEqual(['scrollTo[200,0,false]']);
  });

  it('passes the animated flag through to the native command', () => {
    const act = mountList();

    expect(
      act(handle => handle.scrollToOffset({ offset: 50, animated: true })),
    ).toEqual(['scrollTo[0,50,true]']);
  });

  it('scrolls to the end of the content', () => {
    const act = mountList();

    // RN's `max(0, offset + length + footer - visibleLength)`: Fantom reads 1000 because its
    // `onLayout` has not reached JS yet, here the 600 px viewport is known
    expect(act(handle => handle.scrollToEnd({ animated: false }))).toEqual([
      'scrollTo[0,400,false]',
    ]);
  });

  it('scrolls to an index', () => {
    const act = mountList();

    expect(
      act(handle => handle.scrollToIndex({ index: 5, animated: false })),
    ).toEqual(['scrollTo[0,250,false]']);
  });

  it('scrolls to an item', () => {
    const act = mountList();

    expect(
      act(handle => handle.scrollToItem({ item: DATA[3], animated: false })),
    ).toEqual(['scrollTo[0,150,false]']);
  });

  it('dispatches nothing for an item that is not in the data', () => {
    const act = mountList();

    expect(
      act(handle =>
        handle.scrollToItem({
          item: { key: 'not-in-data', title: 'Missing' },
          animated: false,
        }),
      ),
    ).toEqual([]);
  });

  it('dispatches flashScrollIndicators', () => {
    const act = mountList();

    expect(act(handle => handle.flashScrollIndicators())).toEqual([
      'flashScrollIndicators[]',
    ]);
  });

  it('answers the scroll accessors and tolerates the harmless calls', () => {
    const act = mountList();

    const sent = act(handle => {
      expect(handle.getScrollResponder() === null).toBe(false);
      expect(handle.getNativeScrollRef() === null).toBe(false);
      expect(handle.getScrollableNode() === null).toBe(false);
      handle.recordInteraction();
      handle.setNativeProps({ scrollEnabled: false });
    });

    expect(sent).toEqual([]);
  });
});

report();

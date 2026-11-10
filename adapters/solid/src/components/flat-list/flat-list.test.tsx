// Solid twin of the React, Vue and Svelte FlatList tests, over compiled JSX and the fake Fabric
// Expectations come from RN's documented FlatList behavior, never from this adapter's own source

import { createSignal } from 'solid-js';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
import type {
  ISeparatorProps,
  IViewableItemsChangedInfo,
} from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import type { JSX } from '../../jsx-runtime';
import { mount, unmount } from '../../render';
import '../../register';
import { FlatList, type IFlatListHandle } from './index';

const ROOT_TAG = 823;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';
const REFRESH_CONTROL = 'PullToRefreshView';
const ITEM_HEIGHT = 50;
const ITEM_COUNT = 12;
const VIEWPORT_HEIGHT = 150;

type IItem = {
  id: number;
  label: string;
};

const LIST_HEIGHT_STYLE = { height: 240 };
const CONTENT_PADDING_STYLE = { paddingBottom: 24 };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function makeItems(count: number, suffix = ''): IItem[] {
  return Array.from({ length: count }, (_unused, id) => ({
    id,
    label: `item-${id}${suffix}`,
  }));
}

const DATA = makeItems(ITEM_COUNT);

const getItemLayout = (
  _data: unknown,
  index: number,
): { length: number; offset: number; index: number } => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * index,
  index,
});

// The total creation-log size, every node the engine has authored, a claim that "nothing was
// rebuilt" is a claim that this number held still across the update
function totalCreated(): number {
  return fabric.findAll(() => true).length;
}

// The auto-generated row Views only, filtered to `RCTView` because a horizontal scroll host and
// its content container carry `flexDirection: 'row'` too and would skew the packing assertions
function rowWrappers(): ILiveNode[] {
  return live.findAllLive(
    live.appRoot(),
    node => node.viewName === 'RCTView' && node.payload.flexDirection === 'row',
  );
}

function committed(viewName: string): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.viewName === viewName,
  );
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

// Every committed raw-text payload, read off the LIVE tree in tree order.
function committedLabels(): Set<string> {
  return new Set(live.texts(live.appRoot()));
}

// Mount, then hand the list its viewport through the scroll host's `onLayout`, until that lands RN
// paints the bounded `initialNumToRender` prefix and viewability has no viewport to test against
async function settleViewport(): Promise<void> {
  await tick();
  fabric.fireEvent(committed(SCROLL_VIEW).instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
  });
  await tick();
}

function fireScroll(offsetY: number): void {
  fabric.fireEvent(committed(SCROLL_VIEW).instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: offsetY },
    contentSize: { width: 320, height: ITEM_HEIGHT * ITEM_COUNT },
    layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
  });
}

const keyExtractor = (item: IItem): string => `k-${item.id}`;

// RN's documented FlatList ref surface, `as const` keeps each name a literal key of the handle
const HANDLE_METHODS = [
  'scrollToOffset',
  'scrollToIndex',
  'scrollToItem',
  'scrollToEnd',
  'flashScrollIndicators',
  'recordInteraction',
  'getNativeScrollRef',
  'getScrollableNode',
  'getScrollResponder',
  'getScrollNode',
] as const satisfies readonly (keyof IFlatListHandle)[];

describe('Solid FlatList on the engine', () => {
  describe('Positive', () => {
    // FlatList takes a PLAIN array and derives `getItem` and `getItemCount` itself, virtualization
    // still happening proves it reached the shared list
    it('derives the data protocol from a plain array and mounts only the initial batch', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      expect(committed(SCROLL_VIEW).children[0]?.viewName).toBe(CONTENT_VIEW);
      const labels = committedLabels();
      expect(labels.has('item-0')).toBe(true);
      expect(labels.has('item-1')).toBe(true);
      expect(labels.has('item-2')).toBe(false);
      expect(labels.has('item-11')).toBe(false);
    });

    // `numColumns` regroups the stream into whole ROWS, the windowed cell is a row, laid out as a
    // flex row of equally-weighted columns, or a two-column list would mount twice the cells
    it('packs items into flex-row rows of numColumns equally-weighted cells', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      const rows = rowWrappers();
      expect(rows.length, 'two rows of three, not six item cells').toBe(2);
      expect(rows[0]?.children.length).toBe(3);
      expect(rows[0]?.children.every(cell => cell.payload.flex === 1)).toBe(
        true,
      );

      const labels = committedLabels();
      expect(labels.has('item-0')).toBe(true);
      expect(labels.has('item-5'), 'the whole second row is resident').toBe(
        true,
      );
      expect(labels.has('item-6')).toBe(false);
    });

    // `columnWrapperStyle` is widened past a style object, a bare string is a registered class
    // name and resolves through the same registry as `class`, landing on the generated row view
    it('resolves a columnWrapperStyle class name onto every row wrapper', async () => {
      registerRules([
        {
          tokens: ['rowGap'],
          specificity: [0, 1, 0],
          order: 0,
          style: { columnGap: 4 },
        },
      ]);
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          columnWrapperStyle="rowGap"
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      const rows = rowWrappers();
      expect(rows.length).toBe(2);
      for (const row of rows) expect(row.payload.columnGap).toBe(4);
    });

    // Accepting a string stays ADDITIVE, a plain style object keeps working and the row's own
    // `flexDirection` survives the merge
    it('still accepts a plain columnWrapperStyle object over the row flexDirection', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          columnWrapperStyle={{ columnGap: 8 }}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      const rows = rowWrappers();
      expect(rows.length).toBe(2);
      for (const row of rows) expect(row.payload.columnGap).toBe(8);
    });

    // The divider sits BETWEEN ROWS but the caller's separator is typed on the item, so it gets the
    // real flanking items (last of the row above, first of the row below), never the row wrapper
    it('hands the row separator the real flanking items, not the IRow wrapper', async () => {
      const separator = (sep: ISeparatorProps<IItem>): JSX.Element => (
        <text>{`gap:${sep.leadingItem?.label}>${sep.trailingItem?.label}`}</text>
      );
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          ItemSeparatorComponent={separator}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      expect(committedLabels().has('gap:item-2>item-3')).toBe(true);
    });

    // The list underneath windows ROWS but `onViewableItemsChanged` is typed on the ITEM, so a
    // caller sees one token per item with its own key and absolute index, not rows
    it('expands row viewability back to one token per item', async () => {
      const reports: IViewableItemsChangedInfo<IItem>[] = [];
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA.slice(0, 6)}
          numColumns={2}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          viewabilityConfig={{ itemVisiblePercentThreshold: 0 }}
          onViewableItemsChanged={info => reports.push(info)}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const tokens = reports.flatMap(report => report.viewableItems);
      expect(tokens.length, 'six items, not three rows').toBe(6);
      expect(tokens.map(token => token.key)).toEqual([
        'k-0',
        'k-1',
        'k-2',
        'k-3',
        'k-4',
        'k-5',
      ]);
      expect(tokens.map(token => token.index)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(tokens[5]?.item.label).toBe('item-5');
    });

    // `viewabilityConfigCallbackPairs` is the multi-threshold form of the same report and must get
    // the identical item-level expansion
    it('expands row viewability for every viewabilityConfigCallbackPairs entry', async () => {
      const reports: IViewableItemsChangedInfo<IItem>[] = [];
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA.slice(0, 6)}
          numColumns={2}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          viewabilityConfigCallbackPairs={[
            {
              viewabilityConfig: { itemVisiblePercentThreshold: 0 },
              onViewableItemsChanged: info => reports.push(info),
            },
          ]}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const tokens = reports.flatMap(report => report.viewableItems);
      expect(tokens.length).toBe(6);
      expect(tokens[0]?.item.label).toBe('item-0');
      expect(tokens[0]?.key).toBe('k-0');
    });

    // The ref is the VirtualizedList API and `scrollToOffset` rides the ScrollView's native
    // `scrollTo` command ([x, y, animated]), animated unless told otherwise
    it('exposes the RN imperative handle and drives a native scrollTo', async () => {
      let list: IFlatListHandle | undefined;
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      for (const method of HANDLE_METHODS) {
        expect(typeof list?.[method], `${method} is on the handle`).toBe(
          'function',
        );
      }

      list?.scrollToOffset({ offset: 200 });
      list?.scrollToOffset({ offset: 0, animated: false });

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'scrollTo',
        'scrollTo',
      ]);
      expect(fabric.commands[0]?.args).toEqual([0, 200, true]);
      expect(fabric.commands[1]?.args).toEqual([0, 0, false]);
      expect(fabric.commands[0]?.viewName).toBe(SCROLL_VIEW);
    });

    // The handle is the same API in both branches, with columns a scroll target resolves against
    // ROWS: item 4 of a 3-column list sits in row 1, which starts at 50pt
    it('keeps the handle working in the multi-column branch, resolving against rows', async () => {
      let list: IFlatListHandle | undefined;
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      list?.scrollToIndex({ index: 1, animated: false });

      expect(fabric.commands[0]?.args).toEqual([0, 50, false]);
      expect(fabric.commands[0]?.viewName).toBe(SCROLL_VIEW);
    });

    // The accessibility surface goes to the scroll view so a screen reader announces the LIST,
    // `aria-*` folds into the RN spelling on the way down
    it('rides its accessibility surface down onto the scroll host', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          testID="the-flat-list"
          aria-label="Orders"
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const scrollProps = committed(SCROLL_VIEW).payload;
      expect(scrollProps.testID).toBe('the-flat-list');
      expect(scrollProps.accessibilityLabel).toBe('Orders');
    });

    // FlatList CONSUMES its data-shaping props: a function on the native bag crashes Android's
    // serializer, `data` would cross the bridge, `numColumns` and `columnWrapperStyle` are JS-only
    it('never forwards its own JS-only props onto the native bag', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          columnWrapperStyle={{ columnGap: 8 }}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const scrollProps = committed(SCROLL_VIEW).payload;
      for (const leaked of [
        'data',
        'numColumns',
        'columnWrapperStyle',
        'renderItem',
        'keyExtractor',
        'getItemLayout',
        'initialNumToRender',
      ]) {
        expect(leaked in scrollProps, `${leaked} must not reach native`).toBe(
          false,
        );
      }
    });

    // A horizontal list pins its content container to the full ROW width, sized to the frame
    // there would be nothing to scroll
    it('forwards horizontal to the scroll host and pins the content to the row width', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          horizontal
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      // The axis flag is `foldScrollViewProps` in the engine, which TAG the list picked is this
      // adapter's decision and the row-pinned content node below proves it
      expect(committed(CONTENT_VIEW).payload.width).toBe(
        ITEM_HEIGHT * ITEM_COUNT,
      );
    });

    // `inverted` flips the scroll container and counter-flips each cell, the content CONTAINER must
    // stay alone or it cancels the outer flip
    it('flips the scroll host and each cell when inverted, never the content container', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          inverted
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      const flipped = live.findAllLive(live.appRoot(), node =>
        Array.isArray(node.payload.transform),
      );
      expect(flipped.some(node => node.viewName === SCROLL_VIEW)).toBe(true);
      expect(flipped.some(node => node.viewName === CONTENT_VIEW)).toBe(false);
      expect(
        flipped.length,
        'the scroll host plus the two resident cells',
      ).toBe(3);
    });

    // `onRefresh` hands the ScrollView a RefreshControl and `refreshing` is CONTROLLED, native
    // raises its own spinner on the pull and only the pushed-down prop takes it back
    it('wires a RefreshControl onto the scroll host when onRefresh is set', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          onRefresh={(): void => {}}
          refreshing
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      expect(committed(SCROLL_VIEW).children[0]?.viewName).toBe(
        REFRESH_CONTROL,
      );
      expect(committed(REFRESH_CONTROL).payload.refreshing).toBe(true);
    });

    // RN omits the RefreshControl when `onRefresh` is unset, an always-mounted one would swallow
    // the pull gesture on every plain list
    it('commits no RefreshControl when onRefresh is absent', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      expect(
        live.findAllLive(
          live.appRoot(),
          node => node.viewName === REFRESH_CONTROL,
        ),
      ).toHaveLength(0);
    });

    // `onEndReached` is gated on reaching within `onEndReachedThreshold` viewports of the bottom,
    // firing at mount would fetch a page for a list nobody scrolled
    it('fires onEndReached only once the list is scrolled to the bottom', async () => {
      const reached: number[] = [];
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          onEndReachedThreshold={0.1}
          onEndReached={info => reached.push(info.distanceFromEnd)}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(reached.length, 'not at mount').toBe(0);

      fireScroll(ITEM_HEIGHT * ITEM_COUNT - VIEWPORT_HEIGHT);
      await tick();

      expect(reached.length).toBe(1);
      expect(reached[0]).toBe(0);
    });

    // Header, footer and empty slots are chrome, not cells, so virtualization never recycles them
    // and the empty slot shows only while the list has no items
    it('renders the header and footer chrome, and the empty slot only while data is empty', async () => {
      const [items, setItems] = createSignal<IItem[]>([]);
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={items()}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          ListHeaderComponent={<text>the-header</text>}
          ListFooterComponent={<text>the-footer</text>}
          ListEmptyComponent={<text>nothing-here</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      expect(committedLabels().has('the-header')).toBe(true);
      expect(committedLabels().has('the-footer')).toBe(true);
      expect(committedLabels().has('nothing-here')).toBe(true);

      setItems(DATA);
      await tick();

      expect(committedLabels().has('nothing-here')).toBe(false);
      expect(committedLabels().has('item-0')).toBe(true);
      expect(committedLabels().has('the-header')).toBe(true);
    });

    // The windowing runs on the scroll event, so a user `onScroll` must COMPOSE with it and never
    // replace it, or the window freezes at its first paint
    it('composes a user onScroll with the internal windowing handler', async () => {
      const seen: number[] = [];
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          onScroll={event => {
            const offset = event.nativeEvent.contentOffset;
            if (offset !== undefined) seen.push(offset.y);
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      fireScroll(400);
      await tick();

      expect(seen, 'the user handler ran').toEqual([400]);
      expect(
        committedLabels().has('item-8'),
        'and the internal windowing still moved',
      ).toBe(true);
      expect(committedLabels().has('item-0'), 'the initial region stays').toBe(
        true,
      );
      expect(committedLabels().has('item-4')).toBe(false);
    });

    // A single column is the ordinary unpacked list, packing is gated on `numColumns > 1`, so 1
    // and any degenerate value below it (a narrow screen can compute 0) render flat cells
    it.each([1, 0])('renders flat cells for numColumns %i', async columns => {
      fabric.reset();
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={columns}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      expect(rowWrappers().length, `numColumns ${columns}`).toBe(0);
      expect(committedLabels().has('item-0')).toBe(true);
      expect(committedLabels().has('item-1')).toBe(true);
      unmount(ROOT_TAG);
    });

    // The scroll-lifecycle callbacks have no JS wiring of their own, the only way to break them is
    // to swallow them in the prop split
    it('forwards the scroll-lifecycle callbacks to the native scroll host', async () => {
      const onScrollBeginDrag = vi.fn();
      const onScrollEndDrag = vi.fn();
      const onMomentumScrollBegin = vi.fn();
      const onMomentumScrollEnd = vi.fn();
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollBegin={onMomentumScrollBegin}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const handle = committed(SCROLL_VIEW).instanceHandle;
      fabric.fireEvent(handle, 'topScrollBeginDrag', {});
      fabric.fireEvent(handle, 'topScrollEndDrag', {});
      fabric.fireEvent(handle, 'topMomentumScrollBegin', {});
      fabric.fireEvent(handle, 'topMomentumScrollEnd', {});

      expect(onScrollBeginDrag).toHaveBeenCalledTimes(1);
      expect(onScrollEndDrag).toHaveBeenCalledTimes(1);
      expect(onMomentumScrollBegin).toHaveBeenCalledTimes(1);
      expect(onMomentumScrollEnd).toHaveBeenCalledTimes(1);
    });

    // Native reads the keyboard props and `scrollEventThrottle` directly, and `style`,
    // `contentContainerStyle` and `class` address two DIFFERENT hosts: the scroll view and content
    it('routes the native scroll-host props and both style targets to the right views', async () => {
      registerRules([
        {
          tokens: ['listSkin'],
          specificity: [0, 1, 0],
          order: 0,
          style: { backgroundColor: 'papayawhip' },
        },
      ]);
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          style={LIST_HEIGHT_STYLE}
          class="listSkin"
          contentContainerStyle={CONTENT_PADDING_STYLE}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const scrollProps = committed(SCROLL_VIEW).payload;
      expect(scrollProps.keyboardDismissMode).toBe('on-drag');
      expect(scrollProps.keyboardShouldPersistTaps).toBe('handled');
      expect(scrollProps.scrollEventThrottle).toBe(16);
      expect(scrollProps.height).toBe(240);
      expect(scrollProps.backgroundColor, 'the class resolved too').toBe(
        'papayawhip',
      );
      expect(committed(CONTENT_VIEW).payload.paddingBottom).toBe(24);
    });

    // `onStartReached` is the top-edge twin of `onEndReached`, it DEDUPS the same way and RE-ARMS
    // once the list has scrolled away, or the second visit to the top loads nothing
    it('fires onStartReached at the top, dedups, and re-arms after scrolling away', async () => {
      const onStartReached = vi.fn();
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          onStartReachedThreshold={0}
          onStartReached={onStartReached}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(onStartReached).toHaveBeenCalledTimes(1);
      expect(onStartReached.mock.calls[0][0]).toEqual({ distanceFromStart: 0 });

      fireScroll(400);
      await tick();
      expect(onStartReached, 'dedupped while away').toHaveBeenCalledTimes(1);

      fireScroll(0);
      await tick();
      expect(
        onStartReached,
        'returning to the top arms it again',
      ).toHaveBeenCalledTimes(2);
    });

    // `initialScrollIndex` opens the list parked at an item, applied ONCE and un-animated, a later
    // layout must not yank the list back under the user
    it('jumps to initialScrollIndex once, instantly', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          initialScrollIndex={8}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'scrollTo',
      ]);
      expect(fabric.commands[0]?.args).toEqual([0, ITEM_HEIGHT * 8, false]);

      fabric.fireEvent(committed(SCROLL_VIEW).instanceHandle, 'topLayout', {
        layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
      });
      await tick();

      expect(fabric.commands, 'applied exactly once').toHaveLength(1);
    });

    // Without `getItemLayout` a `scrollToIndex` past the highest measured frame cannot be placed,
    // RN reports it through `onScrollToIndexFailed` and scrolls nowhere
    it('reports onScrollToIndexFailed for a target past the last measured cell', async () => {
      const onScrollToIndexFailed = vi.fn();
      let list: IFlatListHandle | undefined;
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          initialNumToRender={2}
          onScrollToIndexFailed={onScrollToIndexFailed}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      list?.scrollToIndex({ index: 11 });

      expect(onScrollToIndexFailed).toHaveBeenCalledTimes(1);
      expect(fabric.commands, 'and it scrolled nowhere').toHaveLength(0);
    });

    // `maintainVisibleContentPosition` counts CHILDREN, so a `ListHeaderComponent` at child 0 bumps
    // `minIndexForVisible` by one or native anchors against the wrong view
    it('forwards maintainVisibleContentPosition and bumps it past the header', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          ListHeaderComponent={<text>the-header</text>}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(
        committed(SCROLL_VIEW).payload.maintainVisibleContentPosition,
      ).toEqual({ minIndexForVisible: 1 });
      // `collapsableChildren` is derived from the prop above by the engine, this list owes the
      // forwarding asserted above
    });

    // Sticky list headers are JS-only, the flagged CELL is wrapped and the index array is never
    // handed to native where it would be a silent no-op
    it('wraps a stickyHeaderIndices cell and never forwards the array to native', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          stickyHeaderIndices={[0]}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(
        live.findAllLive(
          live.appRoot(),
          node => node.payload.zIndex === STICKY_HEADER_Z_INDEX,
        ),
      ).toHaveLength(1);
      expect('stickyHeaderIndices' in committed(SCROLL_VIEW).payload).toBe(
        false,
      );
    });
  });

  // Solid has no reconciler between a component and the host nodes, so "the screen updated" and
  // "the screen was not torn down to update" are independent claims, the creation counter pins them
  describe('Reactivity — updates must be re-props, not rebuilds', () => {
    // A packed column is a fixed positional slot, replacing the data with fresh items must move
    // the item down to the leaf and not destroy the subtree that holds it
    it('updates a packed column in place when the data changes, creating no nodes', async () => {
      const [items, setItems] = createSignal(DATA);
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={items()}
          numColumns={3}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(committedLabels().has('item-0')).toBe(true);
      const createdAtMount = totalCreated();

      // Same length, same row keys, fresh objects and new labels: nothing structural changed.
      setItems(makeItems(ITEM_COUNT, '-v2'));
      await tick();

      expect(
        committedLabels().has('item-0-v2'),
        'the accessor carried the new item down to the leaf',
      ).toBe(true);
      expect(
        committedLabels().has('item-5-v2'),
        'every column of every resident row, not just the first',
      ).toBe(true);
      expect(
        totalCreated(),
        'and it did so without rebuilding the column subtree',
      ).toBe(createdAtMount);
    });

    // FlatList DERIVES `getItemCount` and `getItem` from `data`, both stay live so an appended page
    // shows up, a protocol captured at mount would leave it invisible
    it('grows when items are appended to the data array', async () => {
      const [items, setItems] = createSignal(DATA.slice(0, 2));
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={items()}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          initialNumToRender={4}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();
      expect(committedLabels().has('item-2')).toBe(false);

      setItems(DATA.slice(0, 6));
      await tick();

      expect(committedLabels().has('item-2')).toBe(true);
      expect(committedLabels().has('item-3')).toBe(true);
      expect(
        committedLabels().has('item-0'),
        'the rows already on screen survived the append',
      ).toBe(true);
    });

    // `columnWrapperStyle` is an ordinary reactive prop, the existing row views are re-styled,
    // capturing it at build time freezes the gutter and rebuilding drops every measured layout
    it('re-props the same row wrapper when columnWrapperStyle changes', async () => {
      const [gap, setGap] = createSignal(4);
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          columnWrapperStyle={{ columnGap: gap() }}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      const rowsAtMount = rowWrappers();
      expect(rowsAtMount.length).toBeGreaterThan(0);
      for (const row of rowsAtMount) expect(row.payload.columnGap).toBe(4);
      const createdAtMount = totalCreated();

      setGap(12);
      await tick();

      const rowsNow = rowWrappers();
      expect(rowsNow.length).toBe(rowsAtMount.length);
      for (const row of rowsNow) expect(row.payload.columnGap).toBe(12);
      expect(totalCreated(), 'the row views were re-propped, not rebuilt').toBe(
        createdAtMount,
      );
    });
  });

  describe('Negative', () => {
    // Fabric has no bare-text host, `RCTRawText` is only valid inside a `<Text>`, so a raw string
    // from `renderItem` must fail loudly at mount instead of deep in native
    it('throws when a packed column renders a bare string outside a Text', () => {
      expect(() =>
        mount(ROOT_TAG, () => (
          <FlatList<IItem>
            data={DATA}
            numColumns={3}
            getItemLayout={getItemLayout}
            initialNumToRender={2}
            renderItem={info => info().item.label}
          />
        )),
      ).toThrow(/must be rendered inside a <Text>/);
    });
  });

  // Behaviors not justified by RN, captured so a later change is visible, each carries its open
  // question in a `// QUESTION:` comment
  describe('Characterization', () => {
    // QUESTION: RN documents `numColumns` as vertical-only but ships no runtime guard, and no
    // adapter has one, should the shared layer refuse the combination or is honoring it relied on
    it('packs rows even with horizontal, which RN documents as unsupported [characterization — behavior not confirmed]', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          horizontal
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      // The axis flag is the engine's rule, this case is about the PACKING below
      // A horizontal cell wrapper is a row too (RN), the packed rows are the ones holding 3 items
      const packed = rowWrappers().filter(row => row.children.length === 3);
      expect(packed.length, 'chunked anyway, no guard').toBe(2);
    });

    // QUESTION: RN calls changing `numColumns` on the fly unsupported, here the `<Show>` boundary
    // gives a fresh render for free, advertise it as supported or keep it undocumented
    it('rebuilds the list into packed rows when numColumns changes after mount [characterization — behavior not confirmed]', async () => {
      const [columns, setColumns] = createSignal(1);
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={columns()}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();
      expect(rowWrappers().length).toBe(0);
      const createdAtMount = totalCreated();

      setColumns(3);
      await tick();

      expect(rowWrappers().length, 'the packed branch took over').toBe(2);
      expect(committedLabels().has('item-5')).toBe(true);
      expect(
        totalCreated(),
        'a flip is a rebuild, not a re-prop',
      ).toBeGreaterThan(createdAtMount);
    });
  });
});

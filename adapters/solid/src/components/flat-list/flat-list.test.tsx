// Solid twin of adapters/react's flat-list tests, adapters/vue's and adapters/svelte's. Drives REAL
// compiled Solid JSX through the universal renderer into the fake Fabric slot. Every expectation
// below comes from a PRODUCT rule — React Native's documented FlatList behaviour, or the surface
// adapters/react already ships (the reference adapter for P0 parity) — never from reading this
// adapter's own source back.

import { createSignal } from 'solid-js';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
import type {
  ISeparatorProps,
  IViewableItemsChangedInfo,
} from '@symbiote-native/components';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import type { JSX } from '../../jsx-runtime';
import { mount, unmount } from '../../render';
import { FlatList, type IFlatListHandle } from './index';

const ROOT_TAG = 823;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';
const REFRESH_CONTROL = 'PullToRefreshView';
const ITEM_HEIGHT = 50;
const ITEM_COUNT = 12;
const VIEWPORT_HEIGHT = 150;

interface IItem {
  id: number;
  label: string;
}

const fabric = installFabric();
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

function flatCommitted(): IFakeNode[] {
  const flat: IFakeNode[] = [];
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return flat;
}

// The auto-generated row Views only. Filtered to RCTView on purpose: a HORIZONTAL scroll host and
// its content container both carry flexDirection 'row' of their own, and counting those would make
// the packing assertions read differently per axis.
function rowWrappers(): IFakeNode[] {
  return flatCommitted().filter(
    node => node.viewName === 'RCTView' && node.props.flexDirection === 'row',
  );
}

function committed(viewName: string): IFakeNode {
  const found = flatCommitted().find(node => node.viewName === viewName);
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

// Every committed raw-text payload. Read off the COMMITTED tree, never `fabric.created`: a created
// node's props are frozen at its first createNode, so asserting there would make every update test
// pass forever.
function committedLabels(): Set<string> {
  const labels = new Set<string>();
  for (const node of flatCommitted()) {
    const text: unknown = node.props.text;
    if (typeof text === 'string') labels.add(text);
  }
  return labels;
}

// Mount, then hand the list its viewport through the scroll host's onLayout — until that lands, RN
// paints the bounded initialNumToRender prefix instead of a measured window, and viewability has no
// viewport to test against.
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

// RN's documented FlatList ref surface. `as const` (not a cast) so each name stays a literal key of
// IFlatListHandle and the loop below needs no assertion to index with it.
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
    // why: FlatList's whole reason to exist is that it takes a PLAIN array and derives the
    // VirtualizedList data-access protocol (getItem/getItemCount) itself, so the caller never
    // writes them. The proof it really reached the shared list is that virtualization still
    // happens: RN mounts only `initialNumToRender` cells and leaves the rest unmounted.
    it('derives the data protocol from a plain array and mounts only the initial batch', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN's numColumns regroups the virtualized stream into whole ROWS — the cell the list
    // windows is a row, not an item — and lays each row out as a flex row of equally-weighted
    // columns. Without that, windowing would count items and a two-column list would mount twice
    // the cells it needs for one screen.
    it('packs items into flex-row rows of numColumns equally-weighted cells', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      const rows = rowWrappers();
      expect(rows.length, 'two rows of three, not six item cells').toBe(2);
      expect(rows[0]?.children.length).toBe(3);
      expect(rows[0]?.children.every(cell => cell.props.flex === 1)).toBe(true);

      const labels = committedLabels();
      expect(labels.has('item-0')).toBe(true);
      expect(labels.has('item-5'), 'the whole second row is resident').toBe(
        true,
      );
      expect(labels.has('item-6')).toBe(false);
    });

    // why: columnWrapperStyle is typed `IStyleProp<IViewStyle> | string`, deliberately widened past
    // a style object — a bare string is a registered class name and must resolve through the SAME
    // shared style registry `class` uses, landing on the auto-generated row view. This is the
    // contract adapters/react and adapters/vue already ship.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      const rows = rowWrappers();
      expect(rows.length).toBe(2);
      for (const row of rows) expect(row.props.columnGap).toBe(4);
    });

    // why: widening the prop to accept a string must stay ADDITIVE — a caller already passing a
    // plain style object must keep working, and the row's own flexDirection must survive the merge
    // rather than be replaced by it.
    it('still accepts a plain columnWrapperStyle object over the row flexDirection', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          columnWrapperStyle={{ columnGap: 8 }}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      const rows = rowWrappers();
      expect(rows.length).toBe(2);
      for (const row of rows) expect(row.props.columnGap).toBe(8);
    });

    // why: RN's multi-column FlatList draws its divider BETWEEN ROWS, but the caller's separator is
    // typed on the item — so it must be handed the real flanking items (last of the row above,
    // first of the row below), never the internal IRow wrapper the virtualized stream carries.
    it('hands the row separator the real flanking items, not the IRow wrapper', async () => {
      const separator = (sep: ISeparatorProps<IItem>): JSX.Element => (
        <symbiote-text>{`gap:${sep.leadingItem?.label}>${sep.trailingItem?.label}`}</symbiote-text>
      );
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          ItemSeparatorComponent={separator}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      expect(committedLabels().has('gap:item-2>item-3')).toBe(true);
    });

    // why: the list underneath windows ROWS, but RN types onViewableItemsChanged on the ITEM — a
    // caller must see one token per real item, carrying that item's own extracted key and its
    // absolute data index, or every viewability-driven feature (impression analytics, lazy image
    // loading) counts rows and under-reports by a factor of numColumns.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: viewabilityConfigCallbackPairs is RN's multi-threshold form of the same report (one
    // config + callback per pair), so it must receive the identical item-level expansion. A pair
    // left reporting IRow wrappers would hand the caller objects whose type says ItemT.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const tokens = reports.flatMap(report => report.viewableItems);
      expect(tokens.length).toBe(6);
      expect(tokens[0]?.item.label).toBe('item-0');
      expect(tokens[0]?.key).toBe('k-0');
    });

    // why: RN documents FlatList's ref as the VirtualizedList API — scrollToOffset / scrollToIndex /
    // scrollToItem / scrollToEnd / flashScrollIndicators / recordInteraction / the scroll-node
    // getters — and scrollToOffset rides the underlying ScrollView's NATIVE scrollTo command
    // ([x, y, animated]), animated unless the caller says otherwise. A handle that stopped at the
    // wrapper would move nothing on a device.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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
      expect(fabric.commands[0]?.node.viewName).toBe(SCROLL_VIEW);
    });

    // why: the handle is the same API in both branches — RN's numColumns changes what a cell holds,
    // never what the ref does. The multi-column path is the one where the ITEM type underneath is
    // IRow, so a scroll target has to resolve against ROWS: item 4 of a 3-column list sits in row 1,
    // which starts at 50pt with 50pt rows.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      list?.scrollToIndex({ index: 1, animated: false });

      expect(fabric.commands[0]?.args).toEqual([0, 50, false]);
      expect(fabric.commands[0]?.node.viewName).toBe(SCROLL_VIEW);
    });

    // why: RN's FlatList forwards its accessibility surface to the underlying scroll view, so a
    // screen reader announces the LIST rather than an unlabelled container. `aria-*` folds into the
    // RN spelling on the way down, exactly as it does on every other component here.
    it('rides its accessibility surface down onto the scroll host', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          testID="the-flat-list"
          aria-label="Orders"
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const scrollProps = committed(SCROLL_VIEW).props;
      expect(scrollProps.testID).toBe('the-flat-list');
      expect(scrollProps.accessibilityLabel).toBe('Orders');
    });

    // why: FlatList CONSUMES its data-shaping props. Leaking a function onto the native prop bag
    // crashes Android's folly::dynamic serializer the moment it tries to stringify it, and leaking
    // `data` ships the whole list payload across the bridge on every commit. numColumns and
    // columnWrapperStyle are equally JS-only — RN has no native FlatList to receive them.
    it('never forwards its own JS-only props onto the native bag', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          columnWrapperStyle={{ columnGap: 8 }}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const scrollProps = committed(SCROLL_VIEW).props;
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

    // why: iOS decides the scroll axis from the native RCTScrollView's own `horizontal` prop, and a
    // horizontal list must pin its content container to the full ROW width — sized to the frame
    // instead, there is nothing to scroll.
    it('forwards horizontal to the scroll host and pins the content to the row width', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          horizontal
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      expect(committed(SCROLL_VIEW).props.horizontal).toBe(true);
      expect(committed(CONTENT_VIEW).props.width).toBe(
        ITEM_HEIGHT * ITEM_COUNT,
      );
    });

    // why: RN's `inverted` flips the scroll container along its axis and counter-flips each cell so
    // the content inside stays upright. The content CONTAINER must be left alone — flipping it too
    // cancels the outer flip and the list paints upside down.
    it('flips the scroll host and each cell when inverted, never the content container', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          inverted
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      const flipped = flatCommitted().filter(node =>
        Array.isArray(node.props.transform),
      );
      expect(flipped.some(node => node.viewName === SCROLL_VIEW)).toBe(true);
      expect(flipped.some(node => node.viewName === CONTENT_VIEW)).toBe(false);
      expect(
        flipped.length,
        'the scroll host plus the two resident cells',
      ).toBe(3);
    });

    // why: RN gives a list pull-to-refresh by handing the inner ScrollView a RefreshControl whenever
    // onRefresh is set, and `refreshing` is CONTROLLED — native raises its own spinner on the pull
    // and only the pushed-down prop takes it back.
    it('wires a RefreshControl onto the scroll host when onRefresh is set', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          onRefresh={(): void => {}}
          refreshing
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      expect(committed(SCROLL_VIEW).children[0]?.viewName).toBe(
        REFRESH_CONTROL,
      );
      expect(committed(REFRESH_CONTROL).props.refreshing).toBe(true);
    });

    // why: RN omits the RefreshControl entirely when onRefresh is unset — a list that always
    // mounted one would swallow the pull gesture on every plain, non-refreshable list.
    it('commits no RefreshControl when onRefresh is absent', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      expect(
        flatCommitted().some(node => node.viewName === REFRESH_CONTROL),
      ).toBe(false);
    });

    // why: onEndReached is the infinite-scroll hook, and RN gates it on the list actually reaching
    // within onEndReachedThreshold viewports of the bottom — firing it at mount would kick off a
    // page fetch for a list the user has not scrolled.
    it('fires onEndReached only once the list is scrolled to the bottom', async () => {
      const reached: number[] = [];
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          onEndReachedThreshold={0.1}
          onEndReached={info => reached.push(info.distanceFromEnd)}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      expect(reached.length, 'not at mount').toBe(0);

      fireScroll(ITEM_HEIGHT * ITEM_COUNT - VIEWPORT_HEIGHT);
      await tick();

      expect(reached.length).toBe(1);
      expect(reached[0]).toBe(0);
    });

    // why: the header, footer and empty slots are FlatList's documented chrome. They are not cells,
    // so virtualization never recycles them, and the empty slot shows only while the list has no
    // items — a placeholder left over an already-loaded list is the classic async-list bug.
    it('renders the header and footer chrome, and the empty slot only while data is empty', async () => {
      const [items, setItems] = createSignal<IItem[]>([]);
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={items()}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          ListHeaderComponent={<symbiote-text>the-header</symbiote-text>}
          ListFooterComponent={<symbiote-text>the-footer</symbiote-text>}
          ListEmptyComponent={<symbiote-text>nothing-here</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: the list's own windowing runs on the scroll event, so a user onScroll must COMPOSE with
    // it, never replace it. A wrapper that forwarded only the user handler would freeze the window
    // at its first paint; one that dropped the user handler would break every scroll-driven header.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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
      expect(committedLabels().has('item-0')).toBe(false);
    });

    // why: RN's FlatList treats a single column as the ordinary, unpacked list — and adapters/react,
    // the reference surface, gates the row packing on `numColumns > 1` rather than on the prop being
    // present. So an explicit 1 (and any degenerate value below it, which a computed
    // `Math.floor(width / cardWidth)` can produce on a narrow screen) must render flat cells, never
    // a row wrapper holding one column.
    it('renders flat cells for numColumns at or below one', async () => {
      for (const columns of [1, 0]) {
        fabric.reset();
        mount(ROOT_TAG, () => (
          <FlatList<IItem>
            data={DATA}
            numColumns={columns}
            getItemLayout={getItemLayout}
            initialNumToRender={2}
            renderItem={info => (
              <symbiote-text>{info().item.label}</symbiote-text>
            )}
          />
        ));
        await tick();

        expect(rowWrappers().length, `numColumns ${columns}`).toBe(0);
        expect(committedLabels().has('item-0')).toBe(true);
        expect(committedLabels().has('item-1')).toBe(true);
        unmount(ROOT_TAG);
      }
    });

    // why: the scroll-lifecycle callbacks are the drag/momentum half of RN's ScrollView API and a
    // FlatList is documented to accept them. They have no JS wiring of their own, so the ONLY way to
    // break them is to swallow them in the prop split on the way down.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: keyboardDismissMode, keyboardShouldPersistTaps and scrollEventThrottle are read by NATIVE
    // directly, and style / contentContainerStyle / class address two DIFFERENT hosts — the scroll
    // view and the content container. A list that never dismisses the keyboard on drag, or that
    // lands its padding on the wrong one of the two views, reads as a native bug rather than as a
    // dropped prop.
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
          style={{ height: 240 }}
          class="listSkin"
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const scrollProps = committed(SCROLL_VIEW).props;
      expect(scrollProps.keyboardDismissMode).toBe('on-drag');
      expect(scrollProps.keyboardShouldPersistTaps).toBe('handled');
      expect(scrollProps.scrollEventThrottle).toBe(16);
      expect(scrollProps.height).toBe(240);
      expect(scrollProps.backgroundColor, 'the class resolved too').toBe(
        'papayawhip',
      );
      expect(committed(CONTENT_VIEW).props.paddingBottom).toBe(24);
    });

    // why: onStartReached is onEndReached's top-edge twin, used for prepend-paging (a chat loading
    // older messages upward). Same contract in reverse: it fires while the list sits within
    // onStartReachedThreshold of the start, DEDUPS against the same content, and RE-ARMS once the
    // list has scrolled away — without the re-arm, the second visit to the top loads nothing.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: initialScrollIndex opens the list already parked at an item (a "jump to unread" entry
    // point), and RN applies it exactly ONCE, un-animated — re-applying it on a later layout would
    // yank the list back under the user mid-scroll.
    it('jumps to initialScrollIndex once, instantly', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          initialScrollIndex={8}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: without getItemLayout the list only knows the size of cells it has MEASURED, so a
    // scrollToIndex past the highest measured frame cannot be placed. RN reports that through
    // onScrollToIndexFailed and scrolls nowhere, so the app can react instead of the list silently
    // jumping to a wrong offset.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      list?.scrollToIndex({ index: 11 });

      expect(onScrollToIndexFailed).toHaveBeenCalledTimes(1);
      expect(fabric.commands, 'and it scrolled nowhere').toHaveLength(0);
    });

    // why: maintainVisibleContentPosition keeps the anchored item still while content is prepended
    // (a chat loading history). RN forwards it to native AND counts CHILDREN, not data indices — so
    // a ListHeaderComponent occupying child 0 has to bump minIndexForVisible by one or native
    // anchors against the wrong view. The cells must also stay un-flattened, or Android Fabric
    // collapses them away and the helper has nothing to anchor to.
    it('forwards maintainVisibleContentPosition and bumps it past the header', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          ListHeaderComponent={<symbiote-text>the-header</symbiote-text>}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(
        committed(SCROLL_VIEW).props.maintainVisibleContentPosition,
      ).toEqual({ minIndexForVisible: 1 });
      expect(committed(CONTENT_VIEW).props.collapsableChildren).toBe(false);
    });

    // why: RN implements sticky list headers purely in JS — the flagged CELL is wrapped in the
    // sticky wrapper and the index array is never handed to native, where it would be a silent
    // no-op. This is a prop adapters/react's FlatList does not even declare, so the surface here is
    // a superset of the reference adapter's rather than a gap.
    it('wraps a stickyHeaderIndices cell and never forwards the array to native', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          stickyHeaderIndices={[0]}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(
        flatCommitted().filter(
          node => node.props.zIndex === STICKY_HEADER_Z_INDEX,
        ),
      ).toHaveLength(1);
      expect('stickyHeaderIndices' in committed(SCROLL_VIEW).props).toBe(false);
    });
  });

  // Solid runs a component body ONCE and has no reconciler between what it returns and the host
  // nodes — `insert` REPLACES a subtree rather than diffing one — so "the screen updated" and "the
  // screen was not torn down in order to update" are two independent, silently-breakable claims.
  // The node-creation counter is the only headless line between them
  // (.claude/rules/solid-descriptor-bridge.md §4).
  describe('Reactivity — updates must be re-props, not rebuilds', () => {
    // why: RN's contract is that a row re-renders when its item changes. Inside a packed row that
    // has to happen WITHOUT rebuilding the column, because a column is a fixed positional slot —
    // column 1 of row 0 is always column 1 of row 0 — so replacing the data array with fresh item
    // objects must move the item down to the leaf, not destroy the subtree that holds it. On device
    // a rebuild landing mid-gesture eats the native responder grant; nothing about what the screen
    // SAYS separates the two, so the counter is the whole test.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      expect(committedLabels().has('item-0')).toBe(true);
      const createdAtMount = fabric.counts.createNode;

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
        fabric.counts.createNode,
        'and it did so without rebuilding the column subtree',
      ).toBe(createdAtMount);
    });

    // why: FlatList DERIVES getItemCount/getItem from `data`, so both have to stay live — an RN list
    // grows when the array it was handed grows (the whole point of an infinite-scroll feed). A
    // protocol captured at mount would leave every appended page invisible while the array itself
    // looked correct in the debugger.
    it('grows when items are appended to the data array', async () => {
      const [items, setItems] = createSignal(DATA.slice(0, 2));
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={items()}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          initialNumToRender={4}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: columnWrapperStyle is an ordinary reactive prop — a theme switch or a measured gutter can
    // change it after mount. RN re-styles the existing row views; a wrapper that captured the style
    // at build time would freeze the gutter, and one that rebuilt on it would drop every row's
    // measured layout on a theme change.
    it('re-props the same row wrapper when columnWrapperStyle changes', async () => {
      const [gap, setGap] = createSignal(4);
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          columnWrapperStyle={{ columnGap: gap() }}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      const rowsAtMount = rowWrappers();
      expect(rowsAtMount.length).toBeGreaterThan(0);
      for (const row of rowsAtMount) expect(row.props.columnGap).toBe(4);
      const createdAtMount = fabric.counts.createNode;

      setGap(12);
      await tick();

      const rowsNow = rowWrappers();
      expect(rowsNow.length).toBe(rowsAtMount.length);
      for (const row of rowsNow) expect(row.props.columnGap).toBe(12);
      expect(
        fabric.counts.createNode,
        'the row views were re-propped, not rebuilt',
      ).toBe(createdAtMount);
    });
  });

  describe('Negative', () => {
    // why: Fabric has no bare-text host — RCTRawText is only ever valid as a child of a <Text> — so
    // a renderItem that returns a raw string builds a tree native cannot mount. The packed-column
    // path inserts that string into the column view it generates itself, so failing loudly at mount
    // is the correct behaviour: the alternative surfaces far deeper in native with an error naming
    // neither the list nor the row.
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

  // Behaviours we could not justify from RN or the React adapter, captured as they are so a later
  // change to them is at least visible. Each carries the open question in a `// QUESTION:` comment.
  describe('Characterization', () => {
    // QUESTION: RN documents numColumns as working only with horizontal={false} ("Multiple columns
    // can only be rendered with horizontal={false}") but ships no runtime guard, and neither do
    // adapters/react, vue or svelte — all four just chunk anyway, producing flex-ROW rows laid out
    // along a horizontal scroll axis. Should the shared layer refuse the combination (a dev-mode
    // invariant), or is silently honouring it the behaviour apps depend on?
    it('packs rows even with horizontal, which RN documents as unsupported [characterization — behavior not confirmed]', async () => {
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={3}
          horizontal
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      expect(committed(SCROLL_VIEW).props.horizontal).toBe(true);
      // All four rows, because an unmeasured horizontal viewport does not bound the first batch the
      // way the vertical one does — a VirtualizedList property, not FlatList's; the point here is
      // only that the packing happened at all.
      expect(rowWrappers().length, 'chunked anyway, no guard').toBe(2);
    });

    // QUESTION: RN documents changing numColumns on the fly as unsupported — "change the key prop on
    // the FlatList to force a fresh render". Here the <Show> boundary gives that fresh render for
    // free (the two branches instantiate the list over different item types, so the flip disposes
    // one and builds the other). That is strictly MORE than RN promises. Should it be advertised as
    // supported, or kept undocumented so the shared layer stays free to cache across the flip?
    it('rebuilds the list into packed rows when numColumns changes after mount [characterization — behavior not confirmed]', async () => {
      const [columns, setColumns] = createSignal(1);
      mount(ROOT_TAG, () => (
        <FlatList<IItem>
          data={DATA}
          numColumns={columns()}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();
      expect(rowWrappers().length).toBe(0);
      const createdAtMount = fabric.counts.createNode;

      setColumns(3);
      await tick();

      expect(rowWrappers().length, 'the packed branch took over').toBe(2);
      expect(committedLabels().has('item-5')).toBe(true);
      expect(
        fabric.counts.createNode,
        'a flip is a rebuild, not a re-prop',
      ).toBeGreaterThan(createdAtMount);
    });
  });
});

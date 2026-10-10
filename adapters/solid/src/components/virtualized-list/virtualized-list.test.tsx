// Solid twin of the React, Vue and Svelte list tests, over compiled JSX and the fake Fabric slot
// Expectations come from RN's documented list behavior, never from this adapter's own source
// `Reactivity` is Solid-only, `insert` replaces a subtree so the node counter pins row reuse

import { createSignal } from 'solid-js';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import '../../register';
import { VirtualizedList } from './index';

const ROOT_TAG = 819;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';
const REFRESH_CONTROL = 'PullToRefreshView';
const ITEM_HEIGHT = 50;
const VIEWPORT_HEIGHT = 100;
const ROW_COUNT = 20;

type IRow = {
  id: number;
  label: string;
};

const RED_STYLE = { backgroundColor: 'red' };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function makeRows(count: number, suffix = ''): IRow[] {
  return Array.from({ length: count }, (_unused, id) => ({
    id,
    label: `row-${id}${suffix}`,
  }));
}

const DATA = makeRows(ROW_COUNT);

function isRow(value: unknown): value is IRow {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    typeof value.id === 'number' &&
    'label' in value &&
    typeof value.label === 'string'
  );
}

// Returns the array element ITSELF, not a copy: RN's scrollToItem resolves an index by reference
// identity, so a fresh object per call could never match.
const getItem = (data: unknown, index: number): IRow => {
  if (!Array.isArray(data)) throw new Error('data is not an array');
  const row: unknown = data[index];
  if (!isRow(row)) throw new Error(`no row at ${index}`);
  return row;
};
const getItemCount = (data: unknown): number =>
  Array.isArray(data) ? data.length : 0;
const getItemLayout = (
  _data: unknown,
  index: number,
): { length: number; offset: number; index: number } => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * index,
  index,
});
const keyExtractor = (item: IRow): string => `k-${item.id}`;

// A string `tag` wins, else the highlight decides
function separatorLabel(separatorProps: {
  tag?: unknown;
  highlighted?: boolean;
}): string {
  if (typeof separatorProps.tag === 'string') return separatorProps.tag;
  return separatorProps.highlighted ? 'sep-on' : 'sep-off';
}

function committed(viewName: string): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.viewName === viewName,
  );
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

// The total creation-log size — every node the engine has ever authored, whatever became of it
// since. The direct replacement for the old mirror's `counts.createNode`: a claim that "nothing was
// rebuilt" is a claim that this number held still across the update.
function totalCreated(): number {
  return fabric.findAll(() => true).length;
}

// Every committed raw-text payload, read off the LIVE tree in tree order.
function committedLabels(): Set<string> {
  return new Set(live.texts(live.appRoot()));
}

// How many times a node carrying this text was created, 1 means the row survived and >1 a rebuild
// `findAll` searches the creation log, the authored bag, which is what `text` on a raw node is
function createdCountForText(text: string): number {
  return fabric.findAll(node => node.props.text === text).length;
}

// Does this committed subtree carry a raw-text payload anywhere inside it? Used to ask WHERE a node
// sits rather than merely whether it exists — placement is geometry for a separator.
function carriesText(node: ILiveNode, text: string): boolean {
  return (
    node.payload.text === text ||
    node.children.some(child => carriesText(child, text))
  );
}

function contentChildren(): ILiveNode[] {
  return committed(CONTENT_VIEW).children;
}

function fireLayout(node: ILiveNode, height: number): void {
  fabric.fireEvent(node.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height },
  });
}

function fireScroll(offsetY: number): void {
  fabric.fireEvent(committed(SCROLL_VIEW).instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: offsetY },
    contentSize: { width: 320, height: ITEM_HEIGHT * ROW_COUNT },
    layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
  });
}

// Mount, then hand the list its viewport through the scroll host's onLayout — until that lands, RN
// paints the bounded initialNumToRender prefix instead of a measured window.
async function settleViewport(): Promise<void> {
  await tick();
  fireLayout(committed(SCROLL_VIEW), VIEWPORT_HEIGHT);
  await tick();
}

describe('Solid VirtualizedList on the engine', () => {
  describe('Positive', () => {
    // RN renders a list through a nested pair, a scroll view panning one content view of cells
    // A flat tree does not scroll on a device, the un-flattening is `foldScrollContentProps`
    // in the engine, what Solid owns here is the nesting
    it('commits a nested scroll host holding a single content container', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={[]}
          getItem={getItem}
          getItemCount={getItemCount}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      const scroll = committed(SCROLL_VIEW);
      expect(scroll.children[0]?.viewName).toBe(CONTENT_VIEW);
      // ONE content child, which is the Android crash this case is named for: a second direct child
      // of the scroll view is an addViewAt failure. The count is the claim, not the node's name.
      expect(scroll.children).toHaveLength(1);
    });

    // why: virtualization IS the component. RN mounts only `initialNumToRender` cells in the first
    // batch and leaves the rest unmounted until the window reaches them; a list that commits all N
    // native views has no reason to exist.
    it('mounts only the initial batch of cells, not every row', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      const labels = committedLabels();
      expect(labels.has('row-0')).toBe(true);
      expect(labels.has('row-1')).toBe(true);
      expect(labels.has('row-2')).toBe(false);
      expect(labels.has('row-19')).toBe(false);
    });

    // Unmounted cells still occupy space, RN collapses the off-window extent into spacers
    // Here none above the window at row 0 and one below: 20 rows of 50pt minus the 100pt mounted
    it('reserves the off-window extent with a trailing spacer and none at the top', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      const children = contentChildren();
      expect(children[0]?.children.length, 'the first child is a cell').toBe(1);
      const trailing = children[children.length - 1];
      expect(trailing?.children.length, 'the last child is a spacer').toBe(0);
      expect(trailing?.payload.height).toBe(900);
    });

    // The window follows the measured viewport and the live offset, `windowSize` 1 is zero overscan
    // At offset 500 with 50pt rows and a 100pt viewport rows 10 and 11 are resident
    it('moves the window and both spacer extents as the list scrolls', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      fireScroll(500);
      await tick();

      const labels = committedLabels();
      expect(labels.has('row-10')).toBe(true);
      expect(labels.has('row-11')).toBe(true);
      expect(labels.has('row-0'), 'the initial region stays mounted').toBe(
        true,
      );
      expect(labels.has('row-5'), 'the rows past it are unmounted').toBe(false);

      const children = contentChildren();
      // Row 9 ends exactly at the offset, RN counts that inclusive end as visible
      expect(
        labels.has('row-9'),
        'the cell ending at the offset is resident',
      ).toBe(true);
      expect(
        children[2]?.payload.height,
        'the spacer covers the 7 rows between the initial region and the window',
      ).toBe(350);
      expect(
        children[children.length - 1]?.payload.height,
        'trailing spacer covers the remaining 8',
      ).toBe(400);
    });

    // why: RN renders ListHeaderComponent above the first cell and ListFooterComponent below the
    // last one, and both stay mounted regardless of where the window sits — they are chrome, not
    // cells, so virtualization never recycles them.
    it('renders the header above and the footer below the windowed cells', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ListHeaderComponent={<text>the-header</text>}
          ListFooterComponent={<text>the-footer</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(committedLabels().has('the-header')).toBe(true);
      expect(committedLabels().has('the-footer')).toBe(true);

      fireScroll(500);
      await tick();

      expect(
        committedLabels().has('the-header'),
        'the header survives the window moving away from the top',
      ).toBe(true);
      expect(committedLabels().has('the-footer')).toBe(true);
    });

    // RN renders `ListEmptyComponent` only while `getItemCount()` is 0 and swaps back on data
    // A slot decided once at mount would leave the placeholder above a list that has since loaded
    it('renders the empty slot only while there are no items', async () => {
      const [rows, setRows] = createSignal<IRow[]>([]);
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={rows()}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ListEmptyComponent={<text>nothing-here</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(committedLabels().has('nothing-here')).toBe(true);

      setRows(DATA);
      await tick();

      expect(committedLabels().has('nothing-here')).toBe(false);
      expect(committedLabels().has('row-0')).toBe(true);
    });

    // RN renders `ItemSeparatorComponent` BETWEEN cells and never after the last one
    // The gate is the last index of the DATA, not of the WINDOW, or a cell's height would change
    // as the window slides past it
    it('gives every cell a separator while none of them is the last item', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ItemSeparatorComponent={() => <text>divider</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(
        contentChildren().filter(child => carriesText(child, 'divider')),
      ).toHaveLength(2);
    });

    // why: the other half of the same gate — the final item of the data has nothing after it, so it
    // gets no separator however the window is positioned.
    it('withholds the separator from the last item of the data', async () => {
      const two = makeRows(2);
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={two}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          ItemSeparatorComponent={() => <text>divider</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const cells = contentChildren();
      expect(cells.filter(child => carriesText(child, 'divider'))).toHaveLength(
        1,
      );
      const last = cells.find(child => carriesText(child, 'row-1'));
      expect(last === undefined ? true : carriesText(last, 'divider')).toBe(
        false,
      );
    });

    // The separator sits INSIDE the measuring wrapper, as a sibling it would be an extra flex child
    // that lands every cell below the leading spacer short
    it('renders the separator inside its cell rather than beside it', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ItemSeparatorComponent={() => <text>divider</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      // Every direct child of the content container that holds a divider must ALSO hold its row's
      // label — i.e. the divider is inside a cell, never a wrapper of its own. A sibling separator
      // shows up here as a child carrying the divider and no label.
      const withDivider = contentChildren().filter(child =>
        carriesText(child, 'divider'),
      );
      expect(withDivider.length).toBeGreaterThan(0);
      for (const [position, child] of withDivider.entries()) {
        expect(carriesText(child, `row-${position}`)).toBe(true);
      }
    });

    // RN hands `renderItem` a `separators` handle so a row can drive its own dividers
    // `highlight()` flips `highlighted` on the separators flanking the cell and must repaint
    it('repaints a separator when the row calls separators.highlight()', async () => {
      let highlight: (() => void) | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ItemSeparatorComponent={separatorProps => (
            <text>{separatorProps.highlighted ? 'sep-on' : 'sep-off'}</text>
          )}
          renderItem={info => {
            if (info().index === 0) highlight = info().separators.highlight;
            return <text>{info().item.label}</text>;
          }}
        />
      ));
      await settleViewport();
      expect(committedLabels().has('sep-off')).toBe(true);

      highlight?.();
      await tick();

      // Only the row that called highlight() flips; the other rendered cell keeps its own
      // separator unhighlighted, so both payloads are on screen at once.
      expect(committedLabels().has('sep-on')).toBe(true);
      expect(committedLabels().has('sep-off')).toBe(true);
    });

    // The other two members of the handle: `updateProps` merges arbitrary props onto one side's
    // separator and `unhighlight` is the release half of the press pair
    it('lets a row push props onto one side and clear the highlight again', async () => {
      let separators:
        | {
            updateProps: (
              select: 'leading' | 'trailing',
              p: Record<string, unknown>,
            ) => void;
            unhighlight: () => void;
          }
        | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ItemSeparatorComponent={separatorProps => (
            <text>{separatorLabel(separatorProps)}</text>
          )}
          renderItem={info => {
            if (info().index === 0) separators = info().separators;
            return <text>{info().item.label}</text>;
          }}
        />
      ));
      await settleViewport();

      separators?.updateProps('trailing', { tag: 'pushed' });
      await tick();
      expect(committedLabels().has('pushed')).toBe(true);

      separators?.updateProps('trailing', {
        tag: undefined,
        highlighted: true,
      });
      await tick();
      expect(committedLabels().has('sep-on')).toBe(true);

      separators?.unhighlight();
      await tick();
      expect(committedLabels().has('sep-off')).toBe(true);
    });

    // `scrollToOffset` rides the ScrollView's native `scrollTo` command ([x, y, animated]) and is
    // animated by default, a JS-only move would do nothing on a device
    it('drives scrollToOffset through the native scrollTo command', async () => {
      let list:
        | {
            scrollToOffset: (p: { offset: number; animated?: boolean }) => void;
          }
        | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

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

    // `scrollToIndex` placement is tunable: `viewPosition` 0 top, 1 bottom, 0.5 centred, and
    // `viewOffset` nudges the final offset, ignoring either lands the row under a pinned header
    it('resolves scrollToIndex to an offset honouring viewPosition and viewOffset', async () => {
      let list:
        | {
            scrollToIndex: (p: {
              index: number;
              animated?: boolean;
              viewPosition?: number;
              viewOffset?: number;
            }) => void;
          }
        | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      // Row 4 starts at 200pt.
      list?.scrollToIndex({ index: 4, animated: false });
      // Bottom-aligned inside a 100pt viewport holding a 50pt row: 200 - (100 - 50).
      list?.scrollToIndex({ index: 4, animated: false, viewPosition: 1 });
      // A 20pt nudge back up, e.g. to clear a pinned header.
      list?.scrollToIndex({ index: 4, animated: false, viewOffset: 20 });

      expect(fabric.commands.map(command => command.args)).toEqual([
        [0, 200, false],
        [0, 150, false],
        [0, 180, false],
      ]);
    });

    // why: RN's scrollToItem finds the item by REFERENCE identity in `data` and then behaves like
    // scrollToIndex. An item that is not in data has no index to resolve, and RN scrolls nowhere
    // rather than guessing — silently scrolling to 0 would look like a jump to the top.
    it('resolves scrollToItem by reference identity and ignores an unknown item', async () => {
      let list:
        | { scrollToItem: (p: { item: unknown; animated?: boolean }) => void }
        | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      list?.scrollToItem({ item: DATA[6], animated: false });
      // Structurally equal but a different object: not the same item.
      list?.scrollToItem({ item: { id: 6, label: 'row-6' }, animated: false });

      expect(fabric.commands.map(command => command.args)).toEqual([
        [0, 300, false],
      ]);
    });

    // why: RN's scrollToEnd lands the LAST content at the bottom edge — contentLength minus the
    // viewport, never past it and never negative when the content is shorter than the screen.
    // Scrolling to contentLength itself would overshoot by a whole screen.
    it('resolves scrollToEnd to the content length minus the viewport', async () => {
      let list:
        { scrollToEnd: (p?: { animated?: boolean }) => void } | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      list?.scrollToEnd({ animated: false });

      // 20 rows of 50pt = 1000, minus the 100pt viewport.
      expect(fabric.commands[0]?.args).toEqual([0, 900, false]);
    });

    // `flashScrollIndicators` is a native command on the scroll view, and the three getters plus
    // `getScrollNode` all reach the SAME scroll view, a null from any breaks Animated integrations
    it('routes flashScrollIndicators and the scroll-node getters to the scroll view', async () => {
      let list:
        | {
            flashScrollIndicators: () => void;
            getNativeScrollRef: () => unknown;
            getScrollableNode: () => unknown;
            getScrollResponder: () => unknown;
            getScrollNode: () => unknown;
          }
        | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      list?.flashScrollIndicators();

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'flashScrollIndicators',
      ]);
      expect(fabric.commands[0]?.viewName).toBe(SCROLL_VIEW);
      expect(list?.getScrollNode()).not.toBeNull();
      expect(list?.getNativeScrollRef()).not.toBeNull();
      expect(list?.getScrollableNode()).not.toBeNull();
      expect(list?.getScrollResponder()).not.toBeNull();
    });

    // Without `getItemLayout` a `scrollToIndex` past the highest measured frame cannot be placed
    // RN reports it through `onScrollToIndexFailed` and scrolls nowhere
    it('reports onScrollToIndexFailed for a target past the last measured cell', async () => {
      const onScrollToIndexFailed = vi.fn();
      let list: { scrollToIndex: (p: { index: number }) => void } | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          initialNumToRender={2}
          windowSize={1}
          onScrollToIndexFailed={onScrollToIndexFailed}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();
      // Measure the first cell so the highest measured frame is 0, the viewport stays unmeasured
      // because a measured one over zero-length cells collapses the window onto the last index
      fireLayout(contentChildren()[0], ITEM_HEIGHT);
      await tick();

      list?.scrollToIndex({ index: 0 });
      expect(onScrollToIndexFailed).not.toHaveBeenCalled();
      expect(fabric.commands).toHaveLength(1);

      list?.scrollToIndex({ index: 5 });

      expect(onScrollToIndexFailed).toHaveBeenCalledTimes(1);
      expect(onScrollToIndexFailed.mock.calls[0][0]).toEqual({
        index: 5,
        highestMeasuredFrameIndex: 0,
        averageItemLength: ITEM_HEIGHT,
      });
      expect(
        fabric.commands,
        'no scroll is attempted when the target cannot be placed',
      ).toHaveLength(1);
    });

    // Without `getItemLayout` RN stops the tail spacer at the highest measured cell, so the
    // unmeasured rest reserves no room and a fling cannot scroll into it
    it('measures its cells and holds the tail spacer at the highest measured cell', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();
      // Nothing measured yet: every cell is zero-length, so there is nothing to reserve.
      expect(contentChildren().every(child => child.children.length > 0)).toBe(
        true,
      );

      fireLayout(contentChildren()[0], ITEM_HEIGHT);
      await tick();

      const trailing = contentChildren()[contentChildren().length - 1];
      expect(
        trailing?.children.length,
        'no trailing spacer past the measured cells',
      ).toBeGreaterThan(0);
      expect(contentChildren(), 'only the window is reserved').toHaveLength(2);
    });

    // `onEndReached` fires within `onEndReachedThreshold` viewports of the end once the last cell
    // renders, and dedups by content length so it fires ONCE per page
    it('fires onEndReached once at the bottom and not again for the same content', async () => {
      const onEndReached = vi.fn();
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          onEndReachedThreshold={0}
          onEndReached={onEndReached}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(onEndReached, 'not at the top').not.toHaveBeenCalled();

      fireScroll(900);
      await tick();
      expect(onEndReached).toHaveBeenCalledTimes(1);
      expect(onEndReached.mock.calls[0][0]).toEqual({ distanceFromEnd: 0 });

      fireScroll(900);
      await tick();
      expect(
        onEndReached,
        'the same content length must not fire it twice',
      ).toHaveBeenCalledTimes(1);
    });

    // `onStartReached` is the top-edge twin of `onEndReached`, it dedups the same way and RE-ARMS
    // once the list has scrolled away, or the second visit to the top loads nothing
    it('fires onStartReached at the top and re-arms after scrolling away', async () => {
      const onStartReached = vi.fn();
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
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

      fireScroll(500);
      await tick();
      expect(onStartReached).toHaveBeenCalledTimes(1);

      fireScroll(0);
      await tick();
      expect(
        onStartReached,
        'returning to the top arms it again',
      ).toHaveBeenCalledTimes(2);
    });

    // `onViewableItemsChanged` reports the items passing `viewabilityConfig`, and `changed` carries
    // only the DELTA, a handler fed the whole set would double-count every row
    it('reports viewable items by their extracted key and only the delta on a scroll', async () => {
      const changes: {
        viewableItems: { key: string; index: number; isViewable: boolean }[];
        changed: { key: string; isViewable: boolean }[];
      }[] = [];
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          viewabilityConfig={{ itemVisiblePercentThreshold: 100 }}
          onViewableItemsChanged={info => changes.push(info)}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(changes).toHaveLength(1);
      expect(changes[0].viewableItems.map(token => token.key)).toEqual([
        'k-0',
        'k-1',
      ]);

      fireScroll(500);
      await tick();

      const last = changes[changes.length - 1];
      expect(last.viewableItems.map(token => token.key)).toEqual([
        'k-10',
        'k-11',
      ]);
      expect(
        last.changed.filter(token => !token.isViewable).map(token => token.key),
        'the rows that left are reported as no longer viewable',
      ).toEqual(['k-0', 'k-1']);
    });

    // `viewabilityConfigCallbackPairs` lets one list report against several thresholds at once
    // and every pair's callback has to be invoked, not just the first
    it('invokes every viewabilityConfigCallbackPairs callback', async () => {
      const seen = vi.fn();
      const fullyVisible = vi.fn();
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          viewabilityConfigCallbackPairs={[
            {
              viewabilityConfig: { itemVisiblePercentThreshold: 50 },
              onViewableItemsChanged: seen,
            },
            {
              viewabilityConfig: { itemVisiblePercentThreshold: 100 },
              onViewableItemsChanged: fullyVisible,
            },
          ]}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(seen).toHaveBeenCalledTimes(1);
      expect(fullyVisible).toHaveBeenCalledTimes(1);
    });

    // `minimumViewTime` holds a row back until it has been viewable that long, so a fast flick
    // past a row is not an impression
    it('defers onViewableItemsChanged by minimumViewTime', async () => {
      const onViewableItemsChanged = vi.fn();
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          viewabilityConfig={{
            itemVisiblePercentThreshold: 100,
            minimumViewTime: 40,
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(
        onViewableItemsChanged,
        'nothing is reported before the dwell time elapses',
      ).not.toHaveBeenCalled();

      await new Promise(resolve => setTimeout(resolve, 80));

      expect(onViewableItemsChanged).toHaveBeenCalledTimes(1);
    });

    // `waitForInteraction` suppresses every viewability report until the user touches the list,
    // a scroll is that interaction
    it('reports nothing under waitForInteraction until the list is scrolled', async () => {
      const onViewableItemsChanged = vi.fn();
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          viewabilityConfig={{
            itemVisiblePercentThreshold: 100,
            waitForInteraction: true,
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(onViewableItemsChanged).not.toHaveBeenCalled();

      fireScroll(50);
      await tick();

      expect(onViewableItemsChanged).toHaveBeenCalledTimes(1);
    });

    // RN runs its windowing bookkeeping and THEN calls `props.onScroll`, the user's handler
    // composes with the internal one, a raw `onScroll` on the host would freeze the window
    it('composes the user onScroll with the internal windowing handler', async () => {
      const onScroll = vi.fn();
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          onScroll={onScroll}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      fireScroll(500);
      await tick();

      expect(onScroll).toHaveBeenCalledTimes(1);
      expect(
        committedLabels().has('row-10'),
        'the internal handler still moved the window',
      ).toBe(true);
    });

    // RN forwards the scroll-lifecycle callbacks straight to the inner ScrollView, swallowed in the
    // prop split they would never fire and nothing would report it
    it('forwards the scroll-lifecycle callbacks to the native scroll host', async () => {
      const onScrollBeginDrag = vi.fn();
      const onScrollEndDrag = vi.fn();
      const onMomentumScrollBegin = vi.fn();
      const onMomentumScrollEnd = vi.fn();
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
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

    // Native reads the keyboard props and `scrollEventThrottle` directly, the only way to get them
    // wrong is to swallow them in the prop split
    it('forwards the keyboard props and scrollEventThrottle to the native scroll host', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const props = committed(SCROLL_VIEW).payload;
      expect(props.keyboardDismissMode).toBe('on-drag');
      expect(props.keyboardShouldPersistTaps).toBe('handled');
      expect(props.scrollEventThrottle).toBe(16);
    });

    // A horizontal list is a different axis end to end: content pinned to the full row WIDTH so
    // it overflows, the offset read off `contentOffset.x`, cells measured by width
    it('lays a horizontal list along the row axis and windows on the x offset', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          horizontal
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();
      const scroll = committed(SCROLL_VIEW);
      // The axis flag and the row style are engine rules, the width below is this list's own
      // arithmetic: it pins the content to the row total
      expect(committed(CONTENT_VIEW).payload.width).toBe(
        ITEM_HEIGHT * ROW_COUNT,
      );

      // The viewport is measured along the scroll axis too: width, not height.
      fabric.fireEvent(scroll.instanceHandle, 'topLayout', {
        layout: { x: 0, y: 0, width: VIEWPORT_HEIGHT, height: 320 },
      });
      await tick();
      fabric.fireEvent(committed(SCROLL_VIEW).instanceHandle, 'topScroll', {
        contentOffset: { x: 500, y: 0 },
      });
      await tick();

      expect(committedLabels().has('row-10')).toBe(true);
      expect(committedLabels().has('row-5')).toBe(false);
      expect(
        contentChildren()[2]?.payload.width,
        'the spacer after the initial region sizes by width',
      ).toBe(350);
    });

    // `inverted` is a `scale(-1)` on the scroll container plus a counter-flip on EVERY cell, the
    // content container must not flip too or it would cancel the outer flip
    it('flips the scroll container and counter-flips each cell when inverted', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          inverted
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(committed(SCROLL_VIEW).payload.transform).toEqual([
        { scaleY: -1 },
      ]);
      expect(
        committed(CONTENT_VIEW).payload.transform,
        'the content container must NOT be flipped as well',
      ).toBeUndefined();

      const cells = contentChildren().filter(
        child => child.children.length > 0,
      );
      expect(cells.length).toBeGreaterThan(0);
      for (const cell of cells) {
        expect(cell.payload.transform).toEqual([{ scaleY: -1 }]);
      }
    });

    // `style` dresses the scroll view and `contentContainerStyle` the inner container of cells
    // This adapter also resolves a registered class name for both
    it('routes style to the scroll view and contentContainerStyle to the content container', async () => {
      registerRules([
        {
          tokens: ['frame'],
          specificity: [0, 1, 0],
          order: 0,
          style: { flex: 1 },
        },
        {
          tokens: ['padded'],
          specificity: [0, 1, 0],
          order: 1,
          style: { padding: 20 },
        },
      ]);
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          class="frame"
          style={RED_STYLE}
          contentContainerStyle="padded"
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const scroll = committed(SCROLL_VIEW).payload;
      expect(scroll.flex, 'the class resolved onto the scroll view').toBe(1);
      expect(scroll.backgroundColor).toBe('red');
      expect(
        scroll.padding,
        'the content style stays off the scroll view',
      ).toBe(undefined);
      expect(committed(CONTENT_VIEW).payload.padding).toBe(20);
    });

    // The whole accessibility surface rides onto the ScrollView and `aria-*` folds into its
    // `accessibility*` twin, losing `testID` or labels breaks e2e selectors and screen readers
    it('rides its accessibility surface down onto the scroll host', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          testID="the-list"
          aria-label="Orders"
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const props = committed(SCROLL_VIEW).payload;
      expect(props.testID).toBe('the-list');
      expect(
        props.accessibilityLabel,
        'aria-label folds into RN spelling',
      ).toBe('Orders');
    });

    // `renderItem`, `getItem`, `data` and the windowing knobs are pure JS and consumed here, a
    // function on the native bag crashes Android's serializer and `data` would cross the bridge
    it('never forwards its JS-only props onto the native bag', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const props = committed(SCROLL_VIEW).payload;
      for (const leaked of [
        'renderItem',
        'getItem',
        'getItemCount',
        'getItemLayout',
        'keyExtractor',
        'data',
        'windowSize',
        'initialNumToRender',
        'contentContainerStyle',
      ]) {
        expect(leaked in props, `${leaked} must not reach native`).toBe(false);
      }
    });

    // With `onRefresh` the iOS RefreshControl is a child of the scroll view placed BEFORE the
    // content container, `refreshing` is controlled so a frozen prop leaves the spinner forever
    // and RN defaults it to false when nullish
    it('attaches the iOS RefreshControl before the content and keeps refreshing controlled', async () => {
      const [refreshing, setRefreshing] = createSignal(false);
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          onRefresh={() => {}}
          refreshing={refreshing()}
          progressViewOffset={12}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const scroll = committed(SCROLL_VIEW);
      expect(scroll.children.map(child => child.viewName)).toEqual([
        REFRESH_CONTROL,
        CONTENT_VIEW,
      ]);
      expect(scroll.children[0]?.payload.refreshing).toBe(false);
      expect(scroll.children[0]?.payload.progressViewOffset).toBe(12);

      setRefreshing(true);
      await tick();

      expect(committed(REFRESH_CONTROL).payload.refreshing).toBe(true);
      expect(
        fabric.findAll(node => node.viewName === REFRESH_CONTROL),
        'the update re-props the SAME control, it does not build a second one',
      ).toHaveLength(1);
    });

    // WHICH platform wraps the RefreshControl is decided by which `<scroll-view>` behavior is
    // registered (`behaviors/scroll-view/index.{ios,android}.ts`), not by which VirtualizedList
    // factory an app imports — that's `wrap-android.test.ts`'s subject, not this file's.

    // RN implements sticky headers in JS, native ignores `stickyHeaderIndices` so forwarding it is
    // a silent no-op, the flagged CELL has to come out wrapped in the sticky header instead
    it('wraps a flagged cell in the sticky header and never forwards the indices to native', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          stickyHeaderIndices={[0]}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const wrappers = live.findAllLive(
        live.appRoot(),
        node => node.payload.zIndex === STICKY_HEADER_Z_INDEX,
      );
      expect(wrappers, 'exactly the one flagged cell is wrapped').toHaveLength(
        1,
      );
      expect(
        'stickyHeaderIndices' in committed(SCROLL_VIEW).payload,
        'native ignores the array; forwarding it would be a silent no-op',
      ).toBe(false);
    });

    // The separator lives inside the measuring wrapper, so excluding the sticky cell would make its
    // height depend on the window and shift everything below it
    it('gives the force-mounted sticky cell a separator like any other cell', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          stickyHeaderIndices={[0, 15]}
          ItemSeparatorComponent={() => <text>divider</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      fireScroll(500);
      await tick();

      const sticky = contentChildren().find(child =>
        carriesText(child, 'row-0'),
      );
      expect(
        sticky === undefined ? false : carriesText(sticky, 'divider'),
      ).toBe(true);
    });

    // RN force-mounts the nearest sticky index off the window so a pinned header is not destroyed
    // and rebuilt, losing its measured layout, each time the window slides past its origin
    it('keeps the nearest sticky header resident once the window scrolls past its origin', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          stickyHeaderIndices={[0, 15]}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      fireScroll(500);
      await tick();

      const labels = committedLabels();
      expect(labels.has('row-10'), 'the in-window cell is resident').toBe(true);
      expect(
        labels.has('row-0'),
        'the force-mounted sticky header stays resident off-window',
      ).toBe(true);
      expect(
        labels.has('row-15'),
        'a sticky index BELOW the window is not force-mounted',
      ).toBe(false);
      expect(
        createdCountForText('row-0'),
        'and it was never destroyed and rebuilt on the way',
      ).toBe(1);
    });

    // The scroll view's rules run in the engine, the list must still commit a scroll view for them
    it('commits a scroll view for the engine scroll rules to land on', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      // `nestedScrollEnabled` is `foldScrollViewProps` in the engine, this host carries no copy
      // and only owes a committed scroll view for the default to land on
      expect(committed(SCROLL_VIEW)).toBeDefined();
    });

    // RN forwards `maintainVisibleContentPosition` to native and bumps `minIndexForVisible` by one
    // when a `ListHeaderComponent` occupies child 0, because the prop counts CHILDREN
    it('forwards maintainVisibleContentPosition, un-flattens the cells, and bumps past the header', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
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

    // RN moves the window with the key at `minIndexForVisible`, native MVCP does the scroll
    it('keeps the mounted rows and sends no scroll when rows are prepended above the window', async () => {
      const [rows, setRows] = createSignal(DATA);
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={rows()}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      fireScroll(500);
      await tick();
      const before = fabric.commands.length;
      const textsBefore = live.texts(live.appRoot());

      const older: IRow[] = Array.from({ length: 5 }, (_unused, offset) => ({
        id: -5 + offset,
        label: `older-${offset}`,
      }));
      setRows([...older, ...DATA]);
      await tick();

      // The first two cells are the retained initial render, now the new top rows
      const initialRender = 2;
      expect(live.texts(live.appRoot()).slice(initialRender)).toEqual(
        textsBefore.slice(initialRender),
      );
      expect(fabric.commands.slice(before)).toEqual([]);
    });

    // `initialScrollIndex` starts the list part-way down ONCE and instantly, re-applying it on
    // later layouts would fight the user for the scroll position
    it('jumps to initialScrollIndex once, instantly', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          initialScrollIndex={10}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'scrollTo',
      ]);
      expect(fabric.commands[0]?.args).toEqual([0, 500, false]);

      fireScroll(500);
      await tick();
      fireLayout(committed(SCROLL_VIEW), VIEWPORT_HEIGHT);
      await tick();

      expect(
        fabric.commands,
        'the initial jump is applied exactly once',
      ).toHaveLength(1);
    });

    // A native `scrollTo` needs the committed handle and this adapter commits on a microtask, so
    // a scroll in the tick of mount rides `contentOffset` until a real scroll supersedes it
    it('falls back to contentOffset for a scroll requested before the first commit', async () => {
      let list:
        | {
            scrollToOffset: (p: { offset: number; animated?: boolean }) => void;
          }
        | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      // No await: the engine has not committed yet, so there is no native handle.
      list?.scrollToOffset({ offset: 200, animated: false });
      await tick();

      expect(fabric.commands, 'nothing could be commanded yet').toHaveLength(0);
      expect(committed(SCROLL_VIEW).payload.contentOffset).toEqual({
        x: 0,
        y: 200,
      });

      fireScroll(120);
      await tick();

      // Absent, not null: the engine's op stream spells "reset to the default" as `NO_VALUE`
      expect(
        Object.hasOwn(committed(SCROLL_VIEW).payload, 'contentOffset'),
        'a real scroll supersedes the commanded offset',
      ).toBe(false);
      // The record carried the offset after the commanded write, so its absence means a clear op
      const recorded = fabric.find(node => node.viewName === SCROLL_VIEW);
      expect(Object.hasOwn(recorded?.props ?? {}, 'contentOffset')).toBe(false);
    });

    // RN always renders the visible rows and fills the overscan INCREMENTALLY, at most
    // `maxToRenderPerBatch` new cells per batch, one batch every `updateCellsBatchingPeriod` ms
    it('fills the overscan incrementally and keeps going until it reaches the target', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={5}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={10}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(committedLabels().has('row-3'), 'one batch was added').toBe(true);
      expect(
        committedLabels().has('row-4'),
        'the rest is deferred to later batches',
      ).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 120));

      expect(
        committedLabels().has('row-5'),
        'the refill timer carried the window all the way to the target',
      ).toBe(true);
    });

    // Every sticky header runs off ONE scroll `AnimatedValue` fed from the JS `onScroll`, so RN
    // raises the event rate (1 native, 16 JS) and both the windowing and the app handler still run
    it('raises the scroll-event rate for sticky headers and still runs both scroll handlers', async () => {
      const onScroll = vi.fn();
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          stickyHeaderIndices={[0]}
          onScroll={onScroll}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(committed(SCROLL_VIEW).payload.scrollEventThrottle).toBe(16);

      fireScroll(500);
      await tick();

      expect(onScroll, 'the app handler still runs').toHaveBeenCalledTimes(1);
      expect(
        committedLabels().has('row-10'),
        'and the internal windowing still ran',
      ).toBe(true);
    });
  });

  // `recordInteraction()` ungates `waitForInteraction` AND runs the viewability pass right there,
  // a list that fits its viewport and is never scrolled has no windowing change to carry the report
  it('reports the ungated viewable items as soon as an interaction is recorded', async () => {
    const onViewableItemsChanged = vi.fn();
    let list: { recordInteraction: () => void } | undefined;
    mount(ROOT_TAG, () => (
      <VirtualizedList<IRow>
        data={DATA}
        getItem={getItem}
        getItemCount={getItemCount}
        getItemLayout={getItemLayout}
        keyExtractor={keyExtractor}
        initialNumToRender={2}
        windowSize={1}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 100,
          waitForInteraction: true,
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        ref={handle => {
          list = handle;
        }}
        renderItem={info => <text>{info().item.label}</text>}
      />
    ));
    await settleViewport();
    expect(onViewableItemsChanged).not.toHaveBeenCalled();

    list?.recordInteraction();
    await tick();
    expect(
      onViewableItemsChanged,
      'the interaction itself carries the report — no further scroll needed',
    ).toHaveBeenCalledTimes(1);

    // And it is not double-reported when a windowing change follows with the same viewable set.
    fireLayout(committed(SCROLL_VIEW), VIEWPORT_HEIGHT);
    await tick();
    expect(onViewableItemsChanged).toHaveBeenCalledTimes(1);
  });

  // The Solid-specific half: each claim is about WHICH nodes moved, Solid has no reconciler between
  // a component and the host nodes, so the shapes are proven by mutation instead of red-first
  describe('Reactivity — updates must be re-props, not rebuilds', () => {
    // A row re-renders when its item changes, so the info crosses as an ACCESSOR while the call
    // stays untracked, only the leaf that reads it re-runs and nothing above it is torn down
    it('updates a cell in place when the data changes, creating no nodes', async () => {
      const [rows, setRows] = createSignal(DATA);
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={rows()}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(committedLabels().has('row-0')).toBe(true);
      const createdAtMount = totalCreated();

      // Same keys, new labels: nothing structural changed, only the text each row reads.
      setRows(makeRows(ROW_COUNT, '-v2'));
      await tick();

      expect(
        committedLabels().has('row-0-v2'),
        'the accessor carried the new item down to the leaf',
      ).toBe(true);
      expect(
        totalCreated(),
        'and it did so without rebuilding the cell subtree',
      ).toBe(createdAtMount);
    });

    // A `renderItem` reading `info()` at its TOP LEVEL would put the signal in the cell's `insert`
    // effect and rebuild mid-gesture, untracked the read is frozen instead, as in Solid's `<Show>`
    // Nothing on screen separates the two, so the node counter is the whole test
    it('never rebuilds a cell whose renderItem reads the info at its top level', async () => {
      const [rows, setRows] = createSignal(DATA);
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={rows()}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => {
            const label = info().item.label;
            return <text>{label}</text>;
          }}
        />
      ));
      await settleViewport();
      const createdAtMount = totalCreated();

      setRows(makeRows(ROW_COUNT, '-v2'));
      await tick();

      expect(
        totalCreated(),
        'a data change must not tear the cell subtree down and rebuild it',
      ).toBe(createdAtMount);
      expect(committedLabels().has('row-0')).toBe(true);
      expect(committedLabels().has('row-0-v2')).toBe(false);
    });

    // Rows that survive a window step must MOVE, keyed by position they would be rebuilt on every
    // scroll step, which no assertion about the screen can see
    it('reuses a cell that survives a window step instead of rebuilding it', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(createdCountForText('row-1')).toBe(1);

      // Window [0,1] -> [1,2]: row 1 survives the step, row 2 is new.
      fireScroll(50);
      await tick();

      expect(committedLabels().has('row-2'), 'the new row mounted').toBe(true);
      expect(
        createdCountForText('row-1'),
        'the surviving row kept its nodes and only moved',
      ).toBe(1);
    });

    // A body runs ONCE, so a prop read outside an accessor is frozen at its mount-time value
    // A later prop change must reach the SAME native node, not a rebuilt one
    it('re-props the same scroll node when a plain prop changes after mount', async () => {
      const [dismiss, setDismiss] = createSignal<'none' | 'on-drag'>('none');
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          keyboardDismissMode={dismiss()}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      const nodeAtMount = committed(SCROLL_VIEW).handle;
      expect(committed(SCROLL_VIEW).payload.keyboardDismissMode).toBe('none');

      setDismiss('on-drag');
      await tick();

      expect(committed(SCROLL_VIEW).payload.keyboardDismissMode).toBe(
        'on-drag',
      );
      expect(
        committed(SCROLL_VIEW).handle,
        'the scroll host kept its identity',
      ).toBe(nodeAtMount);
    });

    // The axis resolves a different host TAG and Solid cannot swap a tag under a live node, so the
    // flip REBUILDS, both axes are `RCTScrollView` headless so the creation count is the proxy
    it('rebuilds and keeps its cells when the scroll axis flips', async () => {
      const [horizontal, setHorizontal] = createSignal(false);
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          horizontal={horizontal()}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      const createdAtMount = totalCreated();

      setHorizontal(true);
      await tick();

      expect(
        totalCreated(),
        'the axis flip must rebuild the host tags',
      ).toBeGreaterThan(createdAtMount);
      // The row style is the engine's rule, the flip rebuilt the tags above without losing cells
      expect(committedLabels().has('row-0'), 'the cells survived').toBe(true);
    });
  });

  describe('Negative', () => {
    // why: RN's scrollToIndex asserts the index is in range and throws, naming the valid range —
    // clamping instead would turn a caller bug into "the wrong row is on screen" with nothing
    // pointing back at the call site. This proves the throw survives the handle, unswallowed.
    it('rejects an out-of-range scrollToIndex the way RN does', async () => {
      let list: { scrollToIndex: (p: { index: number }) => void } | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ref={handle => {
            list = handle;
          }}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(() => list?.scrollToIndex({ index: 999 })).toThrow(
        'scrollToIndex out of range: requested index 999 is out of 0 to 19',
      );
      // Nothing was scrolled: the rejection replaces the clamped command, it does not accompany it
      expect(fabric.commands).toEqual([]);
    });

    // Fabric has no bare-text host, `RCTRawText` is only valid inside a `<Text>`, so a raw string
    // from `renderItem` must fail loudly at mount instead of deep in native
    it('throws when a cell renders a bare string outside a Text', () => {
      expect(() =>
        mount(ROOT_TAG, () => (
          <VirtualizedList<IRow>
            data={DATA}
            getItem={getItem}
            getItemCount={getItemCount}
            getItemLayout={getItemLayout}
            initialNumToRender={2}
            windowSize={1}
            renderItem={info => info().item.label}
          />
        )),
      ).toThrow(/must be rendered inside a <Text>/);
    });
  });

  // Behaviours we could not justify from RN or the React adapter, captured as they are so a later
  // change to them is at least visible. Each carries the open question in a `// QUESTION:` comment.
  describe('Characterization', () => {
    // QUESTION: a Solid cell is a live reactive subtree, so `extraData` has nothing to bust, is
    // there an app shape (a closure over a plain mutable object) where that silence would surprise
    it('accepts extraData and treats it as a no-op [characterization — behavior not confirmed]', async () => {
      const [extra, setExtra] = createSignal(1);
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          initialNumToRender={2}
          windowSize={1}
          extraData={extra()}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      const createdAtMount = totalCreated();

      setExtra(2);
      await tick();

      expect(
        totalCreated(),
        'nothing is re-rendered on an extraData change',
      ).toBe(createdAtMount);
      expect(
        'extraData' in committed(SCROLL_VIEW).payload,
        'and it never reaches native',
      ).toBe(false);
    });
  });
});

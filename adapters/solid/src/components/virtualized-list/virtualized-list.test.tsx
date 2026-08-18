// Solid twin of adapters/react's virtualized-list tests, adapters/vue's and adapters/svelte's. Drives
// REAL compiled Solid JSX through the universal renderer into the fake Fabric slot. Every expectation
// below comes from a PRODUCT rule — React Native's documented VirtualizedList/FlatList behaviour, or
// the surface adapters/react already ships (the reference adapter for P0 parity) — never from
// reading this adapter's own source back.
//
// The `Reactivity` group is the Solid-specific half and has no counterpart in the React file: Solid
// runs a component body ONCE and has no reconciler between what it returns and the host nodes —
// `insert` REPLACES a subtree rather than diffing one — so "the cell updated" and "the cell was not
// rebuilt in order to update" are two independent, silently-breakable claims. The node-creation
// counter is the only headless line between them (.claude/rules/solid-descriptor-bridge.md §4).

import { createSignal } from 'solid-js';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { VirtualizedList } from './index';
import { VirtualizedList as AndroidVirtualizedList } from './index.android';

const ROOT_TAG = 819;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';
const REFRESH_CONTROL = 'PullToRefreshView';
const ITEM_HEIGHT = 50;
const VIEWPORT_HEIGHT = 100;
const ROW_COUNT = 20;

interface IRow {
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

function committed(viewName: string): IFakeNode {
  const found = flatCommitted().find(node => node.viewName === viewName);
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

// Every committed raw-text payload — the row labels plus whatever the header/footer/empty slots
// render. Read off the COMMITTED tree, never `fabric.created`: a created node's props are frozen at
// its first createNode, so asserting there would make every update test pass forever.
function committedLabels(): Set<string> {
  const labels = new Set<string>();
  for (const node of flatCommitted()) {
    const text: unknown = node.props.text;
    if (typeof text === 'string') labels.add(text);
  }
  return labels;
}

// How many TIMES a node carrying this text was created. 1 means the row survived whatever happened in
// between; >1 means it was destroyed and rebuilt.
function createdCountForText(text: string): number {
  return fabric.created.filter(node => node.props.text === text).length;
}

// Does this committed subtree carry a raw-text payload anywhere inside it? Used to ask WHERE a node
// sits rather than merely whether it exists — placement is geometry for a separator.
function carriesText(node: IFakeNode, text: string): boolean {
  return (
    node.props.text === text ||
    node.children.some(child => carriesText(child, text))
  );
}

function contentChildren(): IFakeNode[] {
  return committed(CONTENT_VIEW).children;
}

function fireLayout(node: IFakeNode, height: number): void {
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
    // why: RN renders a VirtualizedList through a ScrollView, which is a NESTED pair — a scroll view
    // that pans a single content view holding the cells. A flat tree looks identical in JS and
    // simply does not scroll on a device; on Android a second direct child of the scroll view is an
    // outright addViewAt crash, which is why RN also pins the content view un-flattened
    // (ScrollView.js preserveChildren / collapsable=false).
    it('commits a nested scroll host with an un-flattened content container', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={[]}
          getItem={getItem}
          getItemCount={getItemCount}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      const scroll = committed(SCROLL_VIEW);
      expect(scroll.children[0]?.viewName).toBe(CONTENT_VIEW);
      expect(committed(CONTENT_VIEW).props.collapsable).toBe(false);
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      const labels = committedLabels();
      expect(labels.has('row-0')).toBe(true);
      expect(labels.has('row-1')).toBe(true);
      expect(labels.has('row-2')).toBe(false);
      expect(labels.has('row-19')).toBe(false);
    });

    // why: the unmounted cells still have to occupy space, or the scroll thumb and the total content
    // size are wrong and the list scrolls to the wrong place. RN collapses the off-window extent into
    // spacers: none above when the window starts at row 0, one below covering the rest (here 20 rows
    // of 50pt = 1000, minus the 100pt the two mounted cells occupy).
    it('reserves the off-window extent with a trailing spacer and none at the top', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      const children = contentChildren();
      expect(children[0]?.children.length, 'the first child is a cell').toBe(1);
      const trailing = children[children.length - 1];
      expect(trailing?.children.length, 'the last child is a spacer').toBe(0);
      expect(trailing?.props.height).toBe(900);
    });

    // why: the resident window is a function of the MEASURED viewport and the live scroll offset —
    // RN recomputes it on every scroll event and re-collapses what left the window back into the
    // spacers. A list that paints its first window and then never moves looks fine at the top and is
    // blank everywhere else. windowSize 1 means zero overscan, so at offset 500 with 50pt rows and a
    // 100pt viewport exactly rows 10 and 11 are resident.
    it('moves the window and both spacer extents as the list scrolls', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      fireScroll(500);
      await tick();

      const labels = committedLabels();
      expect(labels.has('row-10')).toBe(true);
      expect(labels.has('row-11')).toBe(true);
      expect(labels.has('row-0'), 'the rows left behind are unmounted').toBe(
        false,
      );

      const children = contentChildren();
      expect(children[0]?.props.height, 'leading spacer covers 10 rows').toBe(
        500,
      );
      expect(
        children[children.length - 1]?.props.height,
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
          ListHeaderComponent={<symbiote-text>the-header</symbiote-text>}
          ListFooterComponent={<symbiote-text>the-footer</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN renders ListEmptyComponent only while getItemCount() is 0, and swaps back to the cells
    // the moment data arrives. A slot decided once at mount leaves an "empty" placeholder sitting
    // above a list that has since loaded — the classic async-list bug.
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
          ListEmptyComponent={<symbiote-text>nothing-here</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      expect(committedLabels().has('nothing-here')).toBe(true);

      setRows(DATA);
      await tick();

      expect(committedLabels().has('nothing-here')).toBe(false);
      expect(committedLabels().has('row-0')).toBe(true);
    });

    // why: RN renders ItemSeparatorComponent BETWEEN cells and never after the last one — a trailing
    // separator is the classic off-by-one that shows up as a stray divider above the footer. With
    // the window holding exactly two cells there is exactly one gap.
    // why: the gate is the last index of the DATA, not of the WINDOW (RN VirtualizedList.js:793,
    // `const end = getItemCount(data) - 1`). Since the separator lives inside the measuring wrapper,
    // gating on the window would make a cell's own height change as the window slid past it — seen
    // on device 2026-08-19 as a run of cells shifting by exactly the divider's 1px. Every rendered
    // cell here is mid-list, so every one of them carries a separator.
    it('gives every cell a separator while none of them is the last item', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ItemSeparatorComponent={() => <symbiote-text>divider</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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
          ItemSeparatorComponent={() => <symbiote-text>divider</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: WHERE the separator sits is geometry, not decoration. As a sibling of the cell it is an
    // extra flex child, so the chrome between two cells becomes gap + separator + gap while the
    // leading spacer collapsing that region contributes only one gap — every cell below it lands
    // short by (separator + gap) and the content jumps by that much whenever the window's first
    // index moves. Measured at exactly 17px on device 2026-08-19. RN avoids it structurally by
    // rendering the separator INSIDE the cell's measuring wrapper
    // (VirtualizedListCellRenderer.js:218-221), which also folds it into the cell's measured
    // length. Counting dividers, as the test above does, cannot see any of this.
    it('renders the separator inside its cell rather than beside it', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          ItemSeparatorComponent={() => <symbiote-text>divider</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN hands renderItem a `separators` handle (CellRenderer._separators) so a row can drive
    // its own dividers — highlight() flips `highlighted` on the separators flanking that cell, which
    // is how a pressed row draws a full-bleed divider. A handle that mutates without repainting is
    // the failure mode this pins.
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
            <symbiote-text>
              {separatorProps.highlighted ? 'sep-on' : 'sep-off'}
            </symbiote-text>
          )}
          renderItem={info => {
            if (info().index === 0) highlight = info().separators.highlight;
            return <symbiote-text>{info().item.label}</symbiote-text>;
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

    // why: the other two members of RN's separators handle. updateProps('leading'|'trailing') merges
    // ARBITRARY props onto one side's separator — that is how a row pushes its own colour/inset onto
    // just the divider below it — and unhighlight() is the release half of the press pair. A handle
    // that only implements highlight() type-checks and silently drops both.
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
            <symbiote-text>
              {typeof separatorProps.tag === 'string'
                ? separatorProps.tag
                : separatorProps.highlighted
                  ? 'sep-on'
                  : 'sep-off'}
            </symbiote-text>
          )}
          renderItem={info => {
            if (info().index === 0) separators = info().separators;
            return <symbiote-text>{info().item.label}</symbiote-text>;
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

    // why: RN exposes scrollToOffset on the list ref and it rides the underlying ScrollView's NATIVE
    // scrollTo command ([x, y, animated]), animated by default. A JS-only implementation would move
    // nothing on a device, and dropping the animated flag turns every programmatic scroll into a
    // jump.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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
      expect(fabric.commands[0]?.node.viewName).toBe(SCROLL_VIEW);
    });

    // why: RN's scrollToIndex places item `index` in the viewport, and the placement is tunable:
    // viewPosition 0 puts it at the top, 1 at the bottom, 0.5 centred, and viewOffset nudges the
    // final offset by a fixed number of points (for a sticky header overlapping the top). Ignoring
    // either lands the row under whatever is pinned above it.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      list?.scrollToEnd({ animated: false });

      // 20 rows of 50pt = 1000, minus the 100pt viewport.
      expect(fabric.commands[0]?.args).toEqual([0, 900, false]);
    });

    // why: RN's list ref also exposes the inner-scroll routing tail — flashScrollIndicators is a
    // native command on the scroll view, and getNativeScrollRef / getScrollableNode /
    // getScrollResponder / getScrollNode all reach the SAME underlying scroll view (RN keeps three
    // names for API history; external code pattern-matches on them). A null from any of them is how
    // an Animated-driven or focus-scrolling integration silently stops working.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      list?.flashScrollIndicators();

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'flashScrollIndicators',
      ]);
      expect(fabric.commands[0]?.node.viewName).toBe(SCROLL_VIEW);
      expect(list?.getScrollNode()).not.toBeNull();
      expect(list?.getNativeScrollRef()).not.toBeNull();
      expect(list?.getScrollableNode()).not.toBeNull();
      expect(list?.getScrollResponder()).not.toBeNull();
    });

    // why: without getItemLayout the list only knows the size of cells it has actually MEASURED, so
    // a scrollToIndex past the highest measured frame cannot be placed. RN reports that through
    // onScrollToIndexFailed({index, highestMeasuredFrameIndex, averageItemLength}) and scrolls
    // nowhere — the callback exists precisely so the app can react (grow the window, retry) instead
    // of the list silently jumping to a wrong offset.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();
      // Measure the first cell so the list has a highest-measured frame of 0. The viewport is left
      // unmeasured on purpose: with no getItemLayout and no cell measured yet every cell is
      // zero-length, and a measured viewport over zero-length cells collapses the window onto the
      // last index — a shared-core property, not this adapter's.
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

    // why: with no getItemLayout RN learns cell sizes from each rendered cell's own onLayout and
    // sizes the not-yet-measured ones from the running average, so the total content extent becomes
    // plausible before everything has been seen. A list that never measures reports a zero content
    // height, which on a device is a scroll view that refuses to scroll at all.
    it('measures its cells and sizes the unmeasured tail from the average', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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
      expect(trailing?.children.length, 'a trailing spacer appeared').toBe(0);
      // 20 rows at the measured 50pt average, minus the 100pt the two rendered cells occupy.
      expect(trailing?.props.height).toBe(900);
    });

    // why: onEndReached is what drives every infinite list. RN fires it when the scroll position is
    // within onEndReachedThreshold viewport-lengths of the end AND the real last cell is rendered,
    // and dedups by content length so it fires ONCE per page rather than on every scroll frame — a
    // handler that re-fires would issue a network request per frame.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: onStartReached is onEndReached's top-edge twin (RN 0.71+), used for prepend-paging chat
    // lists. Same contract in reverse: it fires while the first cell is rendered and within
    // onStartReachedThreshold of the start, dedups against the same content, and RE-ARMS once the
    // list has scrolled away — otherwise the second visit to the top loads nothing.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: onViewableItemsChanged is RN's impression/analytics hook. It reports the items that pass
    // viewabilityConfig, keyed by keyExtractor, and `changed` carries only the DELTA — the newly
    // viewable ones (isViewable true) and the ones that just left (false). A handler fed the whole
    // set every time double-counts every row on every scroll.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN accepts viewabilityConfigCallbackPairs as an alternative to the single
    // config/callback, so one list can report against several thresholds at once (e.g. a 50% "seen"
    // impression and a 100% "fully read" one). Every pair's callback has to be invoked, not just the
    // first.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(seen).toHaveBeenCalledTimes(1);
      expect(fullyVisible).toHaveBeenCalledTimes(1);
    });

    // why: RN's minimumViewTime holds a row back until it has been continuously viewable for that
    // long, so a fast flick past a row does not count as an impression. Reporting immediately makes
    // every analytics number wrong in the direction that is hardest to notice.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN's waitForInteraction suppresses every viewability report until the user has actually
    // touched the list, so rows that merely happen to be on screen at mount are not counted as seen.
    // A scroll is that interaction.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      expect(onViewableItemsChanged).not.toHaveBeenCalled();

      fireScroll(50);
      await tick();

      expect(onViewableItemsChanged).toHaveBeenCalledTimes(1);
    });

    // why: RN's VirtualizedList._onScroll runs its windowing bookkeeping and THEN calls
    // props.onScroll — the user's handler COMPOSES with the internal one, it never replaces it.
    // Letting the app's onScroll land raw on the host silently freezes the window at its first
    // paint while the app's own handler keeps working, which reads as "virtualization is broken".
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN forwards the scroll-lifecycle callbacks straight to the inner ScrollView
    // (VirtualizedList.js). They are how an app pauses video off-screen, hides a FAB while dragging,
    // or knows momentum has settled; swallowed in the prop split they simply never fire, with no
    // error anywhere.
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
    // directly — there is no JS wiring for them — so the only way to get them wrong is to swallow
    // them in the prop split. A list that never dismisses the keyboard on drag reads as a native
    // bug rather than a dropped prop.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const props = committed(SCROLL_VIEW).props;
      expect(props.keyboardDismissMode).toBe('on-drag');
      expect(props.keyboardShouldPersistTaps).toBe('handled');
      expect(props.scrollEventThrottle).toBe(16);
    });

    // why: a horizontal list is a different axis end to end, not a flag. RN lays the content out in
    // a row and pins it to the full content WIDTH so the row overflows and there is something to
    // scroll (without it the content is stretched to the viewport and iOS never scrolls), reads the
    // scroll offset off contentOffset.X, and measures cells by width.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();
      const scroll = committed(SCROLL_VIEW);
      expect(scroll.props.horizontal).toBe(true);
      expect(committed(CONTENT_VIEW).props.flexDirection).toBe('row');
      expect(committed(CONTENT_VIEW).props.width).toBe(ITEM_HEIGHT * ROW_COUNT);

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
      expect(committedLabels().has('row-0')).toBe(false);
      expect(
        contentChildren()[0]?.props.width,
        'the spacer sizes by width',
      ).toBe(500);
    });

    // why: RN implements `inverted` as a scale(-1) transform on the scroll container plus a
    // counter-flip on EVERY cell, so the list grows from the bottom while each row still reads
    // upright. Flipping the content container as well would cancel the outer flip; flipping only the
    // container renders every row upside down.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(committed(SCROLL_VIEW).props.transform).toEqual([{ scaleY: -1 }]);
      expect(
        committed(CONTENT_VIEW).props.transform,
        'the content container must NOT be flipped as well',
      ).toBeUndefined();

      const cells = contentChildren().filter(
        child => child.children.length > 0,
      );
      expect(cells.length).toBeGreaterThan(0);
      for (const cell of cells) {
        expect(cell.props.transform).toEqual([{ scaleY: -1 }]);
      }
    });

    // why: RN splits list styling in two — `style` dresses the scroll view that pans, while
    // `contentContainerStyle` dresses the inner container the cells sit in (that is where padding
    // between rows belongs; putting it on the outer view clips the scroll instead). This adapter
    // additionally resolves a registered class name, matching its own View/Text/ScrollView, and
    // accepts one for contentContainerStyle too.
    it('routes style to the scroll view and contentContainerStyle to the content container', async () => {
      registerStyles({ frame: { flex: 1 }, padded: { padding: 20 } });
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          class="frame"
          style={{ backgroundColor: 'red' }}
          contentContainerStyle="padded"
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const scroll = committed(SCROLL_VIEW).props;
      expect(scroll.flex, 'the class resolved onto the scroll view').toBe(1);
      expect(scroll.backgroundColor).toBe('red');
      expect(
        scroll.padding,
        'the content style stays off the scroll view',
      ).toBe(undefined);
      expect(committed(CONTENT_VIEW).props.padding).toBe(20);
    });

    // why: the React adapter spreads the list's whole accessibility surface onto the underlying
    // ScrollView, and RN folds the aria-* aliases into their accessibility* twins. A list is the
    // scrollable region a screen reader announces, so losing testID / labels here is what makes an
    // e2e selector or a VoiceOver rotor entry disappear.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const props = committed(SCROLL_VIEW).props;
      expect(props.testID).toBe('the-list');
      expect(
        props.accessibilityLabel,
        'aria-label folds into RN spelling',
      ).toBe('Orders');
    });

    // why: renderItem, getItem, data and the windowing knobs are pure JS and are CONSUMED here.
    // Leaking a function onto the native prop bag crashes Android's folly::dynamic serializer the
    // moment it tries to stringify it, and leaking `data` ships the whole list payload across the
    // bridge on every commit.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const props = committed(SCROLL_VIEW).props;
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

    // why: RN gives a list pull-to-refresh by handing the inner ScrollView a RefreshControl whenever
    // onRefresh is set. On iOS that control is a CHILD of the scroll view placed BEFORE the content
    // container (ScrollView.js: {refreshControl}{contentContainer}) — after it, or outside, the pull
    // gesture never reaches it. `refreshing` is CONTROLLED: native raises its own spinner on the
    // gesture and only the pushed-down prop takes it back, so a frozen prop leaves it spinning
    // forever. RN also defaults it to false when nullish.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const scroll = committed(SCROLL_VIEW);
      expect(scroll.children.map(child => child.viewName)).toEqual([
        REFRESH_CONTROL,
        CONTENT_VIEW,
      ]);
      expect(scroll.children[0]?.props.refreshing).toBe(false);
      expect(scroll.children[0]?.props.progressViewOffset).toBe(12);

      setRefreshing(true);
      await tick();

      expect(committed(REFRESH_CONTROL).props.refreshing).toBe(true);
      expect(
        fabric.created.filter(node => node.viewName === REFRESH_CONTROL),
        'the update re-props the SAME control, it does not build a second one',
      ).toHaveLength(1);
    });

    // why: an Android ScrollView hosts exactly ONE child, so RN cannot place the refresh control
    // beside the content there — AndroidSwipeRefreshLayout WRAPS the scroll host instead. The wrapper
    // then owns the frame, so RN's splitLayoutProps routes the LAYOUT half of the style (flex,
    // margin, size, position) onto it and leaves the VISUAL half (background, padding, border) on the
    // inner scroll view. Dumping the whole style on one of the two collapses the wrapper to zero
    // height or loses the app's layout.
    it('wraps the scroll host in the Android RefreshControl and splits the style across the two', async () => {
      mount(ROOT_TAG, () => (
        <AndroidVirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          onRefresh={() => {}}
          refreshing={false}
          style={{ flex: 1, backgroundColor: 'red' }}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const control = committed(REFRESH_CONTROL);
      expect(
        control.children.map(child => child.viewName),
        'the scroll host nests INSIDE the refresh control',
      ).toEqual([SCROLL_VIEW]);
      expect(control.props.flex, 'the layout half rides the wrapper').toBe(1);
      expect(control.props.backgroundColor).toBeUndefined();
      const scroll = committed(SCROLL_VIEW).props;
      expect(scroll.backgroundColor, 'the visual half stays inside').toBe(
        'red',
      );
      expect(scroll.flex).toBeUndefined();
    });

    // why: RN implements sticky headers PURELY IN JS — the native scroll view ignores
    // stickyHeaderIndices entirely, so forwarding the array is a silent no-op that hides a missing
    // implementation. The flagged CELL has to come out wrapped in the sticky header component
    // instead, which is what pins it while the rows scroll under it.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const wrappers = flatCommitted().filter(
        node => node.props.zIndex === STICKY_HEADER_Z_INDEX,
      );
      expect(wrappers, 'exactly the one flagged cell is wrapped').toHaveLength(
        1,
      );
      expect(
        'stickyHeaderIndices' in committed(SCROLL_VIEW).props,
        'native ignores the array; forwarding it would be a silent no-op',
      ).toBe(false);
    });

    // why: RN's _ensureClosestStickyHeader force-mounts the nearest sticky index BELOW the window, so
    // a pinned header survives the window sliding past its origin index. Without it the pinned header
    // is destroyed the moment its origin leaves [first,last] and recreated (losing its measured
    // layout, so its pin resets) every time the window slides back — the flickering sticky header
    // this exists to fix. Only the NEAREST one below is kept; earlier sticky indices do not apply.
    // why: the separator lives inside the measuring wrapper, so whatever decides to render it
    // decides the cell's HEIGHT. The force-mounted sticky cell used to be excluded, which made that
    // cell's height depend on where the window sat — every window step then shifted everything below
    // it by the divider's 1px, measured on device 2026-08-19. RN excludes neither the sticky cell
    // nor anything else window-shaped; the only gate is the data's last index.
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
          ItemSeparatorComponent={() => <symbiote-text>divider</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN's ScrollView defaults nestedScrollEnabled to true (`nestedScrollEnabled ?? true`), and
    // Android needs the flag for a scrollable nested inside another to get gesture arbitration at
    // all. A list that hand-authors its scroll host — as this one does, to wrap sticky cells itself —
    // does not inherit that default for free, and the symptom is Android-only: only the outer page
    // scrolls, the list never moves.
    it('defaults nestedScrollEnabled on, the way RN ScrollView does', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(committed(SCROLL_VIEW).props.nestedScrollEnabled).toBe(true);
    });

    // why: RN both FORWARDS maintainVisibleContentPosition to native (so the scroll view anchors the
    // cells it can see) and keeps those cells un-flattened — Android Fabric would otherwise collapse
    // a layout-only cell away and the native helper would have nothing to anchor to, so the list
    // jumps on prepend. RN also bumps minIndexForVisible by one when a ListHeaderComponent occupies
    // child 0, because the prop counts CHILDREN, not data indices.
    it('forwards maintainVisibleContentPosition, un-flattens the cells, and bumps past the header', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
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

    // why: native maintainVisibleContentPosition can only anchor cells it has MOUNTED. Items
    // prepended above the window are collapsed into the leading spacer, which native cannot see, so
    // RN replicates the shift in JS (getDerivedStateFromProps): it tracks the key at
    // minIndexForVisible and, when a prepend moves it down, scrolls by exactly the inserted extent.
    // Without it a chat list loading older messages yanks the reader to a different message.
    it('shifts the scroll by the prepended extent that native cannot see', async () => {
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      fireScroll(500);
      await tick();
      const before = fabric.commands.length;

      const older: IRow[] = Array.from({ length: 5 }, (_unused, offset) => ({
        id: -5 + offset,
        label: `older-${offset}`,
      }));
      setRows([...older, ...DATA]);
      await tick();

      const scrolls = fabric.commands.slice(before);
      expect(scrolls.map(command => command.commandName)).toEqual(['scrollTo']);
      // 5 prepended rows of 50pt, added to the 500pt the list was already scrolled to; instant, so
      // the anchored row does not visibly travel.
      expect(scrolls[0]?.args).toEqual([0, 750, false]);
    });

    // why: RN's initialScrollIndex starts the list part-way down, and does it ONCE and instantly —
    // RN does not animate the initial jump, and re-applying it on every later layout pass would fight
    // the user for control of the scroll position.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: a native scrollTo needs the node's COMMITTED Fabric handle, and this adapter commits on a
    // microtask — a scroll requested in the same tick as mount has no handle to command and would
    // silently no-op. RN's own fallback for that window is the ScrollView's `contentOffset` prop, and
    // a real user scroll then supersedes it, or the prop would keep yanking the list back.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      // No await: the engine has not committed yet, so there is no native handle.
      list?.scrollToOffset({ offset: 200, animated: false });
      await tick();

      expect(fabric.commands, 'nothing could be commanded yet').toHaveLength(0);
      expect(committed(SCROLL_VIEW).props.contentOffset).toEqual({
        x: 0,
        y: 200,
      });

      fireScroll(120);
      await tick();

      // A cleared prop reaches Fabric as literal null — that IS the delete (symbiote-engine-core §8).
      expect(
        committed(SCROLL_VIEW).props.contentOffset,
        'a real scroll supersedes the commanded offset',
      ).toBeNull();
    });

    // why: RN fills a widened window INCREMENTALLY — at most maxToRenderPerBatch new cells per batch,
    // one batch every updateCellsBatchingPeriod ms — so a big jump costs a cheap first paint and then
    // catches up, instead of mounting a screenful of cells in one frame and dropping it. Without the
    // refill timer the window stops at the first throttled step and the rest of the list never
    // appears at all, which is far worse than the jank the throttle exists to avoid.
    it('fills a widened window incrementally and keeps going until it reaches the target', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedList<IRow>
          data={DATA}
          getItem={getItem}
          getItemCount={getItemCount}
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          windowSize={1}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={10}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();
      // A viewport 12 rows tall: the target window jumps from 2 cells to 12 in one layout.
      fireLayout(committed(SCROLL_VIEW), ITEM_HEIGHT * 12);
      await tick();

      expect(committedLabels().has('row-3'), 'one batch was added').toBe(true);
      expect(
        committedLabels().has('row-4'),
        'the rest is deferred to later batches',
      ).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 120));

      expect(
        committedLabels().has('row-11'),
        'the refill timer carried the window all the way to the target',
      ).toBe(true);
    });

    // why: RN drives every sticky header off ONE scroll AnimatedValue. With the native animated
    // driver present that value is attached on the UI thread; without it the value has to be fed from
    // the JS onScroll, and RN raises the scroll-event rate for it (1 native / 16 JS) so a header does
    // not pin a frame late. A sticky list left on the default event rate looks like the header
    // stutters. The internal windowing and the app's own onScroll must both still run through the
    // wrapped handler.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(committed(SCROLL_VIEW).props.scrollEventThrottle).toBe(16);

      fireScroll(500);
      await tick();

      expect(onScroll, 'the app handler still runs').toHaveBeenCalledTimes(1);
      expect(
        committedLabels().has('row-10'),
        'and the internal windowing still ran',
      ).toBe(true);
    });
  });

  // The Solid-specific half. Every claim here is about WHICH nodes moved, not about what they say —
  // Solid has no reconciler between what a component returns and the host nodes, so "the cell
  // updated" and "the cell was not rebuilt in order to update" are independent. None of these could
  // be RED-first (the shapes they pin are the natural implementation), so each is proven by
  // MUTATION instead: revert the guard, watch this test fail, restore.
  // why: RN's recordInteraction() ungates waitForInteraction AND runs the viewability pass right
  // there, so the app hears about its viewable items immediately. The shared reducer used to only
  // flip the flag, which on a list that fits its viewport and is never scrolled meant the report
  // never arrived at all — the next windowing change that would have carried it never came.
  // Aligned to RN 2026-08-18.
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
        renderItem={info => <symbiote-text>{info().item.label}</symbiote-text>}
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

  describe('Reactivity — updates must be re-props, not rebuilds', () => {
    // why: renderItem is a render prop, and RN's contract is that a row re-renders when its item
    // changes. Solid has no reconciler to do that for us, so the info has to cross the boundary as an
    // ACCESSOR — a snapshot value would freeze the row at its mount-time item — while the CALL stays
    // untracked, so only the leaf that reads it re-runs and nothing above it is torn down.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      expect(committedLabels().has('row-0')).toBe(true);
      const createdAtMount = fabric.counts.createNode;

      // Same keys, new labels: nothing structural changed, only the text each row reads.
      setRows(makeRows(ROW_COUNT, '-v2'));
      await tick();

      expect(
        committedLabels().has('row-0-v2'),
        'the accessor carried the new item down to the leaf',
      ).toBe(true);
      expect(
        fabric.counts.createNode,
        'and it did so without rebuilding the cell subtree',
      ).toBe(createdAtMount);
    });

    // why: the other half of the same rule, and the one the test above cannot see. A renderItem that
    // reads `info()` at its TOP LEVEL is exactly the shape whose tracked call would put the item
    // signal in the cell's own `insert` effect; on device that rebuild lands mid-gesture and eats the
    // native responder grant. Untracked, the top-level read is frozen instead — documented, and what
    // Solid core's own <Show> does — which is survivable where a rebuild is not. Nothing about what
    // the screen SAYS separates the two, so the node counter is the whole test.
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
            return <symbiote-text>{label}</symbiote-text>;
          }}
        />
      ));
      await settleViewport();
      const createdAtMount = fabric.counts.createNode;

      setRows(makeRows(ROW_COUNT, '-v2'));
      await tick();

      expect(
        fabric.counts.createNode,
        'a data change must not tear the cell subtree down and rebuild it',
      ).toBe(createdAtMount);
      expect(committedLabels().has('row-0')).toBe(true);
      expect(committedLabels().has('row-0-v2')).toBe(false);
    });

    // why: a window step is the most frequent thing a list does, and the rows that survive it must
    // MOVE, not be rebuilt. Keying the row list by position instead of by cell key would reuse row
    // 0's node for a different item on every scroll step and rebuild its whole renderItem subtree —
    // invisible in any assertion about what the screen says, which is why this counter is the test.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: a Solid component body runs ONCE, so a prop read outside an accessor is frozen at its
    // mount-time value. A single destructure of `props` would leave the list stuck on its initial
    // config while every other test in this file still passed. The node counter is the other half of
    // the claim — a later prop change must reach the SAME native node, not a rebuilt one.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      const createdAtMount = fabric.counts.createNode;
      expect(committed(SCROLL_VIEW).props.keyboardDismissMode).toBe('none');

      setDismiss('on-drag');
      await tick();

      expect(committed(SCROLL_VIEW).props.keyboardDismissMode).toBe('on-drag');
      expect(
        fabric.counts.createNode,
        'the scroll host kept its identity',
      ).toBe(createdAtMount);
    });

    // why: the scroll AXIS resolves a different host TAG (on Android horizontal scrolling is its own
    // ViewManager), and Solid cannot swap a tag under a live node — so the flip has to REBUILD,
    // exactly as React remounts on an element-type change. The tag difference itself is unreachable
    // headless (both axes resolve to RCTScrollView under vitest), so the node-creation count is its
    // only proxy, and the risk the rebuild buys — losing the cells on the way — is asserted with it.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      const createdAtMount = fabric.counts.createNode;

      setHorizontal(true);
      await tick();

      expect(
        fabric.counts.createNode,
        'the axis flip must rebuild the host tags',
      ).toBeGreaterThan(createdAtMount);
      expect(committed(CONTENT_VIEW).props.flexDirection).toBe('row');
      expect(committedLabels().has('row-0'), 'the cells survived').toBe(true);
    });
  });

  describe('Negative', () => {
    // why: RN's scrollToIndex asserts the index is in range and throws, naming the valid range. The
    // shared reducer used to clamp, which landed the list on the last row and turned a caller bug
    // into "the wrong row is on screen" with nothing pointing back at the call site. Aligned to RN
    // 2026-08-18; the reducer's own three invariants are pinned in
    // core/components/src/state/virtualized-list-reducer.test.ts. This test is the adapter's proof
    // that the throw survives the handle rather than being swallowed on the way out.
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(() => list?.scrollToIndex({ index: 999 })).toThrow(
        'scrollToIndex out of range: requested index 999 is out of 0 to 19',
      );
      // And nothing was scrolled: the rejection replaces the clamped command, it does not accompany it.
      expect(fabric.commands).toEqual([]);
    });

    // why: Fabric has no bare-text host — RCTRawText is only ever valid as a child of a <Text> — so a
    // renderItem that returns a raw string builds a tree native cannot mount. Failing loudly at mount
    // is the correct behaviour: the alternative surfaces far deeper in native with an error that
    // names neither the list nor the row.
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
    // QUESTION: RN's extraData exists to bust a PureComponent cell, and React/Vue consume it only as
    // a render dependency. A Solid cell is a live reactive subtree, so a signal the app reads inside
    // renderItem already updates its own leaf and extraData has nothing left to do — the same
    // conclusion adapters/svelte reached. Kept in the surface for RN parity; is there a real app
    // shape (a closure over a plain mutable object) where this silence would surprise someone?
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
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      const createdAtMount = fabric.counts.createNode;

      setExtra(2);
      await tick();

      expect(
        fabric.counts.createNode,
        'nothing is re-rendered on an extraData change',
      ).toBe(createdAtMount);
      expect(
        'extraData' in committed(SCROLL_VIEW).props,
        'and it never reaches native',
      ).toBe(false);
    });
  });
});

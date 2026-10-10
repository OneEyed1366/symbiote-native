// Solid twin of the React section list tests, over compiled JSX and the fake Fabric slot
// Flattening and the sticky fold are unit-tested in core, windowing in `../virtualized-list`
// Proven here: the wiring, and that a section update reaches its leaf without a cell rebuild

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import '../../register';
import {
  VirtualizedSectionList,
  type IVirtualizedSectionListHandle,
} from './index';

const ROOT_TAG = 821;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';
const CELL_HEIGHT = 50;
const REFRESH_CONTROL = 'PullToRefreshView';
// Long enough that the initial batch does not reach the last row, which gates every edge-reached
// callback, two sections of 10 items flatten to 2 * (1 + 10 + 1) rows
const LONG_SECTION_SIZE = 10;
const LONG_ENTRY_COUNT = 24;
const VIEWPORT_HEIGHT = 400;

type IRow = {
  id: number;
  label: string;
};

const RED_STYLE = { backgroundColor: 'red' };

const SECTIONS = [
  {
    title: 'Section A',
    data: [
      { id: 0, label: 'row-a0' },
      { id: 1, label: 'row-a1' },
    ],
  },
  {
    title: 'Section B',
    data: [
      { id: 2, label: 'row-b0' },
      { id: 3, label: 'row-b1' },
    ],
  },
];

type IScrollLocation = {
  sectionIndex: number;
  itemIndex: number;
  viewOffset?: number;
  viewPosition?: number;
  animated?: boolean;
};

const LONG_SECTIONS = ['A', 'B'].map((title, sectionIndex) => ({
  title,
  data: Array.from({ length: LONG_SECTION_SIZE }, (_unused, index) => ({
    id: sectionIndex * LONG_SECTION_SIZE + index,
    label: `long-${title}${index}`,
  })),
}));

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function committed(viewName: string): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.viewName === viewName,
  );
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

// The committed raw-text payloads in document order, exactly the flattened entry sequence
function committedTexts(): string[] {
  return live.texts(live.appRoot());
}

// How many times a node carrying this text was created, 1 means the row survived and >1 a rebuild
// `findAll` searches the creation log, the authored bag, which is what `text` on a raw node is
function createdCountForText(text: string): number {
  return fabric.findAll(node => node.props.text === text).length;
}

// The total creation-log size, every node the engine has authored, a claim that "nothing was
// rebuilt" is a claim that this number held still across the update
function totalCreated(): number {
  return fabric.findAll(() => true).length;
}

function contentChildren(): ILiveNode[] {
  return committed(CONTENT_VIEW).children;
}

// Without `getItemLayout` a list learns its sizes from each cell's `onLayout`, and every scroll
// resolves against that offset table, spacer and separator views carry no listener
// The y ADVANCES down the children like a real host, or the table would stack every cell at 0
function measureCells(height: number): void {
  let y = 0;
  for (const child of contentChildren()) {
    fabric.fireEvent(child.instanceHandle, 'topLayout', {
      layout: { x: 0, y, width: 320, height },
    });
    y += height;
  }
}

// Mount, then hand the list its viewport through the scroll host's `onLayout`, until that lands
// the list paints the bounded `initialNumToRender` prefix instead of a measured window
async function settleViewport(height = VIEWPORT_HEIGHT): Promise<void> {
  await tick();
  fabric.fireEvent(committed(SCROLL_VIEW).instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height },
  });
  await tick();
}

function fireScroll(
  offsetY: number,
  viewportHeight: number,
  contentHeight: number,
): void {
  fabric.fireEvent(committed(SCROLL_VIEW).instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: offsetY },
    contentSize: { width: 320, height: contentHeight },
    layoutMeasurement: { width: 320, height: viewportHeight },
  });
}

describe('Solid VirtualizedSectionList on the engine', () => {
  describe('Positive', () => {
    // RN flattens every section into ONE virtualized stream (header, items, footer) windowed by one
    // machine, a wrong order is a visibly broken screen with no runtime error
    it('flattens each section into a header row, its item rows, then a footer row', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          renderSectionHeader={info => (
            <text>{`header:${info().section.title}`}</text>
          )}
          renderSectionFooter={info => (
            <text>{`footer:${info().section.title}`}</text>
          )}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(committedTexts()).toEqual([
        'header:Section A',
        'row-a0',
        'row-a1',
        'footer:Section A',
        'header:Section B',
        'row-b0',
        'row-b1',
        'footer:Section B',
      ]);
    });

    // RN sticks section headers by default on iOS, in JS only, native ignores a bare index array
    // so the header CELL must come out wrapped in the sticky header component
    it('sticks every section header by default on an iOS host', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const wrappers = live.findAllLive(
        live.appRoot(),
        node => node.payload.zIndex === STICKY_HEADER_Z_INDEX,
      );
      expect(wrappers, 'one sticky wrapper per section header').toHaveLength(2);
    });

    // An explicit opt-out gets plain unwrapped headers, the wrap follows the resolved flag, the
    // platform half is unit-tested in core, this pins that the `false` reaches the inner list
    it('sticks nothing when stickySectionHeadersEnabled is false', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const wrappers = live.findAllLive(
        live.appRoot(),
        node => node.payload.zIndex === STICKY_HEADER_Z_INDEX,
      );
      expect(wrappers, 'an explicit opt-out wraps no header').toHaveLength(0);
    });

    // `SectionSeparatorComponent` paints before a section's first item and after its last
    it('paints a section separator around the items of each section', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          SectionSeparatorComponent={() => <text>section-gap</text>}
          renderSectionHeader={info => (
            <text>{`header:${info().section.title}`}</text>
          )}
          renderSectionFooter={info => (
            <text>{`footer:${info().section.title}`}</text>
          )}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(committedTexts()).toEqual([
        'header:Section A',
        'section-gap',
        'row-a0',
        'row-a1',
        'section-gap',
        'footer:Section A',
        'header:Section B',
        'section-gap',
        'row-b0',
        'row-b1',
        'section-gap',
        'footer:Section B',
      ]);
    });

    // RN hands `renderItem` a `separators` handle, `highlight()` flips `highlighted` on the
    // separators flanking the row, dropping the handle here loses the whole press interaction
    it('hands each row the separators handle that repaints its own dividers', async () => {
      let highlight: (() => void) | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ItemSeparatorComponent={separatorProps => (
            <text>{separatorProps.highlighted ? 'sep-on' : 'sep-off'}</text>
          )}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => {
            if (info().item.label === 'row-a0') {
              highlight = info().separators.highlight;
            }
            return <text>{info().item.label}</text>;
          }}
        />
      ));
      await settleViewport();
      expect(committedTexts()).toContain('sep-off');
      expect(committedTexts()).not.toContain('sep-on');

      highlight?.();
      await tick();

      expect(
        committedTexts().filter(text => text === 'sep-on'),
        'the divider after the first row lights up',
      ).toHaveLength(1);
    });

    // `keyExtractor` gets the item and its index WITHIN ITS SECTION, not the flattened position
    // Section chrome never reaches it, headers, footers and separators key off their section
    it('keys items through keyExtractor with the index inside their own section', async () => {
      const seen = new Set<string>();
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          keyExtractor={(item, index) => {
            seen.add(`${item.label}@${index}`);
            return `k-${item.id}`;
          }}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect([...seen].sort()).toEqual([
        'row-a0@0',
        'row-a1@1',
        'row-b0@0',
        'row-b1@1',
      ]);
    });

    // The item separator sees the real items on both sides, it only sits between two items
    it('hands an item separator its leading and trailing items', async () => {
      const label = (row: IRow | undefined): string => row?.label ?? 'none';
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ItemSeparatorComponent={separatorProps => (
            <text>
              {`sep:${label(separatorProps.leadingItem)}>${label(separatorProps.trailingItem)}`}
            </text>
          )}
          renderSectionHeader={info => (
            <text>{`header:${info().section.title}`}</text>
          )}
          renderSectionFooter={info => (
            <text>{`footer:${info().section.title}`}</text>
          )}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(committedTexts()).toEqual([
        'header:Section A',
        'row-a0',
        'sep:row-a0>row-a1',
        'row-a1',
        'footer:Section A',
        'header:Section B',
        'row-b0',
        'sep:row-b0>row-b1',
        'row-b1',
        'footer:Section B',
      ]);
    });

    // A section's own `renderItem` and `ItemSeparatorComponent` beat the list's
    it('lets a section override the list renderItem and item separator', async () => {
      const custom = {
        ...SECTIONS[0],
        renderItem: (info: () => { item: IRow }) => (
          <text>{`custom:${info().item.label}`}</text>
        ),
        ItemSeparatorComponent: () => <text>custom-sep</text>,
      };
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={[custom, SECTIONS[1]]}
          ItemSeparatorComponent={() => <text>default-sep</text>}
          renderItem={info => <text>{`default:${info().item.label}`}</text>}
        />
      ));
      await settleViewport();

      expect(committedTexts()).toEqual([
        'custom:row-a0',
        'custom-sep',
        'custom:row-a1',
        'default:row-b0',
        'default-sep',
        'default:row-b1',
      ]);
    });

    // RN keeps the item separator BETWEEN items of one section (`_getSeparatorComponent`)
    it('paints an item separator between the items of a section, never next to section chrome', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ItemSeparatorComponent={separatorProps => (
            <text>
              {separatorProps.leadingItem === undefined
                ? 'chrome-gap'
                : 'item-gap'}
            </text>
          )}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const texts = committedTexts();
      expect(texts.filter(text => text === 'chrome-gap')).toHaveLength(0);
      expect(texts.filter(text => text === 'item-gap')).toHaveLength(2);
    });

    // `scrollToLocation` names a row by its (section, item) coordinate, only this layer knows how
    // many chrome rows sit between sections in the flattened stream
    it('resolves a section coordinate to the flattened row and scrolls to it', async () => {
      let list: { scrollToLocation: (p: IScrollLocation) => void } | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          ref={handle => {
            list = handle;
          }}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderSectionFooter={() => <text>footer</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      measureCells(CELL_HEIGHT);
      await tick();

      // Flattened: [0] header A, [1..2] its items, [3] footer A, [4] header B, [5..6] its items.
      // Section 1 item 1 is row-b0, the sixth row, so 5 * 50pt.
      list?.scrollToLocation({
        sectionIndex: 1,
        itemIndex: 1,
        animated: false,
      });

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'scrollTo',
      ]);
      expect(fabric.commands[0]?.args).toEqual([0, 250, false]);
      expect(fabric.commands[0]?.viewName).toBe(SCROLL_VIEW);
    });

    // The list chrome wraps the WHOLE stream: `ListHeaderComponent` above the first section header,
    // `ListFooterComponent` below the last footer
    it('renders the list header above and the list footer below every section', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ListHeaderComponent={<text>list-header</text>}
          ListFooterComponent={<text>list-footer</text>}
          renderSectionHeader={info => (
            <text>{`header:${info().section.title}`}</text>
          )}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const texts = committedTexts();
      expect(texts[0]).toBe('list-header');
      expect(texts[texts.length - 1]).toBe('list-footer');
      expect(texts).toContain('header:Section A');
      expect(texts.filter(text => text === 'list-header')).toHaveLength(1);
    });

    // This layer's inputs are JS-only, a function or a section array pushed across JSI is at best
    // ignored and at worst a serialization crash, only the scroll host's real props reach native
    it('never forwards its section-only props onto the native scroll host', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          SectionSeparatorComponent={() => <text>gap</text>}
          ItemSeparatorComponent={() => <text>sep</text>}
          keyExtractor={item => `k-${item.id}`}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderSectionFooter={() => <text>footer</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const nativeProps = Object.keys(committed(SCROLL_VIEW).payload);
      for (const jsOnly of [
        'sections',
        'renderItem',
        'renderSectionHeader',
        'renderSectionFooter',
        'SectionSeparatorComponent',
        'ItemSeparatorComponent',
        'keyExtractor',
        'stickySectionHeadersEnabled',
      ]) {
        expect(nativeProps, `${jsOnly} is JS-only`).not.toContain(jsOnly);
      }
    });

    // `ListEmptyComponent` shows when the flattened stream is empty, an itemless section is NOT
    // empty, it still contributes its header and footer rows
    it('shows the empty slot for no sections and hides it for an itemless section', async () => {
      const [sections, setSections] = createSignal<typeof SECTIONS>([]);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={sections()}
          ListEmptyComponent={<text>nothing-here</text>}
          renderSectionHeader={info => (
            <text>{`header:${info().section.title}`}</text>
          )}
          renderSectionFooter={() => <text>footer</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(committedTexts()).toEqual(['nothing-here']);

      setSections([{ title: 'Empty', data: [] }]);
      await tick();

      expect(committedTexts()).toEqual(['header:Empty', 'footer']);
    });

    // `refreshing` is CONTROLLED, native raises its own spinner and only the pushed-down prop
    // takes it back, control placement is tested in the list, this pins the props are not swallowed
    it('wires pull-to-refresh through to the scroll host and keeps refreshing controlled', async () => {
      const [refreshing, setRefreshing] = createSignal(false);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          onRefresh={() => {}}
          refreshing={refreshing()}
          progressViewOffset={12}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const control = committed(REFRESH_CONTROL);
      expect(control.payload.refreshing).toBe(false);
      expect(control.payload.progressViewOffset).toBe(12);

      setRefreshing(true);
      await tick();

      expect(committed(REFRESH_CONTROL).payload.refreshing).toBe(true);
      expect(
        fabric.findAll(node => node.viewName === REFRESH_CONTROL),
        'the update re-props the SAME control, it does not build a second one',
      ).toHaveLength(1);
    });

    // The scroll-lifecycle callbacks belong to the app, swallowing one in the prop split is the
    // failure, `onScroll` must COMPOSE with the list's own windowing handler
    it('forwards the scroll-lifecycle callbacks and composes the user onScroll', async () => {
      const onScroll = vi.fn();
      const onScrollBeginDrag = vi.fn();
      const onScrollEndDrag = vi.fn();
      const onMomentumScrollBegin = vi.fn();
      const onMomentumScrollEnd = vi.fn();
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollBegin={onMomentumScrollBegin}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      measureCells(CELL_HEIGHT);
      await tick();

      const handle = committed(SCROLL_VIEW).instanceHandle;
      fabric.fireEvent(handle, 'topScroll', {
        contentOffset: { x: 0, y: 100 },
        contentSize: { width: 320, height: 400 },
        layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
      });
      fabric.fireEvent(handle, 'topScrollBeginDrag', {});
      fabric.fireEvent(handle, 'topScrollEndDrag', {});
      fabric.fireEvent(handle, 'topMomentumScrollBegin', {});
      fabric.fireEvent(handle, 'topMomentumScrollEnd', {});

      expect(onScroll).toHaveBeenCalledTimes(1);
      expect(onScrollBeginDrag).toHaveBeenCalledTimes(1);
      expect(onScrollEndDrag).toHaveBeenCalledTimes(1);
      expect(onMomentumScrollBegin).toHaveBeenCalledTimes(1);
      expect(onMomentumScrollEnd).toHaveBeenCalledTimes(1);
    });

    // `style` dresses the scroll view, `contentContainerStyle` the container the rows sit in
    // The keyboard and throttle props are read by native directly, only a prop split can break them
    it('routes the styling and the native scroll-host props onto the right node', async () => {
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
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          class="frame"
          style={RED_STYLE}
          contentContainerStyle="padded"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const scroll = committed(SCROLL_VIEW).payload;
      expect(scroll.flex, 'the class resolved onto the scroll view').toBe(1);
      expect(scroll.backgroundColor).toBe('red');
      expect(scroll.keyboardDismissMode).toBe('on-drag');
      expect(scroll.keyboardShouldPersistTaps).toBe('handled');
      expect(scroll.scrollEventThrottle).toBe(16);
      expect(
        scroll.padding,
        'the content style stays off the scroll view',
      ).toBe(undefined);
      expect(committed(CONTENT_VIEW).payload.padding).toBe(20);
    });

    // The "end" is the end of the WHOLE flattened stream, past the last footer, and RN dedups by
    // content length so a page loads once rather than once per scroll frame
    it('fires onEndReached at the end of the flattened stream, once per page', async () => {
      const onEndReached = vi.fn();
      const shortViewport = CELL_HEIGHT * 2;
      const total = LONG_ENTRY_COUNT * CELL_HEIGHT;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          onEndReachedThreshold={0}
          onEndReached={onEndReached}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderSectionFooter={() => <text>footer</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport(shortViewport);
      measureCells(CELL_HEIGHT);
      await tick();
      expect(onEndReached, 'not at the top').not.toHaveBeenCalled();

      fireScroll(total - shortViewport, shortViewport, total);
      await tick();

      expect(onEndReached).toHaveBeenCalledTimes(1);
      expect(onEndReached.mock.calls[0]?.[0]).toEqual({ distanceFromEnd: 0 });

      fireScroll(total - shortViewport, shortViewport, total);
      await tick();
      expect(
        onEndReached,
        'the same content length must not fire it twice',
      ).toHaveBeenCalledTimes(1);
    });

    // The list is the region a screen reader announces, a dropped accessibility prop silently
    // loses a VoiceOver entry or an e2e selector
    it('rides its accessibility surface down onto the scroll host', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          testID="the-section-list"
          aria-label="Orders"
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      const props = committed(SCROLL_VIEW).payload;
      expect(props.testID).toBe('the-section-list');
      expect(
        props.accessibilityLabel,
        'aria-label folds into RN spelling',
      ).toBe('Orders');
    });

    // Windowing runs over the FLATTENED stream: only `initialNumToRender` rows mount, a spacer
    // stands in for the rest
    it('mounts only the initial batch of the flattened stream', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          initialNumToRender={3}
          renderSectionHeader={info => (
            <text>{`header:${info().section.title}`}</text>
          )}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();

      // Entries 0..2 are section A's header and its first two items.
      expect(committedTexts()).toEqual(['header:A', 'long-A0', 'long-A1']);
    });

    // `inverted` is a scale(-1) on the scroll container plus a counter-flip per cell
    // Flipping the content container too would cancel the outer flip
    it('flips the scroll container and counter-flips each row when inverted', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          inverted
          renderSectionHeader={info => <text>{info().section.title}</text>}
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
    });

    // `minIndexForVisible` counts CHILDREN, so it is bumped by one when a `ListHeaderComponent`
    // occupies child 0
    it('forwards maintainVisibleContentPosition past the list header', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ListHeaderComponent={<text>list-header</text>}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      expect(
        committed(SCROLL_VIEW).payload.maintainVisibleContentPosition,
      ).toEqual({ minIndexForVisible: 1 });
    });

    // The top-edge twin of `onEndReached`, its "start" is the first section's header row
    it('fires onStartReached at the start of the flattened stream', async () => {
      const onStartReached = vi.fn();
      const shortViewport = CELL_HEIGHT * 2;
      const total = LONG_ENTRY_COUNT * CELL_HEIGHT;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          onStartReachedThreshold={0}
          onStartReached={onStartReached}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport(shortViewport);
      measureCells(CELL_HEIGHT);
      await tick();

      expect(onStartReached, 'the list opens at its start').toHaveBeenCalled();
      expect(onStartReached.mock.calls[0]?.[0]).toEqual({
        distanceFromStart: 0,
      });
      const atTop = onStartReached.mock.calls.length;

      fireScroll(total - shortViewport, shortViewport, total);
      await tick();
      expect(
        onStartReached,
        'scrolling away must not fire it',
      ).toHaveBeenCalledTimes(atTop);

      fireScroll(0, shortViewport, total);
      await tick();
      expect(
        onStartReached,
        'returning to the start arms it again',
      ).toHaveBeenCalledTimes(atTop + 1);
    });

    // Visible rows always render, `maxToRenderPerBatch` throttles only the overscan, which
    // `windowSize` bounds and `updateCellsBatchingPeriod` paces
    it('fills the overscan in batches while visible rows render at once', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          initialNumToRender={2}
          windowSize={5}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={10}
          renderSectionHeader={info => (
            <text>{`header:${info().section.title}`}</text>
          )}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await tick();
      measureCells(CELL_HEIGHT);
      await tick();
      await settleViewport(CELL_HEIGHT * 2);

      const afterOneBatch = committedTexts();
      expect(afterOneBatch, 'the visible rows render at once').toContain(
        'long-A0',
      );
      expect(
        afterOneBatch,
        'the overscan is deferred to later batches',
      ).not.toContain('long-A4');

      await new Promise(resolve => setTimeout(resolve, 120));

      expect(
        committedTexts(),
        'the refill timer kept going instead of stopping at the first batch',
      ).toContain('long-A4');
    });

    // `itemIndex` 0 addresses the SECTION HEADER and 1 its first item, that is how an app spells
    // "jump to section"
    it('treats itemIndex 0 as the section header itself', async () => {
      let list: { scrollToLocation: (p: IScrollLocation) => void } | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          ref={handle => {
            list = handle;
          }}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderSectionFooter={() => <text>footer</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      measureCells(CELL_HEIGHT);
      await tick();

      // Header B is the fifth row of the flattened stream, so 4 * 50pt.
      list?.scrollToLocation({
        sectionIndex: 1,
        itemIndex: 0,
        animated: false,
      });

      expect(fabric.commands[0]?.args).toEqual([0, 200, false]);
    });

    // A section index past the end names no row, RN scrolls nowhere rather than guessing, a stale
    // index from a deep link must not jump the list
    it('ignores a scrollToLocation whose section is out of range', async () => {
      let list: { scrollToLocation: (p: IScrollLocation) => void } | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          ref={handle => {
            list = handle;
          }}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      measureCells(CELL_HEIGHT);
      await tick();

      list?.scrollToLocation({ sectionIndex: 9, itemIndex: 1 });

      expect(fabric.commands, 'no row to scroll to, so no scroll').toEqual([]);
    });

    // The ref carries the ScrollView routing tail beside `scrollToLocation`, this layer adds
    // nothing to it and must not drop it on the way to the inner list
    it('routes the scroll tail and recordInteraction to the inner list', async () => {
      let list: IVirtualizedSectionListHandle | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ref={handle => {
            list = handle;
          }}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      list?.flashScrollIndicators();
      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'flashScrollIndicators',
      ]);
      expect(fabric.commands[0]?.viewName).toBe(SCROLL_VIEW);

      const scrollNode = list?.getScrollNode();
      expect(scrollNode, 'the scroll node is the list host itself').toBe(
        committed(SCROLL_VIEW).instanceHandle,
      );
      expect(list?.getNativeScrollRef()).toBe(scrollNode);
      expect(list?.getScrollableNode()?.getScrollNode()).toBe(scrollNode);
      expect(list?.getScrollResponder()?.getScrollNode()).toBe(scrollNode);
      expect(() => list?.recordInteraction()).not.toThrow();
    });
  });

  // Solid has no reconciler, `insert` REPLACES a subtree, so "updated" and "not rebuilt to update"
  // are separate claims and the node-creation counter is the only headless line between them
  describe('Reactivity — updates must be re-props, not rebuilds', () => {
    // The cell info crosses the render prop as an ACCESSOR, a snapshot would freeze the row at its
    // mount-time item, and only the leaf that reads it re-runs
    it('updates a row in place when its section data changes, creating no nodes', async () => {
      const [sections, setSections] = createSignal(SECTIONS);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={sections()}
          keyExtractor={item => `k-${item.id}`}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(committedTexts()).toContain('row-a0');
      const createdAtMount = totalCreated();

      setSections(
        SECTIONS.map(section => ({
          title: section.title,
          data: section.data.map(row => ({ ...row, label: `${row.label}-v2` })),
        })),
      );
      await tick();

      expect(
        committedTexts(),
        'the accessor carried the new item down to the leaf',
      ).toContain('row-a0-v2');
      expect(
        totalCreated(),
        'and it did so without rebuilding the row subtree',
      ).toBe(createdAtMount);
    });

    // The same rule for section chrome, rebuilding the sticky header would drop its measured
    // layout and reset its pin mid-scroll
    it('updates a section header in place when its title changes, creating no nodes', async () => {
      const [sections, setSections] = createSignal(SECTIONS);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={sections()}
          keyExtractor={item => `k-${item.id}`}
          renderSectionHeader={info => (
            <text>{`header:${info().section.title}`}</text>
          )}
          renderSectionFooter={info => (
            <text>{`footer:${info().section.title}`}</text>
          )}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      expect(committedTexts()).toContain('header:Section A');
      const createdAtMount = totalCreated();

      setSections(
        SECTIONS.map(section => ({
          title: `${section.title} (renamed)`,
          data: section.data,
        })),
      );
      await tick();

      const texts = committedTexts();
      expect(texts, 'the header accessor is live').toContain(
        'header:Section A (renamed)',
      );
      expect(texts, 'and so is the footer accessor').toContain(
        'footer:Section A (renamed)',
      );
      expect(
        totalCreated(),
        'a rename must not tear the header subtree down',
      ).toBe(createdAtMount);
    });

    // RN keys a row `(section.key ?? sectionIndex):itemKey`, so a row survives a prepend only when
    // its section carries a stable `key`, and a row never holds an entry of a different kind
    it('keeps its rows when a whole section is prepended', async () => {
      const keyedSections = SECTIONS.map(section => ({
        ...section,
        key: section.title,
      }));
      const [sections, setSections] = createSignal(keyedSections);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={sections()}
          keyExtractor={item => `k-${item.id}`}
          renderSectionHeader={info => (
            <text>{`header:${info().section.title}`}</text>
          )}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();

      setSections([
        {
          title: 'Section Z',
          key: 'Section Z',
          data: [{ id: 9, label: 'row-z0' }],
        },
        ...keyedSections,
      ]);
      await tick();

      expect(committedTexts()).toEqual([
        'header:Section Z',
        'row-z0',
        'header:Section A',
        'row-a0',
        'row-a1',
        'header:Section B',
        'row-b0',
        'row-b1',
      ]);
      expect(
        createdCountForText('row-a0'),
        'the surviving row moved instead of being rebuilt',
      ).toBe(1);
    });
  });

  describe('Negative', () => {
    // `RCTRawText` is only valid inside a <Text>, failing at mount beats a native error that names
    // neither the list nor the section
    it('throws when a section header renders a bare string outside a Text', () => {
      expect(() =>
        mount(ROOT_TAG, () => (
          <VirtualizedSectionList<IRow>
            sections={SECTIONS}
            renderSectionHeader={info => info().section.title}
            renderItem={info => <text>{info().item.label}</text>}
          />
        )),
      ).toThrow(/must be rendered inside a <Text>/);
    });
  });

  // Behavior not justified by RN, captured so a change is visible, each holds a `QUESTION:`
  describe('Characterization', () => {
    // QUESTION: `initialScrollIndex` needs `getItemLayout` to land, this surface has none, so the
    // jump resolves against an unmeasured table and lands at 0, defer it or expose the prop?
    it('issues the initialScrollIndex jump against unmeasured rows, so it lands at 0 [characterization — behavior not confirmed]', async () => {
      const shortViewport = CELL_HEIGHT * 2;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          initialScrollIndex={12}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport(shortViewport);
      measureCells(CELL_HEIGHT);
      await tick();

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'scrollTo',
      ]);
      expect(fabric.commands[0]?.args).toEqual([0, 0, false]);
    });

    // QUESTION: `extraData` only busts a PureComponent cell and Solid rows read live accessors,
    // it is kept for RN parity, drop it from the props instead of ignoring it?
    it('accepts extraData and treats it as a no-op [characterization — behavior not confirmed]', async () => {
      const [extra, setExtra] = createSignal(0);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          extraData={extra()}
          renderSectionHeader={info => <text>{info().section.title}</text>}
          renderItem={info => <text>{info().item.label}</text>}
        />
      ));
      await settleViewport();
      const createdAtMount = totalCreated();
      const textsAtMount = committedTexts();

      setExtra(1);
      await tick();

      expect(committedTexts()).toEqual(textsAtMount);
      expect(totalCreated()).toBe(createdAtMount);
      expect(
        'extraData' in committed(SCROLL_VIEW).payload,
        'and it never reaches native either',
      ).toBe(false);
    });
  });
});

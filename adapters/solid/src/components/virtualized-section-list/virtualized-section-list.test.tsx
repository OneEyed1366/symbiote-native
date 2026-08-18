// Solid twin of adapters/react's virtualized-section-list tests (and adapters/vue's,
// adapters/svelte's). Drives REAL compiled Solid JSX through the universal renderer into the fake
// Fabric slot. Every expectation comes from a PRODUCT rule — React Native's documented
// SectionList/VirtualizedSectionList behaviour, or the surface adapters/react already ships (the
// reference adapter for P0 parity) — never from reading this adapter's own source back.
//
// SCOPE: the flattening itself (flattenSections / sectionEntryKey / scrollLocationToFlatIndex) and
// the sticky-enabled fold (resolveStickySectionHeaders) are unit-tested in core, and the whole
// windowing machinery in ../virtualized-list. What is proven HERE is the wiring: that a section
// stream reaches the shared list as ONE tagged sequence, that each entry kind dispatches to the
// right renderer, and — the Solid-specific half — that a section update reaches the leaf that
// reads it WITHOUT rebuilding the cell subtree.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import {
  VirtualizedSectionList,
  type IVirtualizedSectionListHandle,
} from './index';

const ROOT_TAG = 821;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';
const CELL_HEIGHT = 50;
const REFRESH_CONTROL = 'PullToRefreshView';
// A stream long enough that the initial batch does not already reach the last row, which is what
// gates every edge-reached callback. Two sections of 10 items flatten to 2 * (1 + 10 + 1) rows.
const LONG_SECTION_SIZE = 10;
const LONG_ENTRY_COUNT = 24;
const VIEWPORT_HEIGHT = 400;

interface IRow {
  id: number;
  label: string;
}

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

interface IScrollLocation {
  sectionIndex: number;
  itemIndex: number;
  viewOffset?: number;
  viewPosition?: number;
  animated?: boolean;
}

const LONG_SECTIONS = ['A', 'B'].map((title, sectionIndex) => ({
  title,
  data: Array.from({ length: LONG_SECTION_SIZE }, (_unused, index) => ({
    id: sectionIndex * LONG_SECTION_SIZE + index,
    label: `long-${title}${index}`,
  })),
}));

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

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

// The committed raw-text payloads in document order: exactly the flattened entry sequence.
function committedTexts(): string[] {
  const texts: string[] = [];
  for (const node of flatCommitted()) {
    const text: unknown = node.props.text;
    if (typeof text === 'string') texts.push(text);
  }
  return texts;
}

// How many TIMES a node carrying this text was created. 1 means the row survived whatever happened
// in between; >1 means it was destroyed and rebuilt.
function createdCountForText(text: string): number {
  return fabric.created.filter(node => node.props.text === text).length;
}

function contentChildren(): IFakeNode[] {
  return committed(CONTENT_VIEW).children;
}

// Without getItemLayout a list learns its cell sizes from each cell's own onLayout; the offset
// table those build is what every imperative scroll resolves against. Spacer and separator views
// carry no layout listener, so firing at all of them only reaches the cells.
//
// The y ADVANCES down the children, which is what a real host reports — every cell claiming y=0
// would tell the offset table that they all sit on top of each other. It is read: the table uses
// the real distance between two measured neighbours, not the sum of their heights (buildOffsets).
function measureCells(height: number): void {
  let y = 0;
  for (const child of contentChildren()) {
    fabric.fireEvent(child.instanceHandle, 'topLayout', {
      layout: { x: 0, y, width: 320, height },
    });
    y += height;
  }
}

// Mount, then hand the list its viewport through the scroll host's onLayout — until that lands the
// list paints the bounded initialNumToRender prefix instead of a measured window.
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
    // why: this IS the component's contract. RN flattens every section into ONE virtualized stream
    // — section header, that section's items, then its footer — so the whole screen is windowed by
    // one machine rather than N nested lists. A wrong order (a footer painted before its items, a
    // header emitted per item) is a visibly broken screen with no runtime error to catch it.
    it('flattens each section into a header row, its item rows, then a footer row', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderSectionFooter={info => (
            <symbiote-text>{`footer:${info().section.title}`}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN sticks section headers by default (SectionList.js `stickySectionHeadersEnabled ??
    // Platform.OS === 'ios'`), and stickiness is implemented PURELY IN JS — the native scroll view
    // ignores a bare index array. So the header CELL has to come out wrapped in the sticky header
    // component; forwarding indices alone is a silent no-op that pins nothing on a device.
    it('sticks every section header by default on an iOS host', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const wrappers = flatCommitted().filter(
        node => node.props.zIndex === STICKY_HEADER_Z_INDEX,
      );
      expect(wrappers, 'one sticky wrapper per section header').toHaveLength(2);
    });

    // why: a caller who explicitly opts out (RN parity — a horizontally scrolling section list, or
    // a design where headers must scroll away) has to get plain unwrapped headers. The wrap must be
    // conditional on the resolved flag, not applied whenever headers exist. The Platform.OS half of
    // that fold is unit-tested on resolveStickySectionHeaders in core; what this pins is that the
    // explicit `false` actually reaches the inner list rather than being dropped on the way.
    it('sticks nothing when stickySectionHeadersEnabled is false', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const wrappers = flatCommitted().filter(
        node => node.props.zIndex === STICKY_HEADER_Z_INDEX,
      );
      expect(wrappers, 'an explicit opt-out wraps no header').toHaveLength(0);
    });

    // why: RN's SectionSeparatorComponent paints the gap BETWEEN adjacent sections — after one
    // section's footer and before the next section's header — and never before the first section or
    // after the last. Emitting a leading/trailing one puts a stray divider at the top and bottom of
    // the screen; emitting none collapses the two sections into one visual block.
    it('paints a section separator between adjacent sections only', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          SectionSeparatorComponent={() => (
            <symbiote-text>section-gap</symbiote-text>
          )}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderSectionFooter={info => (
            <symbiote-text>{`footer:${info().section.title}`}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(committedTexts()).toEqual([
        'header:Section A',
        'row-a0',
        'row-a1',
        'footer:Section A',
        'section-gap',
        'header:Section B',
        'row-b0',
        'row-b1',
        'footer:Section B',
      ]);
    });

    // why: RN hands renderItem a `separators` handle (CellRenderer._separators) so a row can drive
    // its own dividers — highlight() flips `highlighted` on the separators flanking that row, which
    // is how a pressed row draws a full-bleed divider. A section list is where pressed rows live, so
    // dropping the handle on the way through this layer takes the whole interaction with it.
    it('hands each row the separators handle that repaints its own dividers', async () => {
      let highlight: (() => void) | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ItemSeparatorComponent={separatorProps => (
            <symbiote-text>
              {separatorProps.highlighted ? 'sep-on' : 'sep-off'}
            </symbiote-text>
          )}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => {
            if (info().item.label === 'row-a0') {
              highlight = info().separators.highlight;
            }
            return <symbiote-text>{info().item.label}</symbiote-text>;
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
        'both dividers flanking the row light up',
      ).toHaveLength(2);
    });

    // why: RN hands keyExtractor the item and ITS INDEX WITHIN ITS SECTION, not the flattened
    // stream position — app code routinely keys off that index (`section.data[index]`), and a flat
    // index would silently address the wrong row, or run off the end of a short section. Section
    // chrome never reaches the user's extractor at all: headers, footers and section separators
    // carry no item, so they key off their section instead.
    it('keys items through keyExtractor with the index inside their own section', async () => {
      const seen = new Set<string>();
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          keyExtractor={(item, index) => {
            seen.add(`${item.label}@${index}`);
            return `k-${item.id}`;
          }}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: the user's ItemSeparatorComponent is typed on ItemT, but the inner list streams the
    // section ENTRY wrapper — so leadingItem/trailingItem have to be unwrapped back to the item
    // before they reach user code, and a gap next to section chrome (a header, a footer) has no
    // item on that side at all. Handing the raw entry through would make every `leadingItem.label`
    // in an app read `undefined`, or crash on a chrome gap.
    it('unwraps the entry wrapper before an item separator sees leading and trailing items', async () => {
      const label = (row: IRow | undefined): string => row?.label ?? 'none';
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ItemSeparatorComponent={separatorProps => (
            <symbiote-text>
              {`sep:${label(separatorProps.leadingItem)}>${label(separatorProps.trailingItem)}`}
            </symbiote-text>
          )}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderSectionFooter={info => (
            <symbiote-text>{`footer:${info().section.title}`}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(committedTexts()).toEqual([
        'header:Section A',
        'sep:none>row-a0',
        'row-a0',
        'sep:row-a0>row-a1',
        'row-a1',
        'sep:row-a1>none',
        'footer:Section A',
        'sep:none>none',
        'header:Section B',
        'sep:none>row-b0',
        'row-b0',
        'sep:row-b0>row-b1',
        'row-b1',
        'sep:row-b1>none',
        'footer:Section B',
      ]);
    });

    // why: scrollToLocation is the ONE method a section list adds over a plain list — it names a
    // row by its (section, item) coordinate, which only this layer can resolve, because only it
    // knows how many header/footer/separator rows sit between the sections in the flattened stream.
    // Resolving against the item index alone would land on a row of an earlier section.
    it('resolves a section coordinate to the flattened row and scrolls to it', async () => {
      let list: { scrollToLocation: (p: IScrollLocation) => void } | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          ref={handle => {
            list = handle;
          }}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderSectionFooter={() => <symbiote-text>footer</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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
      expect(fabric.commands[0]?.node.viewName).toBe(SCROLL_VIEW);
    });

    // why: RN's list chrome wraps the WHOLE stream, not each section — ListHeaderComponent above
    // the first section header, ListFooterComponent below the last section's footer. An app puts a
    // search bar or a title there, so painting it per section, or dropping it because this layer
    // consumes props it does not own, is immediately visible.
    it('renders the list header above and the list footer below every section', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ListHeaderComponent={<symbiote-text>list-header</symbiote-text>}
          ListFooterComponent={<symbiote-text>list-footer</symbiote-text>}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const texts = committedTexts();
      expect(texts[0]).toBe('list-header');
      expect(texts[texts.length - 1]).toBe('list-footer');
      expect(texts).toContain('header:Section A');
      expect(texts.filter(text => text === 'list-header')).toHaveLength(1);
    });

    // why: this layer's own inputs are JS-only — Fabric has no `sections` or `renderSectionHeader`
    // prop, and a function or a section array pushed across the JSI boundary is at best ignored and
    // at worst a serialization crash on a real host. RN keeps every list prop on the JS side; only
    // the scroll host's real props may reach native.
    it('never forwards its section-only props onto the native scroll host', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          SectionSeparatorComponent={() => <symbiote-text>gap</symbiote-text>}
          ItemSeparatorComponent={() => <symbiote-text>sep</symbiote-text>}
          keyExtractor={item => `k-${item.id}`}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderSectionFooter={() => <symbiote-text>footer</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const nativeProps = Object.keys(committed(SCROLL_VIEW).props);
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

    // why: RN shows ListEmptyComponent when the flattened stream is empty — and a section with no
    // items is NOT empty: it still contributes its header and footer rows, which is how a "no
    // results in this category" screen keeps its category title. Treating an itemless section as
    // empty would swap a titled section for the empty placeholder.
    it('shows the empty slot for no sections and hides it for an itemless section', async () => {
      const [sections, setSections] = createSignal<typeof SECTIONS>([]);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={sections()}
          ListEmptyComponent={<symbiote-text>nothing-here</symbiote-text>}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderSectionFooter={() => <symbiote-text>footer</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      expect(committedTexts()).toEqual(['nothing-here']);

      setSections([{ title: 'Empty', data: [] }]);
      await tick();

      expect(committedTexts()).toEqual(['header:Empty', 'footer']);
    });

    // why: RN's SectionList exposes pull-to-refresh by handing its inner list onRefresh/refreshing,
    // and `refreshing` is CONTROLLED — native raises its own spinner on the gesture and only the
    // pushed-down prop takes it back, so a value that stops arriving leaves it spinning forever.
    // The platform placement of the control (iOS sibling vs the Android wrap) is VirtualizedList's
    // and is tested there; what is proven here is that this layer does not swallow the props.
    it('wires pull-to-refresh through to the scroll host and keeps refreshing controlled', async () => {
      const [refreshing, setRefreshing] = createSignal(false);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          onRefresh={() => {}}
          refreshing={refreshing()}
          progressViewOffset={12}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const control = committed(REFRESH_CONTROL);
      expect(control.props.refreshing).toBe(false);
      expect(control.props.progressViewOffset).toBe(12);

      setRefreshing(true);
      await tick();

      expect(committed(REFRESH_CONTROL).props.refreshing).toBe(true);
      expect(
        fabric.created.filter(node => node.viewName === REFRESH_CONTROL),
        'the update re-props the SAME control, it does not build a second one',
      ).toHaveLength(1);
    });

    // why: RN's SectionList is a ScrollView underneath, and every scroll-lifecycle callback is the
    // app's hook into that gesture (hiding a FAB on drag, pausing video on momentum end). This layer
    // owns none of them, so swallowing one in its prop split is the whole failure mode — and
    // `onScroll` is the sharpest, because the list uses it internally for windowing: the user's
    // handler must COMPOSE with that, not replace it or be replaced by it.
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
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN splits list styling in two — `style` dresses the scroll view that pans,
    // `contentContainerStyle` dresses the container the rows sit in (padding between rows belongs
    // there; on the outer view it clips the scroll instead). keyboardDismissMode,
    // keyboardShouldPersistTaps and scrollEventThrottle are read by NATIVE directly, with no JS
    // wiring at all, so the only way to break them is to swallow them in this layer's prop split.
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
          style={{ backgroundColor: 'red' }}
          contentContainerStyle="padded"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const scroll = committed(SCROLL_VIEW).props;
      expect(scroll.flex, 'the class resolved onto the scroll view').toBe(1);
      expect(scroll.backgroundColor).toBe('red');
      expect(scroll.keyboardDismissMode).toBe('on-drag');
      expect(scroll.keyboardShouldPersistTaps).toBe('handled');
      expect(scroll.scrollEventThrottle).toBe(16);
      expect(
        scroll.padding,
        'the content style stays off the scroll view',
      ).toBe(undefined);
      expect(committed(CONTENT_VIEW).props.padding).toBe(20);
    });

    // why: onEndReached is what drives every paged section list, and the "end" it means is the end
    // of the WHOLE flattened stream — past the last section's footer — not the last item of the last
    // section. Counting only items would fire it two footer-rows early on every page. RN also dedups
    // by content length, so a page loads once rather than once per scroll frame.
    it('fires onEndReached at the end of the flattened stream, once per page', async () => {
      const onEndReached = vi.fn();
      const shortViewport = CELL_HEIGHT * 2;
      const total = LONG_ENTRY_COUNT * CELL_HEIGHT;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          onEndReachedThreshold={0}
          onEndReached={onEndReached}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderSectionFooter={() => <symbiote-text>footer</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: a section list IS the scrollable region a screen reader announces, and RN folds the
    // aria-* aliases into their accessibility* twins on the way down. This layer sits between the
    // app and that host, so an accessibility prop it drops is a VoiceOver rotor entry or an e2e
    // selector that silently disappears.
    it('rides its accessibility surface down onto the scroll host', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          testID="the-section-list"
          aria-label="Orders"
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      const props = committed(SCROLL_VIEW).props;
      expect(props.testID).toBe('the-section-list');
      expect(
        props.accessibilityLabel,
        'aria-label folds into RN spelling',
      ).toBe('Orders');
    });

    // why: virtualization is the point of the component, and it has to window the FLATTENED stream:
    // RN mounts only initialNumToRender rows and collapses everything below into a spacer. A section
    // list that mounts every section's every item has no reason to exist, and one that windows per
    // section would mount N partial sections instead of one contiguous run.
    it('mounts only the initial batch of the flattened stream', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          initialNumToRender={3}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();

      // Entries 0..2 are section A's header and its first two items.
      expect(committedTexts()).toEqual(['header:A', 'long-A0', 'long-A1']);
    });

    // why: RN implements `inverted` as a scale(-1) transform on the scroll container plus a
    // counter-flip on every cell, so a chat-shaped section list grows from the bottom while each row
    // still reads upright. Flipping the content container too would cancel the outer flip.
    it('flips the scroll container and counter-flips each row when inverted', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          inverted
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
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
    });

    // why: RN forwards maintainVisibleContentPosition to native so the scroll view anchors the rows
    // it can see, and bumps minIndexForVisible by one when a ListHeaderComponent occupies child 0 —
    // the prop counts CHILDREN, not stream indices. A section list loading older messages above the
    // viewport is exactly the case it exists for.
    it('forwards maintainVisibleContentPosition past the list header', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ListHeaderComponent={<symbiote-text>list-header</symbiote-text>}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
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

    // why: onStartReached is onEndReached's top-edge twin (RN 0.71+), the hook a prepend-paging chat
    // list loads older messages from. Same reason it must see the flattened stream: the "start" is
    // the first section's header row, not the first item of the first section.
    it('fires onStartReached at the start of the flattened stream', async () => {
      const onStartReached = vi.fn();
      const shortViewport = CELL_HEIGHT * 2;
      const total = LONG_ENTRY_COUNT * CELL_HEIGHT;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          onStartReachedThreshold={0}
          onStartReached={onStartReached}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: RN fills a widened window INCREMENTALLY — at most maxToRenderPerBatch new rows per batch,
    // one batch every updateCellsBatchingPeriod ms — so a big jump costs a cheap first paint and then
    // catches up. windowSize bounds the resident window itself. All three are the knobs an app tunes
    // when a section list janks, and a layer that swallowed them would leave the tuning inert.
    it('honours windowSize and fills a widened window in batches', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          initialNumToRender={2}
          windowSize={1}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={10}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await tick();
      measureCells(CELL_HEIGHT);
      await tick();
      // A viewport 12 rows tall: the target window jumps from 2 rows to 12 in one layout.
      await settleViewport(CELL_HEIGHT * 12);

      // The initial window is the header row plus long-A0; one batch of 2 adds long-A1 and long-A2.
      const afterOneBatch = committedTexts();
      expect(afterOneBatch, 'one batch was added').toContain('long-A2');
      expect(
        afterOneBatch,
        'the rest is deferred to later batches',
      ).not.toContain('long-A3');

      await new Promise(resolve => setTimeout(resolve, 120));

      expect(
        committedTexts(),
        'the refill timer kept going instead of stopping at the first batch',
      ).toContain('long-A9');
    });

    // why: RN's scrollToLocation offsets itemIndex by one so that itemIndex 0 addresses the SECTION
    // HEADER and itemIndex 1 the section's first item — that is how "jump to section" is spelled in
    // an app, and it is the reason the coordinate cannot be resolved by counting items alone.
    it('treats itemIndex 0 as the section header itself', async () => {
      let list: { scrollToLocation: (p: IScrollLocation) => void } | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          ref={handle => {
            list = handle;
          }}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderSectionFooter={() => <symbiote-text>footer</symbiote-text>}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // why: a section index past the end names no row at all, and RN scrolls nowhere rather than
    // guessing — a silent jump to the top (or to the last row) reads as the list losing the user's
    // place. Apps call scrollToLocation from search results and deep links, where an index can go
    // stale between the data changing and the call landing.
    it('ignores a scrollToLocation whose section is out of range', async () => {
      let list: { scrollToLocation: (p: IScrollLocation) => void } | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          stickySectionHeadersEnabled={false}
          ref={handle => {
            list = handle;
          }}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      measureCells(CELL_HEIGHT);
      await tick();

      list?.scrollToLocation({ sectionIndex: 9, itemIndex: 1 });

      expect(fabric.commands, 'no row to scroll to, so no scroll').toEqual([]);
    });

    // why: RN's SectionList ref carries the whole ScrollView routing tail besides scrollToLocation —
    // flashScrollIndicators, the three scroll-ref getters, the scroll node, recordInteraction. They
    // are what a parent uses to drive the list it owns (flashing the indicators on a tab re-press,
    // ungating a waitForInteraction viewability config). This layer adds nothing to them, so its
    // whole job is to not drop them on the way to the inner list.
    it('routes the scroll tail and recordInteraction to the inner list', async () => {
      let list: IVirtualizedSectionListHandle | undefined;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ref={handle => {
            list = handle;
          }}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
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

      const scrollNode = list?.getScrollNode();
      expect(scrollNode, 'the scroll node is the list host itself').toBe(
        committed(SCROLL_VIEW).instanceHandle,
      );
      expect(list?.getNativeScrollRef()).not.toBeNull();
      expect(list?.getScrollableNode()).toBe(list?.getNativeScrollRef());
      expect(list?.getScrollResponder()).toBe(list?.getNativeScrollRef());
      expect(() => list?.recordInteraction()).not.toThrow();
    });
  });

  // The Solid-specific half, with no counterpart in the React file: a Solid component body runs ONCE
  // and there is no reconciler between what a render prop returns and the host nodes — `insert`
  // REPLACES a subtree rather than diffing one. So "the header updated" and "the header was not
  // rebuilt in order to update" are two independent, silently-breakable claims, and the node-creation
  // counter is the only headless line between them (.claude/rules/solid-descriptor-bridge.md §4).
  describe('Reactivity — updates must be re-props, not rebuilds', () => {
    // why: RN re-renders a row when its item changes. Solid has no reconciler to do that, so the
    // cell info has to cross the render-prop boundary as an ACCESSOR — a snapshot would freeze the
    // row at its mount-time item — while the CALL stays untracked, so only the leaf that reads it
    // re-runs and nothing above it is torn down.
    it('updates a row in place when its section data changes, creating no nodes', async () => {
      const [sections, setSections] = createSignal(SECTIONS);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={sections()}
          keyExtractor={item => `k-${item.id}`}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      expect(committedTexts()).toContain('row-a0');
      const createdAtMount = fabric.counts.createNode;

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
        fabric.counts.createNode,
        'and it did so without rebuilding the row subtree',
      ).toBe(createdAtMount);
    });

    // why: the same rule for the SECTION chrome, and the one a section list adds over a plain list.
    // A header built from a snapshot of its section keeps painting a stale title after the section
    // is renamed or its data reloaded — and because the header is also the sticky one, rebuilding it
    // to update would drop its measured layout and reset its pin mid-scroll.
    it('updates a section header in place when its title changes, creating no nodes', async () => {
      const [sections, setSections] = createSignal(SECTIONS);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={sections()}
          keyExtractor={item => `k-${item.id}`}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderSectionFooter={info => (
            <symbiote-text>{`footer:${info().section.title}`}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      expect(committedTexts()).toContain('header:Section A');
      const createdAtMount = fabric.counts.createNode;

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
        fabric.counts.createNode,
        'a rename must not tear the header subtree down',
      ).toBe(createdAtMount);
    });

    // why: a prepended section is the structural change a section list actually gets (a new day, a
    // new group), and it moves every later row's position in the flattened stream. Rows are keyed,
    // so the ones that survive must MOVE and re-prop rather than be rebuilt — and, because each
    // row's subtree is built once for the entry KIND it was created with, a row must never end up
    // holding an entry of a different kind, or a header would paint an item's content.
    it('keeps its rows when a whole section is prepended', async () => {
      const [sections, setSections] = createSignal(SECTIONS);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={sections()}
          keyExtractor={item => `k-${item.id}`}
          renderSectionHeader={info => (
            <symbiote-text>{`header:${info().section.title}`}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      setSections([
        { title: 'Section Z', data: [{ id: 9, label: 'row-z0' }] },
        ...SECTIONS,
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
    // why: Fabric has no bare-text host — RCTRawText is only ever valid inside a <Text> — so a
    // section header that returns a raw string builds a tree native cannot mount. Failing loudly at
    // mount is correct: the alternative surfaces far deeper in native, in an error naming neither
    // the list nor the section.
    it('throws when a section header renders a bare string outside a Text', () => {
      expect(() =>
        mount(ROOT_TAG, () => (
          <VirtualizedSectionList<IRow>
            sections={SECTIONS}
            renderSectionHeader={info => info().section.title}
            renderItem={info => (
              <symbiote-text>{info().item.label}</symbiote-text>
            )}
          />
        )),
      ).toThrow(/must be rendered inside a <Text>/);
    });
  });

  // Behaviours we could not justify from RN or from the React adapter, captured as they are so a
  // later change to them is at least visible. Each carries its open question in a `// QUESTION:`.
  describe('Characterization', () => {
    // QUESTION: RN documents initialScrollIndex as needing getItemLayout to land on the right row,
    // and the React adapter's section-list surface (which this mirrors) exposes no getItemLayout at
    // all. So the initial jump resolves against an offset table where nothing has been measured yet
    // and lands at 0 — it is issued, and it goes nowhere. Should the shared reducer defer the
    // initial jump until the first measurement lands, or should this surface expose getItemLayout?
    it('issues the initialScrollIndex jump against unmeasured rows, so it lands at 0 [characterization — behavior not confirmed]', async () => {
      const shortViewport = CELL_HEIGHT * 2;
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={LONG_SECTIONS}
          initialScrollIndex={12}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
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

    // QUESTION: RN's own VirtualizedSectionList keeps ItemSeparatorComponent strictly BETWEEN items
    // of the same section and paints SectionSeparatorComponent around section chrome. Every adapter
    // here instead forwards the user separator to the inner list, which paints it in every gap —
    // including the ones next to a header or a footer, where both sides unwrap to undefined. Should
    // the shared layer suppress an item separator on a chrome gap?
    it('paints an item separator on the gaps around section chrome too [characterization — behavior not confirmed]', async () => {
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          ItemSeparatorComponent={separatorProps => (
            <symbiote-text>
              {separatorProps.leadingItem === undefined
                ? 'chrome-gap'
                : 'item-gap'}
            </symbiote-text>
          )}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();

      expect(
        committedTexts().filter(text => text === 'chrome-gap'),
        'a gap next to a header or a footer paints one too',
      ).not.toHaveLength(0);
    });

    // QUESTION: RN needs extraData only to bust a PureComponent cell. A Solid row reads its data
    // through live accessors, so a signal an app reads inside renderItem already updates the leaf
    // that reads it and extraData has nothing left to do. It stays on the surface for RN parity —
    // should it be dropped from this adapter's props instead of accepted and ignored?
    it('accepts extraData and treats it as a no-op [characterization — behavior not confirmed]', async () => {
      const [extra, setExtra] = createSignal(0);
      mount(ROOT_TAG, () => (
        <VirtualizedSectionList<IRow>
          sections={SECTIONS}
          extraData={extra()}
          renderSectionHeader={info => (
            <symbiote-text>{info().section.title}</symbiote-text>
          )}
          renderItem={info => (
            <symbiote-text>{info().item.label}</symbiote-text>
          )}
        />
      ));
      await settleViewport();
      const createdAtMount = fabric.counts.createNode;
      const textsAtMount = committedTexts();

      setExtra(1);
      await tick();

      expect(committedTexts()).toEqual(textsAtMount);
      expect(fabric.counts.createNode).toBe(createdAtMount);
      expect(
        'extraData' in committed(SCROLL_VIEW).props,
        'and it never reaches native either',
      ).toBe(false);
    });
  });
});

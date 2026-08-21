// VirtualizedSectionList, the Vue wrapper that flattens sections into one virtualized stream
// over VirtualizedList: each section contributes a header row, its item rows, then a footer row
// (RN counts 2 per section), and the flattened tagged sequence is windowed by the same
// machinery as one list. Flattening, entry keying, separator-item unwrap, and scrollToLocation
// mapping are shared from @symbiote-native/components; this file wires Vue lifecycle
// (typed-prop inputs + handle re-expose + per-entry render dispatch).
//
// Typed-emits generic component (mirrors FlatList/VirtualizedList): a GENERIC setup function so
// section inputs infer ItemT at the call site. Those inputs are read from typed `props`
// (declared in the runtime `props` array); the VirtualizedList passthrough tail rides through
// $attrs onto the inner list. The three adapter-synthesized events (endReached/startReached/
// refresh) stay GATED on listener presence so the inner VirtualizedList keeps building
// RefreshControl / computing edge-reached strictly on demand.

import {
  defineComponent,
  getCurrentInstance,
  h,
  shallowRef,
  type FunctionalComponent,
  type VNode,
} from '@vue/runtime-core';
import {
  flattenSections,
  resolveStickySectionHeaders,
  scrollLocationToFlatIndex,
  sectionEntryKey,
  unwrapEntryItem,
  type ISection,
  type ISectionEntry,
  type ISeparatorProps,
  type ISeparators,
  type IScrollViewHandle,
  type IVirtualizedListHandle,
  type IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import {
  Platform,
  dlog,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import { VirtualizedList } from '../virtualized-list';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';
import type { ICtx } from '../../utils/component-helpers';

// VirtualizedList's generic construct signature can't be resolved by h()'s overloads, so drive
// it through a loose functional-component handle instead.
const VirtualizedListHost = VirtualizedList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

export type { ISection } from '@symbiote-native/components';
// Re-export the shared handle type so section-list imports it from '../virtualized-section-list'.
export type { IVirtualizedSectionListHandle };

export interface IVirtualizedSectionListProps<ItemT> {
  sections: ReadonlyArray<ISection<ItemT>>;
  // Cell + section chrome are Vue scoped slots (#item / #sectionHeader / #sectionFooter /
  // #separator / #sectionSeparator / #header / #footer / #empty), typed by
  // IVirtualizedSectionListSlots - not renderItem / renderSection* / *Component props.
  keyExtractor?: (item: ItemT, index: number) => string;
  // Fixed-layout fast path, FLAT like RN's: the SECTIONS array plus a flat entry index, where every
  // section contributes two rows beyond its items (header, footer) and the caller accounts for them.
  // A `({ section, index })` form would be our invention, not parity - `VirtualizedSectionList.js`
  // has no getItemLayout code at all, the prop rides through `passThroughProps`; that shape is the
  // community react-native-section-list-get-item-layout, layered on top. Without it a fast scroll
  // outruns measurement and leaves blank windows.
  getItemLayout?: (
    data: ReadonlyArray<ISection<ItemT>> | null,
    index: number,
  ) => { length: number; offset: number; index: number };
  // Routed to the inner VirtualizedList's stickyHeaderIndices. Defaults to
  // Platform.OS === 'ios'; Android does not stick by default.
  stickySectionHeadersEnabled?: boolean;
  // Everything below rides through $attrs onto the inner VirtualizedList untouched (NOT in
  // PROP_KEYS); declared here only so consumers get typed props.
  extraData?: unknown;
  onEndReachedThreshold?: number;
  onStartReachedThreshold?: number;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  initialNumToRender?: number;
  initialScrollIndex?: number;
  maxToRenderPerBatch?: number;
  updateCellsBatchingPeriod?: number;
  windowSize?: number;
  inverted?: boolean;
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // Raw native scroll passthrough: NOT emits, rides through $attrs onto the inner VirtualizedList.
  onScroll?: (event: ISymbioteEvent) => void;
  onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  onScrollEndDrag?: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  [key: string]: unknown;
}

// ItemT flows in from `sections`, so #item / #sectionHeader are typed without annotation.
export type IVirtualizedSectionListSlots<ItemT> = {
  item: (info: {
    item: ItemT;
    index: number;
    section: ISection<ItemT>;
    separators: ISeparators;
  }) => VNode[] | VNode;
  sectionHeader?: (info: { section: ISection<ItemT> }) => VNode[] | VNode;
  sectionFooter?: (info: { section: ISection<ItemT> }) => VNode[] | VNode;
  // Painted between adjacent sections (RN's SectionSeparatorComponent).
  sectionSeparator?: () => VNode[] | VNode;
  // Typed on ItemT; VSL unwraps each entry back to its ItemT before the inner list invokes it.
  separator?: (props: ISeparatorProps<ItemT>) => VNode[] | VNode;
  header?: () => VNode[] | VNode;
  footer?: () => VNode[] | VNode;
  empty?: () => VNode[] | VNode;
};

// The exact set React's section list exposes; no ItemT-carrying event, so the emits type is not
// generic. Raw native scroll events stay raw $attrs passthrough, NOT emits.
export type IVirtualizedSectionListEmits = {
  endReached: (info: { distanceFromEnd: number }) => void;
  startReached: (info: { distanceFromStart: number }) => void;
  refresh: () => void;
};

// Listed for the runtime `props` declaration (keyof can't derive it: the index signature widens
// keyof to `string`). The three emit events are deliberately absent (declared as emits below).
// getItemLayout is declared here, not left to $attrs: falling through would hand the user's
// callback the flattened ENTRIES as its `data` argument instead of the sections (see below).
const PROP_KEYS = [
  'sections',
  'keyExtractor',
  'getItemLayout',
  'stickySectionHeadersEnabled',
];

const EMIT_KEYS = ['endReached', 'startReached', 'refresh'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isVirtualizedListHandle(
  value: unknown,
): value is IVirtualizedListHandle {
  return isRecord(value) && typeof value.scrollToOffset === 'function';
}

function buildSectionDelegate(
  getInner: () => IVirtualizedListHandle | null,
  getHeaderIndices: () => number[],
): IVirtualizedSectionListHandle {
  return {
    scrollToLocation: (params): void => {
      const flatIndex = scrollLocationToFlatIndex(
        getHeaderIndices(),
        params.sectionIndex,
        params.itemIndex,
      );
      if (flatIndex === undefined) {
        dlog(
          `Vue VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
        );
        return;
      }
      dlog(
        `Vue VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
          `item=${params.itemIndex} -> flat ${flatIndex}`,
      );
      getInner()?.scrollToIndex({
        index: flatIndex,
        viewOffset: params.viewOffset,
        viewPosition: params.viewPosition,
        animated: params.animated,
      });
    },
    flashScrollIndicators: () => getInner()?.flashScrollIndicators(),
    getNativeScrollRef: (): IScrollViewHandle | null =>
      getInner()?.getNativeScrollRef() ?? null,
    getScrollableNode: (): IScrollViewHandle | null =>
      getInner()?.getScrollableNode() ?? null,
    getScrollResponder: (): IScrollViewHandle | null =>
      getInner()?.getScrollResponder() ?? null,
    getScrollNode: (): ISymbioteNode | null =>
      getInner()?.getScrollNode() ?? null,
    recordInteraction: () => getInner()?.recordInteraction(),
  };
}

export const VirtualizedSectionList = defineComponent(
  <ItemT>(
    props: IVirtualizedSectionListProps<ItemT>,
    {
      attrs,
      expose,
      emit,
      slots,
    }: ICtx<IVirtualizedSectionListEmits, IVirtualizedSectionListSlots<ItemT>>,
  ) => {
    const inner = shallowRef<IVirtualizedListHandle | null>(null);
    const setInner = (instance: unknown): void => {
      inner.value = isVirtualizedListHandle(instance) ? instance : null;
    };
    // headerIndices change each render (sections may change); the delegate reads them lazily.
    let headerIndices: number[] = [];
    expose(
      buildSectionDelegate(
        () => inner.value,
        () => headerIndices,
      ),
    );

    // Emits are stripped from $attrs by Vue; detect listener presence off the instance's own
    // vnode props instead, so an emit bridge is wired ONLY when the consumer actually listens.
    const instance = getCurrentInstance();
    const listens = (onName: string): boolean => {
      const vnodeProps = instance?.vnode.props;
      return vnodeProps != null && typeof vnodeProps[onName] === 'function';
    };

    return () => {
      const sections: ReadonlyArray<ISection<ItemT>> = Array.isArray(
        props.sections,
      )
        ? props.sections
        : [];
      const keyExtractor = props.keyExtractor;
      // The passthrough tail: declared props + declared emits' onX are already removed from $attrs,
      // so what's left is the VirtualizedList passthrough (kebab-folded for the inner list).
      const forwarded = normalizeVueAttrs(attrs);

      const { entries, headerIndices: indices } = flattenSections(
        sections,
        slots.sectionSeparator !== undefined,
      );
      headerIndices = indices;

      // RN sticks section headers by default only on iOS; Android does not unless asked.
      const stickyHeaderIndices = resolveStickySectionHeaders(
        props.stickySectionHeadersEnabled,
        indices,
        Platform.OS,
      );

      dlog(
        `Vue VirtualizedSectionList: ${sections.length} sections flattened to ${entries.length} entries`,
      );

      // The inner list's #item slot: dispatch each flattened entry to the matching consumer slot,
      // returning its VNode[] (empty when the consumer left that slot off).
      const renderEntry = (info: {
        item: ISectionEntry<ItemT>;
        index: number;
        separators: ISeparators;
      }): VNode[] | VNode => {
        const entry = info.item;
        if (entry.kind === 'header') {
          return slots.sectionHeader
            ? slots.sectionHeader({ section: entry.section })
            : [];
        }
        if (entry.kind === 'footer') {
          return slots.sectionFooter
            ? slots.sectionFooter({ section: entry.section })
            : [];
        }
        if (entry.kind === 'section-separator') {
          return slots.sectionSeparator ? slots.sectionSeparator() : [];
        }
        return slots.item
          ? slots.item({
              item: entry.item,
              index: entry.itemIndex,
              section: entry.section,
              separators: info.separators,
            })
          : [];
      };

      // The user's #separator is typed on ItemT, but the inner stream is the entry wrapper; unwrap
      // each entry back to its ItemT (shared unwrapEntryItem) before the inner list invokes it.
      const entrySeparatorSlot =
        slots.separator === undefined
          ? undefined
          : (
              entryProps: ISeparatorProps<ISectionEntry<ItemT>>,
            ): VNode[] | VNode =>
              slots.separator!({
                ...entryProps,
                leadingItem: unwrapEntryItem(entryProps.leadingItem),
                trailingItem: unwrapEntryItem(entryProps.trailingItem),
              });

      const entryKeyExtractor = (
        entry: ISectionEntry<ItemT>,
        index: number,
      ): string => sectionEntryKey(entry, index, keyExtractor);

      // Hand the callback `sections`, not the entries: RN's inner VirtualizedList gets
      // `data={this.props.sections}` (VirtualizedSectionList.js:216) while ours streams the
      // FLATTENED entries, so the same user code would otherwise see a different argument here
      // than on RN.
      //
      // UPSTREAM-DIVERGENCE(react-native): the flat INDEX matches RN's (two rows per section,
      // header and footer) only while the #sectionSeparator slot is unset. With it,
      // flattenSections emits an extra 'section-separator' row per boundary that RN renders inside
      // the neighbouring cell, so indices shift by one per boundary from the second section on.
      // Deliberate - that row is how this adapter paints the separator; a caller combining the two
      // must account for it.
      const getItemLayout = props.getItemLayout;
      const entryItemLayout =
        getItemLayout === undefined
          ? undefined
          : (
              _entries: unknown,
              index: number,
            ): { length: number; offset: number; index: number } =>
              getItemLayout(sections, index);

      // The three synthesized events become inner-VL handlers ONLY when listened, so the inner list
      // keeps gating (no parasitic RefreshControl / edge-reached work for an unlistened event).
      const endReached = listens('onEndReached')
        ? (eventInfo: { distanceFromEnd: number }): void =>
            emit('endReached', eventInfo)
        : undefined;
      const startReached = listens('onStartReached')
        ? (eventInfo: { distanceFromStart: number }): void =>
            emit('startReached', eventInfo)
        : undefined;
      const refresh = listens('onRefresh')
        ? (): void => emit('refresh')
        : undefined;

      return h(
        VirtualizedListHost,
        {
          ...forwarded,
          ref: setInner,
          data: entries,
          getItem: (_source: unknown, index: number): ISectionEntry<ItemT> =>
            entries[index],
          getItemCount: (): number => entries.length,
          keyExtractor: entryKeyExtractor,
          getItemLayout: entryItemLayout,
          stickyHeaderIndices,
          onEndReached: endReached,
          onStartReached: startReached,
          onRefresh: refresh,
        },
        {
          item: renderEntry,
          separator: entrySeparatorSlot,
          header: slots.header,
          footer: slots.footer,
          empty: slots.empty,
        },
      );
    };
  },
  {
    name: 'VirtualizedSectionList',
    inheritAttrs: false,
    props: PROP_KEYS,
    emits: EMIT_KEYS,
  } as unknown as undefined,
);

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
  cellGapsFor,
  createSeparatorBoard,
  flattenSections,
  layoutOverSections,
  renderSectionEntry,
  resolveScrollLocation,
  resolveStickySectionHeaders,
  routeScrollHandle,
  sectionEntryKey,
  type IInnerViewRef,
  type ISection as ICoreSection,
  type ISectionEntry,
  type ISeparatorBoard,
  type ISeparatorGap,
  type ISeparatorProps,
  type ISeparators,
  type IVirtualizedListHandle,
  type IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import {
  Platform,
  dlog,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { VirtualizedList } from '../virtualized-list';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';
import type { ICtx } from '../../utils/component-helpers';
import { SectionItemCell, type ISeparatorState } from './section-item-cell';

// VirtualizedList's generic construct signature can't be resolved by h()'s overloads, so drive
// it through a loose functional-component handle instead.
const VirtualizedListHost = VirtualizedList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

// Re-export the shared handle type so section-list imports it from '../virtualized-section-list'.
export type { IVirtualizedSectionListHandle };

// A section may bring its own item render and separator, which beat the list's slots
export type ISection<ItemT> = ICoreSection<ItemT> & {
  renderItem?: (info: {
    item: ItemT;
    index: number;
    section: ISection<ItemT>;
    separators: ISeparators;
  }) => VNode[] | VNode;
  ItemSeparatorComponent?: (props: ISeparatorProps<ItemT>) => VNode[] | VNode;
};

export type IVirtualizedSectionListProps<ItemT> = {
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
  disableVirtualization?: boolean;
  inverted?: boolean;
  horizontal?: boolean;
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
  onContentSizeChange?: (width: number, height: number) => void;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  removeClippedSubviews?: boolean;
  nestedScrollEnabled?: boolean;
  stickyHeaderHiddenOnScroll?: boolean;
  innerViewRef?: IInnerViewRef;
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  listHeaderComponentStyle?: IStyleProp<IViewStyle>;
  listFooterComponentStyle?: IStyleProp<IViewStyle>;
  [key: string]: unknown;
};

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
  // Painted before a section's first item and after its last (RN's SectionSeparatorComponent)
  sectionSeparator?: (props: ISeparatorProps<ItemT>) => VNode[] | VNode;
  // Painted between the items of one section, an item cell renders it itself
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

type ISectionCtx<ItemT> = ICtx<
  IVirtualizedSectionListEmits,
  IVirtualizedSectionListSlots<ItemT>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isVirtualizedListHandle(
  value: unknown,
): value is IVirtualizedListHandle {
  return isRecord(value) && typeof value.scrollToOffset === 'function';
}

type IScrollLocationParams = Parameters<
  IVirtualizedSectionListHandle['scrollToLocation']
>[0];

function buildSectionDelegate(
  getInner: () => IVirtualizedListHandle | null,
  locate: (
    params: IScrollLocationParams,
  ) => ReturnType<typeof resolveScrollLocation>,
): IVirtualizedSectionListHandle {
  return {
    scrollToLocation: (params): void => {
      const target = locate(params);
      if (target === undefined) {
        dlog(
          `Vue VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
        );
        return;
      }
      dlog(
        `Vue VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
          `item=${params.itemIndex} -> flat ${target.index}`,
      );
      getInner()?.scrollToIndex(target);
    },
    ...routeScrollHandle(getInner),
  };
}

type IEntry<ItemT> = ISectionEntry<ItemT, ISection<ItemT>>;

type IEntryRendering<ItemT> = {
  slots: ISectionCtx<ItemT>['slots'];
  entries: ReadonlyArray<IEntry<ItemT>>;
  board: ISeparatorBoard<Record<string, unknown>>;
  keyOf(entry: IEntry<ItemT>): string;
  isInverted: boolean;
};

// The separator slot for a gap: the section one, or the item one where a section's own beats
// the list's
function separatorRenderFor<ItemT>(
  gap: ISeparatorGap<ItemT, ISection<ItemT>>,
  slots: ISectionCtx<ItemT>['slots'],
): ((state: ISeparatorState) => VNode[] | VNode) | undefined {
  if (gap.props === undefined) return undefined;
  const { props } = gap;
  const slot =
    gap.kind === 'section'
      ? slots.sectionSeparator
      : (props.section.ItemSeparatorComponent ?? slots.separator);
  if (slot === undefined) return undefined;
  return ({ isHighlighted, override }) =>
    slot({ highlighted: isHighlighted, ...props, ...override });
}

// The inner list's #item slot: each flattened entry goes to the matching consumer slot, an item
// to a cell that paints its own separators. A slot the consumer left off renders nothing
function entryRendererFor<ItemT>(
  rendering: IEntryRendering<ItemT>,
): (info: { item: IEntry<ItemT>; index: number }) => VNode[] | VNode {
  const { slots, entries, board, keyOf } = rendering;
  return info =>
    renderSectionEntry<ItemT, VNode[] | VNode, ISection<ItemT>>(
      {
        header: ({ section }) => slots.sectionHeader?.({ section }) ?? [],
        footer: ({ section }) => slots.sectionFooter?.({ section }) ?? [],
        item: entry => {
          const gaps = cellGapsFor(entries, info.index);
          const previous = entries[info.index - 1];
          const render = entry.section.renderItem ?? slots.item;
          return h(SectionItemCell, {
            board,
            cellKey: keyOf(entry),
            prevCellKey: previous === undefined ? undefined : keyOf(previous),
            renderItem: separators =>
              render?.({
                item: entry.item,
                index: entry.itemIndex,
                section: entry.section,
                separators,
              }) ?? [],
            leadingSeparator: separatorRenderFor(gaps.leading, slots),
            trailingSeparator: separatorRenderFor(gaps.trailing, slots),
            inverted: rendering.isInverted,
          });
        },
      },
      info.item,
    );
}

// The three synthesized events become inner-list handlers ONLY when listened, so the inner list
// keeps gating (no parasitic RefreshControl / edge-reached work for an unlistened event)
function synthesizedEvents(
  listens: (onName: string) => boolean,
  emit: ISectionCtx<unknown>['emit'],
): Record<string, ((...args: never[]) => void) | undefined> {
  return {
    onEndReached: listens('onEndReached')
      ? (eventInfo: { distanceFromEnd: number }): void =>
          emit('endReached', eventInfo)
      : undefined,
    onStartReached: listens('onStartReached')
      ? (eventInfo: { distanceFromStart: number }): void =>
          emit('startReached', eventInfo)
      : undefined,
    onRefresh: listens('onRefresh') ? (): void => emit('refresh') : undefined,
  };
}

export const VirtualizedSectionList = defineComponent(
  <ItemT>(
    props: IVirtualizedSectionListProps<ItemT>,
    { attrs, expose, emit, slots }: ISectionCtx<ItemT>,
  ) => {
    const board = createSeparatorBoard<Record<string, unknown>>();
    const inner = shallowRef<IVirtualizedListHandle | null>(null);
    const setInner = (instance: unknown): void => {
      inner.value = isVirtualizedListHandle(instance) ? instance : null;
    };
    // Both change every render (sections may change), the delegate reads them lazily
    let headerIndices: number[] = [];
    let stickyHeaderIndices: number[] | undefined;
    expose(
      buildSectionDelegate(
        () => inner.value,
        params =>
          resolveScrollLocation(headerIndices, stickyHeaderIndices, params),
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
      const { entries, headerIndices: indices } = flattenSections<
        ItemT,
        ISection<ItemT>
      >(sections);
      headerIndices = indices;
      const keyOf = (entry: IEntry<ItemT>): string =>
        sectionEntryKey(entry, props.keyExtractor);
      // RN sticks section headers by default only on iOS; Android does not unless asked.
      stickyHeaderIndices = resolveStickySectionHeaders(
        props.stickySectionHeadersEnabled,
        indices,
        Platform.OS,
      );
      dlog(
        `Vue VirtualizedSectionList: ${sections.length} sections flattened to ${entries.length} entries`,
      );

      return h(
        VirtualizedListHost,
        {
          // The passthrough tail: declared props and emits are already out of $attrs
          ...normalizeVueAttrs(attrs),
          ref: setInner,
          data: entries,
          getItem: (_source: unknown, index: number): IEntry<ItemT> =>
            entries[index],
          getItemCount: (): number => entries.length,
          keyExtractor: keyOf,
          getItemLayout: layoutOverSections(props.getItemLayout, sections),
          stickyHeaderIndices,
          ...synthesizedEvents(listens, emit),
        },
        {
          item: entryRendererFor({
            slots,
            entries,
            board,
            keyOf,
            isInverted: attrs.inverted === true,
          }),
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

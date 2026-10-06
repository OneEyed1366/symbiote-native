// VirtualizedSectionList: sections flattened into one virtualized stream. Each section
// contributes a header row, its item rows, then a footer row; the flattened sequence is fed to
// VirtualizedList as a single tagged list, so headers, items, and footers are all windowed by the
// same machinery. The flattening, entry keying, separator-item unwrap, and scrollToLocation
// mapping are shared from @symbiote-native/components; this file wires React's lifecycle (refs +
// useImperativeHandle + the per-entry render dispatch). Lower layer in RN's
// SectionList -> VirtualizedSectionList -> VirtualizedList stack.

import {
  createElement,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { dlog, Platform, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  cellGapsFor,
  createSeparatorBoard,
  flattenSections,
  resolveStickySectionHeaders,
  layoutOverSections,
  renderSectionEntry,
  resolveScrollLocation,
  routeScrollHandle,
  sectionEntryKey,
  type ISection as ICoreSection,
  type ISectionEntry,
  type ISeparatorBoard,
  type ISeparatorGap,
  type IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import {
  VirtualizedList,
  type ICellRendererComponent,
  type ISeparators,
  type ISeparatorProps,
  type IVirtualizedListHandle,
} from '../virtualized-list';
import type {
  IAccessibilityProps,
  IAriaProps,
  IInnerViewRef,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';
import { SectionItemCell, type ISeparatorComponent } from './section-item-cell';

// Re-export the shared handle type so section-list imports it from '../virtualized-section-list'.
export type { IVirtualizedSectionListHandle };

// A section may bring its own `renderItem` and `ItemSeparatorComponent`, which beat the list's
export type ISection<ItemT> = ICoreSection<ItemT> & {
  renderItem?: (info: {
    item: ItemT;
    index: number;
    section: ISection<ItemT>;
    separators: ISeparators;
  }) => ReactNode;
  ItemSeparatorComponent?: ComponentType<ISeparatorProps<ItemT>>;
};

export type IVirtualizedSectionListProps<ItemT> = IAccessibilityProps &
  IAriaProps & {
    sections: ReadonlyArray<ISection<ItemT>>;
    renderItem: (info: {
      item: ItemT;
      index: number;
      section: ISection<ItemT>;
      separators: ISeparators;
    }) => ReactNode;
    renderSectionHeader?: (info: { section: ISection<ItemT> }) => ReactNode;
    renderSectionFooter?: (info: { section: ISection<ItemT> }) => ReactNode;
    // Painted before a section's first item and after its last (RN's SectionSeparatorComponent)
    SectionSeparatorComponent?: ISeparatorComponent<ItemT>;
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
    // Stick each section header to the top as the next section scrolls up. Routed to the inner
    // VirtualizedList's stickyHeaderIndices. Defaults to `Platform.OS === 'ios'` (RN
    // SectionList.js:243-244); Android does not stick by default. Pass true/false to override.
    stickySectionHeadersEnabled?: boolean;
    extraData?: unknown;
    ItemSeparatorComponent?: ComponentType<ISeparatorProps<ItemT>>;
    // The cell's `item` is the list's own entry (an item, header or footer), not an `ItemT`
    CellRendererComponent?: ICellRendererComponent<unknown>;
    ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement;
    ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement;
    ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement;
    ListHeaderComponentStyle?: IStyleProp<IViewStyle>;
    ListFooterComponentStyle?: IStyleProp<IViewStyle>;
    onEndReached?: (info: { distanceFromEnd: number }) => void;
    onEndReachedThreshold?: number;
    onStartReached?: (info: { distanceFromStart: number }) => void;
    onStartReachedThreshold?: number;
    onRefresh?: () => void;
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
    // Forwarded onto the inner list like `style` — resolves through the shared style registry.
    className?: string;
  };

// Kept apart so the component body stays readable: the handle only forwards to the inner list
function buildSectionHandle(
  listRef: { current: IVirtualizedListHandle | null },
  headerIndices: number[],
  stickyHeaderIndices: number[] | undefined,
): IVirtualizedSectionListHandle {
  return {
    scrollToLocation: (params): void => {
      const target = resolveScrollLocation(
        headerIndices,
        stickyHeaderIndices,
        params,
      );
      if (target === undefined) {
        dlog(
          `VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
        );
        return;
      }
      dlog(
        `VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
          `item=${params.itemIndex} -> flat ${target.index}`,
      );
      listRef.current?.scrollToIndex(target);
    },
    ...routeScrollHandle(() => listRef.current),
  };
}

// The handle reaches into the inner list to drive `scrollToIndex`, so it owns the list ref
function useSectionHandle(
  ref: Ref<IVirtualizedSectionListHandle> | undefined,
  headerIndices: number[],
  stickyHeaderIndices: number[] | undefined,
): RefObject<IVirtualizedListHandle | null> {
  const listRef = useRef<IVirtualizedListHandle | null>(null);
  useImperativeHandle(
    ref ?? null,
    () => buildSectionHandle(listRef, headerIndices, stickyHeaderIndices),
    [headerIndices, stickyHeaderIndices],
  );
  return listRef;
}

function flattenLogged<ItemT>(
  sections: ReadonlyArray<ISection<ItemT>>,
): ReturnType<typeof flattenSections<ItemT, ISection<ItemT>>> {
  const flat = flattenSections<ItemT, ISection<ItemT>>(sections);
  dlog(
    `VirtualizedSectionList: ${sections.length} sections flattened to ${flat.entries.length} entries`,
  );
  return flat;
}

type IEntry<ItemT> = ISectionEntry<ItemT, ISection<ItemT>>;

// The flat stream plus the board its item cells share their separator state through
function useSectionEntries<ItemT>(
  sections: ReadonlyArray<ISection<ItemT>>,
  keyExtractor: ((item: ItemT, index: number) => string) | undefined,
  stickySectionHeadersEnabled: boolean | undefined,
) {
  const [board] = useState(() =>
    createSeparatorBoard<Record<string, unknown>>(),
  );
  const keyOf = (entry: IEntry<ItemT>): string =>
    sectionEntryKey(entry, keyExtractor);
  const { entries, headerIndices } = flattenLogged(sections);
  // RN sticks section headers by default only on iOS; Android does not unless asked
  const stickyHeaderIndices = resolveStickySectionHeaders(
    stickySectionHeadersEnabled,
    headerIndices,
    Platform.OS,
  );
  return { entries, headerIndices, stickyHeaderIndices, board, keyOf };
}

type IEntryRenderers<ItemT> = Pick<
  IVirtualizedSectionListProps<ItemT>,
  | 'renderItem'
  | 'renderSectionHeader'
  | 'renderSectionFooter'
  | 'SectionSeparatorComponent'
  | 'ItemSeparatorComponent'
  | 'inverted'
> & {
  entries: ReadonlyArray<IEntry<ItemT>>;
  board: ISeparatorBoard<Record<string, unknown>>;
  keyOf(entry: IEntry<ItemT>): string;
};

// A separator component by the kind of gap it sits in: the section one, or the item one where a
// section's own `ItemSeparatorComponent` beats the list's
function separatorFor<ItemT>(
  gap: ISeparatorGap<ItemT, ISection<ItemT>>,
  renderers: IEntryRenderers<ItemT>,
): ISeparatorComponent<ItemT> | undefined {
  if (gap.kind === 'section') return renderers.SectionSeparatorComponent;
  if (gap.kind === 'item')
    return (
      gap.props.section.ItemSeparatorComponent ??
      renderers.ItemSeparatorComponent
    );
  return undefined;
}

// The inner list's single `renderItem`, one renderer per entry kind. An item entry becomes a
// cell that paints its own separators, so the inner list gets no `ItemSeparatorComponent`
function entryRendererFor<ItemT>(
  renderers: IEntryRenderers<ItemT>,
): (info: { item: IEntry<ItemT>; index: number }) => ReactNode {
  return info =>
    renderSectionEntry<ItemT, ReactNode, ISection<ItemT>>(
      {
        header: ({ section }) => renderers.renderSectionHeader?.({ section }),
        footer: ({ section }) => renderers.renderSectionFooter?.({ section }),
        item: entry => {
          const gaps = cellGapsFor(renderers.entries, info.index);
          const previous = renderers.entries[info.index - 1];
          return createElement(SectionItemCell<ItemT, ISection<ItemT>>, {
            board: renderers.board,
            cellKey: renderers.keyOf(entry),
            prevCellKey:
              previous === undefined ? undefined : renderers.keyOf(previous),
            item: entry.item,
            index: entry.itemIndex,
            section: entry.section,
            renderItem: entry.section.renderItem ?? renderers.renderItem,
            leadingGap: gaps.leading,
            trailingGap: gaps.trailing,
            LeadingSeparatorComponent: separatorFor(gaps.leading, renderers),
            TrailingSeparatorComponent: separatorFor(gaps.trailing, renderers),
            inverted: renderers.inverted === true,
          });
        },
      },
      info.item,
    );
}

export function VirtualizedSectionList<ItemT>(
  props: IVirtualizedSectionListProps<ItemT> & {
    ref?: Ref<IVirtualizedSectionListHandle>;
  },
): ReactElement {
  const {
    ref,
    sections,
    renderItem,
    renderSectionHeader,
    renderSectionFooter,
    SectionSeparatorComponent,
    // Pulled out of `rest`, these are typed on ItemT while the inner list streams entries
    ItemSeparatorComponent,
    keyExtractor,
    getItemLayout,
    stickySectionHeadersEnabled,
    inverted,
    ...rest
  } = props;

  const { entries, headerIndices, stickyHeaderIndices, board, keyOf } =
    useSectionEntries(sections, keyExtractor, stickySectionHeadersEnabled);

  const listRef = useSectionHandle(ref, headerIndices, stickyHeaderIndices);

  return createElement(VirtualizedList<IEntry<ItemT>>, {
    ref: listRef,
    data: entries,
    getItem: (_source: unknown, index: number): IEntry<ItemT> => entries[index],
    getItemCount: (): number => entries.length,
    renderItem: entryRendererFor({
      renderItem,
      renderSectionHeader,
      renderSectionFooter,
      SectionSeparatorComponent,
      ItemSeparatorComponent,
      inverted,
      entries,
      board,
      keyOf,
    }),
    keyExtractor: keyOf,
    getItemLayout: layoutOverSections(getItemLayout, sections),
    stickyHeaderIndices,
    inverted,
    ...rest,
  });
}

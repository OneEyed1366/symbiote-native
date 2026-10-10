// `IVirtualizedSectionListProps`'s canonical home. Per-adapter (Snippet render props), same
// rationale as virtualized-list-props.ts. `ISection`/`IVirtualizedSectionListHandle` themselves
// ARE framework-agnostic (plain data / plain method signatures) and come straight from
// @symbiote-native/components — only the render-callback fields below are hand-declared here.
import type { Snippet } from 'svelte';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IInnerViewRef,
  ISection as ICoreSection,
  ISeparatorProps,
  ISeparators,
  IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';
import type { ICellRendererProps } from '../virtualized-list/virtualized-list-props';

export type { IVirtualizedSectionListHandle };

export type ISectionCellInfo<ItemT> = {
  item: ItemT;
  index: number;
  section: ISection<ItemT>;
  separators: ISeparators;
};

// A section may bring its own `item` and `separator` snippets, which beat the list's
export type ISection<ItemT> = ICoreSection<ItemT> & {
  item?: Snippet<[ISectionCellInfo<ItemT>]>;
  separator?: Snippet<[ISeparatorProps<ItemT>]>;
};

export type IVirtualizedSectionListProps<ItemT> = IAccessibilityProps &
  IAriaProps & {
    sections: ReadonlyArray<ISection<ItemT>>;
    item: Snippet<[ISectionCellInfo<ItemT>]>;
    sectionHeader?: Snippet<[{ section: ISection<ItemT> }]>;
    sectionFooter?: Snippet<[{ section: ISection<ItemT> }]>;
    // Painted before a section's first item and after its last (RN's SectionSeparatorComponent)
    sectionSeparator?: Snippet<[ISeparatorProps<ItemT>]>;
    // Painted between the items of one section, an item cell renders it itself
    separator?: Snippet<[ISeparatorProps<ItemT>]>;
    // The cell's `item` is the list's own entry (an item, header or footer), not an `ItemT`
    cellRenderer?: Snippet<[ICellRendererProps<unknown>]>;
    header?: Snippet;
    footer?: Snippet;
    empty?: Snippet;
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
    // Stick each section header to the top as the next section scrolls up. Defaults to
    // `Platform.OS === 'ios'`; Android does not stick by default. Pass true/false to override.
    stickySectionHeadersEnabled?: boolean;
    extraData?: unknown;
    onEndReached?: (info: { distanceFromEnd: number }) => void;
    onEndReachedThreshold?: number;
    onStartReached?: (info: { distanceFromStart: number }) => void;
    onStartReachedThreshold?: number;
    // Pull-to-refresh — delegates straight through to the inner VirtualizedList's own
    // RefreshControl wiring, same as React's VirtualizedSectionList.
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
    onContentSizeChange?: (width: number, height: number) => void;
    onScrollBeginDrag?: (event: ISymbioteEvent) => void;
    onScrollEndDrag?: (event: ISymbioteEvent) => void;
    onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
    onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
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
    class?: ISvelteClassValue;
  };

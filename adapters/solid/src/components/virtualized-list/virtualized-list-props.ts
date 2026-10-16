// The public prop contract of the Solid VirtualizedList

import type { Accessor, Ref } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import type {
  IAccessibilityProps,
  IAriaProps,
  ICellRendererBaseProps,
  IInnerViewRef,
  ISeparatorProps,
  ISeparators,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IViewableItemsChangedInfo,
  IVirtualizedListHandle,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

// What a `CellRendererComponent` is handed, the item and its separator arrive as `children`
export type ICellRendererProps<ItemT> = ICellRendererBaseProps<ItemT> & {
  children?: JSX.Element;
};

// A function component, so one typed for `unknown` fits a list of any item
export type ICellRendererComponent<ItemT> = (
  props: ICellRendererProps<ItemT>,
) => JSX.Element;

// What `renderItem` is handed. Other adapters pass this as a VALUE, here it arrives as an ACCESSOR:
// Solid has no node-reusing layer under the render prop, so only the leaf that reads it re-runs
export type IVirtualizedListCellInfo<ItemT> = {
  item: ItemT;
  index: number;
  separators: ISeparators;
};

export type IVirtualizedListRenderItem<ItemT> = (
  info: Accessor<IVirtualizedListCellInfo<ItemT>>,
) => JSX.Element;

export type IVirtualizedListProps<ItemT> = IAccessibilityProps &
  IAriaProps & {
    data: unknown;
    getItem: (data: unknown, index: number) => ItemT;
    getItemCount: (data: unknown) => number;
    // One of the two is required, `ListItemComponent` wins when both are given
    renderItem?: IVirtualizedListRenderItem<ItemT>;
    // A component taking `item`, `index` and `separators` as props, RN's `ListItemComponent`
    ListItemComponent?: (props: IVirtualizedListCellInfo<ItemT>) => JSX.Element;
    getItemLayout?: (
      data: unknown,
      index: number,
    ) => { length: number; offset: number; index: number };
    initialNumToRender?: number;
    windowSize?: number;
    // Mounts every cell from the top and paints no spacer, the window only grows toward the end
    disableVirtualization?: boolean;
    // Elements, not components, each is read ONCE: a JSX prop is a getter that BUILDS the element
    ListHeaderComponent?: JSX.Element;
    ListFooterComponent?: JSX.Element;
    ListEmptyComponent?: JSX.Element;
    // A component, instantiated per gap, because its props change over time (the highlight flag)
    ItemSeparatorComponent?: (props: ISeparatorProps<ItemT>) => JSX.Element;
    // Replaces the view around each cell, it must wire `onLayout` and `onFocus` itself
    CellRendererComponent?: ICellRendererComponent<ItemT>;
    // The imperative handle, not the host node: Solid turns `ref={list}` into a callback prop
    ref?: Ref<IVirtualizedListHandle>;
    onEndReached?: (info: { distanceFromEnd: number }) => void;
    onEndReachedThreshold?: number;
    onStartReached?: (info: { distanceFromStart: number }) => void;
    onStartReachedThreshold?: number;
    keyExtractor?: (item: ItemT, index: number) => string;
    onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
    viewabilityConfig?: IViewabilityConfig;
    viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
    // Composes with the internal handler, it never replaces it
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
    horizontal?: boolean;
    inverted?: boolean;
    style?: IStyleProp<IViewStyle>;
    // A bare STRING resolves through the shared style registry, like this adapter's ScrollView
    contentContainerStyle?: IStyleProp<IViewStyle> | string;
    ListHeaderComponentStyle?: IStyleProp<IViewStyle>;
    ListFooterComponentStyle?: IStyleProp<IViewStyle>;
    // Solid's spelling of a registered class name, resolved by the class+style merge
    class?: IClassNameValue;
    // With `onRefresh` a real RefreshControl is attached, `refreshing` is the controlled state
    onRefresh?: () => void;
    refreshing?: boolean | null;
    progressViewOffset?: number;
    // Data indices that stick to the top, the flagged CELL is wrapped here and never forwarded
    stickyHeaderIndices?: number[];
    maintainVisibleContentPosition?: {
      minIndexForVisible: number;
      autoscrollToTopThreshold?: number;
    };
    initialScrollIndex?: number;
    maxToRenderPerBatch?: number;
    updateCellsBatchingPeriod?: number;
    // A no-op here: a signal read inside `renderItem` already updates the leaf that reads it
    extraData?: unknown;
    onScrollToIndexFailed?: (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => void;
  };

export type IVirtualizedListComponent = <ItemT>(
  props: IVirtualizedListProps<ItemT>,
) => JSX.Element;

// Consumed by the lifecycle itself, everything LEFT OVER is the accessibility surface that rides
// down onto the scroll host
export const HANDLED_PROPS = [
  'data',
  'getItem',
  'getItemCount',
  'renderItem',
  'ListItemComponent',
  'getItemLayout',
  'initialNumToRender',
  'windowSize',
  'disableVirtualization',
  'ListHeaderComponent',
  'ListFooterComponent',
  'ListEmptyComponent',
  'ItemSeparatorComponent',
  'CellRendererComponent',
  'ref',
  'onEndReached',
  'onEndReachedThreshold',
  'onStartReached',
  'onStartReachedThreshold',
  'keyExtractor',
  'onViewableItemsChanged',
  'viewabilityConfig',
  'viewabilityConfigCallbackPairs',
  'onScroll',
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
  'scrollEventThrottle',
  'keyboardShouldPersistTaps',
  'keyboardDismissMode',
  'horizontal',
  'inverted',
  'style',
  'contentContainerStyle',
  'ListHeaderComponentStyle',
  'ListFooterComponentStyle',
  'class',
  'onScrollToIndexFailed',
  'onRefresh',
  'refreshing',
  'progressViewOffset',
  'stickyHeaderIndices',
  'maintainVisibleContentPosition',
  'initialScrollIndex',
  'maxToRenderPerBatch',
  'updateCellsBatchingPeriod',
  'extraData',
] as const satisfies readonly (keyof IVirtualizedListProps<unknown>)[];

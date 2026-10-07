// Public prop types of the React VirtualizedList

import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { ISymbioteEvent } from '@symbiote-native/engine';
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
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

// What `renderItem` and `ListItemComponent` are both handed
export type IListItemInfo<ItemT> = {
  item: ItemT;
  index: number;
  separators: ISeparators;
};

export type IRenderItem<ItemT> = (info: IListItemInfo<ItemT>) => ReactNode;

export type ICellRendererProps<ItemT> = ICellRendererBaseProps<ItemT> & {
  children?: ReactNode;
};

// A function component, so one typed for `unknown` fits a list of any item (a class would not)
export type ICellRendererComponent<ItemT> = (
  props: ICellRendererProps<ItemT>,
) => ReactNode;

export type IListSlot =
  ComponentType<Record<string, never>> | ReactElement | undefined;

export type IVirtualizedListProps<ItemT> = IAccessibilityProps &
  IAriaProps & {
    data: unknown;
    getItem: (data: unknown, index: number) => ItemT;
    getItemCount: (data: unknown) => number;
    // One of the two is required, `ListItemComponent` wins when both are given
    renderItem?: IRenderItem<ItemT>;
    ListItemComponent?: ComponentType<IListItemInfo<ItemT>>;
    keyExtractor?: (item: ItemT, index: number) => string;
    getItemLayout?: (
      data: unknown,
      index: number,
    ) => { length: number; offset: number; index: number };
    ItemSeparatorComponent?: ComponentType<ISeparatorProps<ItemT>>;
    // Replaces the view wrapped around each cell, it must wire `onLayout` and `onFocus` itself
    CellRendererComponent?: ICellRendererComponent<ItemT>;
    ListHeaderComponent?: IListSlot;
    ListFooterComponent?: IListSlot;
    ListEmptyComponent?: IListSlot;
    ListHeaderComponentStyle?: IStyleProp<IViewStyle>;
    ListFooterComponentStyle?: IStyleProp<IViewStyle>;
    horizontal?: boolean;
    inverted?: boolean;
    // Opaque marker prop: the list is not memoized, so a change re-renders it and `renderItem`
    // closures reading external state stay fresh, RN's `extraData`
    extraData?: unknown;
    onEndReached?: (info: { distanceFromEnd: number }) => void;
    onEndReachedThreshold?: number;
    // The top-edge twin of `onEndReached`
    onStartReached?: (info: { distanceFromStart: number }) => void;
    onStartReachedThreshold?: number;
    // With `onRefresh` the list writes a `<refresh-control>` as the scroll tag's first child
    // `refreshing` is its controlled spinner state, `progressViewOffset` nudges its rest
    onRefresh?: () => void;
    refreshing?: boolean | null;
    progressViewOffset?: number;
    onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
    viewabilityConfig?: IViewabilityConfig;
    viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
    // Fired when `scrollToIndex` targets an unmeasured cell and there is no `getItemLayout`
    onScrollToIndexFailed?: (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => void;
    initialNumToRender?: number;
    initialScrollIndex?: number;
    maxToRenderPerBatch?: number;
    updateCellsBatchingPeriod?: number;
    windowSize?: number;
    // Mounts every cell from the top and paints no spacer, the window only grows toward the end
    disableVirtualization?: boolean;
    // Data indices that stick to the top as they scroll off, section lists pass their headers
    stickyHeaderIndices?: number[];
    // Keeps the anchored item in place on a prepend, native does the in-window part and the
    // reducer shifts for the off-window leading spacer native cannot see
    maintainVisibleContentPosition?: {
      minIndexForVisible: number;
      autoscrollToTopThreshold?: number;
    };
    // The user's handler composes with the internal windowing one, it never replaces it
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
    // Resolves through the shared style registry like `style`
    className?: string;
  };

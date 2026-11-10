// The public prop surface of the Angular VirtualizedList, kept apart from the component class

import type {
  IAccessibilityProps,
  IAriaProps,
  IInnerViewRef,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IViewableItemsChangedInfo,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

// The React and Vue surface minus element-returning props, which are `<ng-template>` here
export type IVirtualizedListProps<ItemT> = IAccessibilityProps &
  IAriaProps & {
    data: unknown;
    getItem: (data: unknown, index: number) => ItemT;
    getItemCount: (data: unknown) => number;
    keyExtractor?: (item: ItemT, index: number) => string;
    getItemLayout?: (
      data: unknown,
      index: number,
    ) => { length: number; offset: number; index: number };
    horizontal?: boolean;
    inverted?: boolean;
    extraData?: unknown;
    onEndReached?: (info: { distanceFromEnd: number }) => void;
    onEndReachedThreshold?: number;
    onStartReached?: (info: { distanceFromStart: number }) => void;
    onStartReachedThreshold?: number;
    onRefresh?: () => void;
    refreshing?: boolean | null;
    progressViewOffset?: number;
    onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
    viewabilityConfig?: IViewabilityConfig;
    viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
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
    disableVirtualization?: boolean;
    stickyHeaderIndices?: number[];
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
    listHeaderComponentStyle?: IStyleProp<IViewStyle>;
    listFooterComponentStyle?: IStyleProp<IViewStyle>;
  };

// The plain inputs: the full surface minus the events exposed as real outputs
export type IVirtualizedListInputs<ItemT> = Omit<
  IVirtualizedListProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onViewableItemsChanged'
  | 'onScrollToIndexFailed'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

// The public prop, slot and emit contract of the Vue VirtualizedList

import type { Component, VNode } from '@vue/runtime-core';
import type {
  IInnerViewRef,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IViewableItemsChangedInfo,
  ISeparatorProps,
  ISeparators,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

// The cell renderer and the separator, header, footer and empty chrome are scoped slots
// (`#item`, `#separator`, ...), React's `renderItem` family is deliberately not on this contract
export type IVirtualizedListProps<ItemT> = {
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
  onEndReachedThreshold?: number;
  onStartReachedThreshold?: number;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  initialNumToRender?: number;
  initialScrollIndex?: number;
  maxToRenderPerBatch?: number;
  updateCellsBatchingPeriod?: number;
  windowSize?: number;
  // Replaces the view around each cell, a component taking `ICellRendererProps` with the item and
  // its separator in its default slot, it must wire `onLayout` and `onFocus` itself
  cellRendererComponent?: Component;
  // Mounts every cell from the top and paints no spacer, the window only grows toward the end
  disableVirtualization?: boolean;
  stickyHeaderIndices?: number[];
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // Raw native scroll events ride through `$attrs` onto the inner ScrollView, `onScroll` is also
  // intercepted for the windowing offset and then composed with the user's
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
  // The remaining passthrough tail forwards onto the inner ScrollView without redeclaring each prop
  [key: string]: unknown;
};

// Slots return `VNode[]` (Vue's scoped-slot contract), `ItemT` flows in from `data`
export type IVirtualizedListSlots<ItemT> = {
  item: (info: {
    item: ItemT;
    index: number;
    separators: ISeparators;
  }) => VNode[] | VNode;
  separator?: (props: ISeparatorProps<ItemT>) => VNode[] | VNode;
  header?: () => VNode[] | VNode;
  footer?: () => VNode[] | VNode;
  empty?: () => VNode[] | VNode;
};

export type IVirtualizedListEmits<ItemT> = {
  viewableItemsChanged: (info: IViewableItemsChangedInfo<ItemT>) => void;
  endReached: (info: { distanceFromEnd: number }) => void;
  startReached: (info: { distanceFromStart: number }) => void;
  refresh: () => void;
  scrollToIndexFailed: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
};

// The runtime `props` declaration, the raw scroll events and the emit events are absent on purpose
export const PROP_KEYS = [
  'data',
  'getItem',
  'getItemCount',
  'keyExtractor',
  'getItemLayout',
  'viewabilityConfig',
  'viewabilityConfigCallbackPairs',
  'extraData',
  'horizontal',
  'inverted',
  'onEndReachedThreshold',
  'onStartReachedThreshold',
  'refreshing',
  'progressViewOffset',
  'initialNumToRender',
  'initialScrollIndex',
  'maxToRenderPerBatch',
  'updateCellsBatchingPeriod',
  'windowSize',
  'cellRendererComponent',
  'disableVirtualization',
  'stickyHeaderIndices',
  'maintainVisibleContentPosition',
  'style',
  'contentContainerStyle',
  'listHeaderComponentStyle',
  'listFooterComponentStyle',
  'keyboardShouldPersistTaps',
  'keyboardDismissMode',
] as const satisfies readonly (keyof IVirtualizedListProps<unknown>)[];

export const EMIT_KEYS = [
  'viewableItemsChanged',
  'endReached',
  'startReached',
  'refresh',
  'scrollToIndexFailed',
] as const satisfies readonly (keyof IVirtualizedListEmits<unknown>)[];

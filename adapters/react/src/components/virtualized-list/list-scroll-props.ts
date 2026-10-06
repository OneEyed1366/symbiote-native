// The props handed to the scroll tag, and the accessibility rest that rides down with them

import { createElement, type ReactElement } from 'react';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import {
  buildListScrollProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote-native/components';
import type { IRefreshControlProps } from '../refresh-control-props';
import type { IScrollViewProps } from '../scroll-view/scroll-view-props';
import type { IListConfig } from './list-config';
import type { IVirtualizedListProps } from './virtualized-list-props';

export type IScrollTagProps = IScrollViewProps & {
  onLayout: (event: ISymbioteEvent) => void;
  isInvertedVirtualizedList?: boolean;
};

// The data access protocol and the slots, none of which the scroll tag takes
function withoutDataAndSlots<ItemT>(
  props: IVirtualizedListProps<ItemT> & { ref?: unknown },
) {
  const {
    data,
    getItem,
    getItemCount,
    renderItem,
    keyExtractor,
    getItemLayout,
    ItemSeparatorComponent,
    CellRendererComponent,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    ...rest
  } = props;
  return rest;
}

// Everything the list does not consume itself is accessibility surface for the ScrollView
// The user's `onScroll` is among the consumed keys, composed with the internal handler instead
export function accessibilityRestOf<ItemT>(
  props: IVirtualizedListProps<ItemT> & { ref?: unknown },
): IAccessibilityProps & IAriaProps {
  const {
    horizontal,
    inverted,
    extraData,
    onEndReached,
    onEndReachedThreshold,
    onStartReached,
    onStartReachedThreshold,
    onRefresh,
    refreshing,
    progressViewOffset,
    onViewableItemsChanged,
    viewabilityConfig,
    viewabilityConfigCallbackPairs,
    onScrollToIndexFailed,
    initialNumToRender,
    initialScrollIndex,
    maxToRenderPerBatch,
    updateCellsBatchingPeriod,
    windowSize,
    disableVirtualization,
    stickyHeaderIndices,
    maintainVisibleContentPosition,
    style,
    contentContainerStyle,
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    scrollEventThrottle,
    keyboardShouldPersistTaps,
    keyboardDismissMode,
    ref,
    ...rest
  } = withoutDataAndSlots(props);
  return rest;
}

// With `onRefresh` the RefreshControl is an ordinary FIRST CHILD on both platforms, the scroll
// behavior claims it and places it per platform
export function refreshControlOf<ItemT>(
  config: IListConfig<ItemT>,
): ReactElement | undefined {
  if (config.onRefresh === undefined) return undefined;
  return createElement('refresh-control', {
    key: 'refresh-control',
    refreshing: config.refreshing ?? false,
    onRefresh: config.onRefresh,
    progressViewOffset: config.progressViewOffset,
  } satisfies IRefreshControlProps & { key: string });
}

export type IScrollTagInputs<ItemT> = {
  config: IListConfig<ItemT>;
  accessibilityRest: IAccessibilityProps & IAriaProps;
  total: number;
  // The handlers that also reach the nested lists replace the app's own, which they call
  onScroll: (event: ISymbioteEvent) => void;
  onScrollBeginDrag: (event: ISymbioteEvent) => void;
  onScrollEndDrag: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd: (event: ISymbioteEvent) => void;
  onContentSizeChange: (width: number, height: number) => void;
  onLayout: (event: ISymbioteEvent) => void;
  commandedOffset: { x: number; y: number } | undefined;
  hasHeader: boolean;
};

export function buildScrollProps<ItemT>(
  inputs: IScrollTagInputs<ItemT>,
): IScrollTagProps {
  const { config, accessibilityRest, ...tagInputs } = inputs;
  return buildListScrollProps({ ...config, ...tagInputs }, accessibilityRest);
}

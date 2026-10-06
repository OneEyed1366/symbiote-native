// The list props with every default applied, read as one object by the component's derived state

import {
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_WINDOW_SIZE,
} from '@symbiote-native/components';
import type { IVirtualizedListProps } from './virtualized-list-props';

export function resolveListProps<ItemT>(props: IVirtualizedListProps<ItemT>) {
  return {
    data: props.data,
    getItem: props.getItem,
    getItemCount: props.getItemCount,
    keyExtractor: props.keyExtractor,
    getItemLayout: props.getItemLayout,
    horizontal: props.horizontal === true,
    inverted: props.inverted === true,
    onEndReached: props.onEndReached,
    onEndReachedThreshold: props.onEndReachedThreshold,
    onStartReached: props.onStartReached,
    onStartReachedThreshold: props.onStartReachedThreshold,
    onRefresh: props.onRefresh,
    refreshing: props.refreshing,
    progressViewOffset: props.progressViewOffset,
    onViewableItemsChanged: props.onViewableItemsChanged,
    viewabilityConfig: props.viewabilityConfig,
    viewabilityConfigCallbackPairs: props.viewabilityConfigCallbackPairs,
    onScrollToIndexFailed: props.onScrollToIndexFailed,
    initialNumToRender:
      props.initialNumToRender ?? DEFAULT_INITIAL_NUM_TO_RENDER,
    initialScrollIndex: props.initialScrollIndex,
    maxToRenderPerBatch:
      props.maxToRenderPerBatch ?? DEFAULT_MAX_TO_RENDER_PER_BATCH,
    updateCellsBatchingPeriod:
      props.updateCellsBatchingPeriod ?? DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
    windowSize: props.windowSize ?? DEFAULT_WINDOW_SIZE,
    disableVirtualization: props.disableVirtualization,
    stickyHeaderIndices: props.stickyHeaderIndices,
    maintainVisibleContentPosition: props.maintainVisibleContentPosition,
    userOnScroll: props.onScroll,
    onContentSizeChange: props.onContentSizeChange,
    onScrollBeginDrag: props.onScrollBeginDrag,
    onScrollEndDrag: props.onScrollEndDrag,
    onMomentumScrollBegin: props.onMomentumScrollBegin,
    onMomentumScrollEnd: props.onMomentumScrollEnd,
    scrollEventThrottle: props.scrollEventThrottle,
    keyboardShouldPersistTaps: props.keyboardShouldPersistTaps,
    keyboardDismissMode: props.keyboardDismissMode,
    removeClippedSubviews: props.removeClippedSubviews,
    nestedScrollEnabled: props.nestedScrollEnabled,
    stickyHeaderHiddenOnScroll: props.stickyHeaderHiddenOnScroll,
    innerViewRef: props.innerViewRef,
    style: props.style,
    contentContainerStyle: props.contentContainerStyle,
    listHeaderComponentStyle: props.listHeaderComponentStyle,
    listFooterComponentStyle: props.listFooterComponentStyle,
    class: props.class,
  };
}

type IResolvedListProps = ReturnType<typeof resolveListProps>;

// The RefreshControl's props, absent while the list has no `onRefresh`
export function refreshControlPropsOf(
  narrowed: Pick<
    IResolvedListProps,
    'onRefresh' | 'refreshing' | 'progressViewOffset'
  >,
) {
  if (narrowed.onRefresh === undefined) return undefined;
  return {
    refreshing: narrowed.refreshing ?? false,
    onRefresh: narrowed.onRefresh,
    progressViewOffset: narrowed.progressViewOffset,
  };
}

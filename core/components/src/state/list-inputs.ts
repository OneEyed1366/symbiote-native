// The framework-agnostic inputs the list reducer reads, assembled from an adapter's resolved props

import type { IListReducerInputs } from './list-reducer-types';
import { isRtlLayout } from './list-rtl';
import type { IViewabilityConfigCallbackPair } from './list-viewability';

export type IListInputsSource<ItemT> = Omit<
  IListReducerInputs<ItemT>,
  | 'onEndReachedActive'
  | 'onStartReachedActive'
  | 'viewabilityPairs'
  | 'onEndReachedThreshold'
  | 'onStartReachedThreshold'
> & {
  onEndReachedThreshold?: number;
  onStartReachedThreshold?: number;
  // Only whether an edge listener exists reaches the reducer, never the callback itself
  onEndReached?: unknown;
  onStartReached?: unknown;
};

export function buildListReducerInputs<ItemT>(
  source: IListInputsSource<ItemT>,
  viewabilityPairs: IViewabilityConfigCallbackPair<ItemT>[],
): IListReducerInputs<ItemT> {
  return {
    data: source.data,
    getItem: source.getItem,
    getItemCount: source.getItemCount,
    keyExtractor: source.keyExtractor,
    getItemLayout: source.getItemLayout,
    horizontal: source.horizontal,
    rtl: source.rtl ?? isRtlLayout(),
    windowSize: source.windowSize,
    initialNumToRender: source.initialNumToRender,
    maxToRenderPerBatch: source.maxToRenderPerBatch,
    updateCellsBatchingPeriod: source.updateCellsBatchingPeriod,
    onEndReachedThreshold: source.onEndReachedThreshold,
    onStartReachedThreshold: source.onStartReachedThreshold,
    onEndReachedActive: source.onEndReached !== undefined,
    onStartReachedActive: source.onStartReached !== undefined,
    viewabilityPairs,
    maintainVisibleContentPosition: source.maintainVisibleContentPosition,
    initialScrollIndex: source.initialScrollIndex,
    disableVirtualization: source.disableVirtualization,
    findFirstChildWithMore: source.findFirstChildWithMore,
  };
}

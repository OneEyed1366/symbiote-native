// Props with their defaults applied

import {
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_WINDOW_SIZE,
} from '@symbiote-native/components';
import type { IVirtualizedListProps } from './virtualized-list-props';

export type IListConfig<ItemT> = IVirtualizedListProps<ItemT> & {
  horizontal: boolean;
  inverted: boolean;
  initialNumToRender: number;
  maxToRenderPerBatch: number;
  updateCellsBatchingPeriod: number;
  windowSize: number;
  // The first cell a nested list in it still has more rows for, the window holds there
  findFirstChildWithMore?: (first: number, last: number) => number | null;
};

export function resolveListConfig<ItemT>(
  props: IVirtualizedListProps<ItemT>,
  findFirstChildWithMore?: IListConfig<ItemT>['findFirstChildWithMore'],
): IListConfig<ItemT> {
  return {
    ...props,
    findFirstChildWithMore,
    horizontal: props.horizontal ?? false,
    inverted: props.inverted ?? false,
    initialNumToRender:
      props.initialNumToRender ?? DEFAULT_INITIAL_NUM_TO_RENDER,
    maxToRenderPerBatch:
      props.maxToRenderPerBatch ?? DEFAULT_MAX_TO_RENDER_PER_BATCH,
    updateCellsBatchingPeriod:
      props.updateCellsBatchingPeriod ?? DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
    windowSize: props.windowSize ?? DEFAULT_WINDOW_SIZE,
  };
}

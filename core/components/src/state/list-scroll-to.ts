// Imperative scroll requests folded into `scroll-to` effects

import { dlog } from '@symbiote-native/engine';
import { EMPTY_OFFSET, FIRST_INDEX, NO_INDEX } from './list-constants';
import { offsetForEnd } from './list-edges';
import { indexOfItem } from './list-keys';
import { highestMeasuredIndex, offsetForIndex } from './list-metrics';
import type {
  IListReduceResult,
  IListReducerInputs,
  IListState,
} from './list-reducer-types';

export function scrollToEffect<ItemT>(
  state: IListState<ItemT>,
  offset: number,
  animated: boolean,
): IListReduceResult<ItemT> {
  return {
    state,
    effects: [{ kind: 'scroll-to', offset, animated }],
    changed: false,
  };
}

export function scrollToEnd<ItemT>(
  state: IListState<ItemT>,
  animated: boolean,
): IListReduceResult<ItemT> {
  return scrollToEffect(
    state,
    offsetForEnd(state.metrics.total, state.viewportLength),
    animated,
  );
}

// The one place the range is enforced, `offsetForIndex` still CLAMPS because `scrollToEnd` and
// `initialScrollIndex` resolve through it with indices legitimately at or past the edge
// Runs before the failure branch, or a bad index would read as a measurement problem
function assertIndexInRange(index: number, itemCount: number): void {
  if (index < FIRST_INDEX) {
    throw new Error(
      `scrollToIndex out of range: requested index ${index} but minimum is 0`,
    );
  }
  if (itemCount < 1) {
    throw new Error(
      `scrollToIndex out of range: item length ${itemCount} but minimum is 1`,
    );
  }
  if (index >= itemCount) {
    throw new Error(
      `scrollToIndex out of range: requested index ${index} is out of 0 to ${itemCount - 1}`,
    );
  }
}

type IScrollToIndexAction = {
  index: number;
  animated: boolean;
  viewPosition: number;
  viewOffset: number;
  offsetByCellLength?: number;
};

function coveredLength(
  lengths: number[],
  cellIndex: number | undefined,
): number {
  return cellIndex === undefined
    ? EMPTY_OFFSET
    : (lengths[cellIndex] ?? EMPTY_OFFSET);
}

// Reports the failure when there is no `getItemLayout` and the target is past the last measured
// cell (RN's `VirtualizedList`), else scrolls to the resolved offset
export function resolveScrollToIndex<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  action: IScrollToIndexAction,
): IListReduceResult<ItemT> {
  const m = state.metrics;
  assertIndexInRange(action.index, inputs.getItemCount(inputs.data));

  const measuredCeiling = highestMeasuredIndex(state.measured);
  if (inputs.getItemLayout === undefined && action.index > measuredCeiling) {
    dlog(
      `VirtualizedList onScrollToIndexFailed index=${action.index} ` +
        `highestMeasured=${measuredCeiling} (no getItemLayout)`,
    );
    return {
      state,
      effects: [
        {
          kind: 'fire-scroll-to-index-failed',
          index: action.index,
          highestMeasuredFrameIndex: measuredCeiling,
          averageItemLength: m.averageLength,
        },
      ],
      changed: false,
    };
  }
  const offset = offsetForIndex({
    index: action.index,
    viewPosition: action.viewPosition,
    viewOffset:
      action.viewOffset + coveredLength(m.lengths, action.offsetByCellLength),
    count: m.count,
    offsets: m.offsets,
    lengths: m.lengths,
    viewportLength: state.viewportLength,
  });
  return scrollToEffect(state, offset, action.animated);
}

type IScrollToItemAction = {
  item: unknown;
  animated: boolean;
  viewPosition: number;
};

export function resolveScrollToItem<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  action: IScrollToItemAction,
): IListReduceResult<ItemT> {
  const m = state.metrics;
  const index = indexOfItem(inputs.data, inputs.getItem, m.count, action.item);
  if (index === NO_INDEX) {
    dlog('VirtualizedList scrollToItem: item not found');
    return { state, effects: [], changed: false };
  }
  const offset = offsetForIndex({
    index,
    viewPosition: action.viewPosition,
    viewOffset: EMPTY_OFFSET,
    count: m.count,
    offsets: m.offsets,
    lengths: m.lengths,
    viewportLength: state.viewportLength,
  });
  return scrollToEffect(state, offset, action.animated);
}

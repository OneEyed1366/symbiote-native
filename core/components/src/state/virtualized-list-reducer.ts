// The framework-agnostic list STATE MACHINE: one pure `reduceList(state, action, inputs)`
// The adapter turns a native event into an action, holds one state cell and executes the returned
// effects with its own primitives, so a windowing, edge or viewability bug is fixed once for all

import {
  commitList,
  viewabilityEffects,
  viewableDueEffects,
} from './list-commit';
import { FIRST_INDEX } from './list-constants';
import { deriveMetrics } from './list-derive';
import { keyForOf } from './list-keys';
import { isSettledLayout } from './list-metrics';
import {
  flowRelativeOffset,
  isRtlList,
  withCartesianScrollTo,
} from './list-rtl';
import type {
  IListAction,
  IListReduceResult,
  IListReducerInputs,
  IListState,
} from './list-reducer-types';
import {
  resolveScrollToIndex,
  resolveScrollToItem,
  scrollToEffect,
  scrollToEnd,
} from './list-scroll-to';
import { recordCellMove } from './virtualized-list-diagnostics';

export { createInitialListState, listEffectSignature } from './list-derive';
export type * from './list-reducer-types';

function settle<ItemT>(
  state: IListState<ItemT>,
  changed: boolean,
): IListReduceResult<ItemT> {
  return { state, effects: [], changed };
}

// The first scroll is the interaction that ungates `waitForInteraction` viewability configs
function applyScroll<ItemT>(
  state: IListState<ItemT>,
  action: { offset: number; timestamp?: number },
): IListReduceResult<ItemT> {
  const elapsed =
    state.scrollTimestamp !== undefined && state.scrollTimestamp !== 0
      ? Math.max(1, (action.timestamp ?? 0) - state.scrollTimestamp)
      : 1;
  state.scrollVelocity = (action.offset - state.scrollOffset) / elapsed;
  state.scrollTimestamp = action.timestamp;
  state.hasInteracted = true;
  state.scrollOffset = action.offset;
  state.pendingScrollUpdates = Math.max(0, state.pendingScrollUpdates - 1);
  return settle(state, true);
}

// Same settling rule as a cell measurement: the scroll host re-reports its size after every
// relayout, and a re-derive off noise in its last bits drives the same loop
function applyLayout<ItemT>(
  state: IListState<ItemT>,
  length: number,
): IListReduceResult<ItemT> {
  if (isSettledLayout(state.viewportLength, length))
    return settle(state, false);
  state.viewportLength = length;
  return settle(state, true);
}

// A nested list ignores the parent's scroll until it knows where it sits, as RN does
function applyParentScroll<ItemT>(
  state: IListState<ItemT>,
  action: { offset: number; visibleLength: number; timestamp?: number },
): IListReduceResult<ItemT> {
  if (state.nestedContentLength === 0) return settle(state, false);
  state.viewportLength = action.visibleLength;
  return applyScroll(state, {
    offset: action.offset - state.offsetFromParent,
    timestamp: action.timestamp,
  });
}

function applyParentLayout<ItemT>(
  state: IListState<ItemT>,
  action: { offsetFromParent: number; contentLength: number },
): IListReduceResult<ItemT> {
  state.offsetFromParent = action.offsetFromParent;
  state.nestedContentLength = action.contentLength;
  return settle(state, true);
}

type IMeasureAction = { index: number; length: number; offset?: number };

// An RTL cell's x counts from the left, the table counts from the right edge
function flowMeasure<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  action: IMeasureAction,
): IMeasureAction {
  if (!isRtlList(inputs) || action.offset === undefined) return action;
  return {
    ...action,
    offset: flowRelativeOffset(
      state.contentLength,
      action.offset,
      action.length,
    ),
  };
}

// RN's `_invalidateIfOrientationChanged`: lengths along another axis or direction mean nothing
function dropMeasurementsOfOtherOrientation<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): void {
  const isRtl = inputs.rtl === true;
  const known = state.measuredOrientation;
  if (known.horizontal === inputs.horizontal && known.rtl === isRtl) return;
  state.measuredOrientation = { horizontal: inputs.horizontal, rtl: isRtl };
  state.measured.clear();
  state.measuredOffsets.clear();
  state.measuredKeys.clear();
  state.staleMeasured.clear();
  state.highestMeasuredIndex = FIRST_INDEX;
  state.measureVersion += 1;
}

// Each half is stored only if IT moved, so a cell that slid without resizing keeps its length
// A settled re-report bails WITHOUT storing: byte-identical values stop the spacer moving
function applyMeasure<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  action: IMeasureAction,
): IListReduceResult<ItemT> {
  // A fixed `getItemLayout` owns cell sizes, so a measured length is ignored
  if (inputs.getItemLayout !== undefined) return settle(state, false);
  // A reading taken for another key is no reading, the cell now at this index is measured anew
  const wasStale = state.staleMeasured.delete(action.index);
  state.measuredKeys.set(action.index, keyForOf(inputs)(action.index));
  state.highestMeasuredIndex = Math.max(
    state.highestMeasuredIndex,
    action.index,
  );
  const knownLength = wasStale ? undefined : state.measured.get(action.index);
  const knownOffset = wasStale
    ? undefined
    : state.measuredOffsets.get(action.index);
  const isLengthSettled = isSettledLayout(knownLength, action.length);
  const isOffsetSettled =
    action.offset === undefined || isSettledLayout(knownOffset, action.offset);
  if (isLengthSettled && isOffsetSettled) return settle(state, false);

  if (!isLengthSettled) {
    if (knownLength !== undefined) {
      recordCellMove('sized', action.index, knownLength, action.length);
    }
    state.measured.set(action.index, action.length);
    state.measureVersion += 1;
  }
  if (action.offset !== undefined && !isOffsetSettled) {
    if (knownOffset !== undefined) {
      recordCellMove('moved', action.index, knownOffset, action.offset);
    }
    state.measuredOffsets.set(action.index, action.offset);
    state.measureVersion += 1;
  }
  return settle(state, true);
}

// The flag flip lands BEFORE the pass, `computeViewableSet` reads it to decide who is still gated
function recordInteraction<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListReduceResult<ItemT> {
  state.hasInteracted = true;
  return {
    state,
    effects: viewabilityEffects(state, inputs),
    changed: false,
  };
}

// Scalar transitions never recompute the window, derivation runs once per render in
// `refresh-metrics`, or `committedWindow` would advance twice per frame
export function reduceList<ItemT>(
  state: IListState<ItemT>,
  action: IListAction<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListReduceResult<ItemT> {
  const result = reduceAction(state, action, inputs);
  return isRtlList(inputs) ? withCartesianScrollTo(result, action) : result;
}

function reduceAction<ItemT>(
  state: IListState<ItemT>,
  action: IListAction<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListReduceResult<ItemT> {
  switch (action.kind) {
    case 'scroll':
      return applyScroll(state, action);
    case 'layout':
      return applyLayout(state, action.length);
    case 'content-size':
      dropMeasurementsOfOtherOrientation(state, inputs);
      state.contentLength = action.length;
      return settle(state, true);
    case 'parent-scroll':
      return applyParentScroll(state, action);
    case 'parent-layout':
      return applyParentLayout(state, action);
    case 'measure':
      dropMeasurementsOfOtherOrientation(state, inputs);
      return applyMeasure(state, inputs, flowMeasure(state, inputs, action));
    case 'batch-tick':
      // The refill timer fired, the render it asks for grows the window one step
      state.isBatchDue = true;
      return settle(state, true);
    case 'refresh-metrics':
      return settle(deriveMetrics(state, inputs), true);
    case 'record-interaction':
      return recordInteraction(state, inputs);
    case 'cell-focused':
      state.focusedCell = {
        index: action.index,
        key: keyForOf(inputs)(action.index),
      };
      return settle(state, true);
    case 'viewable-due':
      return {
        state,
        effects: viewableDueEffects(state, inputs, action),
        changed: false,
      };
    case 'commit':
      return commitList(state, inputs);
    default:
      return reduceImperativeScroll(state, action, inputs);
  }
}

// The imperative scroll family, kept apart so `reduceList` stays one line per kind
function reduceImperativeScroll<ItemT>(
  state: IListState<ItemT>,
  action: Extract<
    IListAction<ItemT>,
    {
      kind:
        | 'scroll-to-offset'
        | 'scroll-to-index'
        | 'scroll-to-item'
        | 'scroll-to-end';
    }
  >,
  inputs: IListReducerInputs<ItemT>,
): IListReduceResult<ItemT> {
  switch (action.kind) {
    case 'scroll-to-offset':
      return scrollToEffect(state, action.offset, action.animated);
    case 'scroll-to-index':
      return resolveScrollToIndex(state, inputs, action);
    case 'scroll-to-item':
      return resolveScrollToItem(state, inputs, action);
    case 'scroll-to-end':
      return scrollToEnd(state, action.animated);
  }
}

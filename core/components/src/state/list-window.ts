// The render window of a list, RN's `_adjustCellsAroundViewport` over our offset table

import {
  DEFAULT_WINDOWING_THRESHOLD,
  EMPTY_OFFSET,
  FAST_SCROLL_VELOCITY,
  FIRST_INDEX,
  NO_INDEX,
} from './list-constants';
import { keyForOf } from './list-keys';
import { initialRenderRegion } from './list-metrics';
import type { IListReducerInputs, IListState } from './list-reducer-types';
import {
  computeWindowedRenderLimits,
  type IRenderRange,
  type IWindowParams,
} from './virtualize-utils';

type IOffsetTable = { offsets: number[]; lengths: number[]; total: number };

export type IDerivedWindow = {
  window: IRenderRange;
  // Where the window settles once every batch has landed
  target: IRenderRange;
  // The window first, then the initial render kept mounted for scroll-to-top
  regions: IRenderRange[];
};

const EMPTY_WINDOW: IRenderRange = { first: FIRST_INDEX, last: NO_INDEX };

// A shorter list can leave the window past its end, the batch size keeps it from collapsing
function constrainToCount(
  window: IRenderRange,
  count: number,
  maxToRenderPerBatch: number,
): IRenderRange {
  const lastPossible = count - 1;
  const maxFirst = Math.max(FIRST_INDEX, lastPossible - maxToRenderPerBatch);
  return {
    first: Math.min(Math.max(FIRST_INDEX, window.first), maxFirst),
    last: Math.min(lastPossible, window.last),
  };
}

function previousWindow<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  count: number,
): IRenderRange {
  if (!state.isWindowSeeded) {
    return initialRenderRegion(
      count,
      inputs.initialScrollIndex,
      inputs.initialNumToRender,
    );
  }
  // RN re-constrains only when the item count changed
  return state.metrics.count === count
    ? state.committedWindow
    : constrainToCount(
        state.committedWindow,
        count,
        inputs.maxToRenderPerBatch,
      );
}

function windowParams<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  count: number,
  table: IOffsetTable,
): IWindowParams {
  return {
    metrics: {
      itemCount: count,
      getCellMetricsApprox: index => ({
        offset: table.offsets[index],
        length: table.lengths[index],
      }),
    },
    maxToRenderPerBatch: inputs.maxToRenderPerBatch,
    windowSize: inputs.windowSize,
    prev: previousWindow(state, inputs, count),
    scroll: {
      offset: state.scrollOffset,
      velocity: state.scrollVelocity,
      visibleLength: state.viewportLength,
    },
  };
}

// RN trusts `initialNumToRender` until the scroll view reports a viewport and the content a length
function isMeasured(
  state: { viewportLength: number },
  table: IOffsetTable,
): boolean {
  return state.viewportLength > EMPTY_OFFSET && table.total > EMPTY_OFFSET;
}

// A pending scroll update means the scroll metrics are stale and RN keeps the window as it is,
// except with virtualization off, where that branch never looks at the pending count
function isScrollCurrent<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): boolean {
  return (
    state.pendingScrollUpdates === EMPTY_OFFSET ||
    inputs.disableVirtualization === true
  );
}

export function isOpeningPastStart<ItemT>(
  inputs: IListReducerInputs<ItemT>,
): boolean {
  return (
    inputs.initialScrollIndex !== undefined && inputs.initialScrollIndex > 0
  );
}

// The initial render stays mounted as the "scroll-to-top" optimization, unless the list starts
// somewhere else
function retainedRegions<ItemT>(
  inputs: IListReducerInputs<ItemT>,
  count: number,
): IRenderRange[] {
  return isOpeningPastStart(inputs)
    ? []
    : [
        initialRenderRegion(
          count,
          inputs.initialScrollIndex,
          inputs.initialNumToRender,
        ),
      ];
}

// A viewport of cells either side of the last focused one stays mounted, so tabbing around it
// never blanks, RN gives up when the data moved that key to another index
function focusRegions<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  count: number,
  lengths: number[],
): IRenderRange[] {
  const focused = state.focusedCell;
  if (focused === null || focused.index >= count) return [];
  if (keyForOf(inputs)(focused.index) !== focused.key) return [];
  let first = focused.index;
  for (
    let covered = 0;
    first > FIRST_INDEX && covered < state.viewportLength;
  ) {
    first -= 1;
    covered += lengths[first];
  }
  let last = focused.index;
  for (let covered = 0; last < count - 1 && covered < state.viewportLength;) {
    last += 1;
    covered += lengths[last];
  }
  return [{ first, last }];
}

function scrollingThreshold(
  threshold: number | undefined,
  visibleLength: number,
): number {
  return ((threshold ?? DEFAULT_WINDOWING_THRESHOLD) * visibleLength) / 2;
}

// RN's `_shouldRenderWithPriority`: blank is showing or about to at speed, so no waiting for a tick
function isFillUrgent<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  count: number,
  table: IOffsetTable,
): boolean {
  const { first, last } = state.committedWindow;
  const { scrollOffset, scrollVelocity, viewportLength } = state;
  if (first > FIRST_INDEX) {
    const distTop = scrollOffset - table.offsets[first];
    const reach = scrollingThreshold(
      inputs.onStartReachedThreshold,
      viewportLength,
    );
    if (
      distTop < 0 ||
      (scrollVelocity < -FAST_SCROLL_VELOCITY && distTop < reach)
    )
      return true;
  }
  if (last < FIRST_INDEX || last >= count - 1) return false;
  const distBottom = table.offsets[last] - (scrollOffset + viewportLength);
  const reach = scrollingThreshold(
    inputs.onEndReachedThreshold,
    viewportLength,
  );
  return (
    distBottom < 0 ||
    (scrollVelocity > FAST_SCROLL_VELOCITY && distBottom < reach)
  );
}

// Only a due batch or an urgent fill grows the window, the rest holds it (RN schedules a timer)
function mayGrow<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  count: number,
  table: IOffsetTable,
): boolean {
  return state.isBatchDue || isFillUrgent(state, inputs, count, table);
}

// Child lists get to render before the parent mounts cells past theirs, otherwise several child
// lists mount and unmount their items in turn
function holdForChildren<ItemT>(
  window: IRenderRange,
  inputs: IListReducerInputs<ItemT>,
): IRenderRange {
  const held = inputs.findFirstChildWithMore?.(window.first, window.last);
  return held === null || held === undefined
    ? window
    : { first: window.first, last: held };
}

// RN's `disableVirtualization` branch: the window stays anchored at the top, only the end moves
function unvirtualizedLimits<ItemT>(
  params: IWindowParams,
  inputs: IListReducerInputs<ItemT>,
  count: number,
  table: IOffsetTable,
): IRenderRange {
  const { prev, scroll, maxToRenderPerBatch } = params;
  const threshold = inputs.onEndReachedThreshold ?? DEFAULT_WINDOWING_THRESHOLD;
  const distanceFromEnd = table.total - scroll.visibleLength - scroll.offset;
  const renderAhead =
    distanceFromEnd < threshold * scroll.visibleLength
      ? maxToRenderPerBatch
      : EMPTY_OFFSET;
  return {
    first: FIRST_INDEX,
    last: Math.min(prev.last + renderAhead, count - 1),
  };
}

function limitsFor<ItemT>(
  params: IWindowParams,
  inputs: IListReducerInputs<ItemT>,
  count: number,
  table: IOffsetTable,
): IRenderRange {
  return inputs.disableVirtualization === true
    ? unvirtualizedLimits(params, inputs, count, table)
    : computeWindowedRenderLimits(params);
}

export function deriveWindow<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  count: number,
  table: IOffsetTable,
): IDerivedWindow {
  if (count === EMPTY_OFFSET) {
    return {
      window: EMPTY_WINDOW,
      target: EMPTY_WINDOW,
      regions: [EMPTY_WINDOW],
    };
  }
  const params = windowParams(state, inputs, count, table);
  const isTrusted = isMeasured(state, table) && isScrollCurrent(state, inputs);
  const window =
    isTrusted && mayGrow(state, inputs, count, table)
      ? holdForChildren(limitsFor(params, inputs, count, table), inputs)
      : params.prev;
  const target = isTrusted
    ? holdForChildren(
        limitsFor(
          { ...params, prev: window, maxToRenderPerBatch: count },
          inputs,
          count,
          table,
        ),
        inputs,
      )
    : window;
  return {
    window,
    target,
    regions: [
      window,
      ...retainedRegions(inputs, count),
      ...focusRegions(state, inputs, count, table.lengths),
    ],
  };
}

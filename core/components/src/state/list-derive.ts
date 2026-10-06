// Initial list state and the derived window metrics recomputed on every render

import {
  EMPTY_OFFSET,
  FIRST_INDEX,
  NO_CONTENT_LENGTH_SENT,
  NO_INDEX,
} from './list-constants';
import { keyForOf } from './list-keys';
import { trackAnchorKey } from './list-mvcp';
import {
  averageMeasuredStride,
  buildOffsets,
  resolveAverageLength,
  wrapFixedLayout,
} from './list-metrics';
import type {
  IListMetrics,
  IListReducerInputs,
  IListState,
  IOffsetsCache,
} from './list-reducer-types';
import type { ICellLayout } from './list-types';
import { deriveWindow, isOpeningPastStart } from './list-window';
import { recordListFrame } from './virtualized-list-diagnostics';

// RN's `hasMore`: the window stops short of the last item, a parent waits for such a child list
export function listHasMore<ItemT>(state: IListState<ItemT>): boolean {
  return state.metrics.last < state.metrics.count - 1;
}

export function createInitialListState<ItemT>(): IListState<ItemT> {
  return {
    scrollOffset: EMPTY_OFFSET,
    viewportLength: EMPTY_OFFSET,
    offsetFromParent: EMPTY_OFFSET,
    nestedContentLength: EMPTY_OFFSET,
    contentLength: undefined,
    measured: new Map<number, number>(),
    measuredOffsets: new Map<number, number>(),
    focusedCell: null,
    highestMeasuredIndex: FIRST_INDEX,
    measuredKeys: new Map<number, string>(),
    staleMeasured: new Set<number>(),
    measuredData: undefined,
    measureVersion: 0,
    offsetsCache: null,
    committedWindow: { first: FIRST_INDEX, last: NO_INDEX },
    isWindowSeeded: false,
    isBatchDue: false,
    scrollVelocity: EMPTY_OFFSET,
    scrollTimestamp: undefined,
    pendingScrollUpdates: EMPTY_OFFSET,
    sentEndForContentLength: NO_CONTENT_LENGTH_SENT,
    sentStartForContentLength: NO_CONTENT_LENGTH_SENT,
    lastViewable: [],
    viewableIndices: [],
    viewabilityData: undefined,
    hasInteracted: false,
    firstVisibleKey: null,
    appliedInitialScroll: false,
    metrics: {
      count: EMPTY_OFFSET,
      offsets: [],
      lengths: [],
      total: EMPTY_OFFSET,
      first: FIRST_INDEX,
      last: NO_INDEX,
      regions: [],
      target: { first: FIRST_INDEX, last: NO_INDEX },
      averageLength: EMPTY_OFFSET,
      fixedLayout: undefined,
      tailLimit: undefined,
      hasSpacers: true,
    },
  };
}

// New data can put another key under a measured index, RN then treats the cell as unmeasured
// Checked once per data identity and only over the measured indices, never the whole list
function refreshStaleMeasurements<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  count: number,
): void {
  if (state.measuredData === inputs.data) return;
  state.measuredData = inputs.data;
  const keyFor = keyForOf(inputs);
  const stale = new Set<number>();
  for (const [index, key] of state.measuredKeys) {
    if (index >= count || keyFor(index) !== key) stale.add(index);
  }
  const isSame =
    stale.size === state.staleMeasured.size &&
    [...stale].every(index => state.staleMeasured.has(index));
  if (isSame) return;
  state.staleMeasured = stale;
  state.measureVersion += 1;
}

// A cheap signature over the render-relevant state
// The adapter skips the after-commit pass when it is unchanged, so unrelated re-renders do not
// thrash the batch-fill timer, shared so the key cannot drift between adapters
export function listEffectSignature<ItemT>(state: IListState<ItemT>): string {
  const m = state.metrics;
  return `${state.scrollOffset}|${state.viewportLength}|${m.first}|${m.last}|${m.count}|${m.total}`;
}

type ITableShape = {
  count: number;
  fixedLayout: ((index: number) => ICellLayout) | undefined;
  averageLength: number;
  averageStride: number;
};

// `data` and `getItemLayout` stand in for `fixedLayout`, which is minted fresh on every call
function reusableCache<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  shape: ITableShape,
): IOffsetsCache | null {
  const cached = state.offsetsCache;
  const isReusable =
    cached !== null &&
    cached.count === shape.count &&
    cached.data === inputs.data &&
    cached.getItemLayout === inputs.getItemLayout &&
    cached.averageLength === shape.averageLength &&
    cached.averageStride === shape.averageStride &&
    cached.measureVersion === state.measureVersion;
  return isReusable ? cached : null;
}

function offsetTableFor<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  shape: ITableShape,
): { offsets: number[]; lengths: number[]; total: number } {
  const cached = reusableCache(state, inputs, shape);
  if (cached !== null) return cached;
  const table = buildOffsets({
    count: shape.count,
    measured: state.measured,
    measuredOffsets: state.measuredOffsets,
    staleIndices: state.staleMeasured,
    fixedLayout: shape.fixedLayout,
    averageLength: shape.averageLength,
    averageStride: shape.averageStride,
  });
  state.offsetsCache = {
    count: shape.count,
    data: inputs.data,
    getItemLayout: inputs.getItemLayout,
    averageLength: shape.averageLength,
    averageStride: shape.averageStride,
    measureVersion: state.measureVersion,
    ...table,
  };
  return table;
}

// The two spacers by the same region formula `buildListPlan` uses, minus its sticky branch
function frameExtents(m: IListMetrics): { leading: number; trailing: number } {
  const { offsets, lengths, first, last, count, total } = m;
  return {
    leading:
      first > FIRST_INDEX
        ? offsets[first - 1] + lengths[first - 1] - offsets[FIRST_INDEX]
        : EMPTY_OFFSET,
    trailing: last < count - 1 ? total - offsets[last + 1] : EMPTY_OFFSET,
  };
}

function recordFrame<ItemT>(
  state: IListState<ItemT>,
  averageStride: number,
): void {
  const m = state.metrics;
  recordListFrame(() => ({
    scrollOffset: state.scrollOffset,
    viewportLength: state.viewportLength,
    first: m.first,
    last: m.last,
    targetFirst: m.target.first,
    targetLast: m.target.last,
    count: m.count,
    measuredCount: state.measured.size,
    averageLength: m.averageLength,
    averageStride,
    firstOffset: m.offsets[m.first] ?? EMPTY_OFFSET,
    firstRaw: state.measuredOffsets.get(m.first),
    total: m.total,
    leadingExtent: frameExtents(m).leading,
    trailingExtent: frameExtents(m).trailing,
  }));
}

// Recomputes the window metrics off the current state and inputs
// Owns the `committedWindow`, plain state grown one batch step at a time, so it triggers no
// reactivity loop
export function deriveMetrics<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListState<ItemT> {
  const count = inputs.getItemCount(inputs.data);
  refreshStaleMeasurements(state, inputs, count);
  const fixedLayout = wrapFixedLayout(inputs.data, inputs.getItemLayout);
  const averageLength = resolveAverageLength(
    fixedLayout,
    count,
    state.measured,
  );
  const averageStride = averageMeasuredStride(
    state.measuredOffsets,
    averageLength,
  );
  const table = offsetTableFor(state, inputs, {
    count,
    fixedLayout,
    averageLength,
    averageStride,
  });
  const { offsets, lengths, total } = table;
  if (!state.isWindowSeeded && isOpeningPastStart(inputs)) {
    state.pendingScrollUpdates = 1;
  }
  trackAnchorKey(state, inputs, count);
  const { window, target, regions } = deriveWindow(state, inputs, count, table);
  state.committedWindow = window;
  state.isWindowSeeded = true;
  state.isBatchDue = false;
  state.metrics = {
    count,
    offsets,
    lengths,
    total,
    first: window.first,
    last: window.last,
    regions,
    target,
    averageLength,
    fixedLayout,
    tailLimit:
      fixedLayout === undefined ? state.highestMeasuredIndex : undefined,
    hasSpacers: inputs.disableVirtualization !== true,
  };
  recordFrame(state, averageStride);
  return state;
}

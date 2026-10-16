// The after-render pass: refill, edge-reached, viewability and initial scroll effects

import { dlog } from '@symbiote-native/engine';
import { EMPTY_OFFSET, FIRST_INDEX } from './list-constants';
import {
  computeEndReached,
  computeStartReached,
  decideEdgeReached,
  offsetForEnd,
} from './list-edges';
import { resolveItemKey } from './list-keys';
import { offsetForIndex } from './list-metrics';
import type {
  IListEffect,
  IListReduceResult,
  IListReducerInputs,
  IListState,
} from './list-reducer-types';
import {
  computeViewableSet,
  diffViewable,
  maxMinimumViewTime,
  type IViewToken,
} from './list-viewability';

function tokenAt<ItemT>(
  inputs: IListReducerInputs<ItemT>,
  index: number,
): IViewToken<ItemT> {
  const item = inputs.getItem(inputs.data, index);
  return {
    item,
    key: resolveItemKey(item, index, inputs.keyExtractor),
    index,
    isViewable: true,
  };
}

// RN's `_onUpdateSync`: the report is what changed against the last one this pair made
function reportPair<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  pairIndex: number,
  indices: number[],
): IListEffect<ItemT>[] {
  const tokens = indices.map(index => tokenAt(inputs, index));
  const map = new Map(tokens.map(token => [token.key, token]));
  const diff = diffViewable(
    state.lastViewable[pairIndex] ?? new Map(),
    map,
    tokens,
  );
  if (!diff.hasChanged) return [];
  state.lastViewable[pairIndex] = map;
  dlog(
    `VirtualizedList pair ${pairIndex} viewable=${tokens.length} changed=${diff.changed.length}`,
  );
  return [
    {
      kind: 'fire-viewable',
      pairIndex,
      info: {
        viewableItems: tokens,
        changed: diff.changed,
        viewabilityConfig: inputs.viewabilityPairs[pairIndex].viewabilityConfig,
      },
    },
  ];
}

function hasSameIndices(left: number[], right: number[]): boolean {
  return (
    left.length === right.length &&
    left.every((index, position) => index === right[position])
  );
}

// RN keeps a `ViewabilityHelper` per config, so each pair sees only the cells its config accepts
function pairViewableEffect<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  pairIndex: number,
): IListEffect<ItemT>[] {
  const m = state.metrics;
  const pair = inputs.viewabilityPairs[pairIndex];
  const { tokens } = computeViewableSet<ItemT>({
    first: m.first,
    last: m.last,
    count: m.count,
    offsets: m.offsets,
    lengths: m.lengths,
    scrollOffset: state.scrollOffset,
    viewportLength: state.viewportLength,
    data: inputs.data,
    getItem: inputs.getItem,
    keyExtractor: inputs.keyExtractor,
    pairs: [pair],
    hasInteracted: state.hasInteracted,
  });
  const indices = tokens.map(token => token.index);
  // We might get a lot of scroll events where visibility doesn't change, RN skips those too
  if (hasSameIndices(state.viewableIndices[pairIndex] ?? [], indices)) {
    return [];
  }
  state.viewableIndices[pairIndex] = indices;
  const delay = maxMinimumViewTime([pair]);
  return delay > EMPTY_OFFSET
    ? [{ kind: 'schedule-viewable', pairIndex, indices, delay }]
    : reportPair(state, inputs, pairIndex, indices);
}

// A `minimumViewTime` timer came due: only the cells still viewable now are reported
export function viewableDueEffects<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  due: { pairIndex: number; indices: number[] },
): IListEffect<ItemT>[] {
  const current = state.viewableIndices[due.pairIndex] ?? [];
  const stillViewable = due.indices.filter(index => current.includes(index));
  return reportPair(state, inputs, due.pairIndex, stillViewable);
}

// Shared with `record-interaction`, which ungates `waitForInteraction` configs at once
export function viewabilityEffects<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListEffect<ItemT>[] {
  const isIdle =
    inputs.viewabilityPairs.length === EMPTY_OFFSET ||
    state.viewportLength === EMPTY_OFFSET ||
    state.metrics.count === FIRST_INDEX ||
    state.pendingScrollUpdates > EMPTY_OFFSET;
  if (isIdle) return [];
  if (state.viewabilityData !== inputs.data) {
    state.viewabilityData = inputs.data;
    state.viewableIndices = [];
  }
  return inputs.viewabilityPairs.flatMap((_pair, pairIndex) =>
    pairViewableEffect(state, inputs, pairIndex),
  );
}

// While the throttled window is short of the target, ask for another tick (RN's incremental fill)
function batchFillEffects<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListEffect<ItemT>[] {
  const { first, last, target } = state.metrics;
  const isFilled = first <= target.first && last >= target.last;
  return isFilled
    ? []
    : [{ kind: 'schedule-refill', delay: inputs.updateCellsBatchingPeriod }];
}

type ISentKey = 'sentEndForContentLength' | 'sentStartForContentLength';

// RN's `getContentLength`: header, footer and padding count, unlike the sum of the cells
// Before the first content layout the cells are all there is
function edgeContentLength<ItemT>(state: IListState<ItemT>): number {
  return state.contentLength ?? state.metrics.total;
}

// Dedupes by content length and re-arms once out of threshold, the sent length lives in `sentKey`
function shouldFireEdge<ItemT>(
  state: IListState<ItemT>,
  sentKey: ISentKey,
  edge: { withinThreshold: boolean; edgeCellRendered: boolean },
): boolean {
  const decision = decideEdgeReached({
    ...edge,
    total: edgeContentLength(state),
    sentForContentLength: state[sentKey],
  });
  state[sentKey] = decision.nextSentForContentLength;
  return decision.shouldFire;
}

// Fires only when the last cell is rendered AND within threshold
// Re-arms on scroll away from the end (RN's `_maybeCallOnEdgeReached`)
function endReachedEffects<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListEffect<ItemT>[] {
  const m = state.metrics;
  if (
    !inputs.onEndReachedActive ||
    state.viewportLength <= EMPTY_OFFSET ||
    state.pendingScrollUpdates > EMPTY_OFFSET
  ) {
    return [];
  }
  const { distanceFromEnd, withinThreshold } = computeEndReached(
    edgeContentLength(state),
    state.scrollOffset,
    state.viewportLength,
    inputs.onEndReachedThreshold,
  );
  const isEdgeCellRendered = m.last === m.count - 1;
  const shouldFire = shouldFireEdge(state, 'sentEndForContentLength', {
    withinThreshold,
    edgeCellRendered: isEdgeCellRendered,
  });
  if (!shouldFire) return [];
  dlog(
    `VirtualizedList onEndReached distanceFromEnd=${distanceFromEnd} ` +
      `(last=${m.last} of ${m.count}, contentLength=${m.total})`,
  );
  return [{ kind: 'fire-end-reached', distanceFromEnd }];
}

// The top-edge twin of `endReachedEffects`
function startReachedEffects<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListEffect<ItemT>[] {
  const m = state.metrics;
  if (
    !inputs.onStartReachedActive ||
    state.viewportLength <= EMPTY_OFFSET ||
    state.pendingScrollUpdates > EMPTY_OFFSET
  ) {
    return [];
  }
  const { distanceFromStart, withinThreshold } = computeStartReached(
    state.scrollOffset,
    state.viewportLength,
    inputs.onStartReachedThreshold,
  );
  const isEdgeCellRendered = m.first === FIRST_INDEX;
  const shouldFire = shouldFireEdge(state, 'sentStartForContentLength', {
    withinThreshold,
    edgeCellRendered: isEdgeCellRendered,
  });
  if (!shouldFire) return [];
  dlog(
    `VirtualizedList onStartReached distanceFromStart=${distanceFromStart} ` +
      `(first=${m.first}, contentLength=${m.total})`,
  );
  return [{ kind: 'fire-start-reached', distanceFromStart }];
}

// Once the first viewport is known, jump to `initialScrollIndex` a single time
// The jump is instant, RN does not animate it
function initialScrollEffects<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListEffect<ItemT>[] {
  const m = state.metrics;
  const target = inputs.initialScrollIndex;
  if (target === undefined) return [];
  const isNotDue =
    state.appliedInitialScroll ||
    state.viewportLength <= EMPTY_OFFSET ||
    m.count === FIRST_INDEX;
  if (isNotDue) return [];
  state.appliedInitialScroll = true;
  // RN scrolls only for a positive index, and an index past the data goes to the end instead
  if (target <= FIRST_INDEX) return [];
  const offset =
    target >= m.count
      ? offsetForEnd(m.total, state.viewportLength)
      : offsetForIndex({
          index: target,
          viewPosition: FIRST_INDEX,
          viewOffset: EMPTY_OFFSET,
          count: m.count,
          offsets: m.offsets,
          lengths: m.lengths,
          viewportLength: state.viewportLength,
        });
  // A jump onto the offset the list already has sends no scroll event to release the hold
  if (offset === state.scrollOffset) state.pendingScrollUpdates = EMPTY_OFFSET;
  return [{ kind: 'scroll-to', offset, animated: false }];
}

export function commitList<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListReduceResult<ItemT> {
  const effects = [
    ...batchFillEffects(state, inputs),
    ...endReachedEffects(state, inputs),
    ...startReachedEffects(state, inputs),
    ...viewabilityEffects(state, inputs),
    ...initialScrollEffects(state, inputs),
  ];
  return { state, effects, changed: false };
}

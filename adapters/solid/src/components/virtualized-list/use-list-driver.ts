// The list's lifecycle: one folded state cell, native events turned into reducer actions, and the
// returned effects run with Solid primitives

import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
  type Accessor,
} from 'solid-js';
import {
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_WINDOW_SIZE,
  LIST_ACTION_KIND,
  buildListHandle,
  buildListReducerInputs,
  buildScrollViewHandle,
  buildViewabilityPairs,
  clearTimers,
  createInitialListState,
  listEffectSignature,
  reduceList,
  runListEffects,
  scrollTargetOf,
  type IEffectHost,
  type IListAction,
  type IListMetrics,
  type IListReducerInputs,
  type IListState,
  type IScrollViewHandle,
  type ITimerSlot,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import {
  dlog,
  getNativeTag,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type { IVirtualizedListProps } from './virtualized-list-props';

type ICommandedOffset = { x: number; y: number };

export type IListDriver<ItemT> = {
  metrics: Accessor<IListMetrics>;
  dispatch: (action: IListAction<ItemT>) => void;
  handle: IVirtualizedListHandle;
  // The count of the last derive, read untracked by the separator bookkeeping
  currentCount: () => number;
  // The folded state and the node the list renders, read by the nesting controller
  getState: () => IListState<ItemT>;
  getHostNode: () => ISymbioteNode | null;
  setHostNode: (node: ISymbioteNode | null) => void;
  commandedOffset: Accessor<ICommandedOffset | undefined>;
  clearCommandedOffset: () => void;
};

function viewabilityPairsOf<ItemT>(props: IVirtualizedListProps<ItemT>) {
  return buildViewabilityPairs(
    props.onViewableItemsChanged,
    props.viewabilityConfig,
    props.viewabilityConfigCallbackPairs,
  );
}

type IFindFirstChildWithMore =
  IListReducerInputs<unknown>['findFirstChildWithMore'];

function reducerInputsOf<ItemT>(
  props: IVirtualizedListProps<ItemT>,
  findFirstChildWithMore: IFindFirstChildWithMore,
): IListReducerInputs<ItemT> {
  return buildListReducerInputs(
    {
      findFirstChildWithMore,
      data: props.data,
      getItem: props.getItem,
      getItemCount: props.getItemCount,
      keyExtractor: props.keyExtractor,
      getItemLayout: props.getItemLayout,
      horizontal: props.horizontal === true,
      windowSize: props.windowSize ?? DEFAULT_WINDOW_SIZE,
      disableVirtualization: props.disableVirtualization,
      initialNumToRender:
        props.initialNumToRender ?? DEFAULT_INITIAL_NUM_TO_RENDER,
      maxToRenderPerBatch:
        props.maxToRenderPerBatch ?? DEFAULT_MAX_TO_RENDER_PER_BATCH,
      updateCellsBatchingPeriod:
        props.updateCellsBatchingPeriod ?? DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
      onEndReachedThreshold: props.onEndReachedThreshold,
      onStartReachedThreshold: props.onStartReachedThreshold,
      maintainVisibleContentPosition: props.maintainVisibleContentPosition,
      initialScrollIndex: props.initialScrollIndex,
      onEndReached: props.onEndReached,
      onStartReached: props.onStartReached,
    },
    viewabilityPairsOf(props),
  );
}

// The host node is held by identity in a plain variable, a store or proxy would be a different key
// than the engine's commit mirror holds and every imperative command would silently no-op
function createScrollTarget<ItemT>(props: IVirtualizedListProps<ItemT>) {
  let hostNode: ISymbioteNode | null = null;
  const scrollHandle: IScrollViewHandle = buildScrollViewHandle(() => hostNode);
  const [commandedOffset, setCommandedOffset] = createSignal<
    ICommandedOffset | undefined
  >(undefined);
  // A native `scrollTo` needs the committed Fabric tag and this adapter commits on a microtask, so
  // a scroll requested in the tick of mount rides `contentOffset` instead
  const scrollToPixel = (offset: number, animated: boolean): void => {
    const target = scrollTargetOf(offset, props.horizontal === true);
    if (hostNode !== null && getNativeTag(hostNode) !== undefined) {
      dlog(`VirtualizedList scrollTo offset=${offset} animated=${animated}`);
      setCommandedOffset(undefined);
      scrollHandle.scrollTo({ ...target, animated });
      return;
    }
    dlog(`VirtualizedList scrollTo offset=${offset} pending-commit`);
    setCommandedOffset(target);
  };
  return {
    scrollHandle,
    scrollToPixel,
    commandedOffset,
    clearCommandedOffset: () => setCommandedOffset(undefined),
    setHostNode: (node: ISymbioteNode | null): void => {
      hostNode = node;
    },
    getHostNode: () => hostNode,
  };
}

// Kept apart so the driver body reads as state, memos and effects, with the host wiring named
function effectHostOf<ItemT>(
  props: IVirtualizedListProps<ItemT>,
  scrollToPixel: IEffectHost<ItemT>['scrollToPixel'],
  getDispatch: IEffectHost<ItemT>['dispatch'],
  [viewableTimer, batchTimer]: [ITimerSlot, ITimerSlot],
): IEffectHost<ItemT> {
  return {
    callbacks: () => ({
      onEndReached: props.onEndReached,
      onStartReached: props.onStartReached,
      onScrollToIndexFailed: props.onScrollToIndexFailed,
      viewabilityPairs: viewabilityPairsOf(props),
    }),
    scrollToPixel,
    dispatch: getDispatch,
    viewableTimer,
    batchTimer,
  };
}

export function createListDriver<ItemT>(
  props: IVirtualizedListProps<ItemT>,
  findFirstChildWithMore: IFindFirstChildWithMore,
): IListDriver<ItemT> {
  const listState = createInitialListState<ItemT>();
  // Bumped on every render-relevant transition, `listState` is plain and triggers nothing itself
  const [version, setVersion] = createSignal(0);
  const target = createScrollTarget(props);
  const viewableTimer: ITimerSlot = { current: null };
  const batchTimer: ITimerSlot = { current: null };
  const host = effectHostOf(props, target.scrollToPixel, () => dispatch, [
    viewableTimer,
    batchTimer,
  ]);

  // Untracked by construction: it is reached from native events, timers and the imperative handle,
  // and reading every prop through the inputs in a tracked scope would subscribe it to all of them
  function dispatch(action: IListAction<ItemT>): void {
    untrack(() => {
      const result = reduceList(
        listState,
        action,
        reducerInputsOf(props, findFirstChildWithMore),
      );
      runListEffects(result.effects, host);
      if (result.changed) setVersion(tick => tick + 1);
    });
  }

  // The window is recomputed once per pass, deriving twice would advance the throttle twice
  const metrics = createMemo(() => {
    version();
    reduceList(
      listState,
      { kind: LIST_ACTION_KIND.refreshMetrics },
      reducerInputsOf(props, findFirstChildWithMore),
    );
    return listState.metrics;
  });
  const commitSignature = createMemo(() => {
    metrics();
    return listEffectSignature(listState);
  });
  // `on()` runs the body untracked, so the commit pass depends on the windowing signature alone
  createEffect(
    on(commitSignature, () => {
      const result = reduceList(
        listState,
        { kind: LIST_ACTION_KIND.commit },
        reducerInputsOf(props, findFirstChildWithMore),
      );
      runListEffects(result.effects, host);
    }),
  );
  onCleanup(() => clearTimers([viewableTimer, batchTimer]));

  return {
    metrics,
    dispatch,
    handle: buildListHandle({
      dispatch,
      scrollHandle: target.scrollHandle,
      getNode: target.getHostNode,
    }),
    currentCount: () => listState.metrics.count,
    getState: () => listState,
    getHostNode: target.getHostNode,
    setHostNode: target.setHostNode,
    commandedOffset: target.commandedOffset,
    clearCommandedOffset: target.clearCommandedOffset,
  };
}

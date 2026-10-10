// The list's lifecycle: one folded state cell, native events turned into reducer actions, and the
// returned effects run with React primitives

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { dlog, type ISymbioteNode } from '@symbiote-native/engine';
import {
  EMPTY_OFFSET,
  LIST_ACTION_KIND,
  buildListReducerInputs,
  buildScrollViewHandle,
  buildViewabilityPairs,
  clearTimers,
  createInitialListState,
  listEffectSignature,
  reduceList,
  runListEffects,
  type IEffectHost,
  type IListAction,
  type IListCallbacks,
  type IListReducerInputs,
  type IListState,
} from '@symbiote-native/components';
import type { IScrollViewHandle } from '../scroll-view/scroll-view-props';
import type { IListConfig } from './list-config';

export type ICommandedOffset = { x: number; y: number };

export type IScrollTarget = {
  nodeRef: RefObject<ISymbioteNode | null>;
  handle: IScrollViewHandle;
  // The offset driven imperatively before the handle attaches, pushed down as `contentOffset`
  commandedOffset: ICommandedOffset | undefined;
  clearCommandedOffset: () => void;
  scrollToPixel: (offset: number, animated: boolean) => void;
};

export type IListDriver<ItemT> = {
  state: IListState<ItemT>;
  dispatch: (action: IListAction<ItemT>) => void;
  scroll: IScrollTarget;
};

// A `ref` on the scroll tag hands back the engine node, `buildScrollViewHandle` turns it into
// RN's scroll surface, the node is null until commit
function useScrollTarget(
  axisRef: RefObject<{ horizontal: boolean }>,
): IScrollTarget {
  const nodeRef = useRef<ISymbioteNode | null>(null);
  const handle = useMemo<IScrollViewHandle>(
    () => buildScrollViewHandle(() => nodeRef.current),
    [],
  );
  const [commandedOffset, setCommandedOffset] = useState<
    ICommandedOffset | undefined
  >(undefined);
  const scrollToPixel = useCallback(
    (offset: number, animated: boolean): void => {
      const clamped = Math.max(EMPTY_OFFSET, offset);
      const horizontal = axisRef.current.horizontal;
      const target = horizontal
        ? { x: clamped, y: EMPTY_OFFSET }
        : { x: EMPTY_OFFSET, y: clamped };
      if (nodeRef.current === null) {
        dlog(
          `VirtualizedList scrollTo offset=${clamped} pending-ref (horizontal=${horizontal})`,
        );
        setCommandedOffset(target);
        return;
      }
      dlog(
        `VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${horizontal})`,
      );
      handle.scrollTo({ x: target.x, y: target.y, animated });
    },
    [handle, axisRef],
  );
  const clearCommandedOffset = useCallback(
    () => setCommandedOffset(undefined),
    [],
  );
  return {
    nodeRef,
    handle,
    commandedOffset,
    clearCommandedOffset,
    scrollToPixel,
  };
}

// The latest value of every render, read by handlers that must stay stable
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function useListState<ItemT>(): IListState<ItemT> {
  const stateRef = useRef<IListState<ItemT> | null>(null);
  return (stateRef.current ??= createInitialListState<ItemT>());
}

type IDispatchParts<ItemT> = {
  inputsRef: RefObject<IListReducerInputs<ItemT>>;
  callbacksRef: RefObject<IListCallbacks<ItemT>>;
  scrollToPixel: IScrollTarget['scrollToPixel'];
};

// Dispatch and the effect host recurse into each other (a refill or a fired debounce dispatches a
// follow-up action), so the host reaches `dispatch` through a ref
function useDispatch<ItemT>(
  state: IListState<ItemT>,
  parts: IDispatchParts<ItemT>,
): { dispatch: IListDriver<ItemT>['dispatch']; host: IEffectHost<ItemT> } {
  const { inputsRef, callbacksRef, scrollToPixel } = parts;
  const [, forceRender] = useReducer((tick: number): number => tick + 1, 0);
  const dispatchRef = useRef<(action: IListAction<ItemT>) => void>(() => {});
  const viewableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const host = useMemo<IEffectHost<ItemT>>(
    () => ({
      callbacks: () => callbacksRef.current,
      scrollToPixel,
      dispatch: () => dispatchRef.current,
      viewableTimer,
      batchTimer,
    }),
    [callbacksRef, scrollToPixel],
  );
  const dispatch = useCallback(
    (action: IListAction<ItemT>): void => {
      const result = reduceList(state, action, inputsRef.current);
      runListEffects(result.effects, host);
      if (result.changed) forceRender();
    },
    [state, inputsRef, host],
  );
  dispatchRef.current = dispatch;
  useEffect(
    () => () => clearTimers([viewableTimer, batchTimer]),
    [viewableTimer, batchTimer],
  );
  return { dispatch, host };
}

// The after-commit pass runs in a layout effect so MVCP's shift lands before paint, and only when
// the signature changed, the same dedup key every adapter shares
function useCommitPass<ItemT>(
  state: IListState<ItemT>,
  inputsRef: RefObject<IListReducerInputs<ItemT>>,
  host: IEffectHost<ItemT>,
): void {
  const commitSignature = listEffectSignature(state);
  useLayoutEffect(() => {
    const result = reduceList(
      state,
      { kind: LIST_ACTION_KIND.commit },
      inputsRef.current,
    );
    runListEffects(result.effects, host);
  }, [commitSignature, state, inputsRef, host]);
}

export function useListDriver<ItemT>(
  config: IListConfig<ItemT>,
): IListDriver<ItemT> {
  const viewabilityPairs = useMemo(
    () =>
      buildViewabilityPairs(
        config.onViewableItemsChanged,
        config.viewabilityConfig,
        config.viewabilityConfigCallbackPairs,
      ),
    [
      config.onViewableItemsChanged,
      config.viewabilityConfig,
      config.viewabilityConfigCallbackPairs,
    ],
  );
  const inputs = buildListReducerInputs(config, viewabilityPairs);
  const inputsRef = useLatest(inputs);
  const callbacksRef = useLatest<IListCallbacks<ItemT>>({
    onEndReached: config.onEndReached,
    onStartReached: config.onStartReached,
    onScrollToIndexFailed: config.onScrollToIndexFailed,
    viewabilityPairs,
  });
  const state = useListState<ItemT>();
  const scroll = useScrollTarget(inputsRef);
  const { dispatch, host } = useDispatch(state, {
    inputsRef,
    callbacksRef,
    scrollToPixel: scroll.scrollToPixel,
  });
  // The single derive per render, before anything reads the metrics
  reduceList(state, { kind: LIST_ACTION_KIND.refreshMetrics }, inputs);
  useCommitPass(state, inputsRef, host);
  return { state, dispatch, scroll };
}

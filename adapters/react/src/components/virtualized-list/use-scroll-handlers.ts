// Native scroll and layout events turned into reducer actions, and handed on to nested lists

import { useCallback } from 'react';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import {
  LIST_ACTION_KIND,
  contentSizeActionOf,
  layoutActionOf,
  measureActionOf,
  resolveItemKey,
  scrollActionOf,
  type IListNesting,
  type INestedHandlers,
} from '@symbiote-native/components';
import type { IListConfig } from './list-config';
import type { IListDriver } from './use-list-driver';

export type IScrollHandlers = INestedHandlers & {
  onViewportLayout: (event: ISymbioteEvent) => void;
  measureCell: (index: number) => (event: ISymbioteEvent) => void;
  focusCell: (index: number) => () => void;
  onContentSizeChange: (width: number, height: number) => void;
};

type IHandlerDeps<ItemT> = {
  config: IListConfig<ItemT>;
  driver: Pick<IListDriver<ItemT>, 'dispatch' | 'scroll'>;
  nesting: IListNesting<ItemT>;
};

// Each one reaches the lists nested in this one first, then the app's own handler
function useDragHandlers<ItemT>(
  deps: IHandlerDeps<ItemT>,
): Omit<INestedHandlers, 'onScroll'> {
  const { config, driver, nesting } = deps;
  const { dispatch } = driver;
  const { fanOut } = nesting;
  const {
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
  } = config;
  const recordInteraction = useCallback((): void => {
    fanOut.recordInteraction();
    dispatch({ kind: LIST_ACTION_KIND.recordInteraction });
  }, [fanOut, dispatch]);
  const onBeginDrag = useCallback(
    (event: ISymbioteEvent): void => {
      fanOut.onScrollBeginDrag(event);
      dispatch({ kind: LIST_ACTION_KIND.recordInteraction });
      onScrollBeginDrag?.(event);
    },
    [fanOut, dispatch, onScrollBeginDrag],
  );
  const onEndDrag = useCallback(
    (event: ISymbioteEvent): void => {
      fanOut.onScrollEndDrag(event);
      onScrollEndDrag?.(event);
    },
    [fanOut, onScrollEndDrag],
  );
  const onMomentumBegin = useCallback(
    (event: ISymbioteEvent): void => {
      fanOut.onMomentumScrollBegin(event);
      onMomentumScrollBegin?.(event);
    },
    [fanOut, onMomentumScrollBegin],
  );
  const onMomentumEnd = useCallback(
    (event: ISymbioteEvent): void => {
      fanOut.onMomentumScrollEnd(event);
      onMomentumScrollEnd?.(event);
    },
    [fanOut, onMomentumScrollEnd],
  );
  return {
    recordInteraction,
    onScrollBeginDrag: onBeginDrag,
    onScrollEndDrag: onEndDrag,
    onMomentumScrollBegin: onMomentumBegin,
    onMomentumScrollEnd: onMomentumEnd,
  };
}

// A nested list's viewport is the parent's, so its own scroll events carry nothing it can use
function useScrollHandler<ItemT>(
  deps: IHandlerDeps<ItemT>,
): INestedHandlers['onScroll'] {
  const { config, driver, nesting } = deps;
  const { horizontal, onScroll: userOnScroll } = config;
  const { dispatch, scroll } = driver;
  const { clearCommandedOffset } = scroll;
  return useCallback(
    (event: ISymbioteEvent): void => {
      nesting.fanOut.onScroll(event);
      const timestamp = performance.now();
      const action = nesting.isNested
        ? nesting.parentScrollAction(event, timestamp)
        : scrollActionOf<ItemT>(event, horizontal, timestamp);
      if (action === undefined) return;
      // A real user or native scroll supersedes any pending commanded offset
      clearCommandedOffset();
      dispatch(action);
      // Compose, don't clobber: the internal windowing ran first, now the user's handler
      userOnScroll?.(event);
    },
    [nesting, horizontal, userOnScroll, dispatch, clearCommandedOffset],
  );
}

// RN's `_onContentSizeChange`: the list learns its content length, then the app's own handler
function useContentSizeHandler<ItemT>(
  deps: IHandlerDeps<ItemT>,
): IScrollHandlers['onContentSizeChange'] {
  const { horizontal, onContentSizeChange: userHandler } = deps.config;
  const { dispatch } = deps.driver;
  return useCallback(
    (width: number, height: number): void => {
      dispatch(contentSizeActionOf<ItemT>(width, height, horizontal));
      userHandler?.(width, height);
    },
    [horizontal, dispatch, userHandler],
  );
}

function useLayoutHandlers<ItemT>(deps: IHandlerDeps<ItemT>): {
  onViewportLayout: IScrollHandlers['onViewportLayout'];
  measureCell: IScrollHandlers['measureCell'];
} {
  const { config, driver, nesting } = deps;
  const { horizontal, getItem, data, keyExtractor } = config;
  const { dispatch, scroll } = driver;
  const onViewportLayout = useCallback(
    (event: ISymbioteEvent): void => {
      if (nesting.isNested) {
        const node = scroll.nodeRef.current;
        if (node !== null) nesting.attachAt(node);
        nesting.child.measureLayoutRelativeToContainingList();
        return;
      }
      const action = layoutActionOf<ItemT>(event, horizontal);
      if (action !== undefined) dispatch(action);
    },
    [horizontal, dispatch, nesting, scroll.nodeRef],
  );
  const measureCell = useCallback(
    (index: number) =>
      (event: ISymbioteEvent): void => {
        const action = measureActionOf<ItemT>(event, index, horizontal);
        if (action !== undefined) dispatch(action);
        const cellKey = resolveItemKey(
          getItem(data, index),
          index,
          keyExtractor,
        );
        nesting.scope.registerCellNode(event.currentTarget, cellKey);
        nesting.remeasureCell(cellKey);
      },
    [horizontal, dispatch, nesting, getItem, data, keyExtractor],
  );
  return { onViewportLayout, measureCell };
}

export function useScrollHandlers<ItemT>(
  deps: IHandlerDeps<ItemT>,
): IScrollHandlers {
  const { dispatch } = deps.driver;
  const onScroll = useScrollHandler(deps);
  const focusCell = useCallback(
    (index: number) => (): void =>
      dispatch({ kind: LIST_ACTION_KIND.cellFocused, index }),
    [dispatch],
  );
  return {
    onScroll,
    focusCell,
    onContentSizeChange: useContentSizeHandler(deps),
    ...useDragHandlers(deps),
    ...useLayoutHandlers(deps),
  };
}

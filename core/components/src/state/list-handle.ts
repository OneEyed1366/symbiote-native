// The list's imperative surface, the scroll family is resolved by the reducer
// Shared by every adapter, each supplies its dispatch and the scroll node

import type { ISymbioteNode } from '@symbiote-native/engine';
import type { IScrollViewHandle } from '../scroll-view-commands';
import { EMPTY_OFFSET, FIRST_INDEX } from './list-constants';
import { LIST_ACTION_KIND } from './list-kinds';
import type { IListAction } from './list-reducer-types';
import type { IVirtualizedListHandle } from './list-types';

export type IHandleParts<ItemT> = {
  dispatch: (action: IListAction<ItemT>) => void;
  scrollHandle: IScrollViewHandle;
  getNode: () => ISymbioteNode | null;
};

// RN animates every imperative scroll unless the caller passes `animated: false`
// Each resolves to an offset, or a scroll-to-index failure, inside the reducer
export function buildListHandle<ItemT>(
  parts: IHandleParts<ItemT>,
): IVirtualizedListHandle {
  const { dispatch, scrollHandle, getNode } = parts;
  // Null until the tag commits, so these keep RN's "no scroll view yet" answer
  const handleOrNull = (): IScrollViewHandle | null =>
    getNode() === null ? null : scrollHandle;
  return {
    scrollToOffset: params => {
      dispatch({
        kind: LIST_ACTION_KIND.scrollToOffset,
        offset: params.offset,
        animated: params.animated ?? true,
      });
    },
    scrollToIndex: params => {
      dispatch({
        kind: LIST_ACTION_KIND.scrollToIndex,
        index: params.index,
        animated: params.animated ?? true,
        viewPosition: params.viewPosition ?? FIRST_INDEX,
        viewOffset: params.viewOffset ?? EMPTY_OFFSET,
        offsetByCellLength: params.offsetByCellLength,
      });
    },
    scrollToItem: params => {
      dispatch({
        kind: LIST_ACTION_KIND.scrollToItem,
        item: params.item,
        animated: params.animated ?? true,
        viewPosition: params.viewPosition ?? FIRST_INDEX,
      });
    },
    scrollToEnd: params => {
      dispatch({
        kind: LIST_ACTION_KIND.scrollToEnd,
        animated: params?.animated ?? true,
      });
    },
    flashScrollIndicators: () => {
      scrollHandle.flashScrollIndicators?.();
    },
    getNativeScrollRef: getNode,
    getScrollableNode: handleOrNull,
    getScrollResponder: handleOrNull,
    getScrollNode: getNode,
    getScrollRef: getNode,
    // RN's `recordInteraction`: flips the flag so `waitForInteraction` configs start reporting
    recordInteraction: () => {
      dispatch({ kind: LIST_ACTION_KIND.recordInteraction });
    },
    setNativeProps: props => {
      getNode()?.setNativeProps(props);
    },
  };
}

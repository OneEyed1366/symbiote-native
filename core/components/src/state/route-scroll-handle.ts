// Forwards the whole inner-scroll tail to whichever inner list is mounted right now
// A handle that adds behavior on top of the tail spreads this and defines its own members

import type { ISymbioteNode } from '@symbiote-native/engine';
import type { IScrollViewHandle } from '../scroll-view-commands';
import type { IScrollRoutingHandle } from './scroll-routing-handle';

export function routeScrollHandle(
  getInner: () => IScrollRoutingHandle | null | undefined,
): IScrollRoutingHandle {
  return {
    flashScrollIndicators: (): void => {
      getInner()?.flashScrollIndicators();
    },
    getNativeScrollRef: (): IScrollViewHandle | null =>
      getInner()?.getNativeScrollRef() ?? null,
    getScrollableNode: (): IScrollViewHandle | null =>
      getInner()?.getScrollableNode() ?? null,
    getScrollResponder: (): IScrollViewHandle | null =>
      getInner()?.getScrollResponder() ?? null,
    getScrollNode: (): ISymbioteNode | null =>
      getInner()?.getScrollNode() ?? null,
    getScrollRef: (): ISymbioteNode | null =>
      getInner()?.getScrollRef() ?? null,
    recordInteraction: (): void => {
      getInner()?.recordInteraction();
    },
    setNativeProps: (props: Record<string, unknown>): void => {
      getInner()?.setNativeProps(props);
    },
  };
}

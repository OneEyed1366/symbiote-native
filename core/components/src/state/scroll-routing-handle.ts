// The inner-scroll routing tail every windowed-list imperative handle exposes
// (VirtualizedList, VirtualizedSectionList, and via those FlatList/SectionList). Each
// method forwards straight to the underlying ScrollView's own handle/node; neither list
// adds behavior of its own, so the 6 members live here once and both list handle types
// extend this instead of hand-duplicating (and risking drift in) the signatures.

import type { ISymbioteNode } from '@symbiote-native/engine';
import type { IScrollViewHandle } from '../scroll-view-commands';

export type IScrollRoutingHandle = {
  flashScrollIndicators(): void;
  // The host ref of the scroll, so it measures itself, `getScrollableNode` and
  // `getScrollResponder` stay the scroll handle: there is no node handle or component instance
  getNativeScrollRef(): ISymbioteNode | null;
  getScrollableNode(): IScrollViewHandle | null;
  getScrollResponder(): IScrollViewHandle | null;
  getScrollNode(): ISymbioteNode | null;
  // The node the list scrolls by, or the host view of a nested list: both answer `scrollTo` and
  // `measure*`, as RN's `getScrollRef()` answers a ScrollView or a View
  getScrollRef(): ISymbioteNode | null;
  recordInteraction(): void;
  // RN forwards it to the scroll view, so a list writes the props straight onto the scroll node
  setNativeProps(props: Record<string, unknown>): void;
};

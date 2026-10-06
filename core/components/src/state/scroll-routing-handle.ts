// The inner-scroll routing tail every windowed-list imperative handle exposes
// (VirtualizedList, VirtualizedSectionList, and via those FlatList/SectionList). Each
// method forwards straight to the underlying ScrollView's own handle/node; neither list
// adds behavior of its own, so the 6 members live here once and both list handle types
// extend this instead of hand-duplicating (and risking drift in) the signatures.

import type { ISymbioteNode } from '@symbiote-native/engine';
import type { IScrollViewHandle } from '../scroll-view-commands';

export type IScrollRoutingHandle = {
  flashScrollIndicators(): void;
  // These three route to the same underlying handle today (SymbioteNative has no
  // findNodeHandle/legacy-component-instance distinction), but they are NOT redundant:
  // real RN's ScrollView.js gives each a genuinely different contract: getNativeScrollRef
  // returns the native host-component ref directly (newest, preferred), getScrollableNode
  // returns findNodeHandle(getNativeScrollRef()) (a numeric node handle, historically used
  // by TextInput focus scrolling), getScrollResponder returns the ScrollView component
  // instance itself (oldest, legacy `ScrollResponderType`). Kept as three names for RN-API
  // parity - collapsing them would break any external code pattern-matching on RN's real
  // three-shape contract, even though we don't yet differentiate the return value ourselves.
  getNativeScrollRef(): IScrollViewHandle | null;
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

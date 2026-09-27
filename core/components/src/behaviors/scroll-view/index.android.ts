// ScrollView's behavior on Android, where a RefreshControl is not a child at all.

// An Android ScrollView holds exactly ONE child, so a sibling refresh control is an `addViewAt`
// crash. RN inverts the tree instead: `AndroidSwipeRefreshLayout` WRAPS the scroll view
// (`ScrollView.js:1856`) — layout style on the wrapper, visual style on the scroller.

// This file is a CLAIM MODE and nothing else: both prop folds are `SymbioteFabricProps.cpp` now —
// `foldScrollViewProps` takes the visual half when its parent is a refresh control,
// `foldRefreshWrapperProps` the layout half of the child it wraps.

// `slotDerived: ['style']` is load-bearing: the wrapper derives from a node that is not itself, so
// an owner style write must mark IT dirty (`routeProp`'s `node.wrapper` branch) or it freezes at
// its mount frame while the scroller visibly restyles (`scroll-view-wrap-payload.itest.ts`).

// Gated on TOPOLOGY, not `#ifdef ANDROID`/`Platform.OS`: iOS claims the refresh control BESIDE
// the content, so a scroll view is never one's child there and neither branch can fire.

import { registerScrollViewBehaviors, type IScrollPlatform } from './shared';

const android: IScrollPlatform = {
  claimMode: 'wrap',
  // `stickyHeaderIndices`: the content view's clipping is forced off under sticky headers on
  // Android only (`ScrollView.js:1740-1745`), so only here does it dirty the slot.
  slotDerived: ['style', 'stickyHeaderIndices'],
};

export function registerScrollViewBehavior(): void {
  registerScrollViewBehaviors(android);
}

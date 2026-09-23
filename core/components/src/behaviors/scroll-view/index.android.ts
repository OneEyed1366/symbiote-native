// ScrollView's behavior on Android, where a RefreshControl is not a child at all.
//
// An Android ScrollView holds exactly ONE child, so a sibling refresh control is an `addViewAt`
// crash rather than a layout mistake. RN inverts the tree instead: `AndroidSwipeRefreshLayout`
// WRAPS the scroll view, and the scroll view's style is split across the two boxes — layout on the
// wrapper's frame, visual on the scroller (`ScrollView.js:1856`). `nestedScrollEnabled` goes on the
// inner view so it consumes the gesture before the refresh parent sees it.
//
// THIS FILE IS A CLAIM MODE AND NOTHING ELSE NOW (2026-09-18). It carried two `payloadFold`s until
// then — the last two folds in ScrollView and the last structural blocker in the behavior
// migration — and both are `SymbioteFabricProps.cpp` now: `foldScrollViewProps` takes the visual
// half when its parent is a refresh control, and `foldRefreshWrapperProps` takes the layout half of
// the child it wraps.
//
// WHY THEY RESISTED THREE ITERATIONS, and what changed. Every seam the engine had read UP —
// `ownerProps`, `IOwner.tagName`, `IAncestorLookup` — and the wrapper is the scroll view's PARENT
// asking for the scroll view's style, the one direction none of them go. `IFirstChild` is that
// direction, and it is the same argument `ownerProps` already made rather than a new one: the tree
// lives in C++, so reading another node is a pointer hop, and RN itself builds this parent FROM its
// child (`cloneElement(refreshControl, {style: outer}, scrollView)`).
//
// `slotDerived: ['style']` STAYS AND IS NOW LOAD-BEARING FOR THE ENGINE'S RULE. A rule re-runs when
// ITS node is dirty; the wrapper derives from a node that is not itself, so an owner style write
// must mark it (`routeProp`'s `node.wrapper` branch). Without this entry the wrapper freezes at its
// mount frame while the scroller visibly restyles inside it —
// `core/engine/cpp/tests/js/scroll-view-wrap-payload.itest.ts` is the case that says so.
//
// AND NOTHING HERE IS `#ifdef ANDROID` OR `Platform.OS`, on either side: the engine's rules are
// gated on TOPOLOGY. iOS claims the refresh control BESIDE the content, so a scroll view is never
// one's child there and neither branch can fire. That is strictly better than a compile-time split
// for the reason `Switch`/`AndroidSwitch` already showed — and it is why the wrap's payload fixture
// runs on the ORDINARY test host rather than needing the Android arm.

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

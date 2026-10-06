---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`ScrollView` gains `experimental_endDraggingSensitivityMultiplier` on every adapter, treats a null `snapToInterval` / `snapToOffsets` as absent when resolving `pagingEnabled`, and lets the app's `contentContainerStyle` override the horizontal row direction, as RN's render does.

`ScrollView` gains `stickyHeaderHiddenOnScroll`: a pinned header slides out by its own height on a downward scroll and comes back as far as the scroll returns, built from `Animated.diffClamp` over the scroll delta as in RN's `ScrollViewStickyHeader`. The pin now rebuilds when the flag flips, and `FlatList`, `SectionList` and `VirtualizedList` forward the prop to their scroll view.

`onContentSizeChange` now fires on every layout of the content view, as in RN, instead of only when the size changed. The `didContentSizeChange` helper and the `IContentSize` type are gone from `@symbiote-native/components`.

A `ScrollView` ref now carries the rest of RN's imperative surface: `getScrollResponder`, `getScrollableNode`, `getNativeScrollRef`, `getInnerViewRef`, `getInnerViewNode`, `scrollResponderZoomTo` and `scrollResponderScrollNativeHandleToKeyboard`.

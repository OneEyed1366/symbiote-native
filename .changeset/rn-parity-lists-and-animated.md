---
'@symbiote-native/components': major
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`DEFAULT_END_REACHED_THRESHOLD`, `DEFAULT_START_REACHED_THRESHOLD` and `visiblePercent` are gone from
`@symbiote-native/components`. The first two were one RN default standing in for another, replaced by
`DEFAULT_EDGE_REACHED_THRESHOLD_PX`; the third split in two and neither half is the old function.

`onEndReached` fired two screens early. RN has two defaults here and we conflated them:
`onEndReachedThresholdOrDefault`'s `?? 2` is a multiple of the visible length, used for render-ahead
windowing, while the unset-case fallback deciding whether to actually FIRE is a flat 2 pixels
(`VirtualizedList.js:1567`). An app passing no threshold gets the pixel answer now.

Viewability precedence was inverted. `itemVisiblePercentThreshold` is a fraction of the CELL,
`viewAreaCoveragePercentThreshold` a fraction of the VIEWPORT, so a short cell fully on screen clears
the first easily and can fail the second. Vendor checks the area config first (`ViewabilityHelper.js`);
we checked the item config. Its `_isEntirelyVisible` shortcut comes along, and a callback shared across
several `viewabilityConfigCallbackPairs` is now told which config fired.

Both `keyExtractor` defaults were wrong: the flat one is `item.key ?? item.id ?? String(index)`
(`VirtualizeUtils.js:248`), and a section's own extractor beats the list-level one
(`VirtualizedSectionList.js:305`).

`RefreshControl` sends `setNativeRefreshing` only when `refreshing` did not change under it
(`:139-158`) - the case that exists to stop the spinner drifting out of sync with the app.

`Animated.parallel` crashed on a falsy array entry, the shape `cond && timing(...)` produces; vendor
treats it as already finished (`AnimatedImplementation.js`'s `parallelImpl`). An `AnimatedValueXY` used
straight as an `event()` mapping target worked only because the generic object walk happened to reach
`x` and `y` - deliberate now, with a test.

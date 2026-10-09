---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

A horizontal `VirtualizedList`, `FlatList`, `SectionList` and `VirtualizedSectionList` follow `I18nManager.isRTL` as RN does: offsets count from the right edge, so a scroll event at `x = 0` is the end of the data, a cell's position and an imperative scroll are converted at the native boundary, and `scrollToOffset` before the content is laid out warns and scrolls nowhere. The lists now take the scroll view's `onContentSizeChange` to learn the content length and still call the app's own handler, and `onEndReached` / `onStartReached` now measure against that real content length (a footer or padding counts), as RN does, instead of the sum of the cells.

---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/solid': patch
'@symbiote-native/svelte': patch
'@symbiote-native/angular': patch
---

`FlatList`, `SectionList` and `VirtualizedList` take `disableVirtualization`, as RN does: the window stays anchored at the first cell, grows by `maxToRenderPerBatch` once the end is within `onEndReachedThreshold`, and no spacer stands in for the cells not yet mounted.

---
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

The header, footer and empty slots of `VirtualizedList`, `FlatList` and `SectionList` follow RN on an inverted list: each wrapper carries the counter-flip, so the slot reads upright instead of upside down.

`ListHeaderComponentStyle` and `ListFooterComponentStyle` are new props on the three lists, applied to the header and footer wrapper (Vue, Svelte and Angular spell them `listHeaderComponentStyle` and `listFooterComponentStyle`).

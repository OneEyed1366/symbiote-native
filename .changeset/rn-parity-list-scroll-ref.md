---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`VirtualizedList`, `FlatList`, `SectionList` and `VirtualizedSectionList` handles gain `getScrollRef()`, RN's accessor for the node the list scrolls by. It answers the scroll view node, or the host view of a nested list that renders as a plain view, and null until the list commits.

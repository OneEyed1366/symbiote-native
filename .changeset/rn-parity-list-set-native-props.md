---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`FlatList`, `SectionList`, `VirtualizedList` and `VirtualizedSectionList` handles get RN's `setNativeProps`, which writes the props onto the list's scroll view.

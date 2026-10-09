---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`FlatList`, `SectionList`, `VirtualizedList` and `VirtualizedSectionList` take `innerViewRef` and hand it to their `ScrollView`, as RN does through `...props`. The prop is typed on every adapter, and Svelte and Angular forward it by hand.

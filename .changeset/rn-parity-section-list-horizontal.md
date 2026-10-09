---
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`SectionList` and `VirtualizedSectionList` take `horizontal` like RN's `VirtualizedListProps`. React, Vue and Solid already passed it through untyped, now it is typed there, and Svelte and Angular forward it to the inner list.

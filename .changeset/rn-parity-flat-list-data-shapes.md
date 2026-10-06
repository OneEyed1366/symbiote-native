---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`FlatList` takes `data` the way RN does: `null`, a number or an object with no length is an empty list, and any array-like object is read by index. React threw on `null` while rendering, and Vue turned an array-like into an empty list.

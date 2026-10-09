---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`ScrollView` takes RN's `innerViewRef`: a callback that receives the content view after the first commit, `null` when the scroll view goes away, and `null` then the node again when the callback is swapped.

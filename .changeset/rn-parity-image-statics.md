---
'@symbiote-native/engine': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`Image.prefetchWithMetadata(url, queryRootName, rootTag?, callback?)` is added to the Image statics, as in RN. On iOS it passes the query root and a root tag (0 when absent) to native and falls back to `prefetch` when the host lacks the call, on Android it is `prefetch` and reports the request id.

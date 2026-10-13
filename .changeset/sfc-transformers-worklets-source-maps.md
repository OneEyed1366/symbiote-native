---
'@symbiote-native/css-parser': minor
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
---

A `.vue` or `.svelte` file that holds a worklet no longer fails the build with `ENOENT`. The Metro transformers compile it under a name that is not on disk, so they now turn the worklets plugin's source maps off for it and keep the options the app set. `relabelForUpstream` is the new css-parser export that does it.

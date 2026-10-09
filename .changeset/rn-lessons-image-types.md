---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
'@symbiote-native/angular': patch
'@symbiote-native/svelte': patch
---

`Image` takes `resizeMode="none"` and `resizeMultiplier` as RN does, and an image `source` types `headers`, `method`, `body`, `cache` and `bundle`. Angular's `Animated.Image` dropped `resizeMode="none"` and `resizeMultiplier` before; `image-shared.ts` is split into the input list, the prop fold and the component base, and the fold is table-driven.

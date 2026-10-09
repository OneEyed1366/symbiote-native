---
'@symbiote-native/engine': patch
---

`Image` carries RN's defaults: `resizeMode` is `cover` unless the prop, the style or `objectFit` says otherwise (`objectFit` wins, then the prop, then the style) and the base style is `overflow: hidden`. Before, an image with no `resizeMode` fell back to the native `stretch`.

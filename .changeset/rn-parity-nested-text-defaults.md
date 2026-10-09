---
'@symbiote-native/engine': patch
---

A `<text>` nested in another `<text>` no longer gets `allowFontScaling`, `ellipsizeMode` and `accessible` defaults, as in React Native. The inner `allowFontScaling: true` used to override an outer `allowFontScaling={false}`. A pressable text now sends `isPressable` and `isHighlighted` up front.

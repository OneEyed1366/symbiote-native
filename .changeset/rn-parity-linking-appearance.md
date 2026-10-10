---
'@symbiote-native/engine': patch
---

`Linking.addEventListener` on Android no longer logs two missing-counter warnings, and `Appearance.getColorScheme()` returns `'unspecified'` after a reset when native has no system scheme, as in React Native.

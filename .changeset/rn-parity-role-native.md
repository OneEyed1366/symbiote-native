---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
---

`role` reaches the native layer as it is, the way React Native 0.86 sends it, instead of being rewritten into `accessibilityRole`. A role outside the old 28-name table (`dialog`, `tooltip`) is no longer sent as an invalid `accessibilityRole`.

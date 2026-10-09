---
'@symbiote-native/engine': patch
---

`accessibilityRole="tabbar"` no longer crashes an Android mount. The role is in RN's public union but Android's role enum has no entry for it, so stock 0.86.0 throws `Invalid accessibility role value: tabbar`. The engine drops it on Android and leaves it on iOS.

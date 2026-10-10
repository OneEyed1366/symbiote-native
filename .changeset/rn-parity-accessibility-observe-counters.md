---
'@symbiote-native/engine': patch
---

`AccessibilityInfo.addEventListener` listens on the device event bus without pinging the native module's observe counters, as React Native does; on Android that module has none, so the subscription drew two console warnings.

---
'@symbiote-native/engine': patch
---

`AccessibilityInfo` on iOS rejects like RN when the native module or getter is missing, with RN's message for each query, instead of resolving `false`. `isAccessibilityServiceEnabled` rejects on iOS, and Android `isReduceMotionEnabled` rejects with RN's text.

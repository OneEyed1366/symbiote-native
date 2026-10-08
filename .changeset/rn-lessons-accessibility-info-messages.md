---
'@symbiote-native/engine': patch
---

`AccessibilityInfo` rejects with the module names RN 0.86 uses (`NativeAccessibilityManagerIOS is not available` for `isGrayscaleEnabled` and `isInvertColorsEnabled` on iOS, `NativeAccessibilityInfoAndroid is not available` for `isReduceMotionEnabled` on Android).

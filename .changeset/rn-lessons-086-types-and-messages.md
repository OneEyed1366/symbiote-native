---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
---

`AccessibilityInfo` rejects with the module names RN 0.86 uses (`NativeAccessibilityManagerIOS is not available` for `isGrayscaleEnabled` and `isInvertColorsEnabled` on iOS, `NativeAccessibilityInfoAndroid is not available` for `isReduceMotionEnabled` on Android). `android_ripple` and `TouchableNativeFeedback.Ripple` accept any colour value, a `PlatformColor` among them, and `android_ripple` takes `alpha`.

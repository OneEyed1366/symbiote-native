---
'@symbiote-native/expo-modules-link': minor
'@symbiote-native/image': patch
'@symbiote-native/app-metrics': patch
---

`native-link.json` accepts `android.requiresKsp`. The linker then writes `kspVersion` into the app's root `android/build.gradle`, picked from Expo's KSP table for the app's Kotlin version, so `expo-image` and `expo-app-metrics` build without a hand-written line.

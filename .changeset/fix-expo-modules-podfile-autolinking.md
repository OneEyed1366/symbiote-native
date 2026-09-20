---
"@symbiote-native/cli": patch
---

Fix `pod install`/build succeeding but the Xcode build then failing on any app scaffolded (or `add`-extended) with `--expo-modules`: `'ExpoModulesCore/Platform.h' file not found`, `could not build Objective-C module 'Expo'`. `use_native_modules!` only autolinks React Native's own native modules — Expo modules need Expo's own autolinking, wired by requiring `expo/scripts/autolinking` and calling `use_expo_modules!` inside the target, which the Podfile template never did. Both `new` and `add` now wire it in, idempotently, matching the pattern `examples/expo-react`'s Podfile already carries.

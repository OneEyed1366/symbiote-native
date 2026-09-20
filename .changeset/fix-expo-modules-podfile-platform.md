---
"@symbiote-native/cli": patch
---

Fix `pod install` failing outright on any app scaffolded (or `add`-extended) with `--expo-modules`: expo's own podspec requires iOS 16.4+, but nothing raised the Podfile's `platform :ios` line past React Native's own default (15.1), so CocoaPods rejected the `Expo` pod with "required a higher minimum deployment target". Both `new` and `add` now raise it to `[min_ios_version_supported.to_f, 16.4].max.to_s` — the same fix `examples/expo-react`'s Podfile already carried — idempotently, and without lowering an already-higher version a developer set by hand.

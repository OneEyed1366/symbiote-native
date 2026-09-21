---
"@symbiote-native/cli": patch
---

Fix `xcodebuild` failing after a green `pod install` on any app scaffolded (or `add`-extended) with `--expo-modules`: `compiling for iOS 15.1, but module 'ExpoModulesCore' has a minimum deployment target of iOS 16.4`. The Podfile's `platform :ios` line only sets the deployment target CocoaPods generates for pods — the app's own `.xcodeproj` target keeps RN's default (15.1) independently. Both `new` and `add` now also raise `IPHONEOS_DEPLOYMENT_TARGET` to 16.4 in the app's `project.pbxproj`, idempotently, matching `examples/expo-react`'s project.

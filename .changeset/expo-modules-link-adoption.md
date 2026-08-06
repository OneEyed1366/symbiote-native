---
"@symbiote-native/application": patch
"@symbiote-native/battery": patch
"@symbiote-native/brightness": patch
"@symbiote-native/cellular": patch
"@symbiote-native/clipboard": patch
"@symbiote-native/crypto": patch
"@symbiote-native/device": patch
"@symbiote-native/haptics": patch
"@symbiote-native/local-auth": patch
"@symbiote-native/network": patch
"@symbiote-native/sensors": patch
---

Each package now depends on `@symbiote-native/expo-modules-link` and runs `symbiote-expo-link`
from its own `postinstall` script, driven by a new co-located `native-link.json` manifest that
declares its Android Gradle project name and native module(s). Consumers no longer need to
hand-edit `android/app/build.gradle` or `MainApplication.kt` when adding one of these packages to
an app — the native module registers itself on `npm install`. `@symbiote-native/local-auth` and
`@symbiote-native/sensors` additionally declare an `ios.infoPlistKeys` entry
(`NSFaceIDUsageDescription` and `NSMotionUsageDescription` respectively), so their `Info.plist`
usage-description string is also registered automatically, with a generic default a consumer can
freely override. No public API changed.

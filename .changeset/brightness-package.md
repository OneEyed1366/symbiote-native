---
"@symbiote-native/brightness": minor
---

Add `@symbiote-native/brightness`, a framework-agnostic wrapper around `expo-brightness` (built on
`expo-modules-core`, never the `expo` meta-package). Ships `getBrightnessAsync`/`setBrightnessAsync`,
the Android-only system-brightness surface (`getSystemBrightnessAsync`, `setSystemBrightnessAsync`,
`restoreSystemBrightnessAsync`, `isUsingSystemBrightnessAsync`, `getSystemBrightnessModeAsync`,
`setSystemBrightnessModeAsync`), the permission pair (`getPermissionsAsync`/`requestPermissionsAsync`),
and an iOS-only `addBrightnessListener`. A new `usePermissions()` hook/composable/service — shared
shape with `@symbiote-native/cellular` — auto-fetches the current permission status on mount and
exposes `get`/`request` as imperative callbacks; every other export is a stateless free function, same
as `@symbiote-native/local-auth`. Note: on the iOS Simulator, `getBrightnessAsync`/`setBrightnessAsync`
never round-trip — a documented Apple Simulator limitation of `UIScreen.main.brightness`, not a bug in
this wrapper; Android's emulator is unaffected.

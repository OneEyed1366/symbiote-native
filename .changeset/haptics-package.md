---
"@symbiote-native/haptics": minor
---

Add `@symbiote-native/haptics`, a framework-agnostic wrapper around `expo-haptics` (built on
`expo-modules-core`, never the `expo` meta-package). Ships `impactAsync`, `notificationAsync`,
`selectionAsync`, and `performAndroidHapticsAsync` — Taptic Engine feedback on iOS, the Vibrator
API on Android, with `performAndroidHapticsAsync` driving Android's device haptics engine
directly and no-opping elsewhere. Every function is a free async call with no per-instance state
or event stream, so the React, Vue, and Angular entry points are plain re-exports of the same
core, unlike the sensor family's per-adapter hooks/composables/services.

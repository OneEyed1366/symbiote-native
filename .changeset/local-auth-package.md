---
"@symbiote-native/local-auth": minor
---

Add `@symbiote-native/local-auth`, a framework-agnostic wrapper around
`expo-local-authentication` (built on `expo-modules-core`, never the `expo` meta-package).
Ships `hasHardwareAsync`, `isEnrolledAsync`, `getEnrolledLevelAsync`,
`supportedAuthenticationTypesAsync`, `authenticateAsync`, and `cancelAuthenticate` — FaceID/
TouchID on iOS, the Fingerprint/Biometric API on Android. Every function is a free async call
with no per-instance state or event stream, so the React, Vue, and Angular entry points are
plain re-exports of the same core, unlike the sensor family's per-adapter hooks/composables/
services.

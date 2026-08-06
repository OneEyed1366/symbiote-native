---
"@symbiote-native/device": minor
"@symbiote-native/application": minor
"@symbiote-native/crypto": minor
---

Add `@symbiote-native/device`, `@symbiote-native/application`, and `@symbiote-native/crypto` — three
framework-agnostic wrappers around `expo-device`, `expo-application`, and `expo-crypto` (all built on
`expo-modules-core`, never the `expo` meta-package). All three follow `@symbiote-native/local-auth`'s
shape exactly: plain constants plus one-shot async/sync functions, no listener or permission state, so
the React/Vue/Angular entry points are single-file re-exports with no hook/composable/service.

`@symbiote-native/device` ships device brand/model/OS constants (`isDevice`, `brand`, `manufacturer`,
`modelName`, `deviceType`, `osName`, `osVersion`, `totalMemory`, …) plus `getDeviceTypeAsync`,
`getUptimeAsync`, `getMaxMemoryAsync`, `isRootedExperimentalAsync`, `isSideLoadingEnabledAsync`, and the
Android feature-flag pair `getPlatformFeaturesAsync`/`hasPlatformFeatureAsync`.

`@symbiote-native/application` ships app version/build/name/ID constants plus `getAndroidId`,
`getInstallReferrerAsync`, `getIosIdForVendorAsync`, `getIosApplicationReleaseTypeAsync`,
`getIosPushNotificationServiceEnvironmentAsync`, `getInstallationTimeAsync`, and
`getLastUpdateTimeAsync`.

`@symbiote-native/crypto` ships `getRandomBytes`/`getRandomBytesAsync`, `getRandomValues`,
`randomUUID`, `digestStringAsync`, and `digest` (SHA-1/256/384/512, MD2/4/5) — the AES surface from
upstream's `expo-crypto` is out of scope for this pass.

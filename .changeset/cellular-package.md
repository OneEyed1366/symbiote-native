---
"@symbiote-native/cellular": minor
---

Add `@symbiote-native/cellular`, a framework-agnostic wrapper around `expo-cellular` (built on
`expo-modules-core`, never the `expo` meta-package). Ships `getCellularGenerationAsync`, the
Android-only carrier/SIM surface (`allowsVoipAsync`, `getIsoCountryCodeAsync`, `getCarrierNameAsync`,
`getMobileCountryCodeAsync`, `getMobileNetworkCodeAsync` — each resolves `null` on iOS, which exposes
none of this), and `getPermissionsAsync`/`requestPermissionsAsync` (Android-only; every other platform
needs no permission for cellular info and always resolves granted). A new `usePermissions()` hook/
composable/service — shared shape with `@symbiote-native/brightness` — auto-fetches the current
permission status on mount and exposes `get`/`request` as imperative callbacks; every other export is
a stateless free function, same as `@symbiote-native/local-auth`.

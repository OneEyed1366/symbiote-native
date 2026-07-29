---
"@symbiote-native/network": minor
---

Add `@symbiote-native/network`, a framework-agnostic wrapper around `expo-network` (built on
`expo-modules-core`, never the `expo` meta-package). Ships `getNetworkStateAsync`, `getIpAddressAsync`,
`isAirplaneModeEnabledAsync`, and one listener-based subscription, `addNetworkStateListener` — a mix
between `@symbiote-native/local-auth`'s pure free functions and `@symbiote-native/battery`'s live-state
hooks: `useNetworkState` (React/Vue) and `NetworkStateService.connect()` (Angular) seed from a one-shot
`getNetworkStateAsync()` call and then subscribe for live updates, while the rest of the surface is a
plain stateless re-export.

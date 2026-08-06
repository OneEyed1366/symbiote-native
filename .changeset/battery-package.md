---
"@symbiote-native/battery": minor
---

Add `@symbiote-native/battery`, a framework-agnostic wrapper around `expo-battery` (built on
`expo-modules-core` directly, never the `expo` meta-package). Ships `isAvailableAsync`,
`getBatteryLevelAsync`, `getBatteryStateAsync`, `isLowPowerModeEnabledAsync`,
`isBatteryOptimizationEnabledAsync` (Android only), and `getPowerStateAsync` as stateless async
calls, plus three separate listener-based subscriptions — `addBatteryLevelListener`,
`addBatteryStateListener`, and `addLowPowerModeListener` — each with its own adapter-level
lifecycle hook/composable/service (`useBatteryLevel`/`useBatteryState`/`useLowPowerMode` on
React and Vue, `BatteryLevelService`/`BatteryStateService`/`LowPowerModeService` on Angular),
mirroring upstream's own three separate hooks rather than one combined hook.

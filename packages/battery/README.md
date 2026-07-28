# @symbiote-native/battery

Port of [`expo-battery`](https://docs.expo.dev/versions/latest/sdk/battery/) for
[SymbioteNative](../../README.md) — battery level and state, low-power-mode detection, reachable
from every adapter (React, Vue, Angular), not just React.

Built the same way as [`@symbiote-native/local-auth`](../local-auth) and
[`@symbiote-native/sensors`](../sensors), an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

## API

A mix of stateless async functions and three listener-based subscriptions
(`addBatteryLevelListener`/`addBatteryStateListener`/`addLowPowerModeListener`), each with its
own adapter-level lifecycle hook — one hook/composable/service per listener, matching upstream's
own `useBatteryLevel`/`useBatteryState`/`useLowPowerMode` being three separate hooks, not one
combined hook.

```ts
isAvailableAsync(): Promise<boolean>                          // battery API availability on this device
getBatteryLevelAsync(): Promise<number>                       // 0..1, or -1 if unsupported
getBatteryStateAsync(): Promise<BatteryState>                 // UNKNOWN/UNPLUGGED/CHARGING/FULL/NOT_CHARGING
isLowPowerModeEnabledAsync(): Promise<boolean>                // Low Power Mode (iOS) / Power Saver (Android)
isBatteryOptimizationEnabledAsync(): Promise<boolean>         // Android only
getPowerStateAsync(): Promise<PowerState>                     // combined level + state + lowPowerMode
addBatteryLevelListener(listener): EventSubscription           // fires on battery level change
addBatteryStateListener(listener): EventSubscription           // fires on battery state change
addLowPowerModeListener(listener): EventSubscription           // fires when low-power mode toggles
```

Plus `BatteryState` (enum), `PowerState`, `BatteryLevelEvent`, `BatteryStateEvent`,
`PowerModeEvent` — ported from upstream's `Battery.types.ts`.

```ts
import { getBatteryLevelAsync, addBatteryLevelListener } from '@symbiote-native/battery';

// framework-scoped entry points re-export the same free functions, plus a lifecycle
// hook/composable/service per listener:
import { useBatteryLevel, useBatteryState, useLowPowerMode } from '@symbiote-native/battery/react';
import { useBatteryLevel, useBatteryState, useLowPowerMode } from '@symbiote-native/battery/vue';
import {
  BatteryLevelService,
  BatteryStateService,
  LowPowerModeService,
} from '@symbiote-native/battery/angular';
```

Each hook/composable/service seeds its initial value from the matching one-shot
`get*Async`/`is*Async` call, then subscribes to the matching listener for updates, and
unsubscribes on unmount — mirroring upstream's own `useBatteryLevel`/`useBatteryState`/
`useLowPowerMode`.

## Not yet done

- **Native example wiring.** `examples/react` already has a working `expo-modules-core`
  bring-up (Podfile monkeypatch + Android `settings.gradle` fallback, done for
  `@symbiote-native/sensors`) that auto-discovers any resolvable expo-modules-core package —
  adding this package needs only `expo-battery` added to the Android `wantedExpoModules`
  allow-list in `examples/react/android/settings.gradle`. Wait on a real published/canary build
  of this package first — `examples/react` resolves `@symbiote-native/*` by pinned version, not
  `workspace:*`.
- Tests exercise the JS layer only (fake native module, `vitest`) — no on-device/simulator smoke
  test yet.

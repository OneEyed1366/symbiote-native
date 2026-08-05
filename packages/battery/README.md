# @symbiote-native/battery

Port of [`expo-battery`](https://docs.expo.dev/versions/latest/sdk/battery/) for
[SymbioteNative](../../README.md) — battery level and state, low-power-mode detection, reachable
from every adapter (React, Vue, Angular), not just React.

Built the same way as [`@symbiote-native/local-auth`](../local-auth) and
[`@symbiote-native/sensors`](../sensors), an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

## Install

```bash
npm install @symbiote-native/battery
```

Depends on `expo-battery` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions — never a caret range, since this package's `core/` is hand-ported against one specific
native API shape and a newer resolve could silently drift the two apart). Never install
`expo-battery` yourself, and never add the `expo` package to this project — it bundles its own
Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-battery`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package (`@symbiote-native/sensors`, `@symbiote-native/local-auth`) with zero further changes:

| Platform | Touches |
|---|---|
| iOS | `ios/Podfile` — add `use_expo_modules!` |
| iOS | `AppDelegate.swift` — Expo's runtime-bootstrap hook |
| Android | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects |
| Android | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics — the Podfile pieces that normally ship inside the `expo` package, the `expo`
peer-dependency exclusion list — live in the `symbiote-expo-native-module` skill. Reference
implementation: `examples/expo-react/ios/Podfile` and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt`.

No platform permission string is needed for battery's basic surface —
`isBatteryOptimizationEnabledAsync` reads an Android-only system state with no runtime permission
prompt either.

## Shape

```
src/core/               Battery.ts — one-shot get*Async functions + addListener subscriptions.
                        native-module.ts resolves the native module through expo-modules-core's
                        requireNativeModule. types.ts — BatteryState enum, PowerState,
                        *Event shapes, hand-ported from Battery.types.ts.
src/react/hooks/        @symbiote-native/battery/react   — useBatteryLevel, useBatteryState,
                        useLowPowerMode
src/vue/composables/    @symbiote-native/battery/vue     — same three names, Vue lifecycle
src/angular/services/   @symbiote-native/battery/angular — BatteryLevelService, BatteryStateService,
                        LowPowerModeService (`.connect()` returns a Signal)
```

Each adapter's hook/composable/service is a thin lifecycle wrapper (seed from the one-shot
`get*Async` call, subscribe to the matching listener, unsubscribe on unmount/cleanup) over the
same `core` functions — the subscription and fallback logic is written once and shared by all
three.

## Use it

```tsx
// React — examples/expo-react/screens/BatteryScreen.tsx
import { useBatteryLevel, useBatteryState, useLowPowerMode } from '@symbiote-native/battery/react';
import { BatteryState } from '@symbiote-native/battery';

function BatteryScreen() {
  const batteryLevel = useBatteryLevel();   // number, -1 until the first reading arrives
  const batteryState = useBatteryState();   // BatteryState, UNKNOWN until the first reading
  const lowPowerMode = useLowPowerMode();   // boolean, false until the first reading

  const batteryLevelLabel = batteryLevel < 0 ? 'unknown' : `${Math.round(batteryLevel * 100)}%`;

  return (
    <>
      <Text>{batteryLevelLabel}</Text>
      <Text>{batteryState === BatteryState.CHARGING ? 'Charging' : 'Not charging'}</Text>
      <Text>{lowPowerMode ? 'On' : 'Off'}</Text>
    </>
  );
}
```

```vue
<!-- Vue — examples/expo-vue-sfc/screens/BatteryScreen.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useBatteryLevel, useBatteryState, useLowPowerMode } from '@symbiote-native/battery/vue';

const batteryLevel = useBatteryLevel(); // Ref<number>
const batteryState = useBatteryState(); // Ref<BatteryState>
const lowPowerMode = useLowPowerMode(); // Ref<boolean>

const batteryLevelText = computed(() =>
  batteryLevel.value < 0 ? 'unknown' : `${Math.round(batteryLevel.value * 100)}%`,
);
</script>
<template>
  <Text>{{ batteryLevelText }}</Text>
  <Text>{{ lowPowerMode ? 'ON' : 'OFF' }}</Text>
</template>
```

```ts
// Angular — examples/expo-angular/src/screens/BatteryScreen.ts
import { Component, inject } from '@angular/core';
import { BatteryLevelService, BatteryStateService, LowPowerModeService } from '@symbiote-native/battery/angular';

@Component({ /* ... */ })
export class BatteryScreen {
  readonly batteryLevel = inject(BatteryLevelService).connect();  // Signal<number>
  readonly batteryState = inject(BatteryStateService).connect();  // Signal<BatteryState>
  readonly lowPowerMode = inject(LowPowerModeService).connect();  // Signal<boolean>

  batteryLevelLabel(): string {
    const level = this.batteryLevel();
    return level < 0 ? 'unknown' : `${Math.round(level * 100)}%`;
  }
}
```

Each of the three demo screens above also renders a one-shot capabilities card
(`isAvailableAsync()`, and Android-only `isBatteryOptimizationEnabledAsync()`) resolved directly
from `@symbiote-native/battery`'s core entry point — see the linked files for the full version.
The iOS Simulator reports the battery API as unavailable (`isAvailableAsync()` resolves `false`)
since simulators have no real battery hardware; a physical device is needed to see live readings.

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

## Test it

No Fabric/Descriptor angle at all — battery is a pure async-function + `EventEmitter` listener
surface, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/battery.test.ts`,
`src/{react,vue,angular}/**/*.test.{ts,tsx}`, `vitest`), the same pattern
`@symbiote-native/sensors` and `@symbiote-native/local-auth` use — no `installFabric()`, no
ViewConfig. Native rendering itself is verified on-device — see the parent
[README](../../README.md).

The Android/iOS native wiring is done across all four `examples/expo-*` canary apps
(`examples/expo-react`, `examples/expo-vue-sfc`, `examples/expo-vue-tsx`, `examples/expo-angular`);
this package isn't yet in the public, non-Expo `examples/react` canary.

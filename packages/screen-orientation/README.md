# @symbiote-native/screen-orientation

Port of [`expo-screen-orientation`](https://docs.expo.dev/versions/latest/sdk/screen-orientation/)
for [SymbioteNative](../../README.md) — orientation locking (`lockAsync`/`lockPlatformAsync`/
`unlockAsync`), reading the current orientation and lock, and an auto-updating orientation-change
subscription, reachable from every adapter (React, Vue, Angular), not just React.

Built the same way as [`@symbiote-native/network`](../network) and
[`@symbiote-native/device`](../device), an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

## Install

```bash
npm install @symbiote-native/screen-orientation
```

Depends on `expo-screen-orientation` and `expo-modules-core` directly (regular dependencies,
pinned to exact versions — never a caret range, since this package's `core/` is hand-ported against
one specific native API shape and a newer resolve could silently drift the two apart). Never
install `expo-screen-orientation` yourself, and never add the `expo` package to this project — it
bundles its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-screen-orientation`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package (`@symbiote-native/network`, `@symbiote-native/device`, `@symbiote-native/sensors`, ...)
with zero further changes:

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

No platform permission string is needed for screen-orientation's surface — locking and reading the
current orientation read/write system state with no runtime permission prompt on either platform.

## Shape

```
src/core/               screen-orientation.ts — lock*/unlock/get* functions +
                        addOrientationChangeListener subscription. native-module.ts resolves the
                        native module through expo-modules-core's requireNativeModule. types.ts —
                        Orientation/OrientationLock/SizeClassIOS/WebOrientationLock/WebOrientation
                        enums, PlatformOrientationInfo, ScreenOrientationInfo,
                        OrientationChangeEvent, hand-ported from ScreenOrientation.types.ts, plus
                        ScreenOrientationState (this package's own hook/composable/service shape).
src/react/hooks/        @symbiote-native/screen-orientation/react   — useScreenOrientation
src/vue/composables/    @symbiote-native/screen-orientation/vue     — useScreenOrientation (same name)
src/angular/services/   @symbiote-native/screen-orientation/angular — ScreenOrientationService
                        (`.connect()` returns a Signal)
```

Each adapter's hook/composable/service is a thin lifecycle wrapper (seed from one-shot
`getOrientationAsync()`/`getOrientationLockAsync()` calls, subscribe to
`addOrientationChangeListener`, unsubscribe on unmount) over the same `core` functions — the
subscription logic is written once and shared by all three.

## Use it

```tsx
// React — examples/expo-react/screens/ScreenOrientationScreen.tsx
import { lockAsync, OrientationLock } from '@symbiote-native/screen-orientation';
import { useScreenOrientation } from '@symbiote-native/screen-orientation/react';

function ScreenOrientationScreen() {
  const { orientation, orientationLock } = useScreenOrientation();

  return (
    <>
      <Text>Orientation: {orientation}</Text>
      <Text>Lock: {orientationLock}</Text>
      <Button title="Lock landscape" onPress={() => lockAsync(OrientationLock.LANDSCAPE)} />
    </>
  );
}
```

```vue
<!-- Vue — examples/expo-vue-sfc/screens/ScreenOrientationScreen.vue -->
<script setup lang="ts">
import { Text } from '@symbiote-native/vue';
import { lockAsync, OrientationLock } from '@symbiote-native/screen-orientation';
import { useScreenOrientation } from '@symbiote-native/screen-orientation/vue';

const screenOrientation = useScreenOrientation(); // Ref<ScreenOrientationState>
</script>
<template>
  <Text>Orientation: {{ screenOrientation.orientation }}</Text>
  <Text>Lock: {{ screenOrientation.orientationLock }}</Text>
</template>
```

```ts
// Angular — examples/expo-angular/src/screens/ScreenOrientationScreen.ts
import { Component, inject } from '@angular/core';
import { Text } from '@symbiote-native/angular';
import { ScreenOrientationService } from '@symbiote-native/screen-orientation/angular';

@Component({
  standalone: true,
  imports: [Text],
  template: `<Text>Orientation: {{ screenOrientation().orientation }}</Text>`,
})
export class ScreenOrientationScreen {
  readonly screenOrientation = inject(ScreenOrientationService).connect(); // Signal<ScreenOrientationState>
}
```

## API

A mix of stateless async functions and one listener-based subscription
(`addOrientationChangeListener`), with its own adapter-level lifecycle hook.

```ts
lockAsync(orientationLock): Promise<void>                    // locks to one of the OrientationLock values
lockPlatformAsync(options): Promise<void>                    // locks via a platform-specific param
unlockAsync(): Promise<void>                                 // unlocks back to OrientationLock.DEFAULT
getOrientationAsync(): Promise<Orientation>                   // the device's current orientation
getOrientationLockAsync(): Promise<OrientationLock>           // the current lock
getPlatformOrientationLockAsync(): Promise<PlatformOrientationInfo>
supportsOrientationLockAsync(orientationLock): Promise<boolean>
addOrientationChangeListener(listener): EventSubscription     // fires whenever orientation/lock changes
removeOrientationChangeListener(subscription): void           // removes one subscription
removeOrientationChangeListeners(): void                      // removes every subscription at once
```

Plus `Orientation` (enum: `UNKNOWN`/`PORTRAIT_UP`/`PORTRAIT_DOWN`/`LANDSCAPE_LEFT`/
`LANDSCAPE_RIGHT`), `OrientationLock` (enum: `DEFAULT`/`ALL`/`PORTRAIT`/`PORTRAIT_UP`/
`PORTRAIT_DOWN`/`LANDSCAPE`/`LANDSCAPE_LEFT`/`LANDSCAPE_RIGHT`/`OTHER`/`UNKNOWN`), `SizeClassIOS`,
`WebOrientationLock`, `WebOrientation`, `PlatformOrientationInfo`, `ScreenOrientationInfo`,
`OrientationChangeEvent` — ported from upstream's `ScreenOrientation.types.ts`.

```ts
import { getOrientationAsync, addOrientationChangeListener } from '@symbiote-native/screen-orientation';

// framework-scoped entry points re-export the same free functions, plus a lifecycle
// hook/composable/service:
import { useScreenOrientation } from '@symbiote-native/screen-orientation/react';
import { useScreenOrientation } from '@symbiote-native/screen-orientation/vue';
import { ScreenOrientationService } from '@symbiote-native/screen-orientation/angular';
```

`useScreenOrientation` seeds its initial value (`{ orientation: Orientation.UNKNOWN,
orientationLock: OrientationLock.UNKNOWN }`) from one-shot `getOrientationAsync()`/
`getOrientationLockAsync()` calls, then subscribes to `addOrientationChangeListener` for updates,
and unsubscribes on unmount.

**Note (Android):** `expo-screen-orientation` doesn't emit its own `expoDidUpdateDimensions`
event on Android — the module piggybacks on RN's own `Dimensions.addEventListener('change', ...)`
there instead, re-fetching the lock and orientation on every dimensions change. iOS and web both
subscribe to the native `expoDidUpdateDimensions` event directly.

## Test it

No Fabric/Descriptor angle at all — screen-orientation is a pure async-function + `EventEmitter`
listener surface, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/screen-orientation.test.ts`,
`src/{react,vue,angular}/**/*.test.{ts,tsx}`, `vitest`), the same pattern
`@symbiote-native/network`/`@symbiote-native/device`/`@symbiote-native/sensors` use — no
`installFabric()`, no ViewConfig. Native rendering itself is verified on-device — see the parent
[README](../../README.md).

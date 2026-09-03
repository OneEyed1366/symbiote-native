# @symbiote-native/brightness

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-brightness`](https://github.com/expo/expo/tree/main/packages/expo-brightness) — screen
brightness get/set, Android-only system-brightness-mode control, an iOS-only brightness-change
listener, and permission get/request — usable from **every** adapter: React, Vue, Svelte, Solid,
and Angular, not just React. Unlike [`@symbiote-native/sensors`](../sensors) — a `DeviceSensor` class per instance,
subscribed through a hook/composable/service — this package's surface is mostly stateless free
async functions plus one listener; only the permission surface gets its own lifecycle hook/
composable/service, mirroring upstream's own `usePermissions`. Built the same way as
[`@symbiote-native/local-auth`](../local-auth), [`@symbiote-native/battery`](../battery), and
[`@symbiote-native/haptics`](../haptics) — an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

## Install

```bash
npm install @symbiote-native/brightness
```

`expo-brightness` and `expo-modules-core` come along as regular, pinned dependencies — never
install either yourself, and never add the `expo` meta-package to this project (it bundles its own
Metro/Babel pipeline that conflicts with this project's own).

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-brightness`'s native code is discovered by
`expo-modules-autolinking`, not the `react-native.config.cjs`/podspec mechanism other wrappers in
this repo use — this needs wiring into the native host app **once**, covering this package and
every other `expo-modules-core` package with zero further changes:

| Platform | Touches                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | `ios/Podfile` — add `use_expo_modules!`                                                                                                                             |
| iOS      | `AppDelegate.swift` — Expo's runtime-bootstrap hook                                                                                                                 |
| Android  | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects                                                                               |
| Android  | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one)                 |
| Android  | `AndroidManifest.xml` — `android.permission.WRITE_SETTINGS`, required to set the system-wide brightness (`setSystemBrightnessAsync`/`setSystemBrightnessModeAsync`) |

Full mechanics — the Podfile pieces that normally ship inside the `expo` package, the `expo`
peer-dependency exclusion list — live in the `symbiote-expo-native-module` skill. Reference
implementation: `examples/expo-react/android/app/src/main/AndroidManifest.xml` (the
`WRITE_SETTINGS` permission) and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt` (the
`BrightnessModule` registration) — the Vue and Angular Expo canaries wire the same three layers.

## Shape

```
src/core/                 isAvailableAsync, get/setBrightnessAsync, the Android-only
                          system-brightness-mode surface, permission get/request, and
                          addBrightnessListener (iOS only); native-module.ts resolves
                          ExpoBrightness through expo-modules-core's requireNativeModule.
src/react/hooks/           @symbiote-native/brightness/react   — usePermissions
src/vue/composables/       @symbiote-native/brightness/vue     — usePermissions (same name)
src/svelte/runes/          @symbiote-native/brightness/svelte  — usePermissions (same name)
src/solid/primitives/      @symbiote-native/brightness/solid   — createPermissions (Solid says
                                                                 create*, not use*)
src/angular/services/      @symbiote-native/brightness/angular — PermissionsService
```

Each adapter's hook/composable/service wraps the same one-shot `getPermissionsAsync`/
`requestPermissionsAsync` pair in its own lifecycle idiom (auto-fetch on mount, exposed as a
tuple/object/accessor/signal). Every other export — brightness get/set, the system-brightness-mode
surface, the listener — is a stateless free-function re-export, written once in `core/` and shared
verbatim by every adapter.

## Use it

```tsx
// React — trimmed from examples/expo-react/screens/BrightnessScreen.tsx
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from '@symbiote-native/react';
import {
  addBrightnessListener,
  getBrightnessAsync,
  setBrightnessAsync,
} from '@symbiote-native/brightness';
import { usePermissions } from '@symbiote-native/brightness/react';

function BrightnessScreen() {
  const [brightness, setBrightness] = useState<number | null>(null);
  const [permissionStatus, requestPermission] = usePermissions();

  useEffect(() => {
    getBrightnessAsync().then(setBrightness);
    // iOS only — never fires on Android, so there the value only changes via setBrightnessAsync.
    const subscription = addBrightnessListener(event =>
      setBrightness(event.brightness),
    );
    return () => subscription.remove();
  }, []);

  return (
    <View>
      <Text>
        {brightness === null ? 'checking…' : `${Math.round(brightness * 100)}%`}
      </Text>
      <Pressable onPress={() => setBrightnessAsync(0.5)}>
        <Text>Set to 50%</Text>
      </Pressable>
      <Text>{permissionStatus?.status ?? 'checking…'}</Text>
      <Pressable onPress={() => requestPermission()}>
        <Text>Request permission</Text>
      </Pressable>
    </View>
  );
}
```

```vue
<!-- Vue — trimmed from examples/expo-vue-sfc/screens/BrightnessScreen.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Pressable, Text, View } from '@symbiote-native/vue';
import {
  addBrightnessListener,
  getBrightnessAsync,
  setBrightnessAsync,
  type EventSubscription,
} from '@symbiote-native/brightness';
import { usePermissions } from '@symbiote-native/brightness/vue';

const brightness = ref<number | null>(null);
const { status: permissionStatus, request: requestPermission } =
  usePermissions();

let subscription: EventSubscription | undefined;

onMounted(() => {
  void getBrightnessAsync().then(value => (brightness.value = value));
  subscription = addBrightnessListener(
    event => (brightness.value = event.brightness),
  );
});
onUnmounted(() => subscription?.remove());
</script>

<template>
  <View>
    <Text>{{
      brightness === null ? 'checking…' : `${Math.round(brightness * 100)}%`
    }}</Text>
    <Pressable @press="setBrightnessAsync(0.5)">
      <Text>Set to 50%</Text>
    </Pressable>
    <Text>{{ permissionStatus?.status ?? 'checking…' }}</Text>
    <Pressable @press="requestPermission()">
      <Text>Request permission</Text>
    </Pressable>
  </View>
</template>
```

```svelte
<!-- Svelte — trimmed from examples/expo-svelte/screens/BrightnessScreen.svelte -->
<script lang="ts">
  import { Pressable, Text, View } from '@symbiote-native/svelte';
  import {
    addBrightnessListener,
    getBrightnessAsync,
    setBrightnessAsync,
    usePermissions,
    type EventSubscription,
  } from '@symbiote-native/brightness/svelte';

  let brightness = $state<number | null>(null);
  const permissions = usePermissions(); // boxed getter: permissions.status / .request()

  let subscription: EventSubscription | undefined;

  $effect(() => {
    void getBrightnessAsync().then(value => (brightness = value));
    subscription = addBrightnessListener(event => (brightness = event.brightness));
    return () => subscription?.remove();
  });
</script>

<View>
  <Text>{brightness === null ? 'checking…' : `${Math.round(brightness * 100)}%`}</Text>
  <Pressable onPress={() => setBrightnessAsync(0.5)}>
    <Text>Set to 50%</Text>
  </Pressable>
  <Text>{permissions.status?.status ?? 'checking…'}</Text>
  <Pressable onPress={() => permissions.request()}>
    <Text>Request permission</Text>
  </Pressable>
</View>
```

```tsx
// Solid — trimmed from examples/expo-solid/screens/BrightnessScreen.tsx
import { createSignal, onCleanup } from 'solid-js';
import { Pressable, Text, View } from '@symbiote-native/solid';
import {
  addBrightnessListener,
  getBrightnessAsync,
  setBrightnessAsync,
} from '@symbiote-native/brightness';
import { createPermissions } from '@symbiote-native/brightness/solid';

function BrightnessScreen() {
  const [brightness, setBrightness] = createSignal<number | null>(null);
  const { status: permissionStatus, request: requestPermission } = createPermissions();

  getBrightnessAsync().then(setBrightness);
  const subscription = addBrightnessListener(event => setBrightness(event.brightness));
  onCleanup(() => subscription.remove());

  return (
    <View>
      <Text>
        {brightness() === null ? 'checking…' : `${Math.round(brightness()! * 100)}%`}
      </Text>
      <Pressable onPress={() => setBrightnessAsync(0.5)}>
        <Text>Set to 50%</Text>
      </Pressable>
      <Text>{permissionStatus()?.status ?? 'checking…'}</Text>
      <Pressable onPress={() => requestPermission()}>
        <Text>Request permission</Text>
      </Pressable>
    </View>
  );
}
```

```ts
// Angular — trimmed from examples/expo-angular/src/screens/BrightnessScreen.ts
import { Component, inject, signal } from '@angular/core';
import { Pressable, Text, View } from '@symbiote-native/angular';
import {
  PermissionsService,
  addBrightnessListener,
  getBrightnessAsync,
  setBrightnessAsync,
} from '@symbiote-native/brightness/angular';

@Component({
  selector: 'BrightnessScreen',
  standalone: true,
  imports: [Pressable, Text, View],
  template: `
    <View>
      <Text>{{ brightnessLabel() }}</Text>
      <Pressable (press)="setBrightnessAsync(0.5)"
        ><Text>Set to 50%</Text></Pressable
      >
      <Text>{{ permissionStatus()?.status ?? 'checking…' }}</Text>
      <Pressable (press)="permissionsService.request()"
        ><Text>Request permission</Text></Pressable
      >
    </View>
  `,
})
export class BrightnessScreen {
  private readonly permissionsService = inject(PermissionsService);
  readonly permissionStatus = this.permissionsService.connect();
  readonly brightness = signal<number | null>(null);

  constructor() {
    getBrightnessAsync().then(value => this.brightness.set(value));
    addBrightnessListener(event => this.brightness.set(event.brightness));
  }

  brightnessLabel(): string {
    const value = this.brightness();
    return value === null ? 'checking…' : `${Math.round(value * 100)}%`;
  }

  setBrightnessAsync(value: number): void {
    setBrightnessAsync(value).then(() =>
      getBrightnessAsync().then(result => this.brightness.set(result)),
    );
  }
}
```

The real demo screens (`examples/expo-react/screens/BrightnessScreen.tsx` and its Vue/Svelte/
Solid/Angular twins in `examples/expo-vue-sfc`, `examples/expo-vue-tsx`, `examples/expo-svelte`,
`examples/expo-solid`, `examples/expo-angular`) additionally
gate an Android-only system-brightness-mode card behind `Platform.OS === 'android'` — see
[API](#api) below for that surface's full signatures.

## API

Mostly stateless async functions, plus one iOS-only listener and a permission surface that gets
its own lifecycle hook/composable/service (matching upstream's own `usePermissions`).

```ts
isAvailableAsync(): Promise<boolean>
// Whether the brightness API is available — !!native.getBrightnessAsync.

getBrightnessAsync(): Promise<number>
setBrightnessAsync(brightnessValue: number): Promise<void>
// The app-local screen brightness, 0..1 (clamped; NaN throws a TypeError).

getSystemBrightnessAsync(): Promise<number>
setSystemBrightnessAsync(brightnessValue: number): Promise<void>
// System-wide brightness. On iOS these delegate straight to get/setBrightnessAsync — there is
// no separate system-level value on that platform.

restoreSystemBrightnessAsync(): Promise<void>
isUsingSystemBrightnessAsync(): Promise<boolean>
getSystemBrightnessModeAsync(): Promise<BrightnessMode>       // UNKNOWN / AUTOMATIC / MANUAL
setSystemBrightnessModeAsync(mode: BrightnessMode): Promise<void>
// Android only — every one of these is a no-op (or resolves a fixed fallback) on iOS/other
// platforms. setSystemBrightnessModeAsync(UNKNOWN) is also always a no-op, even on Android.

getPermissionsAsync(): Promise<PermissionResponse>
requestPermissionsAsync(): Promise<PermissionResponse>
// Plain passthroughs to the native module — no platform gating.

addBrightnessListener(listener: (event: BrightnessEvent) => void): EventSubscription
// @platform ios — fires only on iOS; never fires on Android or web.
```

Plus `BrightnessMode` (enum: `UNKNOWN`/`AUTOMATIC`/`MANUAL`), `BrightnessEvent`, and
`PermissionStatus`/`PermissionResponse`/`PermissionExpiration` — the latter three re-exported
verbatim from `expo-modules-core`, never the `expo` meta-package.

```ts
import {
  getBrightnessAsync,
  setBrightnessAsync,
} from '@symbiote-native/brightness';

// framework-scoped entry points re-export the same free functions, plus a usePermissions
// hook/composable/service:
import { usePermissions } from '@symbiote-native/brightness/react';
import { usePermissions } from '@symbiote-native/brightness/vue';
import { usePermissions } from '@symbiote-native/brightness/svelte';
import { createPermissions } from '@symbiote-native/brightness/solid';
import { PermissionsService } from '@symbiote-native/brightness/angular';
```

`usePermissions` (React/Vue/Svelte) auto-fetches the current permission status on mount and
returns a `[status, request, get]` tuple (React) / a `{ status, request, get }` object (Vue refs,
Svelte getters). Solid's `createPermissions` fetches synchronously from the primitive body and
returns the same object with `status`/`error` as ACCESSORS; Angular's
`PermissionsService.connect()` returns a readonly `Signal`:

```ts
// React
const [status, request] = usePermissions();

// Vue
const { status, request } = usePermissions();

// Svelte — a boxed getter, read as permissions.status
const permissions = usePermissions();

// Solid — accessors, so status() is what a tracked scope reads
const { status, request } = createPermissions();

// Angular
readonly status = inject(PermissionsService).connect();
```

## Platform notes

- **System-brightness surface is Android only.** `getSystemBrightnessAsync`/
  `setSystemBrightnessAsync` fall back to the app-local `get`/`setBrightnessAsync` on iOS (there
  is no separate system-level brightness there); `restoreSystemBrightnessAsync`/
  `setSystemBrightnessModeAsync` no-op, `isUsingSystemBrightnessAsync` resolves `false`, and
  `getSystemBrightnessModeAsync` resolves `BrightnessMode.UNKNOWN` on every other platform.
- **`addBrightnessListener` is iOS only.** It never fires on Android or web — an app relying on
  it for cross-platform behavior needs its own fallback (e.g. polling `getBrightnessAsync`).
- **The iOS Simulator never round-trips brightness at all.** `UIScreen.main.brightness` — what
  `getBrightnessAsync`/`setBrightnessAsync` read and write on iOS — isn't implemented by the
  Simulator: `set` is a silent no-op and `get` always resolves a constant (observed `1.0`),
  regardless of what was written. This is a long-standing Apple Simulator limitation reproducible
  in any app, including stock Expo Go — not a bug in this wrapper. It only reproduces on a real
  iOS device; Android's emulator has no equivalent gap (see the `symbiote-expo-native-module`
  skill for the verified symptom and the underlying `BrightnessModule.swift` call).

## Test it

No Fabric/Descriptor angle at all — brightness is a pure async-function + listener + permission
surface, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/*.test.ts`,
`src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`,
`vitest`), the same pattern `expo-brightness` itself uses upstream — no `installFabric()`, no
ViewConfig. Native rendering itself is verified on-device (see the parent
[README](../../README.md) for the project's testing model).

## Known gaps

- Not yet wired into the public, non-Expo `examples/react` canary — only in `examples/expo-react`
  (and its Vue/Svelte/Solid/Angular Expo twins, `examples/expo-vue-sfc`/`examples/expo-vue-tsx`/
  `examples/expo-svelte`/`examples/expo-solid`/`examples/expo-angular`, all of which already have
  full three-layer native wiring: Android `MainApplication.kt` registration + `WRITE_SETTINGS`,
  plus the iOS Podfile/pod install).
- Tests exercise the JS layer only (fake native module, `vitest`) — no on-device/simulator
  automated smoke test yet, only manual verification.

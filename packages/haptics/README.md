# @symbiote-native/haptics

Port of [`expo-haptics`](https://docs.expo.dev/versions/latest/sdk/haptics/) for
[SymbioteNative](../../README.md) — impact/notification/selection vibration feedback via iOS's
Taptic Engine and Android's Vibrator API, plus a direct Android haptics-engine path
(`performAndroidHapticsAsync`). Built the same way as
[`@symbiote-native/local-auth`](../local-auth): an `expo-modules-core`-based wrapper, free
functions with no per-instance state and no event stream. Reachable from every adapter — React,
Vue, Angular — not just React.

## Install

```bash
npm install @symbiote-native/haptics
```

`expo-haptics` and `expo-modules-core` come along as regular, exact-pinned dependencies — never
install either yourself, and never add the `expo` meta-package (it bundles its own Metro/Babel
pipeline that conflicts with this project's own).

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-haptics`' native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs`/podspec mechanism — this needs
wiring into the native host app **once**, covering this package and every other
`expo-modules-core` package with zero further changes:

| Platform | Touches |
|---|---|
| iOS | `ios/Podfile` — add `use_expo_modules!` |
| iOS | `AppDelegate.swift` — Expo's runtime-bootstrap hook |
| Android | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects |
| Android | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics live in the `symbiote-expo-native-module` project skill. Reference
implementation: `examples/expo-react/ios/Podfile` and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt` (registers
`HapticsModule` as `"ExpoHaptics"`).

No permission or `Info.plist`/`AndroidManifest.xml` entry is needed on either platform — haptic
feedback requires none.

## Shape

```
src/core/     notificationAsync / impactAsync / selectionAsync / performAndroidHapticsAsync,
              plus NotificationFeedbackType / ImpactFeedbackStyle / AndroidHaptics.
              native-module.ts resolves the ExpoHaptics native module via
              expo-modules-core's requireNativeModule.
src/angular/  @symbiote-native/haptics/angular — plain re-export of core.
```

Upstream ships four async functions and three enums, not a subscribable sensor — there's
nothing per-framework to add, so `./react`, `./vue`, and `./svelte` are `exports`-map aliases
straight onto `src/core/` (no physical per-framework file). `./angular` stays a physical
file/subpath since Angular ships through a separate `ngc`/AOT build (`build-ngc/`).

## Use it

```tsx
// React — examples/expo-react/screens/HapticsScreen.tsx
import { impactAsync, ImpactFeedbackStyle, notificationAsync, NotificationFeedbackType, selectionAsync } from '@symbiote-native/haptics';

function HapticsScreen() {
  return (
    <>
      <ActionButton title="Medium" onPress={() => impactAsync(ImpactFeedbackStyle.Medium)} />
      <ActionButton title="Success" onPress={() => notificationAsync(NotificationFeedbackType.Success)} />
      <ActionButton title="Selection" onPress={() => selectionAsync()} />
    </>
  );
}
```

```vue
<!-- Vue — examples/expo-vue-sfc/screens/HapticsScreen.vue -->
<script setup lang="ts">
import { impactAsync, ImpactFeedbackStyle, notificationAsync, NotificationFeedbackType, selectionAsync } from '@symbiote-native/haptics';

function fireImpact(style: ImpactFeedbackStyle): void {
  void impactAsync(style);
}
</script>
<template>
  <ActionButton title="Medium" :onPress="() => fireImpact(ImpactFeedbackStyle.Medium)" />
</template>
```

```ts
// Angular — examples/expo-angular/src/screens/HapticsScreen.ts
import { Component } from '@angular/core';
import { impactAsync, ImpactFeedbackStyle, notificationAsync, NotificationFeedbackType } from '@symbiote-native/haptics';

@Component({
  selector: 'HapticsScreen',
  template: `<ActionButton title="Medium" (press)="handleImpact()"></ActionButton>`,
})
export class HapticsScreen {
  handleImpact(): void {
    impactAsync(ImpactFeedbackStyle.Medium);
  }
}
```

Every call is fire-and-forget (no result to await) — a real device is needed to feel the
feedback, a simulator produces none. Android also gets `performAndroidHapticsAsync`, which
drives the device haptics engine directly instead of `impactAsync`'s Vibrator simulation; it
no-ops on every other platform.

## API

Free functions, no event stream, no per-instance state:

```ts
notificationAsync(type?: NotificationFeedbackType): Promise<void>
// Success/Warning/Error feedback — UINotificationFeedbackType on iOS, simulated via Vibrator on Android.

impactAsync(style?: ImpactFeedbackStyle): Promise<void>
// Collision-weight feedback (Light/Medium/Heavy/Soft/Rigid) — UIImpactFeedbackStyle on iOS, simulated via Vibrator on Android.

selectionAsync(): Promise<void>
// Lets the user know a selection change was registered.

performAndroidHapticsAsync(type: AndroidHaptics): Promise<void>
// Android only — no-ops on other platforms. Uses the device haptics engine directly, unlike the Vibrator-based impactAsync.
```

Plus `NotificationFeedbackType`, `ImpactFeedbackStyle`, `AndroidHaptics` — ported verbatim from
upstream's `Haptics.types.ts`.

```ts
import { impactAsync, ImpactFeedbackStyle } from '@symbiote-native/haptics';
// or the framework-scoped entry points — identical surface, re-exported verbatim:
import { impactAsync } from '@symbiote-native/haptics/react';
import { impactAsync } from '@symbiote-native/haptics/vue';
import { impactAsync } from '@symbiote-native/haptics/angular';
```

## Test it

No Fabric/Descriptor angle at all — haptics is a pure async-function surface, never a view.
Tests exercise the JS layer via a fake native module in place of the real
`requireNativeModule` resolution (`vitest`, `src/**/*.test.{ts,tsx}`) — no `installFabric()`, no
ViewConfig. Native rendering itself is verified on-device (see the parent
[README](../../README.md)).

Native wiring for this package is done across all four `examples/expo-*` canary apps (Android
3-layer registration in each app's `build.gradle`/`MainApplication.kt`/`AndroidManifest.xml`,
plus iOS Podfile/pod install) — not yet ported into the plain, non-Expo public canaries
(`examples/react`, `examples/vue-sfc`, `examples/vue-tsx`, `examples/angular`), and no
on-device/simulator automated (Detox) smoke test exists yet, only manual verification.

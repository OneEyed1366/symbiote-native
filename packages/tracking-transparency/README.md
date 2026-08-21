# @symbiote-native/tracking-transparency

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-tracking-transparency`](https://github.com/expo/expo/tree/main/packages/expo-tracking-transparency)
— the iOS App Tracking Transparency prompt, permission get/request, and the advertising-ID getter
— usable from **every** adapter, React, Vue, Svelte, Solid, and Angular, not just React. Like
[`@symbiote-native/brightness`](../brightness), this package's surface is mostly stateless free
async functions; only the permission surface gets its own per-adapter lifecycle wrapper,
mirroring upstream's own `usePermissions`. Built the same way as
[`@symbiote-native/local-auth`](../local-auth), [`@symbiote-native/battery`](../battery), and
[`@symbiote-native/brightness`](../brightness) — an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

This is a **permission-hook package**: on iOS it drives the real ATT prompt; on Android and web
there is no such concept, so every permission call always resolves granted, matching upstream
exactly.

## Install

```bash
npm install @symbiote-native/tracking-transparency
```

`expo-tracking-transparency` and `expo-modules-core` come along as regular, pinned dependencies —
never install either yourself, and never add the `expo` meta-package to this project (it bundles
its own Metro/Babel pipeline that conflicts with this project's own).

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-tracking-transparency`'s native code is discovered by
`expo-modules-autolinking`, not the `react-native.config.cjs`/podspec mechanism other wrappers in
this repo use — this needs wiring into the native host app **once**, covering this package and
every other `expo-modules-core` package with zero further changes:

| Platform | Touches                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | `ios/Podfile` — add `use_expo_modules!`                                                                                                             |
| iOS      | `AppDelegate.swift` — Expo's runtime-bootstrap hook                                                                                                 |
| iOS      | `Info.plist` — `NSUserTrackingUsageDescription`, required to show the ATT prompt                                                                    |
| Android  | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects                                                               |
| Android  | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics — the Podfile pieces that normally ship inside the `expo` package, the `expo`
peer-dependency exclusion list — live in the `symbiote-expo-native-module` skill. The Android
native module also pulls in `com.google.android.gms:play-services-ads-identifier:18.0.1`
transitively via `expo-tracking-transparency`'s own `android/build.gradle` — automatic once the
module project is included, no extra wiring needed on our side.

## Shape

```
src/core/                 getAdvertisingId, get/requestTrackingPermissionsAsync, isAvailable;
                          native-module.ts resolves ExpoTrackingTransparency through
                          expo-modules-core's requireNativeModule.
src/react/hooks/           @symbiote-native/tracking-transparency/react   — usePermissions
src/vue/composables/       @symbiote-native/tracking-transparency/vue     — usePermissions (same name)
src/svelte/runes/          @symbiote-native/tracking-transparency/svelte  — usePermissions (same name)
src/solid/primitives/      @symbiote-native/tracking-transparency/solid   — createPermissions
                           (Solid reserves `use*` for consuming existing state)
src/angular/services/      @symbiote-native/tracking-transparency/angular — PermissionsService
```

Each adapter's wrapper puts the same one-shot `getTrackingPermissionsAsync`/
`requestTrackingPermissionsAsync` pair in its own lifecycle idiom (auto-fetch when the wrapper is
created, exposed as a tuple/object/signal/accessor). `getAdvertisingId`/`isAvailable` are stateless
free-function re-exports, written once in `core/` and shared verbatim by every adapter.

Upstream's own `createPermissionHook`/`useTrackingPermissions` is **not** ported — that helper is
React-only (built on `useState`/`useEffect`), and this repo's convention is for each adapter to
hand-roll its own permission hook instead, exactly like `brightness`/`cellular` already do.

## Use it

```tsx
// React
import { usePermissions } from '@symbiote-native/tracking-transparency/react';
import { getAdvertisingId } from '@symbiote-native/tracking-transparency';

function TrackingScreen() {
  const [permissionStatus, requestPermission] = usePermissions();

  return (
    <View>
      <Text>{permissionStatus?.status ?? 'checking…'}</Text>
      <Pressable onPress={() => requestPermission()}>
        <Text>Request tracking permission</Text>
      </Pressable>
      <Pressable onPress={() => console.log(getAdvertisingId())}>
        <Text>Log advertising ID</Text>
      </Pressable>
    </View>
  );
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { usePermissions } from '@symbiote-native/tracking-transparency/vue';
import { getAdvertisingId } from '@symbiote-native/tracking-transparency';

const { status: permissionStatus, request: requestPermission } =
  usePermissions();
</script>

<template>
  <View>
    <Text>{{ permissionStatus?.status ?? 'checking…' }}</Text>
    <Pressable @press="requestPermission()">
      <Text>Request tracking permission</Text>
    </Pressable>
    <Pressable @press="console.log(getAdvertisingId())">
      <Text>Log advertising ID</Text>
    </Pressable>
  </View>
</template>
```

```ts
// Angular
import { Component, inject } from '@angular/core';
import {
  PermissionsService,
  getAdvertisingId,
} from '@symbiote-native/tracking-transparency/angular';

@Component({
  selector: 'TrackingScreen',
  standalone: true,
  template: `
    <View>
      <Text>{{ permissionStatus()?.status ?? 'checking…' }}</Text>
      <Pressable (press)="permissionsService.request()">
        <Text>Request tracking permission</Text>
      </Pressable>
      <Pressable (press)="logAdvertisingId()"
        ><Text>Log advertising ID</Text></Pressable
      >
    </View>
  `,
})
export class TrackingScreen {
  protected readonly permissionsService = inject(PermissionsService);
  readonly permissionStatus = this.permissionsService.connect();

  logAdvertisingId(): void {
    console.log(getAdvertisingId());
  }
}
```

```tsx
// Solid — the accessors are CALLED; a Solid component body runs once, so a snapshot would freeze.
import { createPermissions } from '@symbiote-native/tracking-transparency/solid';
import { getAdvertisingId } from '@symbiote-native/tracking-transparency';

function TrackingScreen() {
  const { status: permissionStatus, request: requestPermission } =
    createPermissions();

  return (
    <View>
      <Text>{permissionStatus()?.status ?? 'checking…'}</Text>
      <Pressable onPress={() => void requestPermission()}>
        <Text>Request tracking permission</Text>
      </Pressable>
      <Pressable onPress={() => console.log(getAdvertisingId())}>
        <Text>Log advertising ID</Text>
      </Pressable>
    </View>
  );
}
```

The examples above mirror the real canary demo screens —
`examples/expo-react/screens/TrackingTransparencyScreen.tsx`,
`examples/expo-vue-sfc/screens/TrackingTransparencyScreen.vue`,
`examples/expo-vue-tsx/screens/TrackingTransparencyScreen.tsx`,
`examples/expo-angular/src/screens/TrackingTransparencyScreen.ts`.

## API

```ts
getAdvertisingId(): string | null
// The advertising ID (Android AAID / iOS IDFA). Returns null on the iOS simulator, when tracking
// hasn't been authorized via requestTrackingPermissionsAsync, or when the user declined.

getTrackingPermissionsAsync(): Promise<PermissionResponse>
requestTrackingPermissionsAsync(): Promise<PermissionResponse>
// On Android and web these always resolve granted — there is no tracking-consent concept there.
// On iOS these drive the real ATT prompt / read its current status.

isAvailable(): boolean
// Whether the native module resolved at all.
```

Plus `PermissionStatus`/`PermissionResponse`/`PermissionExpiration`/`PermissionHookOptions` —
re-exported verbatim from `expo-modules-core`, never the `expo` meta-package.

```ts
import {
  getAdvertisingId,
  getTrackingPermissionsAsync,
} from '@symbiote-native/tracking-transparency';

// framework-scoped entry points re-export the same free functions, plus a per-adapter
// permission wrapper:
import { usePermissions } from '@symbiote-native/tracking-transparency/react';
import { usePermissions } from '@symbiote-native/tracking-transparency/vue';
import { usePermissions } from '@symbiote-native/tracking-transparency/svelte';
import { createPermissions } from '@symbiote-native/tracking-transparency/solid';
import { PermissionsService } from '@symbiote-native/tracking-transparency/angular';
```

`usePermissions` auto-fetches the current permission status on mount and returns a
`[status, request, get, error]` tuple (React) / `{ status, error, request, get }` object
(Vue/Svelte); Solid's `createPermissions` returns the same object with `Accessor`s instead of
`Ref`s, and Angular's `PermissionsService.connect()` returns a readonly `Signal`:

```ts
// React
const [status, request] = usePermissions();

// Vue / Svelte
const { status, request } = usePermissions();

// Solid — status is an accessor, called at the read site
const { status, request } = createPermissions();

// Angular
readonly status = inject(PermissionsService).connect();
```

## Platform notes

- **Android and web always report granted.** There is no tracking-consent concept on either
  platform — `getTrackingPermissionsAsync`/`requestTrackingPermissionsAsync` short-circuit to a
  fixed granted response without ever calling the native module, matching upstream exactly.
- **`getAdvertisingId` returns `null` on the iOS Simulator, regardless of any settings** — there is
  no real IDFA to read there. This is expected Apple Simulator behavior, not a bug in this wrapper.

## Test it

No Fabric/Descriptor angle at all — tracking-transparency is a pure async-function + permission
surface, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/*.test.ts`, `src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`,
`vitest`), the same pattern `expo-tracking-transparency` itself uses upstream — no
`installFabric()` for the core layer, no ViewConfig. Native rendering itself is verified on-device
(see the parent [README](../../README.md) for the project's testing model).

## Known gaps

- Tests exercise the JS layer only (fake native module, `vitest`) — no on-device/simulator
  automated smoke test yet, only manual verification.

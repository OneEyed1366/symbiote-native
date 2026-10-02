# @symbiote-native/tracking-transparency

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-tracking-transparency`](https://github.com/expo/expo/tree/main/packages/expo-tracking-transparency):
the iOS App Tracking Transparency prompt, permission get/request, and the advertising-ID getter,
usable from **every** adapter, React, Vue, Svelte, Solid, and Angular, not just React. Like
[`@symbiote-native/brightness`](../brightness), this package's surface is mostly stateless free
async functions; only the permission surface gets its own per-adapter lifecycle wrapper,
mirroring upstream's own `useTrackingPermissions`. Built the same way as
[`@symbiote-native/local-auth`](../local-auth), [`@symbiote-native/battery`](../battery), and
[`@symbiote-native/brightness`](../brightness) - an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

This is a **permission-hook package**: on iOS it drives the real ATT prompt; on Android and web
there is no such concept, so every permission call always resolves granted, matching upstream
exactly.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --tracking-transparency
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --tracking-transparency
```

Either way: installs `@symbiote-native/tracking-transparency` and wires the native autolinking
automatically - see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/tracking-transparency
```

`expo-tracking-transparency` and `expo-modules-core` come along as regular, pinned dependencies:
never install either yourself, and never add the `expo` meta-package to this project (it bundles
its own Metro/Babel pipeline that conflicts with this project's own).

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-tracking-transparency`'s native code is discovered by
`expo-modules-autolinking`, not the `react-native.config.cjs`/podspec mechanism other wrappers in
this repo use - this needs wiring into the native host app **once**, covering this package and
every other `expo-modules-core` package with zero further changes:

| Platform | Touches                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | `ios/Podfile` - add `use_expo_modules!`                                                                                                             |
| iOS      | `AppDelegate.swift` - Expo's runtime-bootstrap hook                                                                                                 |
| iOS      | `Info.plist` - `NSUserTrackingUsageDescription`, required to show the ATT prompt                                                                    |
| Android  | `settings.gradle` / `app/build.gradle` - resolve and include the Expo Gradle projects                                                               |
| Android  | `MainApplication.kt` - Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics - the Podfile pieces that normally ship inside the `expo` package, the `expo`
peer-dependency exclusion list - live in the `symbiote-expo-native-module` skill. The Android
native module also pulls in `com.google.android.gms:play-services-ads-identifier:18.0.1`
transitively via `expo-tracking-transparency`'s own `android/build.gradle` - automatic once the
module project is included, no extra wiring needed on our side.

</details>

## Shape

```
src/core/                 getAdvertisingId, get/requestTrackingPermissionsAsync, isAvailable;
                          native-module.ts resolves ExpoTrackingTransparency through
                          expo-modules-core's requireNativeModule.
src/react/                 @symbiote-native/tracking-transparency/react: useTrackingPermissions
src/vue/                   @symbiote-native/tracking-transparency/vue: useTrackingPermissions
src/svelte/                @symbiote-native/tracking-transparency/svelte: useTrackingPermissions
src/solid/                 @symbiote-native/tracking-transparency/solid: useTrackingPermissions
src/angular/               @symbiote-native/tracking-transparency/angular: TrackingPermissionsService
```

Each adapter binds the same `getTrackingPermissionsAsync`/`requestTrackingPermissionsAsync` pair
(`core/tracking-permission-api.ts`) to the shared `createPermissionHook` of its adapter, or to
`PermissionsServiceBase` on Angular. `getAdvertisingId`/`isAvailable` are stateless free-function
re-exports, written once in `core/` and shared verbatim by every adapter.

`useTrackingPermissions` takes upstream's `{ get, request }` options: it fetches on mount by
default, `{ request: true }` asks instead, `{ get: false }` does nothing until called. Unlike the
former `usePermissions`, the hooks carry no `error` slot; Angular's service keeps `error`.

## Use it

```tsx
// React
import { useTrackingPermissions } from '@symbiote-native/tracking-transparency/react';
import { getAdvertisingId } from '@symbiote-native/tracking-transparency';

function TrackingScreen() {
  const [permissionStatus, requestPermission] = useTrackingPermissions();

  return (
    <view>
      <text>{permissionStatus?.status ?? 'checking…'}</text>
      <pressable onPress={() => requestPermission()}>
        <text>Request tracking permission</text>
      </pressable>
      <pressable onPress={() => console.log(getAdvertisingId())}>
        <text>Log advertising ID</text>
      </pressable>
    </view>
  );
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { useTrackingPermissions } from '@symbiote-native/tracking-transparency/vue';
import { getAdvertisingId } from '@symbiote-native/tracking-transparency';

const [permissionStatus, requestPermission] = useTrackingPermissions();
</script>

<template>
  <view>
    <text>{{ permissionStatus?.status ?? 'checking…' }}</text>
    <pressable @press="requestPermission()">
      <text>Request tracking permission</text>
    </pressable>
    <pressable @press="console.log(getAdvertisingId())">
      <text>Log advertising ID</text>
    </pressable>
  </view>
</template>
```

```ts
// Angular
import { Component, inject } from '@angular/core';
import {
  TrackingPermissionsService,
  getAdvertisingId,
} from '@symbiote-native/tracking-transparency/angular';

@Component({
  selector: 'TrackingScreen',
  standalone: true,
  template: `
    <view>
      <text>{{ permissionStatus()?.status ?? 'checking…' }}</text>
      <pressable (press)="permissionsService.request()">
        <text>Request tracking permission</text>
      </pressable>
      <pressable (press)="logAdvertisingId()"
        ><text>Log advertising ID</text></pressable
      >
    </view>
  `,
})
export class TrackingScreen {
  protected readonly permissionsService = inject(TrackingPermissionsService);
  readonly permissionStatus = this.permissionsService.connect();

  logAdvertisingId(): void {
    console.log(getAdvertisingId());
  }
}
```

```svelte
<!-- Svelte - the rune hands back a boxed object whose `status` is a getter; destructuring it
     would freeze the value at its initial null, since Svelte 5 reactivity is lexically scoped. -->
<script lang="ts">
  import {
    getAdvertisingId,
    useTrackingPermissions,
  } from '@symbiote-native/tracking-transparency/svelte';

  const permissions = useTrackingPermissions();
</script>

<view>
  <text>{permissions.status?.status ?? 'checking…'}</text>
  <pressable onPress={() => permissions.requestPermission()}>
    <text>Request tracking permission</text>
  </pressable>
  <pressable onPress={() => console.log(getAdvertisingId())}>
    <text>Log advertising ID</text>
  </pressable>
</view>
```

```tsx
// Solid - the accessors are CALLED; a Solid component body runs once, so a snapshot would freeze.
import { useTrackingPermissions } from '@symbiote-native/tracking-transparency/solid';
import { getAdvertisingId } from '@symbiote-native/tracking-transparency';

function TrackingScreen() {
  const [permissionStatus, requestPermission] = useTrackingPermissions();

  return (
    <view>
      <text>{permissionStatus()?.status ?? 'checking…'}</text>
      <pressable onPress={() => void requestPermission()}>
        <text>Request tracking permission</text>
      </pressable>
      <pressable onPress={() => console.log(getAdvertisingId())}>
        <text>Log advertising ID</text>
      </pressable>
    </view>
  );
}
```

The examples above mirror the real canary demo screens:
`examples/expo-react/screens/TrackingTransparencyScreen.tsx`,
`examples/expo-vue-sfc/screens/TrackingTransparencyScreen.vue`,
`examples/expo-vue-tsx/screens/TrackingTransparencyScreen.tsx`,
`examples/expo-svelte/screens/TrackingTransparencyScreen.svelte`,
`examples/expo-solid/screens/TrackingTransparencyScreen.tsx`,
`examples/expo-angular/src/screens/TrackingTransparencyScreen.ts`.

## API

```ts
getAdvertisingId(): string | null
// The advertising ID (Android AAID / iOS IDFA). Returns null on the iOS simulator, when tracking
// hasn't been authorized via requestTrackingPermissionsAsync, or when the user declined.

getTrackingPermissionsAsync(): Promise<PermissionResponse>
requestTrackingPermissionsAsync(): Promise<PermissionResponse>
// On Android and web these always resolve granted - there is no tracking-consent concept there.
// On iOS these drive the real ATT prompt / read its current status.

isAvailable(): boolean
// Whether the native module resolved at all.
```

Plus `PermissionStatus`/`PermissionResponse`/`PermissionExpiration`/`PermissionHookOptions`:
re-exported verbatim from `expo-modules-core`, never the `expo` meta-package.

```ts
import {
  getAdvertisingId,
  getTrackingPermissionsAsync,
} from '@symbiote-native/tracking-transparency';

// framework-scoped entry points re-export the same free functions, plus a per-adapter
// permission wrapper:
import { useTrackingPermissions } from '@symbiote-native/tracking-transparency/react';
import { useTrackingPermissions } from '@symbiote-native/tracking-transparency/vue';
import { useTrackingPermissions } from '@symbiote-native/tracking-transparency/svelte';
import { useTrackingPermissions } from '@symbiote-native/tracking-transparency/solid';
import { TrackingPermissionsService } from '@symbiote-native/tracking-transparency/angular';
```

`useTrackingPermissions` returns a `[status, request, get]` tuple: plain value (React), `Ref` (Vue),
`Accessor` (Solid). Angular's `TrackingPermissionsService.connect()` returns a readonly `Signal`.
**Svelte's rune returns a boxed object whose `status` is a getter - do not destructure it**, or
the value freezes at its initial `null` (Svelte 5 reactivity is lexically scoped to the property
access); its actions are `requestPermission()` and `getPermission()`:

```ts
// React
const [status, request] = useTrackingPermissions();

// Vue
const [status, request] = useTrackingPermissions();

// Svelte - read permissions.status, never destructure it
const permissions = useTrackingPermissions();
permissions.status;

// Solid - status is an accessor, called at the read site
const [status, request] = useTrackingPermissions();

// Angular
readonly status = inject(TrackingPermissionsService).connect();
```

## Platform notes

- **Android and web always report granted.** There is no tracking-consent concept on either
  platform - `getTrackingPermissionsAsync`/`requestTrackingPermissionsAsync` short-circuit to a
  fixed granted response without ever calling the native module, matching upstream exactly.
- **`getAdvertisingId` returns `null` on the iOS Simulator, regardless of any settings** - there is
  no real IDFA to read there. This is expected Apple Simulator behavior, not a bug in this wrapper.

## Common questions

- **Crash on request.** `NSUserTrackingUsageDescription` is missing from Info.plist.
- **Dialog never appears.** Request only while the app state is `active`; guard duplicates.
- **Rejection under Guideline 5.1.2.** Generic text is rejected; state a concrete user benefit.

Sources: [Expo docs: TrackingTransparency](https://docs.expo.dev/versions/latest/sdk/tracking-transparency/),
[expo/expo#13059](https://github.com/expo/expo/issues/13059),
[Implement App Tracking Transparency with Expo](https://yosukep.medium.com/implement-app-tracking-transparency-with-expo-app-58cf77cb168d).

## Test it

No Fabric/Descriptor angle at all - tracking-transparency is a pure async-function + permission
surface, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/*.test.ts`, `src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`,
`vitest`), the same pattern `expo-tracking-transparency` itself uses upstream - no
`installFabric()` for the core layer, no ViewConfig. Native rendering itself is verified on-device
(see the parent [README](../../README.md) for the project's testing model).

## Known gaps

- Tests exercise the JS layer only (fake native module, `vitest`) - no on-device/simulator
  automated smoke test yet, only manual verification.

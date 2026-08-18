# @symbiote-native/cellular

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-cellular`](https://docs.expo.dev/versions/latest/sdk/cellular/) — cellular connection
generation, carrier/SIM info, and VoIP-support detection — reachable from **every** adapter:
React, Vue, Svelte, Solid, and Angular, not just React. Like [`@symbiote-native/sensors`](../sensors) and
unlike this repo's plain-RN-module/view wrappers ([`@symbiote-native/slider`](../slider),
[`@symbiote-native/splash-screen`](../splash-screen)), `expo-cellular` is built on
`expo-modules-core`, so its native code autolinks straight out of `node_modules` via
`expo-modules-autolinking` — no proxy `react-native.config.cjs`/podspec to ship. `expo-cellular`'s
own JS is never imported (it hard-imports the full `expo` meta-package, which this project never
depends on) — every function is hand-ported into this package's own `core/`.

## Install

```bash
npm install @symbiote-native/cellular
```

Depends on `expo-cellular` and `expo-modules-core` directly (regular dependencies, pinned to
exact versions — never a caret range, since this package's `core/` is hand-ported against one
specific native API shape and a newer resolve could silently drift the two apart). Never install
`expo-cellular` yourself, and never add the `expo` meta-package to this project — it bundles its
own Metro/Babel pipeline that conflicts with this project's own.

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-cellular`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package with zero further changes:

| Platform | Touches                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | `ios/Podfile` — add `use_expo_modules!`                                                                                                             |
| iOS      | `AppDelegate.swift` — Expo's runtime-bootstrap hook                                                                                                 |
| Android  | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects                                                               |
| Android  | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |
| Android  | `AndroidManifest.xml` — the `READ_PHONE_STATE` permission, needed to read carrier/SIM info                                                          |

Full mechanics — the Podfile pieces that normally ship inside the `expo` package, the `expo`
peer-dependency exclusion list, per-module permission strings — live in the
`symbiote-expo-native-module` project skill. This wiring is already done for all four
`examples/expo-*` canary apps (React, Vue SFC, Vue TSX, Angular).

## Shape

```
src/core/              cellular.ts (the free functions) + types.ts (CellularGeneration enum) +
                        native-module.ts, which resolves the native module by name through
                        expo-modules-core's requireNativeModule.
src/react/hooks/        @symbiote-native/cellular/react   — usePermissions
src/vue/composables/    @symbiote-native/cellular/vue     — usePermissions
src/svelte/runes/       @symbiote-native/cellular/svelte  — usePermissions
src/solid/primitives/   @symbiote-native/cellular/solid   — createPermissions (Solid says
                                                            create*, not use*)
src/angular/services/   @symbiote-native/cellular/angular — PermissionsService
```

Each adapter's `usePermissions` hook/composable/service is a thin lifecycle wrapper (fetch on
mount, expose `request`/`get` to re-check imperatively) over the same `core` functions — the
permission-fetch logic is written once and shared by every adapter.

## Use it

```tsx
// React
import { useEffect, useState } from 'react';
import {
  CellularGeneration,
  getCarrierNameAsync,
  getCellularGenerationAsync,
} from '@symbiote-native/cellular';
import { usePermissions } from '@symbiote-native/cellular/react';

function CellularScreen() {
  const [generation, setGeneration] = useState<CellularGeneration | null>(null);
  const [carrierName, setCarrierName] = useState<string | null>(null);
  const [status, requestPermission] = usePermissions();

  useEffect(() => {
    Promise.all([getCellularGenerationAsync(), getCarrierNameAsync()]).then(
      ([gen, carrier]) => {
        setGeneration(gen);
        setCarrierName(carrier);
      },
    );
  }, []);

  return (
    <>
      <Text>
        {generation === null ? 'checking…' : CellularGeneration[generation]}
      </Text>
      <Text>{carrierName ?? 'checking…'}</Text>
      <Text>{status === null ? 'checking…' : status.status}</Text>
      <Button title="Request permission" onPress={() => requestPermission()} />
    </>
  );
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  CellularGeneration,
  getCarrierNameAsync,
  getCellularGenerationAsync,
} from '@symbiote-native/cellular';
import { usePermissions } from '@symbiote-native/cellular/vue';

const generation = ref<CellularGeneration | null>(null);
const carrierName = ref<string | null>(null);
const { status, request: requestPermission } = usePermissions();

onMounted(() => {
  Promise.all([getCellularGenerationAsync(), getCarrierNameAsync()]).then(
    ([gen, carrier]) => {
      generation.value = gen;
      carrierName.value = carrier;
    },
  );
});
</script>
<template>
  <Text>{{
    generation === null ? 'checking…' : CellularGeneration[generation]
  }}</Text>
  <Text>{{ carrierName ?? 'checking…' }}</Text>
  <Text>{{ status === null ? 'checking…' : status.status }}</Text>
  <Button title="Request permission" :onPress="() => requestPermission()" />
</template>
```

```ts
// Angular
import { Component, inject, signal } from '@angular/core';
import {
  CellularGeneration,
  PermissionsService,
  getCarrierNameAsync,
  getCellularGenerationAsync,
} from '@symbiote-native/cellular/angular';

@Component({
  selector: 'CellularScreen',
  template: `
    <Text>{{
      generation() === null ? 'checking…' : CellularGeneration[generation()!]
    }}</Text>
    <Text>{{ carrierName() ?? 'checking…' }}</Text>
    <Text>{{ permissionStatus()?.status ?? 'checking…' }}</Text>
    <Button
      title="Request permission"
      (press)="permissionsService.request()"
    ></Button>
  `,
})
export class CellularScreen {
  readonly CellularGeneration = CellularGeneration;
  private readonly permissionsService = inject(PermissionsService);
  readonly permissionStatus = this.permissionsService.connect();

  readonly generation = signal<CellularGeneration | null>(null);
  readonly carrierName = signal<string | null>(null);

  constructor() {
    Promise.all([getCellularGenerationAsync(), getCarrierNameAsync()]).then(
      ([generation, carrier]) => {
        this.generation.set(generation);
        this.carrierName.set(carrier);
      },
    );
  }
}
```

Trimmed from the real demo screens — `examples/expo-react/screens/CellularScreen.tsx` and its
Vue SFC, Vue TSX, and Angular twins (`examples/expo-vue-sfc/screens/CellularScreen.vue`,
`examples/expo-vue-tsx/screens/CellularScreen.tsx`, `examples/expo-angular/src/screens/CellularScreen.ts`),
which also cover `allowsVoipAsync`/`getIsoCountryCodeAsync`/`getMobileCountryCodeAsync`/
`getMobileNetworkCodeAsync` and gate the Android-only fields behind `Platform.OS === 'android'`.

## API

Mostly stateless async functions, no event stream — plus one stateful pair,
`getPermissionsAsync`/`requestPermissionsAsync`, which gets its own lifecycle
hook/composable/service (`usePermissions`) so a component can re-check permission status
imperatively without re-wiring the fetch itself.

Carrier/SIM info and VoIP support are **Android only** — every one of those functions resolves
`null` on iOS without touching the native module at all, since iOS doesn't expose this
information. `getPermissionsAsync`/`requestPermissionsAsync` need no real permission grant on
iOS either (cellular info requires none there), so they resolve a plain `GRANTED` response
without a native call.

```ts
getCellularGenerationAsync(): Promise<CellularGeneration>
// UNKNOWN/CELLULAR_2G/CELLULAR_3G/CELLULAR_4G/CELLULAR_5G. Delegates to the native module on
// every platform — no iOS gate, unlike every other function below.

allowsVoipAsync(): Promise<boolean | null>
// @deprecated (upstream is deprecating this). null on iOS, native call on Android.

getIsoCountryCodeAsync(): Promise<string | null>       // Android only — null on iOS.
getCarrierNameAsync(): Promise<string | null>           // Android only — null on iOS.
getMobileCountryCodeAsync(): Promise<string | null>     // Android only — null on iOS.
getMobileNetworkCodeAsync(): Promise<string | null>     // Android only — null on iOS.

getPermissionsAsync(): Promise<PermissionResponse>
// Android delegates to the native module; every other platform resolves a plain GRANTED
// literal — no permission is needed there for cellular info.

requestPermissionsAsync(): Promise<PermissionResponse>
// Same split as getPermissionsAsync.
```

Plus `CellularGeneration` (enum) and `PermissionResponse`/`PermissionStatus`/
`PermissionExpiration` — the latter three re-exported straight from `expo-modules-core`, not
ported by hand.

```ts
import {
  getCellularGenerationAsync,
  getCarrierNameAsync,
} from '@symbiote-native/cellular';

// framework-scoped entry points re-export the same free functions, plus usePermissions:
import { usePermissions } from '@symbiote-native/cellular/react';
import { usePermissions } from '@symbiote-native/cellular/vue';
import { usePermissions } from '@symbiote-native/cellular/svelte';
import { createPermissions } from '@symbiote-native/cellular/solid';
import { PermissionsService } from '@symbiote-native/cellular/angular';
```

### `usePermissions`

Fetches the current permission status on mount, then exposes `request`/`get` to re-check it
imperatively — every adapter follows the same shape as its sibling `PermissionsService`/
composable in `@symbiote-native/brightness`, the other package in this repo needing the same
get/request permission pair.

```tsx
// React — a [status, request, get] tuple, mirroring upstream's own usePermissions hooks
const [status, requestPermission, getPermission] = usePermissions();
```

```ts
// Vue — a { status, request, get } object; status is a Ref
const { status, request, get } = usePermissions();
```

```ts
// Svelte — the same object, boxed as getters: permissions.status
const permissions = usePermissions();
```

```ts
// Solid — createPermissions, and status/error are accessors: status()
const { status, request, get } = createPermissions();
```

```ts
// Angular — connect() returns a readonly Signal; request()/get() live on the service itself
readonly status = inject(PermissionsService).connect();
// later: inject(PermissionsService).request()
```

## Test it

No Fabric/Descriptor angle at all — cellular info is a pure async-function + permission surface,
never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/cellular.test.ts`,
`src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`, run via `vitest`) — no `installFabric()`, no
ViewConfig. Native rendering itself is verified on-device (see the parent
[README](../../README.md)).

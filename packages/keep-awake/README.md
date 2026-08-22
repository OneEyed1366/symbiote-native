# @symbiote-native/keep-awake

Port of [`expo-keep-awake`](https://docs.expo.dev/versions/latest/sdk/keep-awake/) for
[SymbioteNative](../../README.md) — keeps the screen on for the lifetime of a mounted
component/composable/service, reachable from every adapter (React, Vue, Svelte, Solid, Angular),
not just React.

Built the same way as [`@symbiote-native/battery`](../battery) and
[`@symbiote-native/device`](../device), an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

## Install

```bash
npm install @symbiote-native/keep-awake
```

Depends on `expo-keep-awake` and `expo-modules-core` directly (regular dependencies, pinned to
exact versions — never a caret range, since this package's `core/` is hand-ported against one
specific native API shape and a newer resolve could silently drift the two apart). Never install
`expo-keep-awake` yourself, and never add the `expo` package to this project — it bundles its own
Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-keep-awake`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package (`@symbiote-native/battery`, `@symbiote-native/device`, `@symbiote-native/sensors`, …)
with zero further changes:

| Platform | Touches                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | `ios/Podfile` — add `use_expo_modules!`                                                                                                             |
| iOS      | `AppDelegate.swift` — Expo's runtime-bootstrap hook                                                                                                 |
| Android  | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects                                                               |
| Android  | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

The recurring per-package half of the Android wiring (`app/build.gradle`'s
`implementation project(':expo-keep-awake')` line and `MainApplication.kt`'s module-name map
entry) is automated by this package's own `postinstall` script via
`@symbiote-native/expo-modules-link` — see that package's README for how the `native-link.json`
manifest above drives it. Full mechanics — the Podfile pieces that normally ship inside the
`expo` package, the `expo` peer-dependency exclusion list — live in the
`symbiote-expo-native-module` skill.

No platform permission string is needed — keeping the screen awake has no runtime permission
prompt on either platform.

## Shape

```
src/core/               keep-awake.ts — isAvailableAsync/activateKeepAwakeAsync/
                        deactivateKeepAwake/addListener, ExpoKeepAwakeTag. native-module.ts
                        resolves the native module through expo-modules-core's
                        requireNativeModule. types.ts — KeepAwakeEvent/KeepAwakeListener/
                        KeepAwakeOptions, hand-ported from KeepAwake.types.ts.
src/react/hooks/        @symbiote-native/keep-awake/react   — useKeepAwake
src/vue/composables/    @symbiote-native/keep-awake/vue     — useKeepAwake
src/svelte/runes/       @symbiote-native/keep-awake/svelte  — useKeepAwake
src/solid/primitives/   @symbiote-native/keep-awake/solid   — createKeepAwake (Solid says
                                                              create*, not use*)
src/angular/services/   @symbiote-native/keep-awake/angular — KeepAwakeService (`.connect()`,
                        no return value — a pure side effect for the component's lifetime)
```

Each adapter's hook/composable/rune/primitive/service activates a keep-awake lock on mount and
deactivates it on unmount, over the same `core` functions — the tag-generation and
activate/deactivate lifecycle is written once and shared by every adapter. React uses `useId()`
for its default per-instance tag, matching upstream; Vue, Svelte, Solid and Angular have no
`useId` equivalent, so they fall back to a small monotonically-incrementing module-local counter (`keep-awake-tag-1`, `keep-awake-tag-2`, …) when
no explicit tag is given.

## Use it

```tsx
// React — examples/expo-react/screens/KeepAwakeScreen.tsx
import { useKeepAwake } from '@symbiote-native/keep-awake/react';

function KeepAwakeScreen() {
  useKeepAwake(); // screen stays on for as long as this component is mounted

  return <Text>Screen will not sleep</Text>;
}
```

```vue
<!-- Vue — examples/expo-vue-sfc/screens/KeepAwakeScreen.vue -->
<script setup lang="ts">
import { useKeepAwake } from '@symbiote-native/keep-awake/vue';

useKeepAwake();
</script>
<template>
  <Text>Screen will not sleep</Text>
</template>
```

```ts
// Angular — examples/expo-angular/src/screens/KeepAwakeScreen.ts
import { Component, inject } from '@angular/core';
import { KeepAwakeService } from '@symbiote-native/keep-awake/angular';

@Component({/* ... */})
export class KeepAwakeScreen {
  constructor() {
    inject(KeepAwakeService).connect();
  }
}
```

## API

```ts
isAvailableAsync(): Promise<boolean>                          // keep-awake API availability on this device
activateKeepAwakeAsync(tag?: string): Promise<void>           // acquires a lock under `tag` (default tag when omitted)
deactivateKeepAwake(tag?: string): Promise<void>              // releases the lock under `tag` (default tag when omitted)
addListener(tagOrListener, listener?): EventSubscription      // subscribes to keep-awake state changes
```

Plus `ExpoKeepAwakeTag` (the shared default tag string), `KeepAwakeEvent`, `KeepAwakeListener`,
`KeepAwakeOptions` — ported from upstream's `KeepAwake.types.ts`. `KeepAwakeEvent#state` is kept
as a minimal `unknown` placeholder: upstream's own shape there is web-specific and has no native
analogue, and native listeners for it rarely fire.

```ts
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from '@symbiote-native/keep-awake';

// framework-scoped entry points re-export the same free functions, plus a lifecycle
// hook/composable/service:
import { useKeepAwake } from '@symbiote-native/keep-awake/react';
import { useKeepAwake } from '@symbiote-native/keep-awake/vue';
import { useKeepAwake } from '@symbiote-native/keep-awake/svelte';
import { createKeepAwake } from '@symbiote-native/keep-awake/solid';
import { KeepAwakeService } from '@symbiote-native/keep-awake/angular';
```

Each hook/composable/rune/primitive/service activates a lock on mount (optionally registering
`options.listener` once activation resolves) and deactivates it on unmount — mirroring upstream's
own `useKeepAwake(tag?, options?)`. Solid's `createKeepAwake(tag?, options?)` does it from the
primitive body, releasing through `onCleanup`.

## Test it

No Fabric/Descriptor angle at all — keep-awake is a pure async-function + `EventEmitter` listener
surface, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/keep-awake.test.ts`,
`src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`, `vitest`), the same pattern
`@symbiote-native/battery` and `@symbiote-native/device` use — no `installFabric()`-driven Fabric
assertions on the core level, only the adapter lifecycle tests mount through the fake Fabric slot
to prove activate-on-mount/deactivate-on-unmount. Native rendering itself is verified on-device —
see the parent [README](../../README.md).

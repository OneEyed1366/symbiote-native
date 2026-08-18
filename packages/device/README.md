# @symbiote-native/device

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-device`](https://github.com/expo/expo/tree/main/packages/expo-device)
— physical device information: brand/model/OS constants, uptime, max-memory,
root/jailbreak detection, side-loading detection, and platform-feature queries — usable from
**every** adapter, React, Vue, and Angular, not just React. Like
[`@symbiote-native/local-auth`](../local-auth) and unlike this repo's stateful Expo wrapper
([`@symbiote-native/sensors`](../sensors), an `EventEmitter` + live-subscription surface), every
export here is either an eagerly-resolved constant or a one-shot async call with no per-instance
state, so there is no hook/composable/service to wrap — the React, Vue, and Angular entry points
are plain re-exports of the same `core`.

## Install

```bash
npm install @symbiote-native/device
```

`expo-device` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions — never install either yourself, and never add the `expo` meta-package to your project
(it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-device`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package with zero further changes:

| Platform | Touches                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | `ios/Podfile` — add `use_expo_modules!`                                                                                                             |
| iOS      | `AppDelegate.swift` — Expo's runtime-bootstrap hook                                                                                                 |
| Android  | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects                                                               |
| Android  | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics live in the `symbiote-expo-native-module` project skill. Reference
implementation: `examples/expo-react/ios/Podfile` and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt`.

`expo-device` needs no runtime permission on either platform — every constant and function here
reads plain system/build information, nothing gated by a permission prompt.

## Shape

```
src/core/     Eager constants (isDevice, brand, manufacturer, modelId, modelName, designName,
              productName, deviceType, deviceYearClass, totalMemory,
              supportedCpuArchitectures, osName, osVersion, osBuildId, osInternalBuildId,
              osBuildFingerprint, platformApiLevel, deviceName), plus getDeviceTypeAsync /
              getUptimeAsync / getMaxMemoryAsync / isRootedExperimentalAsync /
              isSideLoadingEnabledAsync / getPlatformFeaturesAsync / hasPlatformFeatureAsync,
              and the DeviceType enum. native-module.ts resolves the native module via
              expo-modules-core's requireNativeModule.
src/react/    @symbiote-native/device/react   — export * from '../core'
src/vue/      @symbiote-native/device/vue     — export * from '../core'
src/angular/  @symbiote-native/device/angular — export * from '../core'
```

No per-adapter lifecycle wrapper exists because there's nothing to subscribe to or clean up —
each adapter entry is a single-file re-export.

## Use it

```tsx
// React
import { useEffect, useState } from 'react';
import { Text, View } from '@symbiote-native/react';
import {
  brand,
  deviceName,
  getMaxMemoryAsync,
  getUptimeAsync,
  isDevice,
  modelName,
  osName,
  osVersion,
} from '@symbiote-native/device/react';

function DeviceScreen() {
  const [uptime, setUptime] = useState<number | null>(null);
  const [maxMemory, setMaxMemory] = useState<number | null>(null);

  useEffect(() => {
    getUptimeAsync().then(setUptime);
    getMaxMemoryAsync().then(setMaxMemory);
  }, []);

  return (
    <View>
      <Text>{isDevice ? 'Real device' : 'Simulator/emulator'}</Text>
      <Text>{`${brand ?? 'unknown'} ${modelName ?? ''}`}</Text>
      <Text>{`${osName ?? 'unknown OS'} ${osVersion ?? ''}`}</Text>
      <Text>{deviceName ?? 'unnamed device'}</Text>
      <Text>{uptime === null ? 'checking uptime…' : `Uptime: ${uptime}ms`}</Text>
      <Text>{maxMemory === null ? 'checking memory…' : `Max memory: ${maxMemory} bytes`}</Text>
    </View>
  );
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Text, View } from '@symbiote-native/vue';
import {
  brand,
  deviceName,
  getMaxMemoryAsync,
  getUptimeAsync,
  isDevice,
  modelName,
  osName,
  osVersion,
} from '@symbiote-native/device/vue';

const uptime = ref<number | null>(null);
const maxMemory = ref<number | null>(null);

onMounted(() => {
  void getUptimeAsync().then(value => (uptime.value = value));
  void getMaxMemoryAsync().then(value => (maxMemory.value = value));
});
</script>

<template>
  <View>
    <Text>{{ isDevice ? 'Real device' : 'Simulator/emulator' }}</Text>
    <Text>{{ `${brand ?? 'unknown'} ${modelName ?? ''}` }}</Text>
    <Text>{{ `${osName ?? 'unknown OS'} ${osVersion ?? ''}` }}</Text>
    <Text>{{ deviceName ?? 'unnamed device' }}</Text>
    <Text>{{ uptime === null ? 'checking uptime…' : `Uptime: ${uptime}ms` }}</Text>
    <Text>{{ maxMemory === null ? 'checking memory…' : `Max memory: ${maxMemory} bytes` }}</Text>
  </View>
</template>
```

```ts
// Angular
import { Component, signal } from '@angular/core';
import { Text, View } from '@symbiote-native/angular';
import {
  brand,
  deviceName,
  getMaxMemoryAsync,
  getUptimeAsync,
  isDevice,
  modelName,
  osName,
  osVersion,
} from '@symbiote-native/device/angular';

@Component({
  standalone: true,
  imports: [Text, View],
  template: `
    <View>
      <Text>{{ isDevice ? 'Real device' : 'Simulator/emulator' }}</Text>
      <Text>{{ brand ?? 'unknown' }} {{ modelName ?? '' }}</Text>
      <Text>{{ osName ?? 'unknown OS' }} {{ osVersion ?? '' }}</Text>
      <Text>{{ deviceName ?? 'unnamed device' }}</Text>
      <Text>{{ uptime() === null ? 'checking uptime…' : 'Uptime: ' + uptime() + 'ms' }}</Text>
      <Text>{{
        maxMemory() === null ? 'checking memory…' : 'Max memory: ' + maxMemory() + ' bytes'
      }}</Text>
    </View>
  `,
})
export class DeviceScreen {
  readonly isDevice = isDevice;
  readonly brand = brand;
  readonly modelName = modelName;
  readonly osName = osName;
  readonly osVersion = osVersion;
  readonly deviceName = deviceName;

  readonly uptime = signal<number | null>(null);
  readonly maxMemory = signal<number | null>(null);

  constructor() {
    getUptimeAsync().then(value => this.uptime.set(value));
    getMaxMemoryAsync().then(value => this.maxMemory.set(value));
  }
}
```

There's no per-instance service to `inject()` in the Angular case — every constant/function is a
plain export off the core package, read straight in the constructor or class-field initializer.
These snippets mirror the real canary demo screens — `examples/expo-react/screens/DeviceScreen.tsx`,
`examples/expo-vue-sfc/screens/DeviceScreen.vue`, `examples/expo-vue-tsx/screens/DeviceScreen.tsx`,
`examples/expo-angular/src/screens/DeviceScreen.ts`.

## API

Eagerly-resolved constants, plus a handful of one-shot async functions — no event stream, no
per-instance state — so the React/Vue/Angular entry points above are plain re-exports of `core`
with nothing adapter-specific to add.

```ts
// Constants — resolved once, at import time, straight off the native module:
isDevice: boolean
brand: string | null
manufacturer: string | null
modelId: string | null                    // iOS only
modelName: string | null
designName: string | null                 // Android only
productName: string | null                // Android only
deviceType: DeviceType | null
deviceYearClass: number | null
totalMemory: number | null
supportedCpuArchitectures: string[] | null
osName: string | null
osVersion: string | null
osBuildId: string | null
osInternalBuildId: string | null
osBuildFingerprint: string | null         // Android only
platformApiLevel: number | null           // Android only
deviceName: string | null

// Functions:
getDeviceTypeAsync(): Promise<DeviceType>
getUptimeAsync(): Promise<number>                    // Android + iOS
getMaxMemoryAsync(): Promise<number>                 // Android only; -1 sentinel normalized to Number.MAX_SAFE_INTEGER
isRootedExperimentalAsync(): Promise<boolean>        // best-effort root/jailbreak check
isSideLoadingEnabledAsync(): Promise<boolean>        // Android only
getPlatformFeaturesAsync(): Promise<string[]>        // Android only; [] elsewhere, never throws
hasPlatformFeatureAsync(feature: string): Promise<boolean> // Android only; false elsewhere, never throws
```

Plus `DeviceType` (`UNKNOWN`/`PHONE`/`TABLET`/`DESKTOP`/`TV`) — ported from upstream's
`Device.types.ts`.

```ts
import { getDeviceTypeAsync, isDevice } from '@symbiote-native/device';
// or the framework-scoped entry points — identical surface, re-exported verbatim:
import { getDeviceTypeAsync } from '@symbiote-native/device/react';
import { getDeviceTypeAsync } from '@symbiote-native/device/vue';
import { getDeviceTypeAsync } from '@symbiote-native/device/angular';
```

## Notes

- **Every function except `getPlatformFeaturesAsync`/`hasPlatformFeatureAsync` throws an
  `UnavailabilityError` when the native method is missing.** Those two are the deliberate
  exceptions — they resolve to `[]`/`false` instead, matching upstream, since a platform-feature
  query on a platform with no such concept (iOS) is a normal "no" answer, not an error.
- **`getMaxMemoryAsync`'s `-1` native sentinel means "no inherent limit"** and is normalized to
  `Number.MAX_SAFE_INTEGER` before it reaches your code — you never see the raw `-1`.
- **`isRootedExperimentalAsync` is a best-effort check, not a guarantee** — root/jailbreak
  detection bypasses exist on both platforms; a `false` result does not prove the device is
  unmodified.

## Test it

No Fabric/Descriptor angle at all — every export here is a pure constant or async-function
surface, never a view or per-instance state. Tests inject a fake native-module object in place of
the real `requireNativeModule` resolution (`src/core/device.test.ts`, `vitest`) — no
`installFabric()`, no ViewConfig. Native rendering itself is verified on-device (see the parent
[README](../../README.md) for the project's testing model).

Native autolinking wiring for `expo-modules-core` packages is already done in the four Expo
canary apps (`examples/expo-react`, `examples/expo-vue-sfc`, `examples/expo-vue-tsx`,
`examples/expo-angular`) via `@symbiote-native/local-auth`/`@symbiote-native/sensors` — this
package reuses that same wiring with zero further app-side changes, since
`expo-modules-autolinking` discovers any `expo-modules-core` package already present in
`node_modules`. A dedicated `DeviceScreen` demo has not been wired into those canaries yet.

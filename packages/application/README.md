# @symbiote-native/application

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-application`](https://github.com/expo/expo/tree/main/packages/expo-application)
— native app version/build/name/ID, the Android ID, install-referrer and install/update-time
lookups, and the iOS vendor ID / release type / push-notification-service environment — usable
from **every** adapter, React, Vue, Svelte, Solid, and Angular. Like
[`@symbiote-native/local-auth`](../local-auth) (and unlike `@symbiote-native/sensors`'s
`EventEmitter` + live-subscription surface), everything here is either a plain constant resolved
once at import time or a one-shot async call with no per-instance state, so there is no hook/
composable/service to wrap — every adapter's entry point is a plain re-export of the same `core`.

## Install

```bash
npm install @symbiote-native/application
```

`expo-application` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions — never install either yourself, and never add the `expo` meta-package to your project
(it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-application`'s native code is discovered by
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

No app-level permission strings are needed — every function here reads app/device metadata that
carries no runtime or manifest permission.

## Shape

```
src/core/     nativeApplicationVersion / nativeBuildVersion / applicationName / applicationId
              constants, getAndroidId, getInstallReferrerAsync, getIosIdForVendorAsync,
              getIosApplicationReleaseTypeAsync, getIosPushNotificationServiceEnvironmentAsync,
              getInstallationTimeAsync, getLastUpdateTimeAsync, plus ApplicationReleaseType and
              PushNotificationServiceEnvironment. native-module.ts resolves the native module via
              expo-modules-core's requireNativeModule.
src/angular/  @symbiote-native/application/angular — export * from '../core'
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/`
— no physical per-framework file, since there's nothing to subscribe to or clean up. `./angular`
stays a physical file/subpath since Angular ships through a separate `ngc`/AOT build (`build-ngc/`).

## Use it

```tsx
// React
import { useEffect, useState } from 'react';
import { Platform, Text, View } from '@symbiote-native/react';
import {
  applicationId,
  applicationName,
  getInstallationTimeAsync,
  nativeApplicationVersion,
  nativeBuildVersion,
} from '@symbiote-native/application/react';

function ApplicationScreen() {
  const [installedAt, setInstalledAt] = useState<Date | null>(null);

  useEffect(() => {
    getInstallationTimeAsync().then(setInstalledAt);
  }, []);

  return (
    <View>
      <Text>
        {applicationName} ({applicationId})
      </Text>
      <Text>
        v{nativeApplicationVersion} (build {nativeBuildVersion})
      </Text>
      {Platform.OS === 'android' && installedAt && (
        <Text>Installed {installedAt.toLocaleDateString()}</Text>
      )}
    </View>
  );
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Platform, Text, View } from '@symbiote-native/vue';
import {
  applicationId,
  applicationName,
  getInstallationTimeAsync,
  nativeApplicationVersion,
  nativeBuildVersion,
} from '@symbiote-native/application/vue';

const installedAt = ref<Date | null>(null);

onMounted(() => {
  void getInstallationTimeAsync().then(value => (installedAt.value = value));
});
</script>

<template>
  <View>
    <Text>{{ applicationName }} ({{ applicationId }})</Text>
    <Text
      >v{{ nativeApplicationVersion }} (build {{ nativeBuildVersion }})</Text
    >
    <Text v-if="Platform.OS === 'android' && installedAt">
      Installed {{ installedAt?.toLocaleDateString() }}
    </Text>
  </View>
</template>
```

```ts
// Angular
import { Component, signal } from '@angular/core';
import { Platform, Text, View } from '@symbiote-native/angular';
import {
  applicationId,
  applicationName,
  getInstallationTimeAsync,
  nativeApplicationVersion,
  nativeBuildVersion,
} from '@symbiote-native/application/angular';

@Component({
  standalone: true,
  imports: [Text, View],
  template: `
    <View>
      <Text>{{ applicationName }} ({{ applicationId }})</Text>
      <Text
        >v{{ nativeApplicationVersion }} (build {{ nativeBuildVersion }})</Text
      >
      @if (Platform.OS === 'android' && installedAt(); as date) {
        <Text>Installed {{ date.toLocaleDateString() }}</Text>
      }
    </View>
  `,
})
export class ApplicationScreen {
  readonly Platform = Platform;
  readonly installedAt = signal<Date | null>(null);

  constructor() {
    getInstallationTimeAsync().then(value => this.installedAt.set(value));
  }
}
```

```svelte
<!-- Svelte -->
<script lang="ts">
  import { Platform, Text, View } from '@symbiote-native/svelte';
  import {
    applicationId,
    applicationName,
    getInstallationTimeAsync,
    nativeApplicationVersion,
    nativeBuildVersion,
  } from '@symbiote-native/application/svelte';

  let installedAt = $state<Date | null>(null);

  getInstallationTimeAsync().then(value => {
    installedAt = value;
  });
</script>

<View>
  <Text>{applicationName} ({applicationId})</Text>
  <Text>v{nativeApplicationVersion} (build {nativeBuildVersion})</Text>
  {#if Platform.OS === 'android' && installedAt !== null}
    <Text>Installed {installedAt.toLocaleDateString()}</Text>
  {/if}
</View>
```

```tsx
// Solid
import { createSignal } from 'solid-js';
import { Platform, Text, View } from '@symbiote-native/solid';
import {
  applicationId,
  applicationName,
  getInstallationTimeAsync,
  nativeApplicationVersion,
  nativeBuildVersion,
} from '@symbiote-native/application/solid';

function ApplicationScreen() {
  const [installedAt, setInstalledAt] = createSignal<Date | null>(null);

  getInstallationTimeAsync().then(setInstalledAt);

  return (
    <View>
      <Text>
        {applicationName} ({applicationId})
      </Text>
      <Text>
        v{nativeApplicationVersion} (build {nativeBuildVersion})
      </Text>
      {Platform.OS === 'android' && installedAt() !== null && (
        <Text>Installed {installedAt()!.toLocaleDateString()}</Text>
      )}
    </View>
  );
}
```

There's no per-instance service to `inject()` in the Angular case — every function is a plain
free function off the core package, called straight from the constructor (or, on Solid, straight
from the component body). All five examples mirror the real canary demo screens —
`examples/expo-react/screens/ApplicationScreen.tsx`,
`examples/expo-vue-sfc/screens/ApplicationScreen.vue`,
`examples/expo-vue-tsx/screens/ApplicationScreen.tsx`,
`examples/expo-svelte/screens/ApplicationScreen.svelte`,
`examples/expo-solid/screens/ApplicationScreen.tsx`,
`examples/expo-angular/src/screens/ApplicationScreen.ts`.

## API

Plain constants plus one-shot async functions, no event stream, no per-instance state — upstream
ships app/device metadata reads, not a subscribable resource, so the React/Vue/Angular entry
points above are plain re-exports of `core` with nothing adapter-specific to add.

```ts
nativeApplicationVersion: string | null
nativeBuildVersion: string | null
applicationName: string | null
applicationId: string | null

getAndroidId(): string // android only, throws off android
getInstallReferrerAsync(): Promise<string> // android only
getIosIdForVendorAsync(): Promise<string | null> // ios only
getIosApplicationReleaseTypeAsync(): Promise<ApplicationReleaseType> // ios only
getIosPushNotificationServiceEnvironmentAsync(): Promise<PushNotificationServiceEnvironment> // ios only
getInstallationTimeAsync(): Promise<Date>
getLastUpdateTimeAsync(): Promise<Date> // android only
```

Plus `ApplicationReleaseType` and `PushNotificationServiceEnvironment` — ported from upstream's
`Application.types.ts`, renamed with this repo's `I`-prefix convention where applicable
(`PushNotificationServiceEnvironment` stays a plain string-literal union, not a struct, so it
carries no `I` prefix; `ts-js-best-practices`).

```ts
import {
  getInstallationTimeAsync,
  nativeApplicationVersion,
} from '@symbiote-native/application';
// or the framework-scoped entry points — identical surface, re-exported verbatim:
import { getInstallationTimeAsync } from '@symbiote-native/application/react';
import { getInstallationTimeAsync } from '@symbiote-native/application/vue';
import { getInstallationTimeAsync } from '@symbiote-native/application/angular';
```

## Notes

- **Every async function throws `UnavailabilityError` when its native method is absent** —
  e.g. calling an iOS-only function on Android, or vice versa. `getAndroidId()` is the one
  synchronous exception: it checks `Platform.OS` up front and throws immediately off Android,
  never touching the native module at all.
- **`getInstallationTimeAsync`/`getLastUpdateTimeAsync` wrap a native epoch-ms number into a
  `Date`** — the native side returns a plain number, not a serialized date string.
- The four constants (`nativeApplicationVersion`, `nativeBuildVersion`, `applicationName`,
  `applicationId`) resolve once, eagerly, at import time — reading them repeatedly never
  re-queries the native module.

## Test it

No Fabric/Descriptor angle at all — every export here is a plain constant or a pure async-function
surface, never a view or per-instance state. Tests inject a fake native-module object in place of
the real `requireNativeModule` resolution (`src/core/application.test.ts`, `vitest`) — no
`installFabric()`, no ViewConfig. Native rendering itself is verified on-device (see the parent
[README](../../README.md) for the project's testing model).

Native autolinking wiring is shared with `@symbiote-native/local-auth` and every other
`expo-modules-core` package in this repo's `examples/expo-*` canaries, where this package is
demoed by the `ApplicationScreen` of each app.

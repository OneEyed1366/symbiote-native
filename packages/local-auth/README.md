# @symbiote-native/local-auth

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-local-authentication`](https://github.com/expo/expo/tree/main/packages/expo-local-authentication)
— FaceID/TouchID on iOS, the Fingerprint/Biometric API on Android — usable from **every**
adapter, React, Vue, and Angular, not just React. Unlike this repo's other Expo wrapper
([`@symbiote-native/sensors`](../sensors), an `EventEmitter` + live-subscription surface),
every function here is a one-shot async call with no per-instance state, so there is no hook/
composable/service to wrap — the React, Vue, and Angular entry points are plain re-exports of
the same `core`.

## Install

```bash
npm install @symbiote-native/local-auth
```

`expo-local-authentication` and `expo-modules-core` come along as regular dependencies, pinned
to exact versions — never install either yourself, and never add the `expo` meta-package to
your project (it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-local-authentication`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other
`expo-modules-core` package with zero further changes:

| Platform | Touches |
|---|---|
| iOS | `ios/Podfile` — add `use_expo_modules!` |
| iOS | `AppDelegate.swift` — Expo's runtime-bootstrap hook |
| Android | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects |
| Android | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics live in the `symbiote-expo-native-module` project skill. Reference
implementation: `examples/expo-react/ios/Podfile` and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt`.

Two platform permission strings ship with the native module itself — nothing to reimplement,
just add the strings your app's own Info.plist/manifest needs:

- iOS — `NSFaceIDUsageDescription` in `Info.plist` (without it, iOS silently falls back to the
  device passcode instead of prompting FaceID).
- Android — `USE_BIOMETRIC` in `AndroidManifest.xml`.

## Shape

```
src/core/     hasHardwareAsync / isEnrolledAsync / getEnrolledLevelAsync /
              supportedAuthenticationTypesAsync / authenticateAsync / cancelAuthenticate, plus
              AuthenticationType, SecurityLevel, and the option/result/error types.
              native-module.ts resolves the native module via expo-modules-core's
              requireNativeModule.
src/angular/  @symbiote-native/local-auth/angular — export * from '../core'
```

`./react`, `./vue`, and `./svelte` are `exports`-map aliases straight onto `src/core/` — no
physical per-framework file, since there's nothing to subscribe to or clean up. `./angular` stays
a physical file/subpath since Angular ships through a separate `ngc`/AOT build (`build-ngc/`).

## Use it

```tsx
// React
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from '@symbiote-native/react';
import {
  authenticateAsync,
  cancelAuthenticate,
  hasHardwareAsync,
  isEnrolledAsync,
} from '@symbiote-native/local-auth/react';
import type { ILocalAuthenticationResult } from '@symbiote-native/local-auth/react';

function LocalAuthScreen() {
  const [hasHardware, setHasHardware] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [authResult, setAuthResult] = useState<ILocalAuthenticationResult | null>(null);

  useEffect(() => {
    hasHardwareAsync().then(setHasHardware);
    isEnrolledAsync().then(setIsEnrolled);
  }, []);

  const handleAuthenticate = () => {
    authenticateAsync({ promptMessage: 'Confirm it is you' }).then(setAuthResult);
  };

  return (
    <View>
      <Text>{hasHardware && isEnrolled ? 'Ready to authenticate' : 'No biometrics enrolled'}</Text>
      <Pressable onPress={handleAuthenticate}>
        <Text>Authenticate</Text>
      </Pressable>
      {Platform.OS === 'android' && (
        <Pressable onPress={() => cancelAuthenticate()}>
          <Text>Cancel</Text>
        </Pressable>
      )}
      {authResult && <Text>{authResult.success ? 'Success' : `Failed: ${authResult.error}`}</Text>}
    </View>
  );
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Platform, Pressable, Text, View } from '@symbiote-native/vue';
import {
  authenticateAsync,
  cancelAuthenticate,
  hasHardwareAsync,
  isEnrolledAsync,
} from '@symbiote-native/local-auth/vue';
import type { ILocalAuthenticationResult } from '@symbiote-native/local-auth/vue';

const hasHardware = ref(false);
const isEnrolled = ref(false);
const authResult = ref<ILocalAuthenticationResult | null>(null);

onMounted(() => {
  void hasHardwareAsync().then(value => (hasHardware.value = value));
  void isEnrolledAsync().then(value => (isEnrolled.value = value));
});

function handleAuthenticate(): void {
  void authenticateAsync({ promptMessage: 'Confirm it is you' }).then(value => {
    authResult.value = value;
  });
}
</script>

<template>
  <View>
    <Text>{{ hasHardware && isEnrolled ? 'Ready to authenticate' : 'No biometrics enrolled' }}</Text>
    <Pressable @press="handleAuthenticate">
      <Text>Authenticate</Text>
    </Pressable>
    <Pressable v-if="Platform.OS === 'android'" @press="cancelAuthenticate">
      <Text>Cancel</Text>
    </Pressable>
    <Text v-if="authResult">{{ authResult.success ? 'Success' : `Failed: ${authResult.error}` }}</Text>
  </View>
</template>
```

```ts
// Angular
import { Component, signal } from '@angular/core';
import { Platform, Pressable, Text, View } from '@symbiote-native/angular';
import {
  authenticateAsync,
  cancelAuthenticate,
  hasHardwareAsync,
  isEnrolledAsync,
} from '@symbiote-native/local-auth/angular';
import type { ILocalAuthenticationResult } from '@symbiote-native/local-auth/angular';

@Component({
  standalone: true,
  imports: [Pressable, Text, View],
  template: `
    <View>
      <Text>{{ hasHardware() && isEnrolled() ? 'Ready to authenticate' : 'No biometrics enrolled' }}</Text>
      <Pressable (press)="handleAuthenticate()">
        <Text>Authenticate</Text>
      </Pressable>
      @if (Platform.OS === 'android') {
        <Pressable (press)="handleCancel()">
          <Text>Cancel</Text>
        </Pressable>
      }
      @if (authResult(); as result) {
        <Text>{{ result.success ? 'Success' : 'Failed: ' + result.error }}</Text>
      }
    </View>
  `,
})
export class LocalAuthScreen {
  readonly Platform = Platform;
  readonly hasHardware = signal(false);
  readonly isEnrolled = signal(false);
  readonly authResult = signal<ILocalAuthenticationResult | null>(null);

  constructor() {
    hasHardwareAsync().then(value => this.hasHardware.set(value));
    isEnrolledAsync().then(value => this.isEnrolled.set(value));
  }

  handleAuthenticate(): void {
    authenticateAsync({ promptMessage: 'Confirm it is you' }).then(value => this.authResult.set(value));
  }

  handleCancel(): void {
    cancelAuthenticate();
  }
}
```

There's no per-instance service to `inject()` in the Angular case — every function is a plain
free function off the core package, called straight from the constructor. All three examples are
trimmed from the real canary demo screens (`examples/expo-react/screens/LocalAuthScreen.tsx`,
`examples/expo-vue-sfc/screens/LocalAuthScreen.vue`, `examples/expo-vue-tsx/screens/LocalAuthScreen.tsx`,
`examples/expo-angular/src/screens/LocalAuthScreen.ts`), which also cover
`getEnrolledLevelAsync`/`supportedAuthenticationTypesAsync` and render a capabilities card.

## API

Free functions, no event stream, no per-instance state — upstream ships a handful of async
functions and two enums, not a subscribable sensor, so the React/Vue/Angular entry points above
are plain re-exports of `core` with nothing adapter-specific to add.

```ts
hasHardwareAsync(): Promise<boolean>
supportedAuthenticationTypesAsync(): Promise<AuthenticationType[]>
isEnrolledAsync(): Promise<boolean>
getEnrolledLevelAsync(): Promise<SecurityLevel>
authenticateAsync(options?: ILocalAuthenticationOptions): Promise<ILocalAuthenticationResult>
cancelAuthenticate(): Promise<void> // Android only
```

Plus `AuthenticationType`, `SecurityLevel`, `ILocalAuthenticationOptions`,
`ILocalAuthenticationResult`, `ILocalAuthenticationError`, `IBiometricsSecurityLevel` — ported
from upstream's `LocalAuthentication.types.ts`, renamed with this repo's `I`-prefix convention
for exported types (`ts-js-best-practices`).

```ts
import { authenticateAsync, hasHardwareAsync } from '@symbiote-native/local-auth';
// or the framework-scoped entry points — identical surface, re-exported verbatim:
import { authenticateAsync } from '@symbiote-native/local-auth/react';
import { authenticateAsync } from '@symbiote-native/local-auth/vue';
import { authenticateAsync } from '@symbiote-native/local-auth/angular';
```

## Notes

- **`not_enrolled` on Android almost always means the device's own lock screen has no PIN,
  pattern, or password set.** A real symptom on a fresh emulator or factory-reset device:
  `authenticateAsync` resolves `{ success: false, error: 'not_enrolled', warning:
  'KeyguardManager#isDeviceSecure() returned false' }`. This is **not** a missing app
  permission — the manifest permission this package needs is an ordinary build-time merge with
  no runtime prompt, so there's nothing for your app to request. The fix lives on the device:
  Settings → Security → Screen lock → set a PIN/pattern/password, then optionally enroll a
  fingerprint (Extended Controls → Fingerprint on an emulator) to exercise the biometric path
  too, not just the passcode fallback.
- **iOS silently falls back to the device passcode without `NSFaceIDUsageDescription`.** Apple
  requires apps using FaceID to declare why (`Info.plist`); skip it and `authenticateAsync`
  still resolves, just via the passcode prompt instead of FaceID.

## Test it

No Fabric/Descriptor angle at all — every function here is a pure async-function surface, never
a view or per-instance state. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/local-authentication.test.ts`,
`src/core/types.test.ts`, `vitest`) — no `installFabric()`, no ViewConfig. Native rendering itself
is verified on-device (see the parent [README](../../README.md) for the project's testing model).

Native autolinking wiring is done in the four Expo canary apps
(`examples/expo-react`, `examples/expo-vue-sfc`, `examples/expo-vue-tsx`, `examples/expo-angular`)
— iOS Podfile/`AppDelegate.swift` + `NSFaceIDUsageDescription`, Android Gradle/
`MainApplication.kt` + `USE_BIOMETRIC`, all four confirmed present. The one remaining gap: this
package isn't yet demoed in the plain, non-Expo `examples/react`/`vue-sfc`/`vue-tsx`/`angular`
canaries, since an `expo-modules-core` package needs the `expo-modules-autolinking` wiring only
the `examples/expo-*` apps have set up so far.

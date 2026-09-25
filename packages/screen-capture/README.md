# @symbiote-native/screen-capture

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-screen-capture`](https://github.com/expo/expo/tree/main/packages/expo-screen-capture) -
blocking or detecting screenshots/recordings and an iOS app-switcher privacy blur - usable from
**every** adapter, React, Vue, Svelte, Solid, and Angular, not just React. Built the same way as
[`@symbiote-native/print`](../print): an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --screen-capture
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --screen-capture
```

Either way: installs `@symbiote-native/screen-capture` and wires the native autolinking
automatically, see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/screen-capture
```

`expo-screen-capture` and `expo-modules-core` come along as regular, pinned dependencies, never
install either yourself, and never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time app wiring every `expo-modules-core` package shares, see
[`@symbiote-native/print`'s README](../print/README.md#required-one-time-step-native-autolinking-wiring)
for the full table; nothing package-specific here.

### Permissions and no config plugin

- **No config plugin.** Upstream ships none.
- **Android screenshot detection** needs a storage-read permission on API < 33 (`READ_MEDIA_IMAGES`
  on API 33, `READ_EXTERNAL_STORAGE` below it, nothing on API 34+). Both entries ship in
  `expo-screen-capture`'s own bundled `AndroidManifest.xml` and auto-merge via Gradle's manifest
  merger, no `native-link.json` entry needed.
- **iOS never needs a permission**: `getPermissionsAsync`/`requestPermissionsAsync` always
  resolve granted there, matching upstream.

</details>

## Shape

```
src/core/                 the whole API - native-module.ts resolves ExpoScreenCapture through
                          expo-modules-core's requireNativeModule.
src/angular/              @symbiote-native/screen-capture/angular
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/`.
`usePreventScreenCapture`, `useScreenshotListener`, and `usePermissions` are real React hooks
(built on `useEffect`/`createPermissionHook`, same §11 class as image-picker's dropped hooks) and
are not ported, call the plain async functions below directly instead.

## Use it

```ts
import {
  addScreenshotListener,
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
} from '@symbiote-native/screen-capture';

await preventScreenCaptureAsync();
const subscription = addScreenshotListener(() => console.log('screenshot taken'));
// later
subscription.remove();
await allowScreenCaptureAsync();
```

## API

| Export                               | Signature                                                | Notes                                                    |
| ------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `isAvailableAsync`                    | `() => Promise<boolean>`                                     | Whether the native module implements the prevent/allow pair. |
| `preventScreenCaptureAsync`           | `(key?: string) => Promise<void>`                            | Blocks screenshots/recordings until a matching `allowScreenCaptureAsync`. |
| `allowScreenCaptureAsync`             | `(key?: string) => Promise<void>`                            | Re-allows once every active key is released.                 |
| `enableAppSwitcherProtectionAsync`    | `(blurIntensity?: number) => Promise<void>`                   | iOS only; throws `UnavailabilityError` on Android.            |
| `disableAppSwitcherProtectionAsync`   | `() => Promise<void>`                                        | iOS only; throws `UnavailabilityError` on Android.            |
| `addScreenshotListener`               | `(listener: () => void) => EventSubscription`                | Fires when the user takes a screenshot while foregrounded.    |
| `removeScreenshotListener`            | `(subscription: EventSubscription) => void`                  | Deprecated upstream; prefer `subscription.remove()`.          |
| `getPermissionsAsync`                 | `() => Promise<PermissionResponse>`                           | Android-only concept; always granted on iOS.                  |
| `requestPermissionsAsync`             | `() => Promise<PermissionResponse>`                           | Android-only concept; always granted on iOS.                  |

## Test it

```bash
pnpm vitest run packages/screen-capture
```

Upstream ships no test suite of its own for this SDK version, so nothing to port, every test
here is net-new coverage (key-counted prevent/allow, the app-switcher pair's iOS-only failure,
the screenshot listener, and the permission fallback on iOS).

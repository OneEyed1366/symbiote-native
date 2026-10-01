# @symbiote-native/screen-capture

Keep a screen that shows sensitive or paid content out of screenshots and recordings, and find out
when a screenshot is taken. One API for every [SymbioteNative](../../README.md) adapter (React,
Vue, Svelte, Solid and Angular).

It wraps [`expo-screen-capture`](https://github.com/expo/expo/tree/main/packages/expo-screen-capture)
(including an iOS app-switcher privacy blur) the same way [`@symbiote-native/print`](../print)
wraps its upstream: `expo-modules-core` is a direct dependency and the upstream JS is hand-ported
into `core/`. See the `symbiote-expo-native-module` project skill for the full mechanism.

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
src/core/                 the async functions + the shared permissions-runtime get/request wrapper.
                          native-module.ts resolves ExpoScreenCapture through expo-modules-core's
                          requireNativeModule.
src/react/                usePreventScreenCapture + useScreenshotListener + usePermissions (hooks)
src/vue/                  same three, as composables
src/solid/                same three, as primitives
src/svelte/               same three, as runes
src/angular/              PreventScreenCaptureService + ScreenshotListenerService +
                          PermissionsService, `connect()` shape matching
                          `@symbiote-native/keep-awake`/`brightness`'s own services
```

The plain async functions stay framework-agnostic, re-exported by every adapter's own barrel.
`usePreventScreenCapture`/`useScreenshotListener`/`usePermissions` are ported to **every**
adapter, not just React, per this project's `components_split_logic_view_lifecycle` convention.

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

## Notes

- **Prevent and allow are counted by key.** Use a distinct `key` per caller so one screen leaving
  does not unblock another.
- **Screenshot callback on Android 13 and lower needs `READ_MEDIA_IMAGES`.** Android 14+ needs no
  permission for blocking or the callback. Google Play restricts that permission to apps that need
  broad photo access.
- **Test on an emulator:** `adb shell input keyevent 120` triggers a screenshot on Android; the iOS
  Simulator has Device > Trigger Screenshot.

## Common questions

- **What does a protected screen look like?** Blocked or black on Android; hidden behind a blank
  layer on iOS. Test on a device.
- **The prevent hook does nothing.** Check it runs on mount on a real device or emulator, and use a
  distinct `key` per caller.
- **The screenshot callback never fires.** Foreground only; Android 13 and lower need
  `READ_MEDIA_IMAGES`.
- **App switcher preview.** Call `enableAppSwitcherProtectionAsync()` on iOS.

Sources: [Expo docs: ScreenCapture](https://docs.expo.dev/versions/latest/sdk/screen-capture/),
[expo/expo#37874](https://github.com/expo/expo/pull/37874),
[expo/expo#21416](https://github.com/expo/expo/issues/21416).

## Test it

```bash
pnpm vitest run packages/screen-capture
```

Upstream ships no test suite of its own for this SDK version, so nothing to port, every test
here is net-new coverage (key-counted prevent/allow, the app-switcher pair's iOS-only failure,
the screenshot listener, and the permission fallback on iOS).

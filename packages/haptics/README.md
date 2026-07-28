# @symbiote-native/haptics

Port of [`expo-haptics`](https://docs.expo.dev/versions/latest/sdk/haptics/) for
[SymbioteNative](../../README.md) — vibration/haptic feedback via iOS's Taptic Engine and
Android's Vibrator API, reachable from every adapter (React, Vue, Angular), not just React.

Built the same way as [`@symbiote-native/local-auth`](../local-auth), an `expo-modules-core`-based
wrapper (see the `symbiote-expo-native-module` project skill for the full mechanism: why
`expo-modules-core` is depended on directly and never the `expo` meta-package, why the upstream
JS is hand-ported into `core/` rather than imported, and how autolinking picks up the native
module).

## API

Free functions, no event stream, no per-instance state — upstream ships four async functions and
three enums, not a subscribable sensor, so the React/Vue/Angular entry points below are plain
re-exports of `core` with nothing adapter-specific to add.

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

## Not yet done

- **Native example wiring.** `examples/react` already has a working `expo-modules-core`
  bring-up (Podfile monkeypatch + Android `settings.gradle` fallback, done for
  `@symbiote-native/sensors`) that auto-discovers any resolvable expo-modules-core package —
  adding this package needs only its entry in the Android `wantedExpoModules` allow-list in
  `examples/react/android/settings.gradle`. No permission or `Info.plist`/`AndroidManifest.xml`
  entry is needed — haptics feedback requires none on either platform. This waits on a real
  published/canary build of this package first — `examples/react` resolves `@symbiote-native/*`
  by pinned version, not `workspace:*`.
- Tests exercise the JS layer only (fake native module, `vitest`) — no on-device/simulator smoke
  test yet.

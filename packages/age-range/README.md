# @symbiote-native/age-range

Show age-appropriate content, or meet an age-assurance law, without collecting a birth date
yourself: ask the platform. One API for every [SymbioteNative](../../README.md) adapter (React,
Vue, Svelte, Solid and Angular).

It wraps [`expo-age-range`](https://github.com/expo/expo/tree/main/packages/expo-age-range)
(Apple's Declared Age Range API on iOS 26+, and Google Play's Age Signals). Like
[`@symbiote-native/application`](../application), everything here is a one-shot async call (or a
single sync setter) with no per-instance state, so there is no hook, composable or service to wrap:
every adapter entry point is a plain re-export of the same `core`.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --age-range
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --age-range
```

Either way: installs `@symbiote-native/age-range` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI, wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/age-range
```

`expo-age-range` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions. Never install either yourself, and never add the `expo` meta-package to your project
(it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-age-range`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism. This needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package with zero further changes:

| Platform | Touches                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| iOS      | `ios/Podfile`, add `use_expo_modules!`                                                                                                           |
| iOS      | `AppDelegate.swift`, Expo's runtime-bootstrap hook                                                                                                |
| Android  | `settings.gradle` / `app/build.gradle`, resolve and include the Expo Gradle projects                                                              |
| Android  | `MainApplication.kt`, Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics live in the `symbiote-expo-native-module` project skill. Reference
implementation: `examples/expo-react/ios/Podfile` and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt`.

No app-level permission strings are needed. Apple's age-range prompt and Google Play's Age
Signals consent screen are both system UI, carrying no `Info.plist`/manifest entry of their own.

**iOS needs one entitlement, added by hand.** Build with Xcode 26 or later and add
`com.apple.developer.declared-age-range` (`<true/>`) to your app's `.entitlements` file.
`native-link.json` does not generate it.

</details>

## Shape

```
src/core/     requestAgeRangeAsync / isEligibleForAgeFeaturesAsync /
              showSignificantUpdateAcknowledgmentAsync / getRequiredRegulatoryFeaturesAsync /
              requestAgeSignalsAccessAsync / setFakeAgeSignals, plus IAgeRangeRequest /
              IAgeRangeResponse / IAgeSignalsStatus / IFakeAgeSignals / IAgeRangeRegulatoryFeature.
              native-module.ts resolves the native module via expo-modules-core's
              requireNativeModule.
src/angular/  @symbiote-native/age-range/angular, export * from '../core'
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/`,
no physical per-framework file, since there's nothing to subscribe to or clean up. `./angular`
stays a physical file/subpath since Angular ships through a separate `ngc`/AOT build (`build-ngc/`).

## API

```ts
requestAgeRangeAsync(options: IAgeRangeRequest): Promise<IAgeRangeResponse>
isEligibleForAgeFeaturesAsync(): Promise<boolean | null>

showSignificantUpdateAcknowledgmentAsync(updateDescription: string): Promise<void> // ios 26.4+, no-op elsewhere
getRequiredRegulatoryFeaturesAsync(): Promise<IAgeRangeRegulatoryFeature[] | null> // ios 26.4+, null elsewhere

requestAgeSignalsAccessAsync(): Promise<IAgeSignalsStatus | null> // android only, null elsewhere
setFakeAgeSignals(fake: IFakeAgeSignals | null): void // android only, no-op elsewhere
```

```ts
import {
  requestAgeRangeAsync,
  isEligibleForAgeFeaturesAsync,
} from '@symbiote-native/age-range';
// or the framework-scoped entry points, identical surface, re-exported verbatim:
import { requestAgeRangeAsync } from '@symbiote-native/age-range/react';
import { requestAgeRangeAsync } from '@symbiote-native/age-range/vue';
import { requestAgeRangeAsync } from '@symbiote-native/age-range/angular';
```

## Notes

- **Recommended pattern**: call `isEligibleForAgeFeaturesAsync`/`getRequiredRegulatoryFeaturesAsync`
  first and only prompt with `requestAgeRangeAsync` when the result says the user actually needs
  it. Both resolve `null` where the OS can't answer (iOS below 26.2/26.4, Android, web), and
  `null` means "unknown", never "not required".
- On Android, `requestAgeSignalsAccessAsync` must resolve `'SHARED'` before `requestAgeRangeAsync`
  reports anything besides `null` fields. Play Age Signals requires the separate consent screen
  first, unlike iOS where the consent is folded into `requestAgeRangeAsync` itself.
- `setFakeAgeSignals` only works in a debuggable build. The native side throws otherwise unless
  the argument is `null` (which always goes back to real signals).
- **Test on a real device.** Simulators and emulators may not behave as expected; the canary
  `AgeRangeScreen` in the `examples/expo-*` apps exercises every call.

## Common questions

- **iOS `IOS_ENTITLEMENT_ERROR`.** Add `com.apple.developer.declared-age-range`; the Simulator lacks the feature.
- **Xcode?** 26.0 or later.
- **Android `API_NOT_AVAILABLE` / `PLAY_STORE_NOT_FOUND` / `NETWORK_ERROR`.** Needs an up-to-date
  Play Store, a network, and a Google Play install.
- **No range on Android.** Reported only while the user consents to share it.

Sources: [Expo docs: AgeRange](https://docs.expo.dev/versions/latest/sdk/age-range/),
[expo/expo#46365](https://github.com/expo/expo/issues/46365),
[AgeSignalsException](https://developer.android.com/google/play/age-signals/reference/com/google/android/play/agesignals/AgeSignalsException).

## Test it

No Fabric/Descriptor angle at all, every export here is a one-shot async function or a plain sync
setter, never a view or per-instance state. Tests inject a fake native-module object in place of
the real `requireNativeModule` resolution (`src/core/age-range.test.ts`, `vitest`), no
`installFabric()`, no ViewConfig. Native behavior itself is verified on-device (see the parent
[README](../../README.md) for the project's testing model).

# @symbiote-native/location

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-location`](https://github.com/expo/expo/tree/main/packages/expo-location) usable from
**every** adapter — React, Vue, Svelte, Solid, and Angular. Every export is a plain async
function or a `usePermissions`-style hook built by `expo-modules-core`'s `createPermissionHook`,
so there is no adapter-specific state to wrap: the React, Vue, Svelte, Solid, and Angular entry
points are plain re-exports of the same `core`.

Foreground position, heading, geocoding, and motion activity, plus background location updates
and geofencing — registered as tasks through [`@symbiote-native/task-manager`](../task-manager).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --location
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --location
```

Either way: installs `@symbiote-native/location`, wires the native autolinking automatically, and — since
this package has an optional, policy-sensitive Android bundle — asks at the end whether to grant
background location too (see the note below the manual-install block). See
[`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/location
```

`expo-location` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions — never install them yourself, and never add the `expo` meta-package to your project.

## Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships — see
[`@symbiote-native/local-auth`'s README](../local-auth/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill.

`native-link.json` declares four iOS `Info.plist` usage-description keys
(`NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationAlwaysUsageDescription`,
`NSLocationWhenInUseUsageDescription`, `NSMotionUsageDescription`) with generic default text —
override any of them by setting the same key yourself before or after install
(`@symbiote-native/expo-modules-link`'s patcher is additive-only). Android's two base permissions
(`ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION`) already ship in `expo-location`'s own
`AndroidManifest.xml` and merge automatically.

`native-link.json` also declares `ios.infoPlistArrayKeys.UIBackgroundModes: ["location"]` —
upstream's own `withLocation.ts` config plugin always adds it, since without it iOS silently
stops delivering `startLocationUpdatesAsync` updates once the app backgrounds. Wired
automatically by the same postinstall step (see `@symbiote-native/expo-modules-link`), merged
into the same array `@symbiote-native/audio`/`@symbiote-native/task-manager` may also populate.

</details>

**Background location — opt-in, asked for you.** `ACCESS_BACKGROUND_LOCATION`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, and `ACTIVITY_RECOGNITION` (+ its Play
Services counterpart) are Android permissions opt-in by default, matching upstream — requesting
background location triggers Play Console policy review, so it's a deliberate choice, never a
package side effect. `new --location`/`add --location` above already ask, interactively, whether
to grant them; say yes and the trio (minus `ACTIVITY_RECOGNITION`, still a hand-edit) lands in
your `AndroidManifest.xml` for you, along with the `startLocationUpdatesAsync` `foregroundService`
option reminder. Said no, or ran non-interactively (CI, piped stdin)? Run it any time after:

```bash
npx @symbiote-native/cli grant location
```

Idempotent — safe to run again even if already granted.

## Shape

```
src/core/     location.ts (every function + the two useXPermissions hooks), subscribers.ts (the
              watchId-keyed event-subscriber machinery shared by position/heading/motion-activity
              watches), native-module.ts (requireNativeModule resolution), types.ts.
src/angular/  @symbiote-native/location/angular — export * from '../core'
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto
`src/core/`. `./angular` stays a physical file/subpath since Angular ships through a separate
`ngc`/AOT build (`build-ngc/`).

## Use it

```ts
import {
  getCurrentPositionAsync,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
} from '@symbiote-native/location';

const { granted } = await requestForegroundPermissionsAsync();
if (granted) {
  const position = await getCurrentPositionAsync();
  const subscription = await watchPositionAsync(
    { distanceInterval: 10 },
    location => {
      console.log(location.coords);
    },
  );
  // later: subscription.remove();
}
```

Background updates and geofencing register a task defined with
[`@symbiote-native/task-manager`](../task-manager)'s `defineTask` — the task itself must be
defined at module scope, since native can relaunch the JS bundle headlessly to run it:

```ts
// index.ts, alongside AppRegistry.registerComponent
import { defineTask } from '@symbiote-native/task-manager';

const SYNC_TASK = 'background-location-sync';

defineTask(SYNC_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = data as { locations: unknown[] };
  await syncLocations(locations);
});
```

```ts
import {
  requestBackgroundPermissionsAsync,
  startLocationUpdatesAsync,
} from '@symbiote-native/location';

const { granted } = await requestBackgroundPermissionsAsync();
if (granted) {
  await startLocationUpdatesAsync(SYNC_TASK, { distanceInterval: 100 });
}
```

Identical import surface on every adapter — `@symbiote-native/location/react`, `/vue`, `/svelte`,
`/solid`, `/angular` all re-export the same functions.

## API

```ts
getProviderStatusAsync(): Promise<ILocationProviderStatus>
enableNetworkProviderAsync(): Promise<void>                          // android
getCurrentPositionAsync(options?): Promise<ILocationObject>
getLastKnownPositionAsync(options?): Promise<ILocationObject | null>
watchPositionAsync(options, callback, errorHandler?): Promise<ILocationSubscription>
getHeadingAsync(): Promise<ILocationHeadingObject>
watchHeadingAsync(callback, errorHandler?): Promise<ILocationSubscription>
geocodeAsync(address: string): Promise<ILocationGeocodedLocation[]>
reverseGeocodeAsync(location): Promise<ILocationGeocodedAddress[]>
getForegroundPermissionsAsync() / requestForegroundPermissionsAsync(): Promise<ILocationPermissionResponse>
useForegroundPermissions(options?)
getBackgroundPermissionsAsync() / requestBackgroundPermissionsAsync(): Promise<PermissionResponse>
useBackgroundPermissions(options?)
hasServicesEnabledAsync(): Promise<boolean>
getMotionActivityPermissionsAsync() / requestMotionActivityPermissionsAsync(): Promise<PermissionResponse>
useMotionActivityPermissions(options?)
getMotionActivityAsync(): Promise<IMotionActivityObject>
watchMotionActivityAsync(callback, errorHandler?): Promise<ILocationSubscription>       // foreground only
isBackgroundLocationAvailableAsync(): Promise<boolean>
startLocationUpdatesAsync(taskName, options?) / stopLocationUpdatesAsync(taskName) / hasStartedLocationUpdatesAsync(taskName)
startGeofencingAsync(taskName, regions) / stopGeofencingAsync(taskName) / hasStartedGeofencingAsync(taskName)
```

Plus the `Accuracy`/`ActivityType`/`GeofencingEventType`/`GeofencingRegionState` enum aliases and
every `ILocation*`/`IMotionActivity*` type, ported from upstream's `Location.ts`/`Location.types.ts`
with this repo's `I`-prefix convention for exported types (`ts-js-best-practices`).

## Notes

- **Motion activity needs no location permission at all** — it reads Play Services activity
  recognition / the iOS motion coprocessor directly, gated only by its own
  `getMotionActivityPermissionsAsync`/`requestMotionActivityPermissionsAsync`.
- **`watchMotionActivityAsync` is foreground-only** — updates pause while the app is backgrounded
  and resume when it returns, per upstream's own contract.
- **No Expo Go warning.** Upstream logs a one-time console warning about background-location
  limits when running inside Expo Go; this project never runs under Expo Go
  (`<examples_vs_dot_examples>` in root CLAUDE.md), so the check and the warning are dropped
  rather than ported.

## Test it

No Fabric/Descriptor angle at all — every function here is a pure async-function surface plus a
handful of `watchId`-keyed event subscriptions, never a view or per-instance state. Tests inject a
fake native-module object in place of the real `requireNativeModule` resolution and fire the wired
listeners directly (`src/core/location.test.ts`) — no `installFabric()`, no ViewConfig.

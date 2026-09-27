# @symbiote-native/background-fetch

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-background-fetch`](https://github.com/expo/expo/tree/main/packages/expo-background-fetch)
usable from **every** adapter — React, Vue, Svelte, Solid, and Angular. Like
[`@symbiote-native/task-manager`](../task-manager), every export is a plain async function, so
there is no hook/composable/service to wrap: the React, Vue, Svelte, Solid, and Angular entry
points are plain re-exports of the same `core`.

**Upstream deprecated this API in favor of `expo-background-task`** — Apple and Google are both
moving away from periodic-fetch-style scheduling toward task-scheduling APIs
(`BGTaskScheduler` / `WorkManager`). It is ported here anyway, alongside
[`@symbiote-native/background-task`](../background-task), because Expo still ships both
simultaneously as of sdk-57 and an app already built against the old API needs a path to run on
SymbioteNative too. Prefer `@symbiote-native/background-task` for new code.

This package registers a task with native so it fires **periodically in the background** — it
does not define what the task does. Define the task first via
[`@symbiote-native/task-manager`](../task-manager)'s `defineTask`, then register it for periodic
execution via this package's `registerTaskAsync`.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --background-fetch
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --background-fetch
```

Either way: installs `@symbiote-native/background-fetch` + `@symbiote-native/task-manager` and
wires the native autolinking automatically — see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/background-fetch @symbiote-native/task-manager
```

`expo-background-fetch` and `expo-modules-core` come along as regular dependencies, pinned to
exact versions — never install them yourself, and never add the `expo` meta-package to your
project.

## Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships — see
[`@symbiote-native/local-auth`'s README](../local-auth/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill.

iOS also needs `UIBackgroundModes: fetch` in the app's Info.plist —
`native-link.json`'s `ios.infoPlistArrayKeys` covers this ARRAY-valued case (see
`@symbiote-native/expo-modules-link`), so it's wired automatically by the same postinstall step,
no manual edit needed. Android needs no manual step — `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK`
ship in `expo-background-fetch`'s own `AndroidManifest.xml` and merge automatically once the
package is installed.

</details>

## Shape

```
src/core/     getStatusAsync / setMinimumIntervalAsync / registerTaskAsync / unregisterTaskAsync,
              plus BackgroundFetchResult / BackgroundFetchStatus / IBackgroundFetchOptions.
              native-module.ts resolves the native module via expo-modules-core's
              requireNativeModule.
src/angular/  @symbiote-native/background-fetch/angular — export * from '../core'
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto
`src/core/`. `./angular` stays a physical file/subpath since Angular ships through a separate
`ngc`/AOT build (`build-ngc/`).

## Use it

```ts
// index.ts, alongside AppRegistry.registerComponent — identical on every adapter
import { defineTask } from '@symbiote-native/task-manager';
import {
  registerTaskAsync,
  BackgroundFetchResult,
} from '@symbiote-native/background-fetch';

const SYNC_TASK = 'background-sync';

defineTask(SYNC_TASK, async ({ data, error }) => {
  if (error) {
    console.error('background-sync failed:', error);
    return BackgroundFetchResult.Failed;
  }
  const receivedNewData = await runSync(data);
  return receivedNewData
    ? BackgroundFetchResult.NewData
    : BackgroundFetchResult.NoData;
});

// Somewhere after the task is defined (a settings screen, app bootstrap, …):
await registerTaskAsync(SYNC_TASK, { minimumInterval: 900 });
```

`@symbiote-native/task-manager` is the primitive both this package and
[`@symbiote-native/background-task`](../background-task) build on — `defineTask` lives there,
`registerTaskAsync`/`unregisterTaskAsync` live here. `defineTask` must run at the top of the JS
bundle, outside any component, for the same reason documented in task-manager's own README: the
app can be launched headlessly to run a background task, with no views mounted.

```ts
import {
  getStatusAsync,
  unregisterTaskAsync,
} from '@symbiote-native/background-fetch';

const status = await getStatusAsync();
await unregisterTaskAsync(SYNC_TASK); // stop receiving background-fetch callbacks for it
```

Identical import surface on every adapter — `@symbiote-native/background-fetch/react`,
`/vue`, `/svelte`, `/solid`, `/angular` all re-export the same functions.

## API

```ts
getStatusAsync(): Promise<BackgroundFetchStatus | null>
setMinimumIntervalAsync(minimumInterval: number): Promise<void>
registerTaskAsync(taskName: string, options?: IBackgroundFetchOptions): Promise<void>
unregisterTaskAsync(taskName: string): Promise<void>
```

Plus `BackgroundFetchResult`, `BackgroundFetchStatus`, `IBackgroundFetchOptions` — ported from
upstream's `BackgroundFetch.types.ts`, the options type renamed with this repo's `I`-prefix
convention for exported types (`ts-js-best-practices`).

## Notes

- **Every function warns once, on first call, that this API is deprecated** — matching upstream's
  own `showDeprecationWarning`. It still works; the warning is a nudge toward
  `@symbiote-native/background-task`, not a functional restriction.
- **`registerTaskAsync` requires the task to already be defined.** It throws if
  `@symbiote-native/task-manager`'s `isTaskDefined(taskName)` is `false` — call `defineTask`
  first.
- **`getStatusAsync` shortcuts to `Available` on Android without calling native at all** —
  matches upstream, which has no Android-side status concept (the native call exists only on
  iOS).
- **`setMinimumIntervalAsync` silently no-ops when native lacks the method** (Android has no
  equivalent call) rather than throwing — matches upstream.
- **Expo Go is out of scope.** Upstream also warns when running inside Expo Go
  (`isRunningInExpoGo`, imported from the `expo` meta-package). This project never installs
  `expo` — every app here is a bare/dev-client build, never Expo Go — so that check has no
  equivalent here and is intentionally not ported.

## Test it

No Fabric/Descriptor angle at all — every function here is a pure async-function surface, never a
view or per-instance state. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution and a fake `@symbiote-native/task-manager` module
(`src/core/background-fetch.test.ts`) — no `installFabric()`, no ViewConfig.

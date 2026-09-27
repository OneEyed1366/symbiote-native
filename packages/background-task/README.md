# @symbiote-native/background-task

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-background-task`](https://github.com/expo/expo/tree/main/packages/expo-background-task)
usable from **every** adapter — React, Vue, Svelte, Solid, and Angular. Like
[`@symbiote-native/task-manager`](../task-manager), every export is a plain function or a
one-time module-load side effect, so there is no hook/composable/service to wrap: the React,
Vue, Svelte, Solid, and Angular entry points are plain re-exports of the same `core`.

This is the modern replacement for [`@symbiote-native/background-fetch`](../background-fetch),
built on `BGTaskScheduler` (iOS) / `WorkManager` (Android) instead of a periodic-fetch alarm.
Like its sibling, this package registers a task with native so it fires **in the background on
the OS's own schedule** — it does not define what the task does. Define the task first via
[`@symbiote-native/task-manager`](../task-manager)'s `defineTask`, then register it for periodic
execution via this package's `registerTaskAsync`.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --background-task
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --background-task
```

Either way: installs `@symbiote-native/background-task` + `@symbiote-native/task-manager` and
wires the native autolinking automatically — see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/background-task @symbiote-native/task-manager
```

`expo-background-task` and `expo-modules-core` come along as regular dependencies, pinned to
exact versions — never install them yourself, and never add the `expo` meta-package to your
project.

## Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships — see
[`@symbiote-native/local-auth`'s README](../local-auth/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill.

iOS also needs `UIBackgroundModes: processing` and `BGTaskSchedulerPermittedIdentifiers` (the
fixed identifier baked into `expo-background-task`'s own native Swift source,
`BackgroundTaskConstants.swift`) in the app's Info.plist — `native-link.json`'s `ios.infoPlistArrayKeys`
covers this ARRAY-valued case (see `@symbiote-native/expo-modules-link`), so it's wired
automatically by the same postinstall step, no manual edit needed. Android needs no manual step
either; its `AndroidManifest.xml` declares no extra permission.

**The iOS Simulator has no `BGTaskScheduler` support at all** (Apple's own limitation — physical
device only), so `BackgroundTaskStatus` reads `Restricted` there and `registerTaskAsync` is a
no-op regardless of Info.plist. Test registration on a real device.

</details>

## Shape

```
src/core/     getStatusAsync / registerTaskAsync / unregisterTaskAsync /
              triggerTaskWorkerForTestingAsync / addExpirationListener, plus
              BackgroundTaskStatus / BackgroundTaskResult / IBackgroundTaskOptions.
              native-module.ts resolves the native module via expo-modules-core's
              requireNativeModule.
src/angular/  @symbiote-native/background-task/angular — export * from '../core'
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
  BackgroundTaskResult,
} from '@symbiote-native/background-task';

const SYNC_TASK = 'background-sync';

defineTask(SYNC_TASK, async () => {
  try {
    await runSync();
    return BackgroundTaskResult.Success;
  } catch (error) {
    console.error('background-sync failed:', error);
    return BackgroundTaskResult.Failed;
  }
});

// Somewhere after the task is defined (a settings screen, app bootstrap, …):
await registerTaskAsync(SYNC_TASK, { minimumInterval: 15 });
```

`@symbiote-native/task-manager` is the primitive both this package and
[`@symbiote-native/background-fetch`](../background-fetch) build on — `defineTask` lives there,
`registerTaskAsync`/`unregisterTaskAsync` live here. `defineTask` must run at the top of the JS
bundle, outside any component, for the same reason documented in task-manager's own README: the
app can be launched headlessly to run a background task, with no views mounted.

```ts
import {
  getStatusAsync,
  unregisterTaskAsync,
  addExpirationListener,
} from '@symbiote-native/background-task';

const status = await getStatusAsync();

// iOS only — the system can interrupt a running background task before it finishes.
const subscription = addExpirationListener(() => {
  console.warn('background-sync was interrupted before it finished');
});
subscription.remove();

await unregisterTaskAsync(SYNC_TASK); // stop receiving executions of it
```

Identical import surface on every adapter — `@symbiote-native/background-task/react`,
`/vue`, `/svelte`, `/solid`, `/angular` all re-export the same functions.

## API

```ts
getStatusAsync(): Promise<BackgroundTaskStatus>
registerTaskAsync(taskName: string, options?: IBackgroundTaskOptions): Promise<void>
unregisterTaskAsync(taskName: string): Promise<void>
triggerTaskWorkerForTestingAsync(): Promise<boolean>
addExpirationListener(listener: () => void): { remove: () => void }
```

Plus `BackgroundTaskStatus`, `BackgroundTaskResult`, `IBackgroundTaskOptions` — ported from
upstream's `BackgroundTask.types.ts`, the options type renamed with this repo's `I`-prefix
convention for exported types (`ts-js-best-practices`).

## Notes

- **`registerTaskAsync` requires the task to already be defined.** It throws if
  `@symbiote-native/task-manager`'s `isTaskDefined(taskName)` is `false` — call `defineTask`
  first.
- **`registerTaskAsync` is a no-op, twice over.** It skips silently (with a one-time console
  warning) when the environment reports `BackgroundTaskStatus.Restricted` — the iOS Simulator has
  no `BGTaskScheduler` support at all — and it skips again, quietly, when the task is already
  registered (checked via `@symbiote-native/task-manager`'s `isTaskRegisteredAsync`).
- **`triggerTaskWorkerForTestingAsync` only runs in a dev build.** It always resolves `false` in
  production, matching upstream's own `__DEV__` gate — read here through a narrow local type
  rather than the bare RN global, since this package's own type graph never imports
  `react-native`.
- **Expo Go is out of scope.** Upstream also warns when running inside Expo Go
  (`isRunningInExpoGo`, imported from the `expo` meta-package) and reports
  `BackgroundTaskStatus.Restricted` there. This project never installs `expo` — every app here is
  a bare/dev-client build, never Expo Go — so that branch has no equivalent here and is
  intentionally not ported.

## Test it

No Fabric/Descriptor angle at all — every function here is a pure async-function surface plus one
event subscription, never a view or per-instance state. Tests inject a fake native-module object
in place of the real `requireNativeModule` resolution and a fake `@symbiote-native/task-manager`
module (`src/core/background-task.test.ts`) — no `installFabric()`, no ViewConfig.

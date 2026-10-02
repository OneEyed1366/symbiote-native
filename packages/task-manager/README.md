# @symbiote-native/task-manager

Run your code when the OS wakes the app in the background: a location update, a geofence event, a
periodic sync, a silent push. One API for every [SymbioteNative](../../README.md) adapter (React,
Vue, Svelte, Solid and Angular).

It wraps [`expo-task-manager`](https://github.com/expo/expo/tree/main/packages/expo-task-manager).
Like [`@symbiote-native/local-auth`](../local-auth), every export is a plain function or a one-time
module-load side effect, so there is no hook, composable or service to wrap: every adapter entry
point is a plain re-export of the same `core`.

This package is the low-level primitive other background-work packages register tasks through
(background location, geofencing, background notification delivery). It does **not** itself
schedule anything: it defines tasks, tracks which are registered, dispatches native's task-execute
event to the matching executor, and acks completion. Starting a task running (periodic scheduling,
geofence triggers) is each consumer's own job, done through its own native module.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --task-manager
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --task-manager
```

Either way: installs `@symbiote-native/task-manager` and wires the native autolinking
automatically - see [`@symbiote-native/cli`](../cli). Most apps get this transitively anyway, pulled in by
`--location`/`--audio`/`--background-fetch`/`--background-task`/`--notifications`.

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/task-manager
```

`expo-task-manager`, `unimodules-app-loader`, and `expo-modules-core` come along as regular
dependencies, pinned to exact versions - never install them yourself, and never add the `expo`
meta-package to your project.

## Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships - see
[`@symbiote-native/local-auth`'s README](../local-auth/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill. Android's headless-boot loader
(`RNHeadlessAppLoader`) and iOS's `TaskManagerAppDelegateSubscriber` are both discovered
automatically by Expo's own autolinking the moment this package is installed - no extra
`native-link.json` entry, no app-level edit.

One iOS `Info.plist` key IS wired: `UIBackgroundModes: fetch`
(`native-link.json`'s `ios.infoPlistArrayKeys`) - upstream's own `withTaskManager.ts` config
plugin adds this unconditionally, as the baseline mode any registered task's background delivery
relies on, independent of which consumer package (`background-fetch`, `location`, …) actually
registers a task. `@symbiote-native/expo-modules-link` merges it into the same array those
packages populate, so it lands once either way.

</details>

## Shape

```
src/core/     defineTask / isTaskDefined / isTaskRegisteredAsync / getTaskOptionsAsync /
              getRegisteredTasksAsync / unregisterTaskAsync / unregisterAllTasksAsync /
              isAvailableAsync, plus the task-body/executor types. native-module.ts resolves the
              native module via expo-modules-core's requireNativeModule and wires one listener at
              module load - native invokes it whenever a defined task should run.
src/angular/  @symbiote-native/task-manager/angular - export * from '../core'
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto
`src/core/`. `./angular` stays a physical file/subpath since Angular ships through a separate
`ngc`/AOT build (`build-ngc/`).

## Use it

`defineTask` must run at the top of the JS bundle, outside any component - the app can be
launched headlessly to run a background task, with no views mounted, so a task defined inside a
component lifecycle method would simply never register on that launch.

```ts
// index.ts, alongside AppRegistry.registerComponent - identical on every adapter
import { defineTask } from '@symbiote-native/task-manager';

const SYNC_TASK = 'background-sync';

defineTask(SYNC_TASK, async ({ data, error }) => {
  if (error) {
    console.error('background-sync failed:', error);
    return;
  }
  await runSync(data);
});
```

A consumer registers the task with native through its own native module -
[`@symbiote-native/location`](../location)'s `startLocationUpdatesAsync`/`startGeofencingAsync`,
[`@symbiote-native/background-fetch`](../background-fetch)'s `registerTaskAsync`,
[`@symbiote-native/background-task`](../background-task)'s `registerTaskAsync`, or
[`@symbiote-native/notifications`](../notifications)'s `registerTaskAsync`. Once registered,
`isTaskRegisteredAsync`/`getTaskOptionsAsync`/`getRegisteredTasksAsync` reflect it:

```ts
import {
  getRegisteredTasksAsync,
  isTaskRegisteredAsync,
  unregisterTaskAsync,
} from '@symbiote-native/task-manager';

const isRunning = await isTaskRegisteredAsync(SYNC_TASK);
const tasks = await getRegisteredTasksAsync();
await unregisterTaskAsync(SYNC_TASK); // stop receiving updates for this task
```

Identical import surface on every adapter - `@symbiote-native/task-manager/react`,
`/vue`, `/svelte`, `/solid`, `/angular` all re-export the same functions.

## API

```ts
defineTask<TData>(taskName: string, taskExecutor: ITaskManagerTaskExecutor<TData>): void
isTaskDefined(taskName: string): boolean
isTaskRegisteredAsync(taskName: string): Promise<boolean>
getTaskOptionsAsync<TOptions>(taskName: string): Promise<TOptions>
getRegisteredTasksAsync<TOptions>(): Promise<ITaskManagerTask<TOptions>[]>
unregisterTaskAsync(taskName: string): Promise<void>
unregisterAllTasksAsync(): Promise<void>
isAvailableAsync(): Promise<boolean>
```

Plus `ITaskManagerError`, `ITaskManagerTask`, `ITaskManagerTaskBody`,
`ITaskManagerTaskBodyExecutionInfo`, `ITaskManagerTaskExecutor` - ported from upstream's
`TaskManager.ts`, renamed with this repo's `I`-prefix convention for exported types
(`ts-js-best-practices`). Unlike upstream, there is no `registerTaskAsync` free function here -
upstream never exposes one either; registration is always driven by the consumer that needs the
task (`@symbiote-native/location`, `@symbiote-native/background-fetch`,
`@symbiote-native/background-task`, `@symbiote-native/notifications`).

## Notes

- **`isAvailableAsync` resolves `false` rather than throwing when the native method is missing** -
  every other guarded function throws an `UnavailabilityError`. This matches upstream's own
  contract: "can this API be used at all" has to answer even where the rest of the surface can't.
- **A defined task that native fires but nobody registered still gets acked and unregistered.**
  If `defineTask` for a given name was renamed or deleted from the bundle after the task was
  registered, the dangling native registration is cleaned up automatically instead of leaking a
  wakelock forever.
- **A task executor that throws still acks native.** The failure is logged, but
  `notifyTaskFinishedAsync` always fires in a `finally`, so a bug in one task's executor can't
  leave the OS believing the task never completed.

## Common questions

- **My task never runs.** Run `defineTask` at the top of the bundle, outside any component, before
  anything registers it (registering an undefined task throws); and make sure a consumer package
  registered it, since `defineTask` schedules nothing.
- **Stops when the app is swiped away.** iOS terminates it; on Android recents removal varies by
  vendor.
- **Stops after 5 to 10 minutes on Android.** Doze mode: use a foreground service for continuous work.
- **Works in debug, not release.** Test release builds early on Android.
- **Simulators.** Use a physical device; the iOS Simulator has no background task scheduler.

Sources: [Expo docs: BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/),
[expo/expo#9570](https://github.com/expo/expo/issues/9570),
[expo/expo#3535](https://github.com/expo/expo/issues/3535),
[expo/expo#14076](https://github.com/expo/expo/issues/14076),
[expo/expo#26717](https://github.com/expo/expo/issues/26717).

## Test it

No Fabric/Descriptor angle at all - every function here is a pure async-function surface plus one
module-load event listener, never a view or per-instance state. Tests inject a fake native-module
object in place of the real `requireNativeModule` resolution and fire the wired listener directly
(`src/core/task-manager.test.ts`) - no `installFabric()`, no ViewConfig. The headless-relaunch
mechanics themselves (native tearing down and re-executing the whole JS bundle with no UI mounted)
are OS-level and can only be verified on a real device - see the `symbiote-expo-native-module`
skill §10e for what's traced from source versus still unverified.

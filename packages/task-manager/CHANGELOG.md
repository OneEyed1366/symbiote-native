# @symbiote-native/task-manager

## 0.1.2

### Patch Changes

- [`99fdbbb`](https://github.com/OneEyed1366/symbiote-native/commit/99fdbbb54b72d5d06cfd95fbf0d82f2d9fe17a6a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Force a clean republish of every publishable package. `engine@1.3.0`/`components@3.1.1` proved a
  missing changeset on a producer package can leave its published tarball silently behind its own
  source (see the `symbiote-release-publishing` skill's changeset-skips-callee gap) with no CI
  signal. A blanket patch here is the cheap way to rule out the same gap sitting anywhere else:
  every package rebuilds and republishes from current HEAD, and `updateInternalDependencies: patch`
  bumps every internal `workspace:*`/`workspace:^` pin along with it.

## 0.1.1

### Patch Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/task-manager`, wrapping `expo-task-manager` — `defineTask`, registration tracking, and native-to-JS task dispatch, the low-level primitive other background-work packages (`background-fetch`, `background-task`, `location`) register tasks through.

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix a crash (`NullPointerException` in `getAppScopeKey`) on `getRegisteredTasksAsync` and other task operations: `expo-task-manager`'s legacy `TaskManagerInternalModule` reads `ConstantsInterface` from `AppContext`'s `ServicesRegistry` for `appScopeKey`, which nothing provided. Adds `expo-constants` (safe standalone — its only real dependency is `@expo/env`, no `@expo/metro-config`/`babel-preset-expo`) and registers its `ConstantsService`.

# @symbiote-native/task-manager

## 0.1.1

### Patch Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/task-manager`, wrapping `expo-task-manager` — `defineTask`, registration tracking, and native-to-JS task dispatch, the low-level primitive other background-work packages (`background-fetch`, `background-task`, `location`) register tasks through.

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix a crash (`NullPointerException` in `getAppScopeKey`) on `getRegisteredTasksAsync` and other task operations: `expo-task-manager`'s legacy `TaskManagerInternalModule` reads `ConstantsInterface` from `AppContext`'s `ServicesRegistry` for `appScopeKey`, which nothing provided. Adds `expo-constants` (safe standalone — its only real dependency is `@expo/env`, no `@expo/metro-config`/`babel-preset-expo`) and registers its `ConstantsService`.

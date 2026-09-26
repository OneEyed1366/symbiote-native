# @symbiote-native/notifications

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

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/notifications`, wrapping `expo-notifications` — permissions, device/Expo push tokens, scheduling, presentation, badges, Android channels/channel groups, categories, and a `@symbiote-native/task-manager`-backed background-task hook, usable from every adapter.

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix a crash: `AndroidXNotificationsChannelsProvider` was never registered in `native-link.json`, so `NotificationChannelManagerModule`/`NotificationChannelGroupManagerModule`'s `ModuleRegistry.getModule()` lookup for it returned null. Marked `internal: true` since it's reached only by another native module, never by `requireNativeModule` from JS.

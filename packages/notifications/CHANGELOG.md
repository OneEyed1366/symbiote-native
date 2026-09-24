# @symbiote-native/notifications

## 0.1.1

### Patch Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/notifications`, wrapping `expo-notifications` — permissions, device/Expo push tokens, scheduling, presentation, badges, Android channels/channel groups, categories, and a `@symbiote-native/task-manager`-backed background-task hook, usable from every adapter.

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix a crash: `AndroidXNotificationsChannelsProvider` was never registered in `native-link.json`, so `NotificationChannelManagerModule`/`NotificationChannelGroupManagerModule`'s `ModuleRegistry.getModule()` lookup for it returned null. Marked `internal: true` since it's reached only by another native module, never by `requireNativeModule` from JS.

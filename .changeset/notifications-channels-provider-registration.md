---
'@symbiote-native/notifications': patch
---

Fix a crash: `AndroidXNotificationsChannelsProvider` was never registered in `native-link.json`, so `NotificationChannelManagerModule`/`NotificationChannelGroupManagerModule`'s `ModuleRegistry.getModule()` lookup for it returned null. Marked `internal: true` since it's reached only by another native module, never by `requireNativeModule` from JS.

---
'@symbiote-native/expo-modules-link': minor
---

Add `ios.infoPlistArrayKeys` to the `native-link.json` schema for array-valued Info.plist keys (`UIBackgroundModes`, `BGTaskSchedulerPermittedIdentifiers`) that `infoPlistKeys` couldn't express, plus `android.manifestPermissions` and `android.manifestServices` for Android `<uses-permission>`/`<service>` entries. All three merge additively across packages with no duplication. Wired for `background-task`, `background-fetch`, `task-manager`, `location`, and `audio`.

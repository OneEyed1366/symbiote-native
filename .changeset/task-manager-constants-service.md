---
'@symbiote-native/task-manager': patch
---

Fix a crash (`NullPointerException` in `getAppScopeKey`) on `getRegisteredTasksAsync` and other task operations: `expo-task-manager`'s legacy `TaskManagerInternalModule` reads `ConstantsInterface` from `AppContext`'s `ServicesRegistry` for `appScopeKey`, which nothing provided. Adds `expo-constants` (safe standalone — its only real dependency is `@expo/env`, no `@expo/metro-config`/`babel-preset-expo`) and registers its `ConstantsService`.

---
'@symbiote-native/background-task': patch
---

Add `@symbiote-native/background-task`, wrapping `expo-background-task` — the `BGTaskScheduler`/`WorkManager`-backed successor to `expo-background-fetch`, built on `@symbiote-native/task-manager`. Requires a physical device; `BGTaskScheduler` has no iOS Simulator support.

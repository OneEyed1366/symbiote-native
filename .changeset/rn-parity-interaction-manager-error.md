---
'@symbiote-native/engine': patch
---

`InteractionManager.runAfterInteractions` reports a task that throws a non-`Error` value as `new Error(String(value))`, as React Native does, instead of a fixed message.

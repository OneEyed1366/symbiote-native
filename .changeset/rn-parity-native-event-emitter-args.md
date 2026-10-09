---
'@symbiote-native/engine': patch
---

`NativeEventEmitter` calls a listener with every argument of an emit, as React Native does, not only the first.

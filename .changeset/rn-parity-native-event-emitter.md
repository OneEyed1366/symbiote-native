---
'@symbiote-native/engine': patch
---

`NativeEventEmitter` warns with RN's text when the module it is given has no `addListener` or `removeListeners`, exposes `listenerCount`, and calls a listener with the `context` it was added with.

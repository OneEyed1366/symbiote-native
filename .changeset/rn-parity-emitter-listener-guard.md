---
'@symbiote-native/engine': patch
---

`DeviceEventEmitter.addListener` and `NativeEventEmitter.addListener` throw RN's `TypeError` for a listener that is not a function, instead of failing later on the first emit.

---
'@symbiote-native/engine': patch
---

`BackHandler` no longer pings the `DeviceEventManager` observe counters on subscribe and unsubscribe. RN listens for `hardwareBackPress` on the device bus directly.

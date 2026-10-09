---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
---

The engine barrel exports `Alert`, `Share`, `Dimensions`, `Appearance` and the other device modules from the react-native host. `NativeEventEmitter` builds RN's own class and `DeviceEventEmitter` is RN's bus, so `setDeviceEventSource`, `installDeviceEventHub` and the `deviceEventSource` bootstrap option are gone.

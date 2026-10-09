---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
'@symbiote-native/react': minor
'@symbiote-native/vue': minor
'@symbiote-native/solid': minor
'@symbiote-native/svelte': minor
'@symbiote-native/angular': minor
---

RN's `DeviceEventEmitter`, `NativeAppEventEmitter`, `NativeEventEmitter`, `Easing`, `Systrace`, `DevSettings`, `ReactNativeVersion`, `UTFSequence`, `TurboModuleRegistry` and `UIManager` are exported from every adapter, and React adds `RootTagContext`. `UIManager` forwards to RN's own module, handed over by `bootstrapHost`. `getEnforcingNativeModule` raises RN's `getEnforcing` text.

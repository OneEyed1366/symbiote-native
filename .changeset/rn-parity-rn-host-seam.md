---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
'@symbiote-native/react': minor
'@symbiote-native/vue': minor
'@symbiote-native/solid': minor
'@symbiote-native/svelte': minor
'@symbiote-native/angular': minor
---

Every adapter exports RN's `NativeModules`, `Networking`, `LogBox`, `DevMenu`, `Touchable`, `PushNotificationIOS`, `NativeComponentRegistry`, `requireNativeComponent`, `codegenNativeComponent`, `codegenNativeCommands` and `registerCallableModule`, forwarded to RN's own module by `bootstrapHost`. A new `<layout-conformance>` tag carries `experimental_LayoutConformance`. React adds `unstable_batchedUpdates`, `usePressability`, `unstable_NativeText` and `unstable_NativeView`.

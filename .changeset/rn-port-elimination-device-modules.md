---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/solid': patch
'@symbiote-native/svelte': patch
'@symbiote-native/angular': patch
---

`Dimensions`, `PixelRatio`, `I18nManager`, `Appearance`, `AppState`, `Settings`, `BackHandler`, `Alert`, `Linking`, `Vibration`, `Share`, `ToastAndroid`, `ActionSheetIOS`, `PermissionsAndroid`, `InteractionManager` and `LayoutAnimation` are React Native's own modules, forwarded through the host `bootstrapHost` hands over, instead of hand-written ports. They now behave exactly as in RN: `Dimensions.get` throws for an unknown key, `Settings` warns and does nothing off iOS, `useColorScheme` can answer `undefined`, `ToastAndroid` throws without its native module and reports RN's gravity constants, `LayoutAnimation.setEnabled` does nothing as in RN. `bootstrapHost` loads RN's `BackHandler` so an Android app without a handler still exits on back, and the `react-native` module is handed to the engine when `@symbiote-native/*/bootstrap` is imported, so a `Dimensions.get('window')` at the top of an app file works. `DevSettings`, `Systrace`, `UTFSequence`, `ReactNativeVersion` and `SpringConfig` are RN's too, and `resolveAssetSource` is RN's function instead of a bootstrap copy. `processAspectRatio` and `processFontVariant` call RN's own functions. `@symbiote-native/components` now depends on `@react-native/virtualized-lists`: `CellRenderMask` and the list window math (`VirtualizeUtils`) are RN's own, and the window follows RN's `fixVirtualizeListCollapseWindowSize` flag. `DeviceEventEmitter` is RN's `RCTDeviceEventEmitter` and `NativeEventEmitter` builds RN's own class when it gets a module, so observe counters and listener errors follow RN. The React `useColorScheme` is RN's own hook. Breaking: `setDeviceEventSource`, `installDeviceEventHub` and the `deviceEventSource` bootstrap option are gone, and `invariant` comes from the `invariant` package.

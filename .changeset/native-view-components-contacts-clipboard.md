---
'@symbiote-native/clipboard': patch
'@symbiote-native/contacts': patch
'@symbiote-native/engine': patch
'@symbiote-native/angular': patch
---

Add `ClipboardPasteButton` (iOS) and `ContactAccessButton` on every adapter. The Expo view-manager name and lazy view registration move into `@symbiote-native/engine` (`expoViewManagerName`, `tryRegisterNativeView`), and Angular gets `NativeViewBase` for native-view components plus `connectWatchedSignal` for signal-backed services.

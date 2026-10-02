---
'@symbiote-native/react': minor
'@symbiote-native/vue': minor
'@symbiote-native/svelte': minor
'@symbiote-native/solid': minor
'@symbiote-native/angular': minor
'@symbiote-native/engine': minor
'@symbiote-native/components': patch
'@symbiote-native/slider': patch
---

Export the hook factories the Expo wrapper packages are built on: `createPermissionHook`, `createResourceHook` and `createEventValueHook` on React, Vue, Svelte and Solid, and `createResourceHook`, `createEventValueHook`, `PermissionsServiceBase` and `connectWatchedSignal` on Angular. The shared logic lives once in `@symbiote-native/engine` (`createPermissionApi`, `createResourceController` and friends). Angular also exports `AccessibilityInputsBase`, `NativeViewBase` and `anchorStyleProp`, which the slider now builds on, and splits its list components into smaller files without changing their API.

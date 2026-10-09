---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
'@symbiote-native/angular': patch
'@symbiote-native/svelte': patch
---

`ScrollView` calls `onKeyboardWillShow`, `onKeyboardWillHide`, `onKeyboardDidShow` and `onKeyboardDidHide` with the keyboard event, as React Native does, on every adapter.

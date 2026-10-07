---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
'@symbiote-native/angular': patch
'@symbiote-native/svelte': patch
---

`onTouchStart`, `onTouchMove`, `onTouchEnd`, `onTouchCancel` and the `Capture` twin of every bubbling event (`onFocusCapture`, `onBlurCapture`, `onClickCapture`, `onPressCapture`, `onChangeCapture`...) now reach an ancestor, as in React Native; they were never delivered.

---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
'@symbiote-native/angular': patch
'@symbiote-native/svelte': patch
---

Every view accepts `onKeyDown`, `onKeyUp` and their `Capture` twins, the key events RN added to the Android base view config in 0.84. They bubble like `onKeyPress` and carry `key`, `code` and the four modifier flags. Native sends them only when the app enables key events, so on iOS they stay silent. Before, the props were not registered as events and landed in the view's props unread.

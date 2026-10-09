---
'@symbiote-native/engine': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/angular': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
---

Every adapter exports `EventEmitter`, the class `react-native` exposes, as the engine's re-export of React Native's own.

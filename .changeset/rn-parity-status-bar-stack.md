---
'@symbiote-native/engine': minor
'@symbiote-native/react': minor
'@symbiote-native/vue': minor
'@symbiote-native/svelte': minor
'@symbiote-native/solid': minor
'@symbiote-native/angular': minor
---

`StatusBar` keeps RN's props stack: nested bars compose, unmounting restores the bar below, native is updated once per frame with only what changed, and Android re-sends style and color like RN. Adds `showHideTransition`, `pushStackEntry` / `popStackEntry` / `replaceStackEntry`, and the cross-platform setter warnings. `applyStatusBarProps` is replaced by `createStatusBarEntry` in `@symbiote-native/engine`.

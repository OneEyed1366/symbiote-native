---
'@symbiote-native/blur': minor
'@symbiote-native/engine': patch
'@symbiote-native/angular': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/vue': patch
'@symbiote-native/cli': patch
---

Add `@symbiote-native/blur`: `BlurView` and `BlurTargetView` on React, Vue, Svelte, Solid and Angular, and a `--blur` layer in the CLI. The adapters gain shared bridges for native wrappers that take children (`DescriptorHost` on Angular and Svelte, a children argument on the Solid and Vue bridges), `hostNodeOf` on Angular and `hostInstance` on the Svelte native-view bridge. The engine accepts a view name in `expoViewManagerName` and warns when a static template tag cannot match it.

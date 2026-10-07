---
'@symbiote-native/live-photo': minor
'@symbiote-native/engine': minor
'@symbiote-native/angular': patch
'@symbiote-native/cli': patch
---

Add `@symbiote-native/live-photo`: `LivePhotoView` with `startPlayback` and `stopPlayback` on React, Vue, Svelte, Solid and Angular, and a `--live-photo` layer in the CLI. The engine gains `defineExpoViewMethods` for calling the functions of an Expo native view, and Angular's `DescriptorOutlet` exposes the host node it painted as `rootNode`.

---
'@symbiote-native/video': minor
'@symbiote-native/engine': minor
'@symbiote-native/react': minor
'@symbiote-native/vue': minor
'@symbiote-native/solid': minor
'@symbiote-native/svelte': minor
'@symbiote-native/audio': patch
'@symbiote-native/cli': patch
---

Add `@symbiote-native/video`: the player (`useVideoPlayer` / `injectVideoPlayer`, `createVideoPlayer`), `VideoView` with fullscreen and Picture in Picture functions, `VideoAirPlayButton`, thumbnails and the video cache functions on React, Vue, Svelte, Solid and Angular, and a `--video` layer in the CLI. The engine gains `createJsonKeyedResourceController` (audio now takes it from there), and React, Vue, Solid and Svelte gain a helper that builds a component over a package's native view controller (`useNativeViewController` and `defineNativeViewComponent`).

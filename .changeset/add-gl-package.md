---
'@symbiote-native/gl': minor
'@symbiote-native/components': minor
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/solid': patch
'@symbiote-native/svelte': patch
'@symbiote-native/angular': patch
'@symbiote-native/cli': patch
---

Add `@symbiote-native/gl`: `GLView` with a WebGL2 context, headless contexts and snapshots on React, Vue, Svelte, Solid and Angular, and a `--gl` layer in the CLI. A native view controller can now define `dispose`, which every adapter runs when the view unmounts.

---
'@symbiote-native/engine': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/solid': patch
'@symbiote-native/svelte': patch
'@symbiote-native/angular': patch
---

`AppRegistry` follows RN: `runApplication` throws RN's invariant for an unknown key, `setSurfaceProps` and `registerConfig` exist, a headless task warns on a repeated key, and only a `HeadlessJsTaskError` asks native for a retry.

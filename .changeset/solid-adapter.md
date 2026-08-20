---
"@symbiote-native/solid": minor
"@symbiote-native/components": minor
"@symbiote-native/css-parser": minor
"@symbiote-native/engine": minor
"@symbiote-native/test-utils": minor
"@symbiote-native/angular": minor
"@symbiote-native/react": minor
"@symbiote-native/svelte": minor
"@symbiote-native/vue": minor
"@symbiote-native/android": minor
"@symbiote-native/application": minor
"@symbiote-native/battery": minor
"@symbiote-native/brightness": minor
"@symbiote-native/cellular": minor
"@symbiote-native/clipboard": minor
"@symbiote-native/crypto": minor
"@symbiote-native/device": minor
"@symbiote-native/expo-modules-link": minor
"@symbiote-native/haptics": minor
"@symbiote-native/keep-awake": minor
"@symbiote-native/local-auth": minor
"@symbiote-native/localization": minor
"@symbiote-native/navigation": minor
"@symbiote-native/network": minor
"@symbiote-native/screen-orientation": minor
"@symbiote-native/secure-store": minor
"@symbiote-native/sensors": minor
"@symbiote-native/sharing": minor
"@symbiote-native/slider": minor
"@symbiote-native/sms": minor
"@symbiote-native/splash-screen": minor
"@symbiote-native/standard-web-crypto": minor
"@symbiote-native/store-review": minor
"@symbiote-native/system-ui": minor
"@symbiote-native/tracking-transparency": minor
"@symbiote-native/web-browser": minor
---

Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
landing alongside it) build on.

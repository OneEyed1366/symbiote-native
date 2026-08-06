---
'@symbiote-native/angular': patch
'@symbiote-native/application': patch
'@symbiote-native/battery': patch
'@symbiote-native/brightness': patch
'@symbiote-native/cellular': patch
'@symbiote-native/clipboard': patch
'@symbiote-native/crypto': patch
'@symbiote-native/device': patch
'@symbiote-native/expo-modules-link': patch
'@symbiote-native/haptics': patch
'@symbiote-native/keep-awake': patch
'@symbiote-native/local-auth': patch
'@symbiote-native/localization': patch
'@symbiote-native/navigation': patch
'@symbiote-native/network': patch
'@symbiote-native/screen-orientation': patch
'@symbiote-native/secure-store': patch
'@symbiote-native/sensors': patch
'@symbiote-native/sharing': patch
'@symbiote-native/slider': patch
'@symbiote-native/sms': patch
'@symbiote-native/splash-screen': patch
'@symbiote-native/standard-web-crypto': patch
'@symbiote-native/store-review': patch
'@symbiote-native/system-ui': patch
'@symbiote-native/tracking-transparency': patch
'@symbiote-native/web-browser': patch
---

Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
`default` export condition resolves back into it, which also swept in every `*.test.ts` beside
those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.

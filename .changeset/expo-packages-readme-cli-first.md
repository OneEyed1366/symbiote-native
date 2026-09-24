---
'@symbiote-native/application': patch
'@symbiote-native/battery': patch
'@symbiote-native/brightness': patch
'@symbiote-native/cellular': patch
'@symbiote-native/clipboard': patch
'@symbiote-native/crypto': patch
'@symbiote-native/device': patch
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

README: Install now leads with `npx @symbiote-native/cli new`/`add` (split into separate "New app"/"Existing app" blocks to avoid an accidental double copy-paste), with the manual `npm install` + native-wiring steps collapsed into a `<details>` block for anyone not using the CLI. Every `--flag` was verified against `expo-package-layers.ts`, and each package's native-wiring claims (Info.plist keys, manifest permissions/services) were cross-checked against its own `native-link.json`.

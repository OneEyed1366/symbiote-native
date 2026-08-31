---
'@symbiote-native/angular': patch
'@symbiote-native/application': patch
'@symbiote-native/battery': patch
'@symbiote-native/brightness': patch
'@symbiote-native/cellular': patch
'@symbiote-native/clipboard': patch
'@symbiote-native/components': patch
'@symbiote-native/crypto': patch
'@symbiote-native/device': patch
'@symbiote-native/haptics': patch
'@symbiote-native/keep-awake': patch
'@symbiote-native/local-auth': patch
'@symbiote-native/localization': patch
'@symbiote-native/navigation': patch
'@symbiote-native/network': patch
'@symbiote-native/react': patch
'@symbiote-native/screen-orientation': patch
'@symbiote-native/secure-store': patch
'@symbiote-native/sensors': patch
'@symbiote-native/sharing': patch
'@symbiote-native/slider': patch
'@symbiote-native/sms': patch
'@symbiote-native/solid': patch
'@symbiote-native/splash-screen': patch
'@symbiote-native/standard-web-crypto': patch
'@symbiote-native/store-review': patch
'@symbiote-native/svelte': patch
'@symbiote-native/system-ui': patch
'@symbiote-native/tracking-transparency': patch
'@symbiote-native/vue': patch
'@symbiote-native/web-browser': patch
---

Derive internal peer compatibility from the current workspace package versions so packed
manifests reject older engine and adapter releases that do not provide the APIs they import.

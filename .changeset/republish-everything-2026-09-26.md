---
'@symbiote-native/android': patch
'@symbiote-native/angular': patch
'@symbiote-native/application': patch
'@symbiote-native/audio': patch
'@symbiote-native/background-fetch': patch
'@symbiote-native/background-task': patch
'@symbiote-native/battery': patch
'@symbiote-native/brightness': patch
'@symbiote-native/cellular': patch
'@symbiote-native/cli': patch
'@symbiote-native/clipboard': patch
'@symbiote-native/components': patch
'@symbiote-native/crypto': patch
'@symbiote-native/css-parser': patch
'@symbiote-native/device': patch
'@symbiote-native/engine': patch
'@symbiote-native/expo-modules-link': patch
'@symbiote-native/file-system': patch
'@symbiote-native/haptics': patch
'@symbiote-native/keep-awake': patch
'@symbiote-native/local-auth': patch
'@symbiote-native/localization': patch
'@symbiote-native/location': patch
'@symbiote-native/media-library': patch
'@symbiote-native/navigation': patch
'@symbiote-native/network': patch
'@symbiote-native/notifications': patch
'@symbiote-native/react': patch
'@symbiote-native/screen-orientation': patch
'@symbiote-native/secure-store': patch
'@symbiote-native/sensors': patch
'@symbiote-native/sharing': patch
'@symbiote-native/slider': patch
'@symbiote-native/sms': patch
'@symbiote-native/solid': patch
'@symbiote-native/splash-screen': patch
'@symbiote-native/sqlite': patch
'@symbiote-native/standard-web-crypto': patch
'@symbiote-native/store-review': patch
'@symbiote-native/svelte': patch
'@symbiote-native/system-ui': patch
'@symbiote-native/task-manager': patch
'@symbiote-native/test-utils': patch
'@symbiote-native/tracking-transparency': patch
'@symbiote-native/vue': patch
'@symbiote-native/web-browser': patch
---

Force a clean republish of every publishable package. `engine@1.3.0`/`components@3.1.1` proved a
missing changeset on a producer package can leave its published tarball silently behind its own
source (see the `symbiote-release-publishing` skill's changeset-skips-callee gap) with no CI
signal. A blanket patch here is the cheap way to rule out the same gap sitting anywhere else:
every package rebuilds and republishes from current HEAD, and `updateInternalDependencies: patch`
bumps every internal `workspace:*`/`workspace:^` pin along with it.

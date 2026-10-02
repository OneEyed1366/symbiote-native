---
'@symbiote-native/brightness': patch
'@symbiote-native/cellular': patch
'@symbiote-native/haptics': patch
'@symbiote-native/local-auth': patch
'@symbiote-native/localization': patch
'@symbiote-native/location': patch
'@symbiote-native/media-library': patch
'@symbiote-native/system-ui': patch
'@symbiote-native/tracking-transparency': patch
---

Backfill `native-link.json` fields a plugin-introspection audit sweep found missing against each wrapped `expo-*` package's own config plugin: `android.manifestPermissions` (brightness, cellular, haptics, local-auth, media-library, tracking-transparency), `android.mainActivityConfigChanges` (localization's locale/layoutDirection), and `ios.infoPlistKeys.UIUserInterfaceStyle` (system-ui, matching the vendor default). `location` also gains a signed-off `reviewedNonIntrospectableMods` entry for its no-op `dangerous` mod.

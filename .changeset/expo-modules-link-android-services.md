---
'@symbiote-native/expo-modules-link': minor
---

Add `android.services` to the `native-link.json` schema, for a native `Service` a package needs registered in `AppContext`'s `ServicesRegistry` (distinct from `manifestServices`' `<service>` manifest element). Generates `ExpoModulesProvider.getServices()`, adds the required `expo.modules.kotlin.services.Service` import, and includes each service's own Gradle subproject in `build.gradle` even when it belongs to a different package than the one declaring it.

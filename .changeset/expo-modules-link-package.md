---
"@symbiote-native/expo-modules-link": minor
---

Add `@symbiote-native/expo-modules-link`, a shared postinstall runtime for every
`expo-modules-core` wrapper package (`@symbiote-native/sensors`, `@symbiote-native/local-auth`,
`@symbiote-native/haptics`, and the rest). A wrapper package depends on it and calls it from its
own `postinstall` script (`symbiote-expo-link`), which finds the consuming app's root via
`INIT_CWD` and additively patches `android/app/build.gradle` (the missing
`implementation project(':expo-<pkg>')` line) and `MainApplication.kt` (the missing import +
`ModulesProvider` map entry) declared in a co-located `native-link.json` manifest. This replaces
what used to be a fully hand-maintained registration step — a missed entry compiled cleanly and
only failed at runtime with `Cannot find native module`. Also patches a package's `ios.
infoPlistKeys` (declared in the same `native-link.json`) into the app's `Info.plist`, inserting
a generic default usage-description string for a key that isn't already present — a consumer
can freely override the default by adding the key with their own wording, before or after
install, since the patcher never touches a key that already exists. iOS's own autolinking
already auto-discovers every installed `expo-modules-core` package once the one-time per-app
Podfile bootstrap is wired; that one-time bootstrap itself remains manual.

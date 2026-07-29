# @symbiote-native/expo-modules-link

Shared postinstall runtime for SymbioteNative's expo-modules-core wrapper packages
(`@symbiote-native/sensors`, `@symbiote-native/local-auth`, `@symbiote-native/haptics`, ...).

## Why this exists

Every `expo-modules-core`-based package (see the `symbiote-expo-native-module` skill) needs
two Android registration steps that RN's own autolinking can't reach, because there's no
`expo` aggregator package generating them: an `implementation project(':expo-<pkg>')` line in
the consuming app's `android/app/build.gradle`, and a `ModulesProvider` map entry (import +
class-to-name mapping) in its `MainApplication.kt`. Left as a manual step, a missed entry
compiles cleanly and only fails at **runtime** with `Cannot find native module '<Name>'` —
this has bitten the project more than once.

This package moves that registration into each wrapper package's own `postinstall` script, so
it happens automatically for every consumer — this repo's own example apps and any real
external `npm install @symbiote-native/<pkg>` alike — regardless of whether that package
resolves from the real npm registry or a local tarball.

## How a wrapper package uses it

```json
{
  "dependencies": {
    "@symbiote-native/expo-modules-link": "workspace:*"
  },
  "scripts": {
    "postinstall": "symbiote-expo-link"
  }
}
```

Next to the wrapper's own `package.json`, a `native-link.json` manifest declares what it
needs registered:

```json
{
  "android": {
    "gradleProjectName": "expo-local-authentication",
    "modules": [
      {
        "importPath": "expo.modules.localauthentication.LocalAuthenticationModule",
        "className": "LocalAuthenticationModule",
        "nativeName": "ExpoLocalAuthentication"
      }
    ]
  }
}
```

`nativeName` must match that module's own `definition() { Name("...") }` string exactly —
that's the key `requireNativeModule(...)` resolves by on the JS side.

## How patching works

`symbiote-expo-link` finds the consuming app's root via `INIT_CWD` (the directory the
top-level `npm install` was run from — the same technique `husky`/`patch-package` use), then
appends the missing lines to `app/build.gradle` and `MainApplication.kt` next to a one-line
generated marker. The patcher is **additive-only** — it only ever appends a line if the exact
string isn't already present, never rewrites or removes an existing one. That's what makes it
safe to run from any number of independent packages' postinstall scripts, in any order, any
number of times: there's nothing to conflict with, so no checksum/lock mechanism is needed.

If the app isn't a React Native project at all (no `android/app/build.gradle`), or the file
it needs to patch doesn't exist, it logs (under `DEBUG=1`) and exits cleanly — a missing
manifest or unlinkable app never fails the consumer's `npm install`.

## Scope

Android only. iOS's own autolinking (`use_expo_modules!(exclude: [...])` in the app's
Podfile) already auto-discovers every installed expo-modules-core package with zero
per-package edits once wired — see the `symbiote-expo-native-module` skill. The one-time
per-app native bootstrap (Podfile monkey-patch, `SymbioteExpoModulesFactory`, bridging
header) is still a manual, one-time step per app — this package only automates the
*recurring* per-package registration that repeats on every new native module.

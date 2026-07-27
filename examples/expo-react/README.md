# Expo-native-modules canary (`@symbiote-native/sensors` + `@symbiote-native/local-auth` on device)

The **Expo native-modules demo canary** — sibling of [`react`](../react), same
`@symbiote-native/react` reconciler and `@symbiote-native/engine` core, but this app owns the
`expo-modules-core` native bootstrap (Podfile autolinking, Gradle autolinking, the
`SymbioteExpoModulesFactory` iOS factory, the hand-written Android `ExpoModulesProvider`) so the
pure `react` canary can stay free of it. It currently demos `@symbiote-native/sensors`
(`expo-sensors` ported onto our engine) and `@symbiote-native/local-auth` (`expo-local-authentication`
ported onto our engine — FaceID/TouchID/fingerprint), and will grow to demo other Expo-SDK ports as
they land.

```
index.js    registers the app with @symbiote-native/react's bootstrap
App.tsx     the same canary surface as examples/react, plus Sensors + Local Auth screens
```

`index.js` calls `registerApp` from `@symbiote-native/react/bootstrap`, which wires the
native-host seams (colors, images, device events, third-party ViewConfigs) before mounting `App` —
`nativeFabricUIManager` is driven directly, RN's own renderer never runs. See the [React adapter
README](../../adapters/react) for the full surface this app exercises and what's verified on which
platform.

## Run

```sh
cd examples/expo-react
npm install
# iOS
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install
npm start                      # DEBUG=1 npm start -- --reset-cache for diagnostic logs
npm run ios
# Android
npm run android
```

Press <kbd>R</kbd> in the simulator to reload. Because `DEBUG` is Babel-inlined into the bundle,
changing it needs a fresh `npm start -- --reset-cache`, not just a rebuild.

## Test it

```sh
pnpm test                      # vitest, from the workspace root — headless, fake Fabric slot
npm run e2e:build:ios          # build the app for Detox (once per native change)
npm run e2e:test:ios           # run the canary journeys on the iOS simulator
# …or the android equivalents: e2e:build:android / e2e:test:android
```

## Note — a separate native shell from `examples/react`

This app's bundle id (`com.canaryexpo`) and app name (`CanaryExpo`) are deliberately distinct
from `examples/react`'s (`com.canary`/`Canary`) so both can be installed side by side on the same
simulator/emulator without overwriting each other. Its `ios`/`android` projects are its own
copy, carrying the full `expo-modules-core` autolinking wiring — see the
`symbiote-expo-native-module` skill for the mechanics.

# Expo-native-modules canary (`@symbiote-native/sensors` + 20 more Expo-SDK ports on device)

The **Expo native-modules demo canary**, sibling of [`solid`](../solid), same
`@symbiote-native/solid` renderer and `@symbiote-native/engine` core, but this app owns the
`expo-modules-core` native bootstrap (Podfile autolinking, Gradle autolinking, the
`SymbioteExpoModulesFactory` iOS factory, the hand-written Android `ExpoModulesProvider`) so the
pure `solid` canary can stay free of it. It demos every Expo-SDK-ported `@symbiote-native`
package: Sensors, Local Auth, Haptics, Clipboard, Battery, Brightness, Cellular, Network,
Device, Application, Crypto, Web Crypto, System UI, Store Review, Keep Awake, Screen
Orientation, Localization, Tracking Transparency, Secure Store, Sharing, Web Browser, SMS - one
screen per package.

```
index.js    registers the app with @symbiote-native/solid's bootstrap
App.tsx     the native stack navigator over the 22 demo screens (one per Expo-SDK-ported package)
```

`index.js` calls `createApp(App).mount(appName)` from `@symbiote-native/solid/bootstrap`, which
wires the native-host seams (colors, images, device events, third-party ViewConfigs) before
mounting `App` - `nativeFabricUIManager` is driven directly, RN's own renderer never runs. See
the [Solid adapter README](../../adapters/solid) for the full surface this app exercises and
what's verified on which platform.

## Run

```sh
cd examples/expo-solid
npm install
# iOS
bundle install                 # first time only - installs CocoaPods itself
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
npm run typecheck              # tsc --noEmit over every screen
npm run e2e:build:ios          # build the app for Detox (once per native change)
npm run e2e:test:ios           # run the canary journeys on the iOS simulator
# ...or the android equivalents: e2e:build:android / e2e:test:android
```

## Note - a separate native shell from `examples/solid`

This app's bundle id (`com.canaryexpo`) and app name (`CanaryExpo`) are deliberately distinct
from `examples/solid`'s (`com.canary`/`Canary`) so both can be installed side by side on the same
simulator/emulator without overwriting each other. Its `ios`/`android` projects are its own
copy, carrying the full `expo-modules-core` autolinking wiring - see the
`symbiote-expo-native-module` skill for the mechanics.

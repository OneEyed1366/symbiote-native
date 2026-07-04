# React canary (`@symbiote-native/react` on device)

The **reference canary** — the M1/M2 proof on a real host: a React app driving the
framework-agnostic `@symbiote-native/engine` core through `@symbiote-native/react`'s
`react-reconciler` host config, with React Native's own renderer never in the path. Every other
example ([`vue-tsx`](../vue-tsx), [`vue-sfc`](../vue-sfc), [`angular`](../angular)) targets the same
surface this app defines — it's the working spec, not just a demo.

```
index.js    registers a RUNNABLE with RN's AppRegistry → mounts App via @symbiote-native/react
App.tsx     the full canary — every primitive, runtime module, gesture, and Animated block
            described in the React adapter README's Surface section
```

`index.js` calls `AppRegistry.registerRunnable` (not `registerComponent`): RN's Fabric host hands it
the surface's `rootTag`, and `@symbiote-native/react`'s `mount` takes over from there —
`nativeFabricUIManager` is driven directly, RN's own renderer never runs. See the [React adapter
README](../../adapters/react) for the full surface this app exercises and what's verified on which
platform.

## Run

```sh
cd examples/react
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

## Note — the shared native shell

This app's native `ios`/`android` projects are the **origin** copy — `examples/vue-sfc` copies
them verbatim, and `examples/vue-tsx` copies from `vue-sfc` in turn, so all three keep the same
bundle id and app name ("Canary"). On a simulator/emulator the canaries overwrite each other — run
**one at a time**. `examples/angular` has its own separate native project.

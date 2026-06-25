# Vue canary (`@symbiote/vue` on device)

The **M3 / R4 proof on a real host**: a Vue 3 app driving the framework-agnostic
`@symbiote/engine` core on the iOS simulator / Android emulator, with React Native's own
renderer never in the path. It is the [`examples/canary`](../canary) React app with the
JS layer swapped for Vue — same native shell, same engine, a different framework on top.

```
index.js   registers a RUNNABLE with RN's AppRegistry → mounts the Vue app via @symbiote/vue
App.ts     a Vue counter (render functions, no SFC → no Metro Vue transformer needed)
metro      points at core/engine + adapters/vue source; pins one react + one @vue/runtime-core
```

`App.ts` uses plain `h()` render functions, so Metro needs no Vue SFC transformer — the
stock `@react-native/babel-preset` just strips the TypeScript. The tap is the raw responder
protocol (`onStartShouldSetResponder` + `onResponderRelease`), not `Pressable` — the
press-retention controller lands with `@symbiote/components`.

## Run

```sh
cd examples/vue
npm install
# iOS
(cd ios && bundle install && bundle exec pod install)
npm run ios
# Android
npm run android
# diagnostic logs:  DEBUG=1 npm start -- --reset-cache   (then run ios/android)
```

Tap the box → the counter increments. That tap re-enters Vue's reactivity, which recommits
through `@symbiote/engine` into Fabric — RN's renderer never involved.

## Note — shares the canary's native shell

The native iOS/Android projects are copied verbatim from `examples/canary`, so this app
keeps the **same bundle id and app name ("Canary")**. On a simulator the two canaries
overwrite each other — run **one at a time** (`examples/vue` for Vue, `examples/canary`
for React). Renaming to a distinct bundle id is a follow-up if you want both installed
side by side.

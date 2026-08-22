# Vue canary — Expo native modules (`@symbiote-native/vue` on device)

A Vue 3 app driving the framework-agnostic `@symbiote-native/engine` core on the iOS
simulator / Android emulator, with React Native's own renderer never in the path — the
sibling of [`examples/vue-sfc`](../vue-sfc) that owns the **expo-modules-core** native
bootstrap and demos every Expo-SDK-ported package. It currently demos
`@symbiote-native/sensors` and will grow to demo other Expo-SDK ports (e.g.
`@symbiote-native/local-auth`) as they land. `examples/vue-sfc` itself stays a pure
SymbioteNative canary — core primitives + navigation — with zero expo-modules-core
dependency.

This is the **SFC** authoring of the Vue slice (`.vue` single-file components). The same app
authored in **Vue JSX/TSX** lives next door in [`examples/vue-tsx`](../vue-tsx) — same engine,
same components, only the template-vs-JSX authoring differs.

```
index.js                  registers a RUNNABLE with RN's AppRegistry → mounts the Vue app via @symbiote-native/vue
App.vue                    a Vue counter, authored as a real SFC (<template> + <script setup lang="ts">)
metro-vue-transformer.js   compiles .vue on the way into the bundle (parse → compileScript → 'vue'→runtime-core)
metro.config.js            sourceExts += 'vue', babelTransformerPath → the SFC transformer; pins one react + one runtime-core
```

`App.vue` is an ordinary Vue SFC. Metro has no Vue plugin (unplugin-vue ships
vite/webpack/esbuild/rollup adapters, not Metro), so `metro-vue-transformer.js` does the
single-pass compile itself with `@vue/compiler-sfc` — `parse` → `compileScript` with
`inlineTemplate`, then rewrites every `from 'vue'` to `@symbiote-native/vue/runtime-helpers` (the
custom, non-DOM renderer needs the compiler helpers from `@vue/runtime-core`, not
`vue/runtime-dom`; the shim also supplies `vShow`, since `v-show`
compiles to an import runtime-core alone doesn't export). The compiled module is handed to `@react-native/babel-preset` as `.tsx`
so it strips the `lang="ts"` types. The tap is the raw responder protocol
(`@start-should-set-responder` + `@responder-release`), not `Pressable` — the press-retention
controller lands with `@symbiote-native/components`. `ActivityIndicator` is the first
`@symbiote-native/components` component: render fn shared verbatim with React, Vue supplies only the
`descriptorToVue` bridge.

Editing the transformer or `metro.config.js` needs a Metro cache reset
(`npm start -- --reset-cache`); editing `App.vue` does not.

## Run

```sh
cd examples/expo-vue-sfc
npm install
# iOS
(cd ios && bundle install && bundle exec pod install)
npm run ios
# Android
npm run android
# diagnostic logs:  DEBUG=1 npm start -- --reset-cache   (then run ios/android)
```

Tap the box → the counter increments. That tap re-enters Vue's reactivity, which recommits
through `@symbiote-native/engine` into Fabric — RN's renderer never involved.

## Note — own bundle id, native shell carries expo-modules-core

The native iOS/Android projects started as a copy of `examples/vue-sfc`, renamed to app name
`CanaryExpo` / bundle id `com.canaryexpo` — distinct from `examples/vue-sfc`'s `Canary` /
`com.canary`, so both can be installed on the same simulator/emulator side by side. This app
additionally carries the expo-modules-core native bootstrap (Podfile `use_expo_modules!`
integration, Android Gradle autolinking wiring, the `SymbioteExpoModulesFactory` iOS
AppDelegate factory, `MainApplication.kt`'s `SensorsModulesProvider`) that
`examples/vue-sfc` does not — that bootstrap exists solely to make expo-modules-core
autolinking work for the Sensors demo (and future Expo-SDK ports).

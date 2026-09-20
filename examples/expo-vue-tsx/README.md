# Vue canary — Expo native modules (`@symbiote-native/vue` on device)

Sibling of [`examples/vue-tsx`](../vue-tsx), authored the same way — **Vue JSX** instead of an
SFC — but this one is the demo home for Expo-SDK-ported packages: all 22 `expo-modules-core`-based
wrapper packages this repo ships, one screen per package, reached from a `Menu` screen. It carries
the `expo-modules-core` native bootstrap (Podfile autolinking, Gradle wiring, the
`SymbioteExpoModulesFactory` iOS factory, `MainApplication.kt`'s module-registry adapter) that
`examples/vue-tsx` deliberately does not, so the "pure" canary stays free of it. Everything else —
engine, components, navigation demos — is identical to `examples/vue-tsx`.

```
index.js          registers a RUNNABLE with RN's AppRegistry → mounts the Vue app via @symbiote-native/vue
App.tsx           the native stack navigator over the Menu + 22 wrapper-package demo screens
screens/          MenuScreen plus one <Name>Screen.tsx per wrapper package
babel.config.js   @vue/babel-plugin-jsx compiles the JSX → @vue/runtime-core createVNode (before RN's React-JSX transform)
metro.config.js   aliases 'vue' → @vue/runtime-core; pins one react + one runtime-core (no custom transformer)
```

## How the JSX compiles (vs the SFC canary)

The SFC canary needs a Metro transformer to compile `.vue`. The TSX canary needs none — JSX is
a babel concern:

- **`@vue/babel-plugin-jsx`** (listed first in `babel.config.js`) rewrites every `JSXElement`
  into a `@vue/runtime-core` `createVNode` call. Because babel applies `plugins` before
  `presets`, it runs ahead of the RN preset's React-JSX transform, which then finds no JSX left
  and no-ops — so there is **no `react/jsx-runtime` import** in the bundle.
- The plugin injects its helper imports `from 'vue'`; `metro.config.js` aliases the bare `vue`
  specifier to `@vue/runtime-core` (the resolver twin of the SFC transformer's
  `'vue'`→runtime-core string rewrite), so the app and the adapter share **one** Vue runtime —
  reactivity is a singleton, two copies would silently fail to react.

An `onX` prop written in JSX (`onPress={handler}`) lands in `patchProp` → `routeProp` exactly as
the SFC's `@press` does — same runtime path, different authoring surface.

Editing `babel.config.js` or `metro.config.js` needs a Metro cache reset
(`npm start -- --reset-cache`); editing `App.tsx` does not.

> This canary predates `@symbiote-native/cli` and is for in-repo development. To start a new app
> with Expo-backed packages wired in, use
> `npx @symbiote-native/cli new --framework vue --vue-flavor tsx --<package>` instead.

## Run

```sh
cd examples/expo-vue-tsx
npm install
# iOS
(cd ios && bundle install && bundle exec pod install)
npm run ios
# Android
npm run android
# diagnostic logs:  DEBUG=1 npm start -- --reset-cache   (then run ios/android)
```

From the `Menu` screen, push into any wrapper-package demo. Each screen exercises that package's
`@symbiote-native/*/vue` entry point end to end, recommitting through `@symbiote-native/engine`
into Fabric — RN's renderer never involved.

## Note — distinct app identity from `examples/vue-tsx`

This app is named `CanaryExpo` (bundle id / Android `applicationId` `com.canaryexpo`), separate
from `examples/vue-tsx`'s `Canary` (`com.canary`), so both can be installed on the same
simulator/emulator side by side.

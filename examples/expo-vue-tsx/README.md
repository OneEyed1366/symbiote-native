# Vue canary — Expo native modules (`@symbiote-native/vue` on device)

Sibling of [`examples/vue-tsx`](../vue-tsx), authored the same way — **Vue JSX** instead of an
SFC — but this one is the demo home for Expo-SDK-ported packages. It carries the
`expo-modules-core` native bootstrap (Podfile autolinking, Gradle wiring, the
`SymbioteExpoModulesFactory` iOS factory, `MainApplication.kt`'s module-registry adapter) that
`examples/vue-tsx` deliberately does not, so the "pure" canary stays free of it. Currently demos
`@symbiote-native/sensors`; more Expo ports (e.g. `@symbiote-native/local-auth`) land here as they
ship. Everything else — engine, components, navigation demos — is identical to `examples/vue-tsx`.

```
index.js          registers a RUNNABLE with RN's AppRegistry → mounts the Vue app via @symbiote-native/vue
App.tsx           a Vue counter, authored as a defineComponent whose setup() returns a JSX render fn
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

So `<View onResponderRelease={onTap}>` compiles to `createVNode(View, { onResponderRelease: onTap })`;
that `onX` key lands in `patchProp` → `routeProp` exactly as the SFC's `@responder-release` did.

This exercises the same structural reconciler paths as the SFC: a `? :` ternary mounts/unmounts
the spinner (Vue comment placeholder → our anchor node), `.map()` diffs a keyed list (Vue
Fragment → empty-text anchors + engine `insertBefore` / `removeChild`), and a `computed` derives
reactive text. The tap is the raw responder protocol (`onStartShouldSetResponder` +
`onResponderRelease`), not `Pressable`. `ActivityIndicator` is the first `@symbiote-native/components`
component — its render fn is shared verbatim with React; Vue supplies only the `descriptorToVue`
bridge.

Editing `babel.config.js` or `metro.config.js` needs a Metro cache reset
(`npm start -- --reset-cache`); editing `App.tsx` does not.

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

Tap the box → the counter increments and a keyed row is prepended; the second box toggles the
spinner. Every tap re-enters Vue's reactivity, which recommits through `@symbiote-native/engine` into
Fabric — RN's renderer never involved.

## Note — distinct app identity from `examples/vue-tsx`

This app is named `CanaryExpo` (bundle id / Android `applicationId` `com.canaryexpo`), separate
from `examples/vue-tsx`'s `Canary` (`com.canary`), so both can be installed on the same
simulator/emulator side by side.

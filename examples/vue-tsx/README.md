# Vue canary — JSX/TSX (`@symbiote-native/vue` on device)

Authored in **Vue JSX** instead of an SFC: a Vue 3 app
driving the framework-agnostic `@symbiote-native/engine` core on the iOS simulator / Android emulator,
with React Native's own renderer never in the path. It is the [`examples/vue-sfc`](../vue-sfc)
app rewritten JSX-for-template — **same native shell, same engine, same components, only the
authoring differs**. Together the two examples show the Vue slice is template-agnostic.

The app boots into the `@symbiote-native/navigation` demo suite: `Menu` is the initial route, and
its first row pushes into `Canary`, the "every `@symbiote-native/vue` primitive" screen this
example started life as (its own former content, unchanged, just relocated once the app grew a
real `Menu`).

```
index.js          registers a RUNNABLE with RN's AppRegistry → mounts the Vue app via @symbiote-native/vue
App.tsx           the native stack navigator, authored as a defineComponent whose setup() returns a JSX render fn
routes.ts         route-name constants, shared by every registration and every push()
navigation-lines.ts  the wayfinding palette (LINE_COLOR / ROUTE_LINE_INFO)
navigation-linking.ts  the deep-link config, shared by the root wiring and the DeepLinking demo
screens/          21 screens — CanaryScreen plus the tour stops and their nested children
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

So `<view onPress={onTap}>` compiles to `createVNode('view', { onPress: onTap })`; that `onX` key
lands in `patchProp` → `routeProp` exactly as the SFC's `@press` does.

Editing `babel.config.js` or `metro.config.js` needs a Metro cache reset
(`npm start -- --reset-cache`); editing `App.tsx` does not.

## Run

```sh
cd examples/vue-tsx
npm install
# iOS
(cd ios && bundle install && bundle exec pod install)
npm run ios
# Android
npm run android
# diagnostic logs:  DEBUG=1 npm start -- --reset-cache   (then run ios/android)
```

From the `Menu` screen, push into `Canary` and tap the counter card — that tap re-enters Vue's
reactivity, which recommits through `@symbiote-native/engine` into Fabric, RN's renderer never
involved. The other menu rows reach the navigator demos, the benchmark screen, and the style
showcase.

## Note — shares the canary's native shell

The native iOS/Android projects are copied verbatim from `examples/vue-sfc`, so this app keeps
the **same bundle id and app name ("Canary")**. On a simulator the canaries overwrite each
other — run **one at a time** (`examples/vue-tsx` or `examples/vue-sfc` for Vue,
`examples/react` for React). Renaming to a distinct bundle id is a follow-up if you want several
installed side by side.

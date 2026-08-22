# solid-canary

The SolidJS canary for SymbioteNative: compiled Solid JSX driving real native iOS/Android views
through `@symbiote-native/engine`, with React's renderer nowhere in the path.

`App.tsx` composes the native stack navigator (`@symbiote-native/navigation/solid`) over the demo
screens: Menu is the initial route, Canary the every-primitive surface, plus the animated, list,
hooks, tabs, drawer, deep-linking, header-options and API-playground stops. See
`symbiote-new-adapter` §7 for the layer order the adapter is built in, and the adapter's own README
for current status.

## Run

```sh
cd examples/solid
npm install
# iOS
(cd ios && bundle install && bundle exec pod install)
npm run ios
# Android
npm run android
# diagnostic logs:  DEBUG=1 npm run dev   (babel.config.js inlines the flag, so it needs the reset)
```

`examples/*` is a standalone `npm install` tree, deliberately outside the pnpm workspace, so it
matches what a real npm consumer gets — always install from inside this directory, never with
`pnpm` from the repo root. `npm run dev` is Metro with `--reset-cache`; editing `metro.config.js`
or `babel.config.js` needs it, editing a `.tsx` file does not.

## What is wired, and the one piece of boilerplate

- **`babel.config.js`** — `@symbiote-native/solid/babel-preset`, listed LAST so Babel's reverse
  preset order runs it FIRST and it claims the JSX before the React Native preset's own React-JSX
  transform can. The preset arrives with `generate: 'universal'` and the renderer `moduleName`
  already set, so this app cannot get them wrong.
- **`metro.config.js`** — no Solid transformer needed (that is the point of a Babel-preset-based
  framework); only the framework-agnostic stylesheet transformer, plus
  `unstable_forceFullRefreshPatterns: [/\.tsx$/]` because react-refresh misreads a compiled Solid
  component as a React one. It deliberately does NOT touch `unstable_conditionNames` — the file
  explains why, with the resolution actually traced through Metro's source.
- **`App.css`** — styling by class, the convention across every canary;
  `@symbiote-native/css-parser` compiles it at build time and the engine's `routeProp` resolves
  `class` against the registry, exactly as it does for React's `className` and Vue's `class`.
- **`tsconfig.json`'s `jsxImportSource: "@symbiote-native/solid"`** — the whole of this app's JSX
  typing setup. The adapter ships its own `./jsx-runtime` namespace, so there is no `solid-env.d.ts`
  and no `/// <reference types>` line, `<div>` is a compile error rather than a device failure, and
  JSX children are actually type-checked (under solid-js's own namespace they are not — see
  `.claude/rules/solid-jsx-namespace.md`).

## Checks

```sh
npm run lint
npm run typecheck                                        # css-dts runs first, via pretypecheck
npx react-native bundle --platform ios     --entry-file index.js --dev false --bundle-output /tmp/solid-ios.jsbundle
npx react-native bundle --platform android --entry-file index.js --dev false --bundle-output /tmp/solid-android.jsbundle
pnpm test                      # vitest, from the workspace root — fake Fabric slot
```

The bundle is the one worth keeping in the loop: it proves the whole graph resolves and transforms,
and that `solid-js`'s SSR build (its export map has a `node` branch pointing at `dist/server.js`)
stays out of a native bundle.

## Note — shares the canary's native shell

The native iOS/Android projects carry the **same bundle id and app name ("Canary")** as
`examples/react` and the other canaries. On a simulator they overwrite each other — run **one at a
time**. The deep-link scheme is this app's own (`symbiotecanarysolid://`), distinct from every other
canary's, so a link never routes to whichever one the OS resolved last.

# solid-canary

The SolidJS canary for SymbioteNative: compiled Solid JSX driving real native iOS/Android views
through `@symbiote-native/engine`, with React's renderer nowhere in the path.

`App.tsx` composes the native stack navigator (`@symbiote-native/navigation/solid`) over the demo
screens: Menu is the initial route, Canary the every-primitive surface, plus the animated, list,
hooks, tabs, drawer, deep-linking, header-options and API-playground stops. See
`symbiote-new-adapter` §7 for the layer order the adapter is built in, and the adapter's own README
for current status.

## Running it

`examples/*` is a standalone `npm install` tree, deliberately outside the pnpm workspace, so it
matches what a real npm consumer gets. Always install from inside this directory:

```sh
npm install
npm run ios          # or: npm run android
npm run dev          # Metro with --reset-cache
DEBUG=1 npm run dev  # + @symbiote diagnostic logs (babel.config.js inlines the flag)
```

`@symbiote-native/solid` is unpublished, so it is consumed as a **local tarball** built from the
adapter's own directory:

```sh
cd ../../adapters/solid && pnpm pack --pack-destination ../../examples/solid
```

`pnpm pack`, never `npm pack` — only pnpm applies the `publishConfig` swap that points the tarball at
`build/` and rewrites `workspace:*` into real versions. When re-packing the SAME version while
iterating, delete BOTH the extracted copy and the lockfile entry first, or npm silently serves the
stale one (it reports `added N packages` either way):

```sh
rm -rf node_modules/@symbiote-native/solid && rm -f package-lock.json && npm install
cd ios && pod install   # required after any reinstall: see CLAUDE.md's splash-screen podspec note
```

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

## Verified so far

**On device:** the app runs on the iOS simulator — the Solid recording in the repo root's demo
table (`assets/solid-demo.gif`) is this app.

Headless, from this directory: `npm run lint`, `npx tsc --noEmit`, and a full Metro bundle
(`./node_modules/.bin/react-native bundle --platform ios --dev true --entry-file index.js
--bundle-output <path>`). The bundle is the useful one — it proves the whole graph resolves and
transforms, and that `solid-js`'s SSR build (its export map has a `node` branch pointing at
`dist/server.js`) stays out of a native bundle.

The headless signals are not the bar, though. Two of this adapter's sharpest bugs — the render-prop
snapshot killing every other tap, and a `core/*` change never reaching the tarball — were only
visible on a device (`.claude/rules/solid-descriptor-bridge.md` §4,
`.claude/rules/example-shared-package-staleness.md`). Run it on a simulator before calling a change
done.

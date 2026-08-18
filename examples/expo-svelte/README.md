# Svelte canary — Expo native modules (`@symbiote-native/svelte` on device)

A Svelte 5 app driving the framework-agnostic `@symbiote-native/engine` core on the iOS
simulator / Android emulator, with React Native's own renderer never in the path — the
sibling of [`examples/svelte`](../svelte) that owns the **expo-modules-core** native
bootstrap and demos every Expo-SDK-ported package through that package's own `./svelte`
entry. `examples/svelte` itself stays a pure SymbioteNative canary — core primitives, zero
expo-modules-core dependency.

It is the Svelte twin of [`examples/expo-vue-sfc`](../expo-vue-sfc): same 23 routes, same
`App.css`, same `navigation-lines.ts` colors, same native host project (app name `CanaryExpo`,
so all four `expo-*` examples install side by side).

```
index.js             registers a RUNNABLE with RN's AppRegistry → mounts the app via @symbiote-native/svelte
App.svelte           the native stack navigator (@symbiote-native/navigation/svelte) over the 23 demo screens
screens/*.svelte     one screen per Expo-SDK-ported package, each importing that package's ./svelte entry
metro.config.js      sourceExts += 'svelte', babelTransformerPath → the adapter's own SFC transformer
svelte.config.js     fragments:'tree' + css:'external' + the web-only-construct guard
```

Metro has no Svelte plugin, so `@symbiote-native/svelte/metro-svelte-transformer` does the
compile itself: `compile()` for `.svelte` components, `compileModule()` for the `.svelte.ts` /
`.svelte.js` rune modules the packages ship, then the stock RN Babel preset. The compiled output
is **stock** Svelte client code — it runs unchanged against the adapter's globalThis DOM shim,
with no framework-import rewrite of the kind the Vue transformer needs.

Two Metro settings here are correctness, not taste (see the `svelte-adapter-dom-shim` skill):
`resolver.unstable_conditionNames: ['browser']`, without which Metro resolves Svelte's SSR build
and the first `mount()` throws; and `inlineRequires: false`, without which Svelte's internal
client runtime re-enters itself during mount and blows the JS stack.

## Run

```sh
cd examples/expo-svelte
npm install
# iOS
(cd ios && bundle install && bundle exec pod install)
npm run ios
# Android
npm run android
# diagnostic logs:  DEBUG=1 npm start -- --reset-cache   (then run ios/android)
```

## Markup formatting

Write markup normally — indented, one tag per line. This used to be forbidden: whitespace
**between** two sibling nodes compiles to a real text node, which became a real `RCTRawText`
child, invalid under a non-`Text` native parent. The shim now maps a whitespace-only text node
under a parent that takes no raw text to an anchor, so it never reaches Fabric
(`svelte-adapter-dom-shim` §16b).

The other half still needs a build step: Svelte, unlike Vue, does not condense whitespace
**inside** a text node, so a sentence wrapped across two source lines would ship its newline and
indent into the `RCTText`. `collapseTextWhitespace()` folds it back — registered both in
`svelte.config.js` (for `svelte-check` and the editor) and unconditionally in Metro's transformer
(for the bundle). The gate checks the pipeline's OUTPUT, not your source:

```sh
node scripts/audit-svelte-stray-whitespace.mjs examples/expo-svelte   # 0 wrapped text nodes
```

## Local package resolution

Every `@symbiote-native/*` package this app depends on is wired as a `file:` tarball rather than an
npm version: the `./svelte` entries are new and unpublished. Re-packing a tarball at the same
version needs **both** `rm -rf node_modules/@symbiote-native/<pkg>` and `rm -f package-lock.json`
before `npm install`, or npm silently serves the previously extracted copy — see the repo root's
project instructions, `<examples_vs_dot_examples>`. Each `file:` specifier swaps back to a literal
npm version once that package has a real release.

# Svelte canary — Expo native modules (`@symbiote-native/svelte` on device)

A Svelte 5 app driving the framework-agnostic `@symbiote-native/engine` core on the iOS
simulator / Android emulator, with React Native's own renderer never in the path.

It is the sibling of [`examples/svelte`](../svelte) that owns the **expo-modules-core** native
bootstrap and demos every Expo-SDK-ported package through that package's own `./svelte`
entry. `examples/svelte` itself stays a pure SymbioteNative canary: core primitives, zero
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
is stock Svelte client code compiled with `experimental.customRenderer`, so it runs against
`svelte/renderer` with no framework-import rewrite of the kind the Vue transformer needs.

Two Metro settings here are correctness, not taste:
`resolver.unstable_conditionNames: ['svelte-custom-renderer', 'browser']`, without which Metro
resolves Svelte's default runtime and `svelte/renderer` is missing; and `inlineRequires: false`,
without which Svelte's internal client runtime re-enters itself during mount and blows the JS stack.

> This canary predates `@symbiote-native/cli` and is for in-repo development. To start a new app
> with Expo-backed packages wired in, use
> `npx @symbiote-native/cli new --framework svelte --<package>` instead.

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

Write markup normally, indented, one tag per line. Whitespace **between** two sibling nodes
compiles to a text node, which would be an invalid `RCTRawText` child under a non-`Text` native
parent. The adapter drops a whitespace-only text node under a parent that takes no raw text, so it
never reaches Fabric.

The other half still needs a build step: Svelte, unlike Vue, does not condense whitespace
**inside** a text node, so a sentence wrapped across two source lines would ship its newline and
indent into the `RCTText`. `collapseTextWhitespace()` folds it back — registered both in
`svelte.config.js` (for `svelte-check` and the editor) and unconditionally in Metro's transformer
(for the bundle). The gate checks the pipeline's OUTPUT, not your source:

```sh
node scripts/audit-svelte-stray-whitespace.mjs examples/expo-svelte   # 0 wrapped text nodes
```

## Local package resolution

Every `@symbiote-native/*` package this app depends on (`package.json` pins most at `"latest"`)
resolves from the real npm registry, and nothing here is unpublished.

To pick up an unreleased change to a package's own source, use a local Verdaccio registry, not a
`file:` tarball. See the `symbiote-local-dev-registry` skill and the repo root's project
instructions, `<examples_vs_dot_examples>`, for the current mechanism: `pnpm run registry:setup`
once per machine, `pnpm run registry:sync` to publish and repoint every example, then `pod install`
in this app's `ios/`.

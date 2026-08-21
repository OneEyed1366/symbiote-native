# Svelte canary (`@symbiote-native/svelte` on device)

A Svelte 5 app driving the framework-agnostic `@symbiote-native/engine` core on the iOS simulator /
Android emulator, with React Native's own renderer never in the path. It is the
[`examples/react`](../react) React app with the JS layer swapped for Svelte — same native shell,
same engine, a different framework on top.

The app boots into the `@symbiote-native/navigation` demo suite: `Menu` is the initial route, and
its first row pushes into `Canary`, the "every `@symbiote-native/svelte` primitive" screen this
example started life as.

```
index.js               registers a RUNNABLE with RN's AppRegistry → mounts the Svelte app via @symbiote-native/svelte
App.svelte             the native stack navigator (Stack + 11 Screen markers) + the global stylesheet import
routes.ts              route-name constants, shared by every registration and every push()
navigation-lines.ts    the 5-line wayfinding palette (LINE_COLOR / ROUTE_LINE_INFO)
navigation-linking.ts  the deep-link config, shared by the root wiring and the DeepLinking demo
screens/               18 screens — CanaryScreen plus the 9 tour stops and their nested children
components/            the canary's own demo components (Animated, NativeModules, Responder, …)
metro.config.js        sourceExts += 'svelte' + css family, babelTransformerPath → the Svelte transformer
svelte.config.js       fragments: 'tree' + css: 'external' — both mandatory, see below
```

## The Svelte adapter is a DOM shim, and that shapes this app

Svelte's official custom-renderer API ([sveltejs/svelte#18042](https://github.com/sveltejs/svelte/pull/18042))
is still an unmerged PR, so `@symbiote-native/svelte` instead patches the `globalThis` DOM classes
and lets stock compiled Svelte output run unchanged. Three consequences show up in this app:

- **`svelte.config.js` is not optional.** `fragments: 'tree'` makes the compiler emit `from_tree()`
  (element-by-element `document.createElement`) instead of `from_html()` (an `innerHTML` assignment
  on a `<template>`), so the shim needs no HTML parser. `css: 'external'` keeps Svelte from
  injecting `<style>` into a `document.head` that does not meaningfully exist.
- **Markup whitespace is free — write it normally.** It was not always: whitespace between two
  sibling nodes compiles to a real text node, which used to become an `RCTRawText`, illegal under
  a non-`Text` parent on device, so this app was packed edge-to-edge. That is fixed structurally —
  the shim maps a whitespace-only text node under a parent that takes no raw text to an anchor
  (`svelte-adapter-dom-shim` §16b) — and a sentence wrapped across source lines is folded back to
  single spaces by `collapseTextWhitespace()` in `svelte.config.js` and in Metro's transformer.
  `node scripts/audit-svelte-stray-whitespace.mjs` still gates the second half, checking the
  pipeline's OUTPUT rather than your source: `0 wrapped text nodes`.
- **Styling goes through plain CSS classes** (`App.css` + `@symbiote-native/css-parser`), not
  in-component `<style>` blocks — Svelte's own scoped-style path is a documented, not-yet-built
  seam on this adapter.

## Screens are discovered by self-registration, not by scanning children

React reads `children` as an array and Vue scans the default slot's vnodes, so both navigators can
find their `<Screen>` markers by inspection. Svelte hands a component an opaque `Snippet` with no
way to enumerate it, so `@symbiote-native/navigation/svelte` inverts the flow: the navigator
publishes a collector on the context, and each `<Screen>` / `<TabScreen>` / `<DrawerScreen>` marker
registers itself during its own init. Authoring is unchanged (`<Stack><Screen …/><Screen …/></Stack>`);
only the mechanism underneath differs.

One authoring detail follows from that: `bind:this` on `<Stack>` yields the navigator handle at
runtime, but TypeScript resolves an imported `.svelte` module from `node_modules` through Svelte's
ambient `declare module '*.svelte'` fallback, so the `export function` surface is erased from the
type. `App.svelte` therefore holds the binding as `unknown` and narrows it with a runtime guard
before handing it to `useLinkingIntegration`.

## Run

```sh
cd examples/svelte
npm install
# iOS
(cd ios && bundle install && bundle exec pod install)
npm run ios
# Android
npm run android
# diagnostic logs:  DEBUG=1 npm start -- --reset-cache   (then run ios/android)
```

Editing `metro.config.js` or `svelte.config.js` needs a Metro cache reset
(`npm start -- --reset-cache`); editing a `.svelte` file does not.

## Checks

```sh
npx svelte-check --threshold error                       # 0 errors expected
node ../../scripts/audit-svelte-stray-whitespace.mjs     # from the repo root; 0 wrapped text nodes
npx react-native bundle --platform ios     --entry-file index.js --dev false --bundle-output /tmp/svelte-ios.jsbundle
npx react-native bundle --platform android --entry-file index.js --dev false --bundle-output /tmp/svelte-android.jsbundle
```

## Note — shares the canary's native shell

The native iOS/Android projects are copied verbatim from `examples/react`, so this app keeps the
**same bundle id and app name ("Canary")**. On a simulator the canaries overwrite each other — run
**one at a time**. The deep-link scheme is this app's own (`symbiotecanarysvelte://`), distinct from
every other canary's, so a link never routes to whichever one the OS resolved last.

# @symbiote-native/svelte

The **Svelte adapter** for [SymbioteNative](../../README.md) — render real native iOS/Android views
from Svelte 5, on the _same_ untouched core as React, Vue, and Angular, with React Native's own
renderer never in the path. Svelte ships no official host-renderer API yet (`createRenderer` is
still an unmerged PR upstream), so instead of hooking a framework-blessed extension point this
adapter patches `globalThis`'s DOM classes: stock compiled Svelte client output believes it is
talking to a real DOM, and every one of those calls routes into `@symbiote-native/engine`'s same
four-call mutation API underneath, which does the clone-on-write commit into Fabric.

Svelte is the **sharpest test yet** that the core is genuinely framework-agnostic — unlike Vue's
`createRenderer` or Angular's `Renderer2`, there was no host-renderer seam to hook here at all.

<div align="center">

![Svelte driving real native iOS views through SymbioteNative](../../assets/svelte-demo.gif)

</div>

> New to SymbioteNative? The [root README](../../README.md) has the architecture.

---

## Install

```bash
npm install @symbiote-native/svelte react-native svelte
```

`react-native` and `svelte` stay your app's own top-level dependencies — this package only
replaces the JS renderer that drives them. Every component is a `.svelte` SFC — there's no TSX
alternative the way Vue offers — so the Metro wiring below isn't optional. There's no
`create-symbiote` scaffolder yet, so it comes from [`examples/svelte`](../../examples/svelte)
rather than a generator:

- `metro.config.js` — point `babelTransformerPath` at
  `@symbiote-native/svelte/metro-svelte-transformer` (compiles `.svelte` on the way into the
  bundle) and disable `inlineRequires` (see [the gotcha
  below](#a-svelte-specific-gotcha--inlinerequires-vs-the-svelte-runtime)).
- `svelte.config.js` — registers the `forbidWebOnlyConstructs()` and `scopedStyles()`
  preprocessors, so `svelte-check` and the editor catch the same things Metro's transformer
  already guards against at build time, and sets `compilerOptions: { fragments: 'tree', css:
'external' }`.

---

## Use it

The native entry reaches the _same_ seam as every other adapter. `createApp(App).mount(appName)`
wires the native-host seams and RN's own `AppRegistry`, then mounts via `@symbiote-native/engine` —
RN's own renderer is never in the path:

```js
// index.js
import { createApp } from '@symbiote-native/svelte/bootstrap';
import App from './App.svelte';
import { name as appName } from './app.json';

createApp(App).mount(appName);
```

The app is ordinary Svelte 5 — it just imports primitives from `@symbiote-native/svelte` instead of
`react-native`. A tap→increment counter, using runes:

```svelte
<script lang="ts">
  import { View, Text, Pressable } from '@symbiote-native/svelte';

  let count = $state(0);
</script>

<View style={{ padding: 24 }}>
  <Text>Taps: {count}</Text>
  <Pressable onPress={() => count++}>
    <Text>Tap me</Text>
  </Pressable>
</View>
```

The full canary is [`examples/svelte`](../../examples/svelte) — a stock RN 0.86 app whose
[`App.svelte`](../../examples/svelte/App.svelte) exercises the same surface as the React, Vue, and
Angular reference canaries.

---

## Parity — and the one gap

Svelte reaches the same primitives, runtime modules, `Animated` on both drivers, gestures,
accessibility, and the `VirtualizedList` family as React, Vue, and Angular, verified on-device on
iOS and Android. That parity is **structural, not hand-copied**: the component logic (state
machines + render functions) is written **once** in `@symbiote-native/components`, and Svelte
supplies only its lifecycle — runes (`$state` / `$derived` / `$effect`) driving hand-authored
`.svelte` markup that mirrors each `render-*.ts` directly, rather than a generic descriptor bridge
the way React and Vue use one.

The one deliberate gap, same as every other non-React adapter — **third-party React component
packages** (`@react-native-community/slider` used directly) run only under the React adapter:
their body calls React hooks off the React dispatcher, which is null under Svelte.
`@symbiote-native/slider` (this repo's own wrapper) _does_ ship a real Svelte build
(`@symbiote-native/slider/svelte`) through the same `createNode`-by-ViewConfig path Svelte uses
for its own primitives — that wrapper is what makes this one third-party native view usable from
Svelte at all; any _other_ React-only component package stays React-adapter-only until it gets the
same treatment.

---

## A Svelte-specific gotcha — inlineRequires vs the Svelte runtime

RN's default Metro config turns on `inlineRequires` for every top-level import. Svelte's internal
client runtime (`svelte/internal/client/**`) is a graph of small files wired through module-scope
singleton reactivity state (the current-effect/signal graph); under `inlineRequires` that graph
re-enters itself while mounting and blows the JS stack — `Maximum call stack size exceeded` inside
`metroRequire`, reproduced on a real device/simulator, not just in theory.
[`examples/svelte`](../../examples/svelte)'s `metro.config.js` disables it explicitly
(`experimentalImportSupport: false, inlineRequires: false`); any new Svelte app needs the same
override, since RN's default Metro config doesn't know to do this on its own.

A smaller one: Svelte's compiler only trims LEADING/TRAILING whitespace inside a fragment —
whitespace strictly _between_ two sibling non-text nodes collapses to a real text node and is
kept. That's invisible on the web, but a stray text node between siblings under a non-`Text`
parent is an invalid Fabric child on this DOM shim, so markup inside an `{#each}`/`{#if}` chain
over host primitives has to avoid it — this repo carries a device-verified regression test
guarding it.

---

## Run it

[`examples/svelte`](../../examples/svelte) is a stock React Native 0.86 app. Requires Node ≥ 22
and the [RN environment setup](https://reactnative.dev/docs/set-up-your-environment) (Xcode,
CocoaPods):

```bash
cd examples/svelte
npm install
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install        # fetch native pods

# terminal 1 — Metro. DEBUG=1 turns on diagnostic logs.
DEBUG=1 npm run dev

# terminal 2 — build + launch
npm run ios                    # iOS simulator
npm run android                # Android emulator
```

---

## Test it

```bash
pnpm test                      # vitest, from the workspace root — headless, fake Fabric slot

cd examples/svelte
npm run e2e:build:ios          # build the app for Detox
npm run e2e:test:ios           # run the canary journeys on the iOS simulator
# …or the android equivalents: e2e:build:android / e2e:test:android
```

Why these come for free — a SymbioteNative app is a stock RN app underneath, so RN's whole testing
ecosystem applies unchanged. See [Testing](../../README.md#testing).

# @symbiote-native/svelte

The **Svelte adapter** for [SymbioteNative](../../README.md) — render real native iOS/Android views
from Svelte 5, on the _same_ untouched core as React, Vue, Solid, and Angular, with React Native's own
renderer never in the path. The adapter drives Svelte's own custom renderer API
(`svelte/renderer`, `createRenderer`), so the components are compiled with
`experimental.customRenderer` and every node operation routes into `@symbiote-native/engine`'s
same four-call mutation API, which does the clone-on-write commit into Fabric.

> **Experimental.** The custom renderer API is experimental in Svelte itself and needs
> `svelte >= 5.59.1`. It rejects `bind:`, `on:`, `transition:`, `animate:`, `{@html}` and
> `<svelte:window|document|body|head>` at compile time: use `{@attach}`, `onX={...}` props and the
> runtime modules instead.

<div align="center">

![Svelte driving real native iOS views through SymbioteNative](../../assets/svelte-demo.gif)

</div>

> New to SymbioteNative? The [root README](../../README.md) has the architecture.

---

## Install

```bash
npx @symbiote-native/cli new my-app --framework svelte
```

One command, nothing to wire by hand: every component here is a `.svelte` SFC with no TSX
alternative, so the Metro wiring below isn't optional — the generator sets it up, plus
`@symbiote-native/svelte`/`react-native`/`svelte` as your app's own dependencies.

<details>
<summary>Manual install (no generator — an existing app, or you want to wire it yourself)</summary>

```bash
npm install @symbiote-native/svelte react-native svelte
```

`react-native` and `svelte` stay your app's own top-level dependencies — this package only
replaces the JS renderer that drives them. Follow [`examples/svelte`](../../examples/svelte) for
both pieces of Metro wiring below; there is no wiring script for an existing app:

- `metro.config.js` — point `babelTransformerPath` at
  `@symbiote-native/svelte/metro-svelte-transformer` (compiles `.svelte` on the way into the
  bundle) and disable `inlineRequires` (see [the gotcha
  below](#a-svelte-specific-gotcha--inlinerequires-vs-the-svelte-runtime)). Add
  `resolver.unstable_conditionNames: ['svelte-custom-renderer', 'browser']`, so Svelte's runtime
  resolves to its custom-renderer build.
- `svelte.config.js` — registers the `forbidWebOnlyConstructs()`, `scopedStyles()`, and
  `collapseTextWhitespace()` preprocessors, so `svelte-check` and the editor catch the same things
  Metro's transformer guards against at build time. The third one matters beyond diagnostics:
  without it, a sentence wrapped across source lines ships a literal newline into the native text
  content. Also sets `compilerOptions: { fragments: 'tree', css: 'external', experimental: {
customRenderer: '@symbiote-native/svelte/renderer' } }` and a `warningFilter` that silences
  `element_invalid_self_closing_tag` for `<pressable />`-style self-closing primitives.

</details>

---

## Use it

The app is ordinary Svelte 5 — the native primitives are plain intrinsic tags, no import needed.
Styling is a CSS class against the component's own `<style>` block — the convention every example
app here follows. A tap→increment counter, using runes:

```svelte
<script lang="ts">
  let count = $state(0);
</script>

<safe-area-view class="screen">
  <text>Taps: {count}</text>
  <pressable onPress={() => count++}>
    <text>Tap me</text>
  </pressable>
</safe-area-view>

<style>
  .screen {
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
</style>
```

<details>
<summary>Native entry point (index.js) — already scaffolded by <code>npx @symbiote-native/cli new --framework svelte</code></summary>

The native entry reaches the _same_ seam as every other adapter. `createApp(App).mount(appName)`
wires the native-host seams and RN's own `AppRegistry`, then mounts via `@symbiote-native/engine` —
RN's own renderer is never in the path:

```js
// index.js

// Registers host behaviors (Image, Pressable, Switch, ...) that /bootstrap alone doesn't
// reach; deleting this breaks them silently (Metro's production inlineRequires makes a
// side-effect-only barrel import go lazy, see register.ts).
import '@symbiote-native/svelte';
import { createApp } from '@symbiote-native/svelte/bootstrap';
import App from './App.svelte';
import { name as appName } from './app.json';

createApp(App).mount(appName);
```

</details>

The full canary is [`examples/svelte`](../../examples/svelte) — a stock RN 0.86 app whose
[`App.svelte`](../../examples/svelte/App.svelte) exercises the same surface as the React, Vue, and
Angular reference canaries.

---

## Parity — and the one gap

Svelte reaches the same primitives, runtime modules, `Animated` on both drivers, gestures,
accessibility, and the `VirtualizedList` family as React, Vue, Solid, and Angular, verified
on-device on iOS and Android. That parity is **structural, not hand-copied**. The component logic
(state machines + render functions) is written **once** in `@symbiote-native/components`. Svelte
supplies only its lifecycle: runes (`$state` / `$derived` / `$effect`) driving hand-authored
`.svelte` markup that mirrors each `render-*.ts`, not a generic descriptor bridge like React and Vue.

The one deliberate gap, same as every other non-React adapter: **third-party React component
packages** (`@react-native-community/slider` used directly) run only under the React adapter.
Their body calls React hooks off the React dispatcher, which is null under Svelte.
`@symbiote-native/slider` (this repo's own wrapper) _does_ ship a real Svelte build
(`@symbiote-native/slider/svelte`) through the same `createNode`-by-ViewConfig path Svelte uses
for its own primitives. Any _other_ React-only component package stays React-adapter-only until it
gets the same treatment.

---

## A Svelte-specific gotcha — inlineRequires vs the Svelte runtime

RN's default Metro config turns on `inlineRequires` for every top-level import. Svelte's internal
client runtime (`svelte/internal/client/**`) is a graph of small files wired through module-scope
singleton reactivity state (the current-effect/signal graph); under `inlineRequires` that graph
re-enters itself while mounting and blows the JS stack — `Maximum call stack size exceeded` inside
`metroRequire`, reproduced on a real device/simulator, not just in theory.
Any new Svelte app needs an override, since RN's default Metro config doesn't know to do this on
its own. Without Worklets Bundle Mode, `inlineRequires: false` for the whole app is enough.

With Worklets Bundle Mode that global switch breaks the app at start. A worklet runtime evaluates
the same bundle, and eager requires load React Native modules there. The app then fails with
`Accessing __fbBatchedBridgeConfig is not allowed on Worklet Runtimes`.

Keep inline requires on for the files of `react-native-worklets`, and off for everything else.
Metro takes this as `inlineRequires: { blockList }`, which names the files that stay eager. Also
set `experimentalImportSupport: false`. [`examples/svelte`](../../examples/svelte)'s
`metro.config.js` does this.

A smaller one: Svelte's compiler only trims LEADING/TRAILING whitespace inside a fragment.
Whitespace strictly _between_ two sibling non-text nodes collapses to a real text node and is
kept. That is invisible on the web, but a stray text node between siblings under a non-`Text`
parent is an invalid Fabric child. Markup inside an `{#each}`/`{#if}` chain over host primitives
has to avoid it, and this repo carries a device-verified regression test guarding it.

---

## Run it

[`examples/svelte`](../../examples/svelte) is a stock React Native 0.86 app. Requires Node ≥ 22.13
(react-native 0.86's own `package.json#engines`) and the [RN environment
setup](https://reactnative.dev/docs/set-up-your-environment) (Xcode, CocoaPods):

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

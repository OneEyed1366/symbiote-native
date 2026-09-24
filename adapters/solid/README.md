# @symbiote-native/solid

The **SolidJS adapter** for [SymbioteNative](../../README.md) — compiled Solid JSX drives real
native iOS/Android views through the same `@symbiote-native/engine` every other adapter uses,
with React's renderer never in the path. It targets `createRenderer` from `solid-js/universal`,
Solid's own custom-renderer API — no shimming of private internals, no compiler running beside
Metro, no custom Babel transformer path.

<div align="center">

![Solid driving real native iOS views through SymbioteNative](../../assets/solid-demo.gif)

</div>

> New to SymbioteNative? The [root README](../../README.md) has the architecture.

---

## Install

```bash
npx @symbiote-native/cli new my-app --framework solid
```

One command, nothing to wire by hand: scaffolds the Babel preset, Metro config, and
`jsxImportSource` below, plus `@symbiote-native/solid`/`react-native`/`solid-js` as your app's own
dependencies.

<details>
<summary>Manual install (no generator — an existing app, or you want to wire it yourself)</summary>

```bash
npm install @symbiote-native/solid react-native solid-js
```

`react-native` and `solid-js` stay your app's own top-level dependencies — this package only
replaces the JS renderer that drives them. Follow [`examples/solid`](../../examples/solid) for the
Babel preset, Metro config, and `jsxImportSource` below; there is no wiring script for an existing
app.

</details>

Targets **Solid 1.9**, deliberately not 2.0 (RC as of 2026-08) — 2.0 moves the package to
`@solidjs/universal`, changes `RendererOptions`, and changes the compiled-output shape. Moving to
it is a rewrite of `src/renderer.ts`, not a range bump.

---

## Use it

The app is ordinary Solid — the native primitives are plain lowercase intrinsic tags, no import
needed. Styling is a CSS class against a plain `.css` file — the convention every example app
here follows:

```jsx
import { createSignal } from 'solid-js';
import './App.css';

export default function App() {
  const [count, setCount] = createSignal(0);
  return (
    <safe-area-view class="screen">
      <text>Taps: {count()}</text>
      <pressable onPress={() => setCount(c => c + 1)}>
        <text>Tap me</text>
      </pressable>
    </safe-area-view>
  );
}
```

```css
/* App.css */
.screen {
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
```

<details>
<summary>Native entry point (index.js) — already scaffolded by <code>npx @symbiote-native/cli new --framework solid</code></summary>

The zero-config entry wires the RN-backed host seams and registers the app in one call — this is
what [`examples/solid`](../../examples/solid) actually uses:

```js
// index.js

// Registers host behaviors (Image, Pressable, Switch, ...) that /bootstrap alone doesn't
// reach; deleting this breaks them silently (Metro's production inlineRequires makes a
// side-effect-only barrel import go lazy, see register.ts).
import '@symbiote-native/solid';
import { createApp } from '@symbiote-native/solid/bootstrap';
import App from './App';
import { name as appName } from './app.json';

createApp(App).mount(appName);
```

For anything the defaults don't cover, drive the lower-level seam directly — the same
`registerRunnable` seam every other adapter uses:

```js
// index.js
import { AppRegistry } from 'react-native';
import { mount } from '@symbiote-native/solid';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerRunnable(appName, ({ rootTag }) => {
  mount(rootTag, App);
});
```

</details>

`babel.config.js` needs the adapter's preset LAST — Babel applies presets in reverse order, so
listing it last runs it first, claiming the JSX before RN's own React-JSX transform can:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset', '@symbiote-native/solid/babel-preset'],
};
```

## Primitives are plain intrinsic tags — `<view>`/`<text>`/`<pressable>`, no component involved

An app writes the lowercase tags directly (`view`, `text`, `pressable`, …) — `babel-preset-solid`'s
own `isComponent` check already treats a lowercase name as an element, so JSX compiles straight to
`createElement`/`setProp` calls against `symbiote-view` etc., no import and nothing to opt into.
Nothing rewrites the source on the way there, so this adapter carries no Babel plugin of its own.

## `./renderer` is a compiler target, not a convenience export

`babel-preset-solid` with `generate: 'universal'` rewrites JSX into direct calls imported from the
`moduleName` it was given. So `src/renderer.ts` exports twelve specific names because generated code
imports them; dropping one breaks bundling with a module-not-found on an import nobody wrote. The
list (`render`, `createElement`, `createTextNode`, `insertNode`, `insert`, `setProp`, `use`, `effect`,
`memo`, `createComponent`, `spread`, `mergeProps`) was verified by compiling representative JSX, not
read off the docs.

## Three things the universal runtime does that the seam has to answer correctly

Each is a one-line decision in `src/renderer.ts` with a real failure behind it — the comments there
cite the runtime line that forces them.

1. **`createTextNode('')` is a placeholder, not content.** The runtime parks an empty text node where
   a dynamic expression will go. An empty `RCTRawText` genuinely paints in Fabric, so an empty string
   maps to an engine anchor instead (skipped by the commit walk).
2. **`isTextNode` must answer "can I write a string into this", not "did `createTextNode` make it".**
   The runtime asks it about that placeholder anchor; answering `true` sends it to write text into a
   node that never reaches Fabric.
3. **Anchors stay visible to `getFirstChild`/`getNextSibling`.** The runtime re-derives positions
   through those lookups, so hiding a node it inserted itself desyncs its bookkeeping from the tree.
   Anchors are invisible to Fabric, not to traversal.

`tsconfig.json` points `jsxImportSource` at this package — the whole typing setup, no
`solid-env.d.ts`, no per-file pragma:

```jsonc
{ "jsx": "preserve", "jsxImportSource": "@symbiote-native/solid" }
```

Solid's own control-flow `Switch`/`Match` are **not** re-exported from this package — `Switch`
collides with RN's `Switch` component, which every adapter must export under that name. Import
the control-flow pair from `solid-js` directly.

---

## Parity — and the one gap

Solid reaches the same primitives, runtime modules, `Animated` on both drivers, gestures,
accessibility, and the `VirtualizedList` family as React, Vue, Svelte, and Angular, verified
on-device on iOS and Android — the root README's ["How Fast, Against Stock React
Native"](../../README.md#how-fast-against-stock-react-native) section has the measured numbers.
That parity is **structural, not hand-copied**: the component logic (state machines +
render functions) is written **once** in `@symbiote-native/components`, and Solid supplies only
its lifecycle via `descriptorToSolid`. `Portal` (same-surface content relocation) and
`createTunnel` (cross-surface) both ship, built over the universal renderer rather than
`solid-js/web`'s DOM-bound equivalents; `Dynamic` stays absent by design — nothing here needs it.

The one deliberate gap, same as every other non-React adapter — **third-party React component
packages** (`@react-native-community/slider` used directly) run only under the React adapter:
their body calls React hooks off the React dispatcher, which is null under Solid.
`@symbiote-native/slider` (this repo's own wrapper) _does_ ship a real Solid build through the
same `createNode`-by-ViewConfig path Solid uses for its own primitives.

---

## A Solid-specific gotcha — Fast Refresh, not Metro's export conditions

A compiled Solid component is a function with an uppercase name (`function App(props)`) —
exactly what react-refresh's `isLikelyComponentType` heuristic accepts as a React component.
Metro's HMR then tries to patch a React Fiber tree that doesn't exist here (no `react-reconciler`
in this path), and the update is silently swallowed: no error, no visible change.
`metro.config.js` needs `unstable_forceFullRefreshPatterns: [/\.tsx$/]` to force every `.tsx`
edit to a full reload instead.

`solid-js`'s export map does have a `node` branch pointing at its SSR build — the same shape that
broke the Svelte canary — but Metro's own default condition set (`['react-native']`, contributed
by `@react-native/metro-config`) never includes `node`, so the SSR branch is unreachable and the
client build resolves correctly with no extra `unstable_conditionNames` config. Adding one would
not fix anything that's broken and would actively drop `'react-native'` from the condition set
(`mergeConfig` replaces the array rather than extending it) — leave it alone.

---

## Run it

[`examples/solid`](../../examples/solid) is a stock React Native 0.86 app — the steps are
identical to the [React adapter](../react/README.md#run-it), just swap the directory:

```bash
cd examples/solid
npm install
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install        # fetch native pods

# terminal 1 — Metro (DEBUG=1 turns on diagnostic logs)
DEBUG=1 npm start --reset-cache

# terminal 2 — build + launch
npm run ios                    # iOS simulator
npm run android                # Android emulator
```

---

## Test it

```bash
pnpm test                      # vitest, from the workspace root — headless, fake Fabric slot
```

The canary's own real-device verification is the perf benchmark run (see [Run
it](#run-it) plus the root README's device numbers), not an automated on-device suite —
`examples/solid` is the one canary without a Detox `e2e/` setup yet, unlike React/Vue/Svelte/
Angular. Why headless testing comes for free otherwise: see
[Testing](../../README.md#testing).

---

## Reference

- The canary app: [`examples/solid`](../../examples/solid).
- The nodeOps table this mirrors: `adapters/vue/src/renderer/index.ts`.
- The same seam on an ANSI target: `wolf-tui/packages/solid/src/renderer/node-ops.ts`.

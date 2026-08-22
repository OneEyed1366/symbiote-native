# @symbiote-native/solid

SolidJS adapter for SymbioteNative. Compiled Solid JSX drives real native iOS/Android views through
the same `@symbiote-native/engine` every other adapter uses — React's renderer is never in the path.

**Status: L4 in progress (parity phase).** The renderer seam, `mount`/`unmount`, the primitives, the
stateful touch components, the Touchable family, Button / ImageBackground / InputAccessoryView,
StatusBar and the list family all ship at full parity with the React reference — off
`@symbiote-native/components`, via `descriptorToSolid` where the component has a shared render fn.
The engine-owned runtime modules are re-exported from the barrel. Still absent: `createPortal` and
`createTunnel`, both of which need a same-surface replacement for `solid-js/web`'s DOM-bound
`Portal`/`Dynamic`. See `symbiote-new-adapter` §7 for what each layer means and why the adapter is
built in that order.

Solid's own control-flow `Switch`/`Match` are NOT re-exported from this package: `Switch` collides
with RN's Switch component, which every adapter must export under that name. Import the control-flow
pair from `solid-js` directly.

Publishing is gated by `"private": true` in `package.json`, which is what
`scripts/lib/publishable-packages.mjs` filters on — so `changeset publish` and the pkg.pr.new canary
both skip this package until that flag comes off. Without it `0.0.0` (a version absent from npm) would
be published on the next release run, shipping a reduced surface and violating the repo's
`<adapters_reach_full_feature_parity>` invariant. Remove the flag in the commit that finishes parity.

## Why Solid needs no DOM shim and no Metro transformer

Solid ships an official custom-renderer API, `createRenderer` from `solid-js/universal`. That is
exactly the framework-agnostic seam this project looks for in every framework, so the adapter is
`RendererOptions`' ten methods mapped onto the engine's mutation API — no shimming of private
internals (the Svelte adapter's approach, forced by an unmerged upstream PR), no compiler running
beside Metro (Angular's AOT), and no custom `babelTransformerPath` at all.

Targets **Solid 1.9**, deliberately not 2.0 (RC as of 2026-08): 2.0 moved the package to
`@solidjs/universal`, changed `RendererOptions` (added `createSentinel`/`cleanupNodes`, gave
`createElement` a staticProps argument) and changed the compiled-output shape (`use()` →
`applyRef`/`ref`, `effect(fn, init)` → `effect(fn, effectFn)`). Moving to it is a rewrite of
`src/renderer.ts`, not a range bump.

## Wiring an app

`babel.config.js` — the preset ships preconfigured, so the app can't get `moduleName` or `generate`
wrong:

```js
module.exports = {
  presets: [
    'module:@react-native/babel-preset',
    // LAST on purpose: Babel applies presets in reverse order, so this runs FIRST and claims the
    // JSX before the React Native preset's own React-JSX transform can.
    '@symbiote-native/solid/babel-preset',
  ],
};
```

`metro.config.js` needs `unstable_conditionNames: ['browser']` — `solid-js`'s export map has a `node`
branch pointing at its SSR build, and resolving that into a native bundle is the same failure mode
the Svelte example hit (`lifecycle_function_unavailable` on the first mount).

Solid compiles a component to `function App(props)` — a function with an uppercase name, which is
exactly what react-refresh's `isLikelyComponentType` heuristic looks for. It then tries to patch a
React Fiber tree that does not exist in this path, and the update is swallowed with no error. Force a
full reload instead: `unstable_forceFullRefreshPatterns: [/\.tsx$/]`.

## `./renderer` is a compiler target, not a convenience export

`babel-preset-solid` with `generate: 'universal'` rewrites JSX into direct calls imported from the
`moduleName` it was given. So `src/renderer.ts` exports eleven specific names because generated code
imports them; dropping one breaks bundling with a module-not-found on an import nobody wrote. The
list (`createElement`, `createTextNode`, `insertNode`, `insert`, `setProp`, `use`, `effect`, `memo`,
`createComponent`, `spread`, `mergeProps`) was verified by compiling representative JSX, not read off
the docs.

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

## Typing — the app points `jsxImportSource` here, and that is the whole setup

```jsonc
// tsconfig.json
"jsx": "preserve",
"jsxImportSource": "@symbiote-native/solid"
```

That is all an app needs. No `/// <reference types>` line, no `solid-env.d.ts`, no per-file pragma:
TypeScript resolves the entire JSX namespace from this package's `./jsx-runtime` entry, which is
type-only (the emitted JS is `export {};` and nothing ever imports it — JSX becomes calls on
`./renderer` through babel-preset-solid's `moduleName`, a separate mechanism).

Two things follow that the earlier `declare module 'solid-js'` shim could not give:

- **A web tag is a compile error.** `<div>` reports `TS2339: Property 'div' does not exist on type
'JSX.IntrinsicElements'` instead of building fine and failing on device. Augmenting solid-js's
  namespace merges into its HTML/SVG list, so `<div>` stayed legal there. The Svelte adapter needed
  a whole preprocessor for the same guarantee.
- **JSX children are type-checked at all.** solid-js's `JSX.Element` names the DOM's `Node`, which
  does not resolve without a DOM lib — and `skipLibCheck` swallows that error rather than reporting
  it, leaving `Element` as `any` and every JSX child position unchecked. The visible symptom was
  small (a render-prop parameter needed an explicit annotation); the cause was not.

The risk recorded when this was deferred — that our `Element` must line up with what solid-js's own
`<Show>`/`<For>` return — resolves for the same reason: solid's is `any` in the DOM-less programs we
target, so it is assignable to anything of ours. `src/jsx-runtime.test.tsx` pins the runtime half;
the type half rides on `examples/solid`'s typecheck. Full rationale, the measurements behind each
claim, and the one config that would break it: `.claude/rules/solid-jsx-namespace.md`.

## Single root per process

Compiled JSX calls module-level functions with no surface argument, so there is nowhere to thread a
per-surface renderer through — the active surface is module state, set by `mount`. The Svelte adapter
reached the same single-root conclusion for its own reasons.

## Reference

- The canary app: `examples/solid` (its README covers running it and the checks it carries).
- The engine API this targets: the `symbiote-engine-core` skill, `core/engine/src/node.ts`.
- Building/porting an adapter: the `symbiote-new-adapter` skill.
- The nodeOps table this mirrors: `adapters/vue/src/renderer/index.ts`.
- The same seam on an ANSI target: `wolf-tui/packages/solid/src/renderer/node-ops.ts`.

---
name: symbiote-devtools-inspector
description: "Read before investigating why React Native DevTools' Components/Profiler tabs show nothing (\"Loading React Element Tree...\", \"Profiling not supported\") for a Symbiote example on a non-React adapter (Vue/Svelte/Angular), before attempting to hook `__REACT_DEVTOOLS_GLOBAL_HOOK__` from a non-React adapter, or before scoping a devtools/inspector feature for SymbioteNative. Records a confirmed (2026-08, file:line-cited) research finding: React DevTools' Components tree, Profiler, and click-to-select highlight are Fiber-only, not protocol-based — every entry point requires objects produced by React's own commit bookkeeping, not a satisfiable interface, and the Components/Profiler tabs are statically registered in RN's debugger-frontend with no way to hide them short of forking it (out of scope, same reasoning as native_core_is_untouched). Also records the viable alternative: a Rozenite (callstackincubator/rozenite) plugin exposing @symbiote-native/engine's own retained tree as a custom DevTools panel, framework-agnostic across all adapters, with a scoped v0 plan. Status: scoped, not implemented. Trigger on 'devtools doesn't show components', 'Loading React Element Tree', 'Profiling not supported', 'can we get Vue/Svelte/Angular devtools support', 'React DevTools for non-React renderer', 'Rozenite plugin', 'custom devtools panel'."
---

# React Native DevTools for non-React adapters

## The dead end: React DevTools is Fiber-only, not protocol-based

Confirmed 2026-08-16 via source read of `.vendors/react`/`.vendors/react-native`
(react@19.3.0, RN 0.86.0) plus web precedent — do not re-investigate this from
scratch.

The Components tab, Profiler tab, and click-to-select highlight in the new RN
DevTools all trace back to the same gate: `getInspectorDataForViewAtPoint.js`
(`.vendors/react-native/packages/react-native/src/private/devsupport/devmenu/
elementinspector/getInspectorDataForViewAtPoint.js`) iterates
`window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` — populated ONLY by
`hook.inject(rendererConfig)`, which only `react-reconciler`-based renderers
call. Only `@symbiote-native/react` does this; Vue/Svelte/Angular mutate the
engine's retained tree directly and never touch a Fiber tree, so `renderers`
stays empty for them.

`ReactFiberReconciler.js:878` (`.vendors/react`) shows `injectIntoDevTools()`
building that config from raw Fiber internals: `findCurrentFiberUsingSlowPath`/
`findCurrentHostFiber` walk `fiber.alternate`/`child`/`return` (Fiber's
double-buffering), check `fiber.tag === HostComponent` (a version-pinned
numeric `WorkTags` enum), read `fiber._debugOwner`/`memoizedProps`. The
Components TREE itself is a separate path again: `react-devtools-shared`'s
`attach()` (`backend/fiber/renderer.js:1007`, vendored at
`.vendors/react/packages/react-devtools-shared`) walks
`hook.getFiberRoots(rendererID)`, populated by React's own `commitRootImpl`
during every commit.

There is no thin interface to satisfy here — both paths need objects
indistinguishable from real Fiber, produced by React's own commit bookkeeping
(flags bitmask, lanes, hooks linked list). This is a structural dead end, not
just a hard integration: Preact tried and gave up, shipping its own separate
`__PREACT_DEVTOOLS__` + dedicated browser extension instead
(preactjs/preact-devtools#52 — "Fiber-specific code kept leaking into the
devtools agent"). No project has shipped a working non-Fiber shim into that
hook.

## The Components/Profiler tabs can't even be hidden

Also confirmed: there is no way to suppress the useless "Components ⚛" /
"Profiler ⚛" tabs for a non-React adapter, short of forking
`debugger-frontend`. They're registered unconditionally —
`react_devtools_components-meta.js` / `react_devtools_profiler-meta.js`
(`.vendors/react-native/packages/debugger-frontend/dist/third-party/front_end/
panels/react_devtools/`) call `ViewManager.registerViewExtension({persistence:
"permanent", ...})` with no `condition` field, even though Chrome DevTools'
own extension system supports conditional registration elsewhere — Meta's
panel registration just doesn't use it. The device↔frontend
capability-negotiation protocol (`TargetCapabilityFlags`,
`.vendors/react-native/packages/dev-middleware/src/inspector-proxy/types.js:
15-40`) only carries `nativePageReloads`/`nativeSourceCodeFetching`/
`supportsMultipleDebuggers` — nothing about renderer presence. So even after
building the alternative below, these two stock tabs will permanently sit
next to it showing "Loading React Element Tree…" / "Profiling not supported"
for Vue/Svelte/Angular apps — an undismissable cosmetic limitation, not a bug
we can fix without forking `debugger-frontend` (out of scope, same
anti-fork reasoning as `<native_core_is_untouched>` in the root CLAUDE.md).

## The viable alternative: a Rozenite panel over the engine's own tree

[Rozenite](https://github.com/callstackincubator/rozenite) (Callstack) adds
custom panels to RN DevTools WITHOUT forking `debugger-frontend` — a panel is
an iframe-sandboxed React app the Rozenite runtime auto-discovers and injects,
talking to the app over a typed event bridge riding the same CDP connection
DevTools already has open. Confirmed RN 0.86.0 (this repo's pin) is within
Rozenite's supported Fusebox-era range.

Key mechanics (rozenite.dev docs, `plugin-development/overview` +
`getting-started`):

- Plugin layout: `src/*.tsx` (panel UI — plain React DOM in a browser iframe,
  NOT rendered through our own engine/renderer), `react-native.ts` (app-side
  entry), `rozenite.config.ts`, `vite.config.ts` for the panel build.
- **App-side entry is a plain function, zero React**:
  `export default function setupPlugin(client) { client.onMessage(...);
  client.send(...) }` — confirmed safe to hang directly off
  `@symbiote-native/engine` internals regardless of which adapter (React,
  Vue, Svelte, Angular) is driving the engine.
- Wiring: `withRozenite(mergeConfig(...), {enabled: ...})` in
  `metro.config.js`. Originally spiked behind an explicit `WITH_ROZENITE=true`
  env var (opt-in, mirroring the `DEBUG` log flag); changed 2026-08-16 to
  `enabled: process.env.NODE_ENV !== 'production'` — on by DEFAULT for any
  dev build, off in release, no env var to remember. Deliberately NOT the
  same policy as `DEBUG`: `DEBUG` is a diagnostic you opt into even in dev
  (verbose, noisy); a devtools inspector panel is itself a development-time
  tool, so it should just be there whenever you're developing. Verified safe:
  RN CLI's `bundle` command sets `NODE_ENV` from `--dev` itself
  (`@react-native/community-cli-plugin`'s `buildBundle.js`) BEFORE Metro
  config loads, and `react-native start` never touches `NODE_ENV` at all
  (stays unset → still "not production" → still enabled). Zero prod-bundle
  risk either way.
- Precedent: official plugins (Redux DevTools, TanStack Query, MMKV) already
  push arbitrary serializable JS state over this exact bridge — not
  Fiber-shaped, the same shape as our engine's retained tree.

What already exists on our side to build this:

- `ISymbioteNode` (`core/engine/src/node.ts:38`) is already a flat
  serializable shape (`component`/`isText`/`props`/`children`/`listeners`/
  `parent`).
- `registerPostCommit`/`runPostCommitHooks` (`core/engine/src/post-commit.ts`)
  is the exact seam to push a tree snapshot after every commit.
- `measureInWindow` (`core/engine/src/commit.ts:550`, already exported)
  solves highlight-on-select without any new native code.
- Gap: no public "get current retained root(s)" accessor exists yet — a
  small engine API addition.

See the `symbiote-engine-core` skill for the full mutation API, node-identity
(the `mirror` WeakMap), and commit mechanics these hooks sit on top of.

Recommended location: a new `packages/devtools` (sibling to
`packages/slider`), NOT folded into `@symbiote-native/engine` itself — it
pulls in a dev-only dependency plus a separate Vite/React-DOM build, which
would violate keeping the engine dependency-light.

## Architecture decisions (resolved 2026-08-16 via grill-me interview)

- **Surface registry lives IN the engine, auto-registered.** `createSurface()`
  (`core/engine/src/surface.ts`) adds the new `SymbioteSurface` to a
  module-level `Set`, removed on teardown/`disposeRoot`. Same pattern already
  used by `installEventHandler()` inside `createSurface()` — zero adapter
  changes, every future adapter gets devtools support structurally, matching
  `<adapters_reach_full_feature_parity>` ("parity must be structural, not
  maintained by hand"). Rejected alternative: an explicit `attachDevtools
  (surface)` call in each of the 4 `render.ts` files — 4 integration points a
  5th adapter could forget to wire.
- **Tree sync is a full snapshot on every post-commit, no diffing.** Simple,
  always correct, dev-only (never runs when `WITH_ROZENITE` is unset).
  Building a second diff engine here would duplicate the clone-on-write
  diffing already centralized once in `commit.ts` — rejected per
  `<clone_on_write_lives_in_engine>`; revisit only if a real perf problem is
  MEASURED on a large tree, not preemptively — see `symbiote-perf-measurement`
  for how to actually take that measurement instead of guessing.
- **Tree push is lazy, gated on panel subscription.** The app-side
  `setupPlugin(client)` registers the post-commit hook only after receiving a
  `subscribe` message from the panel, and unregisters it on
  disconnect/`unsubscribe`. Avoids serializing+sending a snapshot on every
  commit when a developer left `WITH_ROZENITE=true` set but the DevTools tab
  isn't open.
- **Highlight-on-select is explicitly OUT of v0**, deferred to a fast-follow.
  Rozenite's own official "Overlay" plugin (confirmed via
  rozenite.dev/docs/official-plugins/overlay) is NOT reusable for this — it's
  a grid/image-comparison tool for pixel-perfect layout work (inspired by
  RocketSim), rendered through `react-native-svg` as a real React component
  mounted in the app tree. Our own highlight, when built, will be a temporary
  engine-level `View` node (translucent border box) positioned via the
  already-exported `measureInWindow` (`core/engine/src/commit.ts:550`) —
  added/removed by our own plugin code outside the adapter's normal
  mutation cycle. Flagged risk to verify BEFORE committing to this approach:
  a foreign node injected outside an adapter's own reconciliation might get
  wiped on that adapter's next commit if the adapter recomputes its children
  from scratch (Svelte's diffing in particular). v0 ships tree + click-to-
  select + a props panel only, no on-device visual highlight.
- **Panel UI v0 = tree view + a props panel for the selected node** (not a
  bare tree, not search/hover yet — the props panel is what makes the tree
  actually useful to inspect, and the data is already in the snapshot).
- **Packaging: workspace-internal only until proven, then publish for real.**
  `packages/devtools` starts unpublished (no npm release) while it's being
  built and smoke-tested. It graduates to a real published
  `@symbiote-native/devtools` (via `symbiote-release-publishing` conventions
  — changesets, semver, peerDependency ranges) ONLY once parity is proven
  across all 4 adapters (React/Vue/Svelte/Angular), never after a single
  adapter's smoke test — same P0 bar as
  `<adapters_reach_full_feature_parity>` applies to this feature too, not
  just to visual components.
- **Vite is a new, first-time dependency in this repo — scoped strictly to
  the plugin panel's own build.** Rozenite's documented plugin layout
  requires `vite.config.ts` for the panel bundle; this does NOT conflict with
  the project's "Bundler: Metro... Not Vite" rule in the root CLAUDE.md,
  which is about the RN app's own bundler — the devtools panel is a separate
  browser-iframe artifact, never part of the Metro/Hermes bundle.

### v0 step list — progress

1. ✅ **Done (2026-08-16).** Spiked `withRozenite` against `examples/svelte`.

```
§step1_metro_spike := {
  verified: "withRozenite composes cleanly with examples/svelte's metro.config.js, no conflicts",
  facts: "@rozenite/metro@2.1.0 (confirmed by decompiling dist/index.cjs, not docs) exports withRozenite(config, {enabled: process.env.WITH_ROZENITE==='true'}); returns an async config fn; overrides ONLY watchFolders/resolver.extraNodeModules/resolver.resolveRequest (chains any pre-existing resolveRequest)/server.enhanceMiddleware — never touches transformer, so the Svelte SFC babel transformer and the esm-env/SIGSEGV resolver workaround (examples_vs_dot_examples in root CLAUDE.md) are untouched",
  proof: "react-native bundle: flag-off vs flag-on bundles are byte-identical (shasum match) — flag-off is a provable true no-op"
}
```

2. ✅ **Done (2026-08-16).** Added a public "active surfaces" accessor to the engine.

```
§step2_engine_registry := {
  added: "getActiveSurfaces() on @symbiote-native/engine's public surface",
  files: "core/engine/src/surface-registry.ts (new, mirrors post-commit.ts's shape — no import cycle between surface.ts/commit.ts); createSurface() registers, disposeRoot() (commit.ts) unregisters; both exported from core/engine/src/index.ts alongside registerPostCommit/runPostCommitHooks (not previously in the public barrel)",
  verified: "4 unit tests core/engine/src/surface-registry.test.ts; full engine suite + typecheck + lint green; zero adapter code touched"
}
```

3. ✅ **Done (2026-08-16), folded together with steps 4-6 of the original list.** Built
   `packages/devtools` and wired it into `examples/svelte`.

```
§step3_package_scaffold := {
  built: "packages/devtools (@symbiote-native/devtools) — workspace-internal, private:true, placeholder publishConfig{access:'restricted'} only to satisfy this repo's require-package-fields ESLint gate, no real build overlay yet",
  files: ["react-native.ts — app-side entry", "src/protocol.ts — shared message shapes",
          "src/serialize-tree.ts — pure ISymbioteNode -> JSON-safe bounded tree, tested: array cap 50, depth cap 5, string cap 500, stable per-node id via WeakMap<ISymbioteNode, number>",
          "src/tree-inspector-panel.tsx — plain React DOM: tree view + props panel, no search/hover (matches the resolved v0 UI scope)"],
  wiring: "originally wired into examples/svelte/index.js + babel.config.js behind an explicit WITH_ROZENITE env var (inline-flags babel plugin, mirroring DEBUG) ⟶ changed 2026-08-16 to on-by-default for any dev build: index.js gates on RN's own __DEV__ runtime global (if (__DEV__) require('@symbiote-native/devtools/react-native')); metro.config.js gates on NODE_ENV !== 'production' (see Architecture decisions above for why)",
  bonus_finding: "Metro's --dev false DEAD-CODE-ELIMINATES the if(__DEV__) branch entirely, not just skips it — grep: --dev true bundle has 6 hits for symbiote-devtools-inspector/getRozeniteDevToolsClient, --dev false has 0 (stronger than the old env-var-flag version, which left the branch present but unreached)",
  verified: "package typecheck, whole-project typecheck, syncpack, 5/5 vitest, Metro smoke on both the old flag mechanism and the new __DEV__ one (--dev true/false bundles diffed as above); examples/svelte is outside root ESLint's scope, so no lint step applies there"
}

§step3a_rozenite_docs_correction := {
  claim: "rozenite.dev/docs/plugin-development/plugin-development shows react-native.ts exporting `export default function setupPlugin(client: DevToolsPluginClient<...>)`, implying auto-discovery + auto-invoke of an installed plugin",
  reality: "real @rozenite/plugin-bridge@2.1.0 (verified via npm pack + reading its actual .d.ts) exports NEITHER a DevToolsPluginClient type NOR any auto-invoke mechanism — its only client constructor is getRozeniteDevToolsClient(pluginId): Promise<client>, which the caller must invoke itself",
  precedent: "the official Redux DevTools plugin also wires up explicitly from app code (rozeniteDevToolsEnhancer() in store.ts), not silent discovery",
  real_autodiscovery_scope: "@rozenite/middleware's plugin auto-discovery IS real but only drives the BROWSER DevTools panel side (scans node_modules for a dist/rozenite.json manifest, confirmed via the '[Rozenite] Loaded...' log) — NOT anything injected into the app's own JS bundle. @rozenite/metro's withRozenite() only touches watchFolders/resolver/server.enhanceMiddleware, no app-code import injected",
  consequence: "the app-side plugin entry needs an EXPLICIT require(...) in the consuming app — see `wiring` above",
  rule: "do not trust rozenite.dev's plugin-development code sample at face value for the app-side contract — verify against the installed package's own .d.ts first"
}
```

   **Real device/browser panel rendering was still UNVERIFIED at this point** — everything
   above proves Metro-level bundling and dev-middleware plugin discovery only; nobody had
   yet opened a real RN DevTools browser session against a running app to confirm the tree
   panel visually renders.

```
§step3b_first_device_test_blank_panel := {
  bug: "panel tab appeared but stayed blank",
  symptom: ":8081/devtools/assets/tree-inspector-panel-*.js 404'd (plus a harmless :8888 connection-refused from the frontend's live-reload Vite probe — not the real blocker, no dev server was started)",
  root_cause: "@rozenite/middleware's dist/index.js serves a plugin's dist/ ONLY under /plugins/<plugin>/** (app.get('/plugins/:plugin/*others', ...), pluginPath = path.join(plugin.path, 'dist')) — never at the site root. @rozenite/vite-plugin sets no `base` at all (zero refs to `base` anywhere in its own dist/index.js), so Vite's default base:'/' emitted an ABSOLUTE <script src=\"/devtools/assets/....js\"> in the built panel HTML — a browser resolves that against the origin ROOT, missing the /plugins/<plugin>/ prefix ⟶ 404, so the panel's own script never loads and React never mounts (nothing rendered, not even the 'Connecting to SymbioteNative…' loading text)",
  fix: "base: './' in packages/devtools/vite.config.ts — Vite then emits a relative ../devtools/assets/....js, resolving correctly wherever the HTML was served from",
  verified: "confirmed in the rebuilt dist/devtools/tree-inspector-panel.html"
}

§step3c_repack_stale_tarball_trap := {
  bug: "npm pack (used once, by mistake) left \"@symbiote-native/engine\": \"workspace:*\" and \"catalog:\" literally in the packed package.json — exactly the breakage examples_vs_dot_examples already warns about",
  fix_1: "redo with pnpm pack, which resolves workspace:*/catalog: to real versions",
  new_variant: "pnpm pack ALSO silently produced a tarball missing dist/ entirely on the first attempt, despite dist listed in package.json's files array — because dist/ is git-ignored (root .gitignore) and untracked, and pnpm's packer only picks up files-listed paths git can see, .gitignore or not (unlike plain npm pack, which prioritizes an explicit files field over .gitignore)",
  fix_2: "git add -f packages/devtools/dist before pnpm pack, then git reset packages/devtools/dist after (don't leave a build artifact staged)",
  blast_radius: "will bite every future re-pack of this package until it has a real publish pipeline; packages/slider avoids it by naming its build output build/ — unconfirmed whether that's WHY, or whether slider has just never been pnpm pack'd locally before"
}
```

4. **Next up.** Re-verify on a real device/simulator now that the base-path
   fix is in (`examples/svelte`'s `@symbiote-native/devtools` copy was
   reinstalled via the corrected `pnpm pack` tarball) — confirm the panel
   actually renders a tree this time, not just that the tab appears. No
   flag needed — on by default; use `--dev false`/a release build
   specifically to confirm it's ABSENT there.
5. Prove structural parity: repeat on React/Vue/Angular examples — expect
   ZERO adapter-specific code beyond each example's own `metro.config.js`/
   `index.js` wiring (same `withRozenite`/`__DEV__` pattern as Svelte's),
   since the whole design lives in the engine.
6. Only once parity is proven on all 4 adapters → publish
   `@symbiote-native/devtools` for real, per `symbiote-release-publishing`.
7. Fast-follow (separate task, not v0): highlight-on-select via a temporary
   engine-level `View` node + `measureInWindow` — verify first that a
   foreign node survives each adapter's next commit before building on this
   approach.

Keep this skill updated as the implementation actually lands — as of
2026-08-16, steps 1-3 are done (Metro spike, engine registry, package
scaffold + Svelte wiring, all Metro-level-verified); real on-device panel
rendering and cross-adapter parity are still open.

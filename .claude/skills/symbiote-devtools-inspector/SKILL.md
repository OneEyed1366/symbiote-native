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

## Researched 2026-08-17: can we embed the REAL framework devtools instead of our custom panel?

Asked per-adapter: instead of `packages/devtools`'s own tree+props panel, can
a Rozenite panel embed each framework's OFFICIAL devtools UI (not a
reimplementation), the way React's Components/Profiler tabs are built into
stock RN DevTools? Verdict per adapter — do not re-research from scratch:

- **Vue — the one worth a real spike, not a dead end.** Two separate,
  independently-usable mechanisms in `@vue/devtools-api`:
  1. The core Components tree walks REAL `ComponentInternalInstance` objects
     (`app._instance`/`instance.subTree`), not the DOM. Our Vue adapter
     (`@vue/runtime-core` `createRenderer`) already produces genuine internal
     instances — architecturally compatible in principle, unlike React where
     we never build a Fiber tree at all. Precedent: TresJS (a non-DOM
     Three.js custom renderer) hit a narrow null-check bug in
     `getComponentRootElements` assuming `el.ownerDocument`
     (vuejs/devtools-v6#2078), fixed in #2092 — a bug, not a structural wall.
     Unverified for us specifically: whether the walk survives with `el`
     pointing at a Fabric `ISymbioteNode` instead of a DOM node.
  2. The **Custom Inspector API** (`setupDevtoolsPlugin` +
     `api.addInspector()`/`getInspectorTree`/`getInspectorState`) is an
     OFFICIAL generic tree+state protocol — the same mechanism Pinia and Vue
     Router use to add their own panels. We could feed our own
     `ISymbioteNode` tree through this protocol into the real Vue Devtools
     UI without needing real component instances at all.
     Either mechanism needs its DATA-COLLECTION half running in the same JS
     realm as the app (mirrors the browser extension's content script, or
     Nuxt DevTools' Vite-plugin `birpc` WS-RPC mode) — feasible to bundle
     into our RN JS and re-point its transport at Rozenite's bridge instead
     of `window.postMessage`. The UI half is a separate frontend bundle,
     same shape as a Rozenite panel iframe.
- **Svelte — confirmed dead end, different reason than React's.** No
  architecture question even arises: `sveltejs/svelte-devtools` is stalled
  on Svelte 4. "Support for Svelte 5" (#193) open since April 2024, "Is
  svelte-devtools still actively maintained" (#245) open since May 2026,
  last real commit January 2025. There is no maintained Svelte 5 devtools to
  embed — consistent with `svelte-adapter-dom-shim`'s own finding that
  Svelte 5's compiler rewrite broke prior DOM-walking tooling.
- **Angular — likely dead end, unverified.** `ng-devtools-backend` runs in
  the app's main-world JS realm (same same-process requirement as Vue) but
  reads component metadata via `ng.getComponent()`/`LView`, keyed off
  `__ngContext__` stamped on the HOST ELEMENT. Our Angular adapter
  (`Renderer2`/`RendererFactory2`) hands Angular's core an engine node
  object, not a DOM `Element`, as that "host element" — whether Angular's
  framework internals stamp `__ngContext__` onto any Renderer2-returned
  object or specifically require a real DOM node is NOT confirmed either
  way; nobody has spiked it.
- **Precedent proving the pattern works in THIS ecosystem, in our favor:**
  Rozenite's own official `@rozenite/redux-devtools-plugin` embeds the REAL
  `@redux-devtools/app` frontend (not a reimplementation) bridged over
  `@rozenite/plugin-bridge`. Callstack's own flagship plugin already proves
  "bridge an official framework-devtools frontend over Rozenite's
  transport" for a transport/serialization-based case (Redux) — same shape
  Vue's Custom Inspector API would need.

**Working call (2026-08-17, not yet built): ship the custom panel as the
cross-adapter baseline; treat "embed Vue's official Custom Inspector" as an
optional Vue-only fast-follow, not a blocking redesign.** Rationale: the
custom panel is the only option that's uniform across all 4 adapters in one
code path (`<adapters_reach_full_feature_parity>` favors that), Svelte has
zero alternative regardless, and Angular's viability is unconfirmed. Vue's
Custom Inspector spike is real and worth doing later BECAUSE it's official
protocol + official UI, not a hack — but it is adapter-specific extra work
layered on top of, not instead of, the baseline panel.

### Follow-up research 2026-08-17: NativeScript precedent + re-verifying the Svelte finding

User pushback ("I don't believe official devtools for a major framework are
just dead") triggered a second research pass — do not re-research either
point from scratch.

**NativeScript precedent: a REAL official devtools UI DID connect to a
non-DOM native renderer — this is the strongest evidence yet for the Vue
spike.** NativeScript-Vue (v2, Vue 2/Options API era) had a working,
documented integration (`v2.nativescript-vue.org/.../vue-devtools`,
`nativescript-vue/nativescript-vue-devtools`): `Vue.use(VueDevtools, {host})`
in the app, then `npx vue-devtools` launches the REAL, official Vue Devtools
UI as a standalone Electron app, connected over a plain WebSocket — no DOM
involved anywhere. This confirms the theory from the first pass: Vue's
devtools hook only needs real component-instance objects, not a browser DOM.
Caveat: this specific integration is old and unmaintained (~4+ years stale;
NativeScript-Vue's own template/docs repos were archived by their owners in
Nov/Dec 2022) — a NativeScript-ecosystem momentum death, not a Vue-mechanism
death.

**CORRECTION (2026-08-17, later same day): the "Remote Client" lead above was
the WRONG package — do not chase it.** `devtools.vite.dev/kit/remote-client`
documents `@vitejs/devtools-kit` (repo `vitejs/devtools`, VoidZero's generic
"DevTools Framework for the Vite Ecosystem") — a SEPARATE, EXPERIMENTAL hub,
not Vue's own tooling. Confirmed by reading `vuejs/devtools` source directly:
the real `@vue/devtools-kit@8.2.1` (`packages/devtools-kit/package.json`) has
ZERO dependency on `@vitejs/devtools-kit`. Its actual transport
(`packages/devtools-kit/src/messaging/index.ts`) is `birpc` — a tiny,
transport-agnostic bidirectional-RPC lib needing only `post`/`on` — with five
built-in channel presets (`iframe | electron | vite | broadcast | extension`,
no WebSocket preset) but a pluggable `ChannelOptions` shape a custom channel
wrapping `@rozenite/plugin-bridge`'s `send`/`onMessage` fits cleanly.

**Svelte "dead end" finding: RE-CONFIRMED correct, not stale, by independent
sources dated into 2026 — no walk-back needed.** A March 2026 dev-notes
article states plainly Svelte devtooling "still trails what you get in
React or Vue ecosystems." What Svelte 5 teams actually use instead: the
`$inspect` rune (code-level console logging, not a UI), `vite-plugin-svelte-
inspector` (click-in-browser → jump to IDE line, NOT a component-tree/state
panel), and scattered community tools — none equivalent to a real devtools
UI. Baseline check confirms the asymmetry is real, not an artifact of a bad
search: Vue Devtools v7 and Angular DevTools are both current and
actively maintained by their respective CORE TEAMS (Angular DevTools shows
~3-week-old updates and open Signals-support engineering discussion,
angular/angular#63874); Svelte's devtools has always been a smaller
community effort (the old `RedHatter`/`sveltejs` extension) that never got
rebuilt after Svelte 5's rune/compiler rewrite broke its DOM-attribute-
walking approach — consistent with what `svelte-adapter-dom-shim` already
found about that rewrite breaking prior DOM-coupled tooling generally.

### Angular DevTools: PRIVATE-INTERNALS-DEAD-END, same class as React

Read directly from `angular/angular`'s `devtools/` source. Root discovery and
node identity are hard DOM-typed, not abstracted: `get-roots.ts`'s
`getAppRoots()` is `document.documentElement.querySelectorAll('[ng-version]')`;
`shared/interfaces.ts`'s `DebuggingAPI.getComponent(node: Node)` and
`getHostElement(cmp): HTMLElement` both require a real DOM type. The tree walk
(`tree-strategies/ltree.ts`) reads Ivy's private `LView` slot directly
(`lView[idx][ELEMENT]`, `tNode.directiveStart/directiveEnd`) and embeds the
literal DOM node as `ComponentTreeNode.nativeElement`. The connection itself
is a browser-extension pipeline, not a registrable protocol (`devtools/docs/
connection.md`): a content script plus a `backend_bundle.js` injected into
the page's main world, talking over `window.postMessage`/`chrome.runtime.
Port` — no doc describes registering a synthetic tree source. One partially
abstracted piece exists (`messages.ts` imports unexported/unversioned
`ɵAcxComponentDebugMetadata` symbols, and `ElementPosition = number[]` is
genuinely DOM-agnostic) but it's private, undocumented, not a supported
surface. No non-DOM precedent found either: NativeScript-Angular's own docs
point developers at the plain Chrome/Safari JS inspector, not Angular
DevTools — nobody has made this work.

### Vue: protocol is genuinely reusable, but the real UI is NOT — corrects the earlier "strongest candidate" framing

The Custom Inspector API (`setupDevtoolsPlugin`/`addInspector`/
`getInspectorTree`/`getInspectorState`) IS real, public, and DOM-independent
— same mechanism Pinia/Vue Router use, confirmed by reading
`@vue/devtools-kit` source directly, not just docs. But the DECISIVE blocker
checked concretely against the Redux precedent that seemed to validate
"vendor the official frontend": `@rozenite/redux-devtools-plugin`'s
`package.json` lists `@redux-devtools/app@^6.2.2` as a real devDependency,
thinly wrapped and Vite-built — the actual official Redux DevTools pixels,
served under `/plugins/<id>/**`. Vue has NO equivalent to vendor:
`vuejs/devtools`'s `packages/client` (the real Components-tree/App UI) is
`"private": true` in its own `package.json` — **never published to npm,
ever.** `@vue/devtools-ui`/`@vue/devtools-applet` ARE published, but they're
component primitives/applet-authoring helpers, not the tree UI itself.

**Conclusion: we can feed Vue's official PROTOCOL, but we cannot embed Vue's
official PIXELS** — unlike Redux, where Rozenite embeds the real thing
verbatim. The achievable outcome for Vue is: real `setupDevtoolsPlugin`/
`addInspector` calls, wired through a custom `birpc` channel over
`@rozenite/plugin-bridge`, feeding data into OUR OWN panel UI (the same
`packages/devtools` panel every other adapter uses) — not Vue Devtools'
actual rendered UI. That is a protocol-compliance upgrade (buys nothing
visible today, some future-proofing if Vue ever publishes `packages/client`),
not the "embed the real thing" win it looked like initially. Estimated
effort: a genuine 2-4 day spike (wire the custom channel, verify the
Components-tree walk tolerates `ISymbioteNode` as `el` — TresJS's precedent
was one narrow null-check bug, not structural) if pursued at all.

## FINAL VERDICT (2026-08-17) — closes this investigation, do not re-open without new upstream facts

| Adapter | Official devtools alive? | Protocol nature | Embed real UI verbatim? | Feed real protocol into OUR UI? | Verdict |
|---|---|---|---|---|---|
| React | Yes (Fiber-only) | Private internals (`attach()` hardcoded to Fiber shape) | No (Preact tried, gave up) | No, same coupling | Dead end — see the separate `injectIntoDevTools` bug below, now fixed, for the ONE case (our own React adapter) where React's real Fiber tree genuinely does show |
| Vue | Yes, core-team maintained | Public, DOM-independent (Custom Inspector API) | No (`packages/client` unpublished, private) | Yes | Best of the three non-React adapters, but ends at OUR OWN panel UI, just fed by Vue's sanctioned protocol instead of ad hoc — optional fast-follow, not a blocker |
| Svelte | No (abandoned since Svelte 4) | N/A, nothing to feed | No | No | Dead end, confirmed twice from independent 2026 sources |
| Angular | Yes, core-team maintained | Private internals (real `LView`/DOM-typed APIs, extension-only pipeline) | No | No | Dead end, same class as React |
| Solid (no adapter yet — future) | Yes | **Public, DOM-independent, FIRST-CLASS custom-renderer extension point** (`ElementInterface<T>` — explicitly names Three.js/Pixi.js/Lightning.js as intended non-DOM consumers) | **Yes, arguably** — `@solid-devtools/overlay` is a genuinely PUBLISHED, in-app-mountable Solid component (`attachDevtoolsOverlay()`), unlike Vue's unpublished `packages/client` | Yes | **Best of all five researched** — see dedicated section below, do not treat this as "yet another dead end," it structurally isn't one |

**Every CURRENTLY-ADAPTED framework's REAL UI is unreachable, for three
different reasons** (React/Angular: hardcoded to real internal objects;
Svelte: no maintained UI exists at all; Vue: the UI package itself was never
published). The custom `packages/devtools` Rozenite panel (already scoped,
v0 in progress per the step list above) is therefore not a stopgap — it is
THE plan, unconditionally, for React/Vue/Svelte/Angular. **Solid, once it
gets an adapter, is the one exception — see below.** The only adapter-specific
upside left on the table for the CURRENT four is
Vue's protocol-compliance fast-follow, which is genuinely optional.

## Separate, confirmed bug (2026-08-17): React DevTools shows nothing even for OUR React adapter

Distinct from the above — this is NOT the Fiber-only structural dead end.
`adapters/react/src/host-config.ts` builds the `react-reconciler` instance
but never calls `reconciler.injectIntoDevTools(config)` anywhere in
`adapters/react/src` (confirmed via grep — zero hits for
`injectIntoDevTools` or `__REACT_DEVTOOLS_GLOBAL_HOOK__`). That call is not
automatic for a custom `react-reconciler` consumer — `react-dom` does it
internally, but every third-party renderer (react-three-fiber, `ink`,
react-pixi) calls it explicitly after building the reconciler. Without it,
`window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` stays empty even though we
have a real Fiber tree to show — the same downstream symptom
("Loading React Element Tree…") as the other adapters' structural dead end,
but here it is a one-call fix, not architectural.

The hook itself is already present regardless of which renderer the app
uses: `.vendors/react-native/.../setUpDefaultReactNativeEnvironment.js:27-28`
requires `Libraries/Core/setUpReactDevTools.js` unconditionally whenever
`__DEV__ && enableDeveloperTools` — RN's own core bootstrap installs
`__REACT_DEVTOOLS_GLOBAL_HOOK__` via `react-devtools-core`'s `initialize()`
before any app code runs.

Reference for the exact call shape: RN's own vendored Fabric renderer
(`ReactFabric-dev.js:18899`) builds an `internals` object (`bundleType`,
`version`, `rendererPackageName: "react-native-renderer"`,
`currentDispatcherRef`, plus hot-reload override hooks) and calls
`injectInternals(internals)` — that is RN's internal vendored equivalent of
the PUBLIC `react-reconciler` package's `reconciler.injectIntoDevTools(...)`
method we should call instead (confirmed present at
`node_modules/.../react-reconciler/cjs/react-reconciler.development.js:19613`
and typed in `@types/react-reconciler`'s `DevToolsConfig`).

**Implemented 2026-08-17**, right after `createReconciler(...)` in
`host-config.ts`:
```ts
const isDevBuild: unknown = Reflect.get(globalThis, '__DEV__');
if (isDevBuild === true) {
  reconciler.injectIntoDevTools({
    bundleType: 1,
    version: reactVersion, // import { version as reactVersion } from 'react'
    rendererPackageName: '@symbiote-native/react',
  });
}
```
`findFiberByHostInstance` is omitted (powers click-to-select "inspect
element" only) and needs a new Fiber↔`ISymbioteNode` lookup we don't have
yet — a separate fast-follow, not part of this fix.

**Real gotcha hit implementing this — do not write `if (__DEV__)` directly
in this file.** The first attempt used the bare `__DEV__` identifier (matching
`examples/*/index.js`'s pattern) and typechecked clean, but **broke 61 of 68
test suites** in `adapters/react` at runtime with `ReferenceError: __DEV__ is
not defined` — every test that transitively imports `host-config.ts` (i.e.
nearly the whole package) goes through vitest/Node, which has no Metro and no
RN bootstrap to ever install that global; only a real Metro/RN environment
does. `globalThis.__DEV__` does NOT fix it either — it fails to TYPECHECK
(`TS2339: Property '__DEV__' does not exist on type 'typeof globalThis'`)
because RN's own `globals.d.ts` declares it `const __DEV__: boolean` inside
`declare global {}`, and **TypeScript only merges `var` ambient globals into
`typeof globalThis`'s type, never `const`/`let`** — same reason `console`/
`require` (declared `var`) DO show up on `globalThis` in this same file but
`__DEV__`/`__BUNDLE_START_TIME__`/`HermesInternal` (all declared `const`)
never will, regardless of runtime behavior. The fix that satisfies both
constraints is the repo's own `ambient-global-declarations` rule idiom for a
global RN already owns: `Reflect.get(globalThis, '__DEV__')` typed `unknown`,
narrowed with `=== true`. This gotcha will resurface for ANY new `__DEV__`
read inside a package whose tests run under vitest (i.e. anything under
`core/`/`adapters/`/`packages/` — NOT `examples/*/index.js`, which is
Metro-only and never test-executed) — use the `Reflect.get` idiom there too,
never the bare identifier or a `globalThis.` property read.

Verified: `pnpm --filter @symbiote-native/react run typecheck` clean, `eslint`
clean, full `adapters/react` vitest suite green (261/261, was previously
failing 61/68 suites mid-fix). **Not yet verified on a real device/simulator**
— confirming the Components tab actually populates is still open; typecheck/
lint/unit-test green proves the code compiles and doesn't regress existing
behavior, not that React DevTools visually renders the tree.

## `packages/devtools` v1/v2 feature roadmap (scoped 2026-08-17)

Design pass, informed by a feature survey of the three living official
devtools UIs (React, Vue, Angular — Svelte's is dead, nothing to survey) plus
a per-adapter feasibility scope for local-state capture. Not yet implemented
beyond v0 (tree + props panel). Do not re-scope from scratch — extend this.

### Feature survey — what real devtools show, by tab (2026-08-17)

- **React DevTools**: Components tab — tree with memo/forwardRef/Suspense
  badges, props/state/**named hooks** (via Babel source plugin)/context/owner
  chain, inline prop-value editing, jump-to-source, search+filters, "highlight
  updates" toggle. Profiler tab — commit timeline, flamegraph/ranked/
  per-component charts, "why did this render" (which prop/state/hook changed),
  reload-and-profile. Daily-use core: tree+search+props+hooks+highlight-
  updates; Profiler/owners-tree/filters are situational, not everyday.
- **Vue Devtools v7**: Components tab — tree with `<KeepAlive>`/`<Suspense>`
  tags, props/own-state/computed/setup-bindings/provide-inject, inline edit,
  "scroll to component" highlight, search. Timeline tab (v7 redesign, replaced
  standalone Performance) — per-PLUGIN layers (Router nav events, Pinia
  mutation/action events). Pinia's own inspector (store tree, live state,
  inline edit, JSON snapshot export/import as its "time travel") and Vue
  Router's (route tree, matched-route detail) are the reference precedent for
  what OUR OWN state feature should look like once built, since they're both
  built on the same public Custom Inspector API we could also use.
  Daily-use: tree+props is default; Pinia inspector is second-most-reached-for
  once state is non-trivial; Timeline is situational.
- **Angular DevTools**: Components tab — directive forest (components AND
  directives, not just components), inputs/outputs/other-properties/CD-
  strategy, inline edit, search, inspect-element cursor tool. A `DebugSignalGraph`
  protocol type exists but has NO documented UI yet — newer/rougher than the
  other four tabs, not worth copying yet (even upstream hasn't nailed it: see
  angular/angular#63874, a still-open signal-formatting request). Profiler tab
  — CD-cycle bar chart + flamegraph, "did this component's CD actually run"
  greyout (Angular's version of "why did this render"). Injector Tree tab —
  DI hierarchy visualization, Angular-specific, no analog in any other
  framework surveyed. Router Tree tab — route config, guards, resolvers.
  Daily-use: tree+inputs/outputs is the clear default (most-documented, only
  inline-editable tab); Profiler is perf-investigation-only; Injector Tree is
  a DI specialist tool.

### v1 (cross-adapter, engine-level, no per-adapter work) — build first

All four features apply uniformly to every adapter because they're derived
from data the engine ALREADY has (`ISymbioteNode`'s props/children, and the
clone-on-write diff every commit already performs) — no adapter-specific
instrumentation needed, matching `<adapters_reach_full_feature_parity>`'s
"parity must be structural" bar:

1. Search/filter bar over the tree — every surveyed framework has this,
   reached for daily.
2. Highlight-on-hover / click-to-select in the running app — already flagged
   as a v0 fast-follow (verify a foreign highlight node survives each
   adapter's next commit before building on this, per the existing risk note
   above); now doubly confirmed as a daily feature across all three living
   devtools.
3. Per-commit prop diff ("what changed") — OUR structural advantage: the
   engine's clone-on-write commit path already computes old-vs-new props: this
   is exposing existing internal diff data, not computing anything new. Closes
   React's "why did this render" (which prop changed) and Angular's "did CD
   actually run" (a node with an empty diff didn't) in one cross-framework
   feature, with zero React-specific hook-naming-Babel-plugin-style trickery.
4. A commit timeline (component, duration, what changed) — built on the
   existing `registerPostCommit`/`runPostCommitHooks` seam
   (`core/engine/src/post-commit.ts`), just needs timestamp+duration capture
   and a rolling history buffer. Closes React's Profiler / Vue's Timeline /
   Angular's Profiler in one feature.

### v2 (per-adapter local-state capture) — scoped, ranked by effort/risk, NOT yet implemented

| Adapter | Feature | Reachable? | Seam | Effort | Biggest risk |
|---|---|---|---|---|---|
| Angular | DI Injector tree | Plausible, structurally unblocked but UNVERIFIED end-to-end | Devtools-glue module calling the same private `ɵgetInjectorResolutionPath`/`ɵgetInjectorProviders`/`ɵgetInjectorMetadata` Angular DevTools itself uses | **Spike this FIRST, 1 day timeboxed**: call `ɵgetInjectorResolutionPath` against a real mounted component in `examples/angular` before committing to the full estimate | A private API deeper than `attachPatchData` might still assume a real `Element` — only surfaces by actually running it |
| Angular | Local state (all instance properties, not just `@Input`/`@Output`) | **Yes, confirmed tree-wide, not just root** — `attachPatchData` (`.vendors/angular/.../context_discovery.ts:191`) is a bare property write with no DOM-type assertion at runtime, and `SymbioteRenderer.createElement()`'s returned `ISymbioteNode` is exactly the object it patches (`renderer/index.ts:113-127`); `getLContext` reads the patch off the target FIRST, before any DOM-walk fallback, so our nodes never hit a DOM-specific path at all | Devtools-glue module walking the same `ɵ`-prefixed component-discovery machinery Angular DevTools uses, keyed the same way the engine's post-commit tree walk already visits nodes | 2-4 day spike | Private API property names/shape can shift across Angular minor versions — version-pinned, re-verify on every Angular bump |
| Vue | Local state (refs/computed/setup bindings) | Yes — `app._instance` (root) → `.subTree`/`.component` (recursive children), paired with each `vnode.el` (already an `ISymbioteNode`) | `WeakMap<ISymbioteNode, () => Record<string, unknown>>` living IN `adapters/vue/src` (NOT in `core/engine`'s `ISymbioteNode` — confirmed no such field exists there, correctly, per `<adapters_stay_thin>`/`<clone_on_write_lives_in_engine>`), rebuilt via `registerPostCommit`; new optional `state?: Record<string, unknown>` field on `packages/devtools/src/protocol.ts`'s `ISerializedNode`, `undefined` for other adapters | 3-5 days | Serializer's existing `isPlainObject` check collapses `Ref`/`ComputedRefImpl` to `'[Object]'` today — MUST add a Vue-specific unwrap pre-pass (`unref()`/`.value`, guarded against a throwing computed getter) before handing values to the existing serializer, or the feature ships silently useless while looking done in a quick smoke test |
| Svelte | Local state (`$state`/`$derived` runes) | **No — structurally invisible**, not just hard. Svelte 5 compiles runes to bare closure-scoped variables inside the render function with NO external handle at all (unlike the other three, which all have SOME instance object `ISymbioteNode`/post-commit could key off) | Would need a NEW compile-time preprocessor/transform injecting registration calls at each rune declaration site — this is new first-class machinery, not adapter glue, and doesn't fit `<adapters_stay_thin>` cleanly (no engine-level analog exists to share it with either, since Vue/Angular have no compiler pass at all) | Multi-week, not a spike | Same instability that already killed the old community Svelte devtools extension — Svelte's rune/compiler internals carry no API stability promise across versions |

**Recommended v2 order**: Angular DI spike (1 day, cheap, derisks the biggest
unknown) → Angular state capture (mechanism already proven, low risk) → Vue
state capture (higher effort but well-understood, single load-bearing gotcha
identified) → Svelte LAST, and only after the other two ship and prove the
protocol-extension pattern (`state?` field, panel UI section) is worth it —
multi-week compiler-transform cost with real version-fragility risk, same
class of instability that killed the prior community tool.

## SolidJS (2026-08-17): the ONE framework where real devtools genuinely work — read before scoping the future Solid adapter's devtools story

No `adapters/solid` exists yet (Solid is future-planned per the
`symbiote-new-adapter` skill), so this is external research, not grounded in
our own repo code like the other four sections above. **Do not treat Solid as
"another dead end to add to the table" — it structurally is not one, and
this changes what "devtools for a future Solid adapter" should even mean.**

**Protocol: PUBLIC-PROTOCOL-REUSABLE, stronger than Vue's.**
`@solid-devtools/debugger` ships a documented, FIRST-CLASS "Supporting custom
renderers" extension point (`packages/debugger/README.md`) — a generic,
typed `ElementInterface<T>` (`isElement`/`getElementAt`/`getName`/
`getChildren`/`getParent`/`getRect`/`getLocation`), registered via
`setElementInterface()`. It explicitly names Three.js, Pixi.js, and
Lightning.js as intended non-DOM consumers — this extension point was
designed for exactly our situation (a renderer whose nodes aren't DOM
elements), not discovered as an incidental side door the way Vue's Custom
Inspector API was. Only `getRect` assumes DOM shape
(`getBoundingClientRect()`), and it maps directly onto our already-exported
`measureInWindow` (`core/engine/src/commit.ts:550`).

**Why this works when Svelte's doesn't: Solid's reactive primitives are real
runtime objects, not compiler-inlined closures.** Solid's JSX compiler
(`babel-plugin-jsx-dom-expressions`) only rewrites markup into DOM
operations — it does NOT inline `createSignal`/`createMemo`/`createEffect`
the way Svelte 5's compiler erases runes into bare closure-scoped variables.
`getOwner()` returns a real, walkable `Owner`/`Computation` graph node.
Architecturally this is the SAME shape as Vue's `ComponentInternalInstance`
case (a real object exists, walk it) — except Solid ships the walking
abstraction itself as a public, documented API, where for Vue we'd have to
build our own.

**The decisive extra, beyond even the Redux DevTools precedent:
`@solid-devtools/overlay` is a genuinely PUBLISHED, in-app-mountable UI.**
`attachDevtoolsOverlay()` mounts the real Solid Devtools component tree
directly into the running app — no browser extension, no separate process.
This is stronger than Redux DevTools' embed (Rozenite vendors
`@redux-devtools/app` as a devDependency, still a separate wrapped artifact)
and the OPPOSITE of Vue's blocker (`packages/client`, Vue's real Components-
tree UI, is `"private": true`, never published — confirmed earlier in this
skill). Feature set: component/owner tree, real signal values, a **Locator**
(click-to-select + jump-to-source), and an `autoname` Vite plugin recovering
real signal variable names (solving the same naming problem React needs a
Babel plugin for).

**Future local-state capture for a Solid adapter: closer to Vue's case, a
spike not new infrastructure.** The `Owner`/`Computation` graph plus the
`ElementInterface` abstraction together mean state capture would be "wire
existing, documented extension points to our engine," not "invent a new
compiler transform" (Svelte's problem). Estimated 2-4 days once a Solid
adapter exists — same tier as Angular's state-capture spike.

**Caveat — currency, not abandonment.** `@solid-devtools/overlay`/`debugger`
last published 2025-07-01 (stale relative to "now," 2026-08-17), peer range
`solid-js: ^1.9.0`. GitHub issues as recent as March 2026 suggest the repo is
maintained, just not fast-moving — re-check currency before committing real
engineering time when a Solid adapter is actually being built, don't assume
this snapshot still holds a year+ later.

**Implication for `packages/devtools`' OWN design, today, before Solid even
has an adapter:** worth checking, when v1/v2 above are actually implemented,
whether shaping our own `ISerializedNode`/protocol loosely compatible with
Solid's `ElementInterface<T>` shape (name/children/parent/rect/location) costs
nothing extra now and saves real design work later — not a requirement, just
a cheap option to keep open.

Sources: [thetarnav/solid-devtools](https://github.com/thetarnav/solid-devtools),
[debugger README (custom renderers section)](https://raw.githubusercontent.com/thetarnav/solid-devtools/main/packages/debugger/README.md),
[overlay README](https://raw.githubusercontent.com/thetarnav/solid-devtools/main/packages/overlay/README.md),
[npm: @solid-devtools/overlay](https://www.npmjs.com/package/@solid-devtools/overlay),
[npm: @solid-devtools/debugger](https://www.npmjs.com/package/@solid-devtools/debugger),
[Solid docs: getOwner](https://docs.solidjs.com/references/api-reference/reactive-utilities/getOwner).

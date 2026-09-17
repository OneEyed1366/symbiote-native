# SymbioteNative

Framework-agnostic React Native renderer. Extract the entire native stack of
React Native (Fabric C++, JSI, Yoga, the iOS/Android host) and let renderers for
**any** UI framework — Vue, Svelte, Solid, Angular, React — drive it through the
framework-agnostic seam that Fabric already exposes. One native core, N thin
adapters. The proven shape from [wolf-tui](./wolf-tui) (shared retained-tree +
a thin per-framework reconciler), retargeted from ANSI to native views.

> Local knowledge and decisions live in project Claude skills (`.claude/skills/`,
> authored with SkillForge), not in `.docs/` ADRs. Read the matching skill
> before proposing architectural changes — that's where the rationale and the
> explicit list of what it rules out live now.

## The one architectural fact everything rests on

React is **not** privileged inside React Native's renderer. Fabric exposes a
framework-agnostic, JSI-bound mutation API — `global.nativeFabricUIManager`:

```
createNode / cloneNodeWithNewProps / cloneNodeWithNewChildren
createChildSet / appendChildToSet / completeRoot
```

React's renderer is just **one client** of it, and all of its React-specific glue
lives in a single file: `react/packages/react-native-renderer/src/ReactFiberConfigFabric.js`
(`supportsPersistence = true`, `createInstance`, `cloneInstance`,
`createContainerChildSet`, `completeRoot`). "Removing React" means: stop calling
that host config, call the slot directly from your own renderer. **The native
core is never touched.**

## Architecture (locked — see project skills in `.claude/skills/`)

```
@symbiote-native/components : framework-agnostic state machines + render functions (→ Descriptor)
        │  every adapter wires state→render with ITS lifecycle (hooks / reactivity)
        ▼
Vue · Svelte · Solid · Angular · React        thin reconciler + descriptor→element bridge
        │  insert / remove / setProp / commit
        ▼
@symbiote-native/engine : retained shadow-tree + diff→childSet + event normalization
        │  ALL clone-on-write lives HERE, in one place
        ▼
nativeFabricUIManager  (createNode / cloneNodeWithNewProps / appendChildToSet / completeRoot)
        ▼
stock react-native : Fabric C++ · JSI · Yoga · RCTFabricSurface     ← never forked
```

## Invariants (do not violate without recording the change in a project skill)

<native_core_is_untouched>
We consume `react-native` as an ordinary dependency. We never fork, patch, or
vendor its native (C++/Obj-C++/JNI) sources. The only thing we replace is the
**JS renderer**: instead of React's Fabric host config, our own renderer drives
`nativeFabricUIManager`. If a task seems to require editing ReactCommon, Yoga, or
any native file — stop. That is a signal the design has drifted; raise it as a
new decision, do not patch native.
</native_core_is_untouched>

<react_native_is_an_explicit_top_level_peer>
`react-native` (and `react`) is a **peerDependency** of `@symbiote-native/engine` and every
adapter — never a regular or bundled dependency — and an **explicit top-level
dependency of the consuming app**. It is a runtime singleton and the Metro version
anchor (same class as `react` / `expo`): exactly one copy, declared at the app root.
The adapter facade hides only **imports** — app _code_ names only `@symbiote-native/*`, but
the app _manifest_ still pins `react-native`. Do NOT try to make RN a hidden /
transitive dependency to keep it out of the app's `package.json`: modern Expo
autolinking would resolve it, but it forfeits version-pinning and breaks pnpm
isolated installs — an ecosystem anti-pattern. The future `create-symbiote`
scaffolder owns the top-level pin so the developer never writes it by hand.
</react_native_is_an_explicit_top_level_peer>

<third_party_rn_packages_are_react_only>
A third-party React Native component package (`@react-native-community/slider`,
`react-native-*`, any library shipping a JS component) runs ONLY under the **React
adapter**. Its component body is React internally — it calls `useState` / hooks off
the React dispatcher — so when a non-React adapter (Vue, Svelte, Solid, Angular)
renders it the dispatcher is null and it throws (`Cannot read property 'useState' of
null`). SymbioteNative only makes the _native view_ framework-agnostic (it derives the RN
ViewConfig — events + prop processors — at runtime); it does NOT make the library's
React _component_ framework-agnostic. So: examples and canaries for a non-React
adapter must NOT import RN component packages. A native third-party view is reachable
from a non-React adapter ONLY through that adapter's own thin wrapper over the engine
(the same `createNode`-by-ViewConfig path SymbioteNative uses for its own primitives) — never
by importing the library's React component. Until such a wrapper exists, the component
is React-adapter-only.
</third_party_rn_packages_are_react_only>

<clone_on_write_lives_in_engine>
Fabric is persistent / clone-on-write: you never mutate a node, you clone it with
new props and atomically commit a new child set. Mutation-oriented frameworks
(Vue, Svelte, Solid, Angular) must NOT each reimplement this dance. The entire
mutation→clone-on-write translation lives once in `@symbiote-native/engine`. Adapters
see only a tiny mutation API (`insert / remove / setProp / commit`). A persistence
bug is fixed once, for all adapters.
</clone_on_write_lives_in_engine>

<adapters_stay_thin>
Each framework adapter is a thin reconciler that maps its framework's node
operations onto the engine's mutation API — nothing more. Layout, commit batching,
event normalization, ViewConfig handling: all live in the engine. If adapter code
grows framework-specific layout or commit logic, that logic belongs in the engine.
</adapters_stay_thin>

<adapter_src_follows_framework_idioms>
An adapter is written in IDIOMATIC code for the framework it targets — respect that
framework's own best-practices and naming conventions, do NOT force a foreign one
across adapters for the sake of looking symmetric. The concrete tell is the lifecycle
bucket inside `<package>/src/`: it is named for the framework's term — React groups its
lifecycle files under `hooks/`, Vue under `composables/` — because that is what each
ecosystem calls them; a Vue `hooks/` folder or a React `composables/` folder would be
wrong even though the role is identical. The framework-AGNOSTIC buckets, by contrast,
carry the SAME name in every adapter: `components/` (visual primitives — folders +
flat), `modules/` (imperative RN-API namespaces with no view — `Alert`, `Share`,
`Animated`, `StatusBar`, `PanResponder`…), `utils/` (small agnostic helpers). The
adapter's reconciler wiring stays FLAT at the package root, never in a bucket: `index`,
`render`/`renderer`, `host-config`, `host-instance`, `descriptor-to-<fw>`, the
`components.ts` re-export barrel, `*.d.ts`. The public package barrel (`@symbiote-native/<fw>`,
i.e. `src/index.ts`) is the ONLY thing external code imports — grouping is internal, so
moving files between buckets never changes the package's surface. This idiom rule is
orthogonal to the `symbiote-file-layout` skill's folder-as-module rule (that governs a
single module's platform/shared variants; this governs the top-level category
grouping of `src/`).
</adapter_src_follows_framework_idioms>

<adapters_reach_full_feature_parity>
**P0 — MANDATORY, NO EXCEPTIONS.** Every component / primitive / runtime module
ships at **full feature-parity across ALL adapters**. A "minimal", "basic",
"partial", or "stub" port is FORBIDDEN — if React's `ScrollView` carries sticky
headers, RefreshControl, the imperative scroll handle, `maintainVisibleContent-
Position`, and native scroll-attach, then Vue's `ScrollView` (and every future
adapter's) exposes that SAME complete prop + behavior surface. The same holds for
every prop, event, imperative method, and platform branch of every component.

The rule is not "copy the surface into each adapter" — that would violate
`<adapters_stay_thin>`. It is: extract the shared logic (state machine, render,
prop resolution, platform-invariant assembly) into `@symbiote-native/engine` /
`@symbiote-native/components` so EVERY adapter inherits the full surface for free, and the
adapter supplies ONLY its lifecycle + descriptor bridge. Parity must be
**structural**, not maintained by hand. If a component's shared half does not yet
exist (e.g. React's lives in `adapters/react/src/scroll-view-shared.ts`, not yet in
`core/`), extracting it to the shared layer is PART OF the task of bringing it to a
second adapter — not a follow-up, not deferred.

Concretely, "add component X to adapter Y" is DONE only when X on Y has the same
features X has on every other adapter, proven by a parity check (smoke +
prop-by-prop diff against the reference adapter). Shipping a reduced surface and
calling the rest a "follow-up" is a P0 violation. When the full surface is genuinely
too large for one pass, SPLIT THE WORK HONESTLY (record exactly what is and isn't
covered in the relevant project skill) — never by silently shipping a thinner
component.
</adapters_reach_full_feature_parity>

<layout_is_yoga>
Layout is stock Yoga. Taffy is explicitly out of scope. The C++ seam
`LayoutableShadowNode` keeps the door open for a future engine swap, but swapping
means a native fork and is not on the table until Yoga genuinely blocks us.
</layout_is_yoga>

<runtime_modules_layering>
The runtime-module layer (RN's `Platform`, `StyleSheet`, `Dimensions`,
`Appearance`, `AppState`, `Alert`, `Linking`, `Vibration`, `Share`,
`ActionSheetIOS`, + the `use*` hooks) splits by purity: **pure utilities with no
native event / React dependency (`Platform`, `StyleSheet`) live in
`@symbiote-native/engine`** (framework-agnostic, every adapter re-exports them); **native-
bridge consumers live in the adapter** (`@symbiote-native/react`), exactly like
`Keyboard` / `StatusBar` — thin JS over `getNativeModule` + device events, no Fabric
component of their own. New runtime modules follow this split, never the reverse.
</runtime_modules_layering>

<examples_vs_dot_examples>
`examples/{react,vue-sfc,vue-tsx,angular}` is the ONE tree — public canary AND
where local component/adapter/package work is developed and demoed. It is
OUTSIDE the pnpm workspace entirely (not listed in `pnpm-workspace.yaml`'s
`packages:`) — a standalone `npm install`-able tree with no `catalog:`/
`workspace:*` specifiers (neither resolves outside a pnpm workspace); every
dependency is a literal version, `@symbiote-native/*` included, matching the
real npm consumer experience. Install with plain `npm install` INSIDE the
example directory, never `pnpm install` from repo root.

**`examples/bare-rn` is the one exception and it is deliberate: it is NOT a canary.** Plain
react-native 0.86 driven by React's own Fabric renderer, carrying a port of the same
`BenchmarkScreen`, so adapter numbers have something to be compared AGAINST. Its value is
precisely that it contains **zero `@symbiote-native/*` dependencies** — adding one, or "closing
its parity gap", destroys the only thing it is for. Every parity audit
(`.claude/rules/adapter-parity-audit.md`, `tests/adapter-barrel-parity.test.ts`,
`tests/package-subpath-parity.test.ts`) is about adapters and companion packages and does not
reach it; if a future audit starts enumerating `examples/*`, exclude this one explicitly. It is
also outside the pnpm workspace and outside every CI example list. What it does and does not
make comparable: `symbiote-perf-measurement`, "The stock-React-Native baseline".

**Local development against an unpublished or just-changed `@symbiote-native/*` package — the
everyday loop, as of 2026-09-01, is a LOCAL VERDACCIO REGISTRY, not a `file:` tarball:**

```
pnpm run registry:setup    # once per machine
pnpm run registry:sync     # publish everything, point every example at it, pull it in
cd examples/<app>/ios && pod install
```

The manifest is never touched — it keeps its ordinary public version literal, and a **gitignored**
`examples/<app>/.npmrc` decides where that version resolves from. That pointer may NEVER be
tracked: npm has no registry fallback chain, so a committed `registry=http://localhost:4873` turns
`npm install` into a hard failure for every clone not running Verdaccio, with an error that reads
as a broken machine rather than a bad commit. Guarded by
`tests/no-tracked-local-registry.test.ts`. Absent that file an example resolves from npmjs exactly
as it always has — that is the fallback, and it is the default.

Why it replaced the tarball dance: that dance wrote machine-local install state into TRACKED
manifests, six were dirty at once and three were staged before a peer stopped the commit. Read the
`symbiote-local-dev-registry` skill before touching any of this.

**The paragraphs below describe the retired `file:` path. They are kept because their traps are
properties of NPM, not of tarballs** — a same-version republish still short-circuits, an
already-extracted package folder still satisfies the specifier, and deleting the lockfile alone is
still not enough. Only the repair changed, to one explicit `npm install <name>@<version>`.

**The retired path, for a package the registry cannot serve:** build a tarball with `pnpm pack`
from the package's own directory (**never `npm pack`** — it skips the
`publishConfig` build-artifact swap and leaves `workspace:*` literally in
`peerDependencies`, which crashes a standalone `npm install` with
`EUNSUPPORTEDPROTOCOL`), point the target `examples/*/package.json` at it with a
`file:` specifier, then `npm install` again inside that example directory. A
pkg.pr.new canary URL is the alternative when a shared/remote preview is needed
(PR review, cross-machine testing, no local tarball to hand) — see
`symbiote-release-publishing` for how canary builds are triggered. Either a
`file:` tarball or a pkg.pr.new URL is TEMPORARY and gets swapped back to a
literal npm version once the package has a real release.

**Re-packing the SAME package at the SAME version while iterating (the common case — several
rounds of `pnpm pack` against one unreleased version) needs an extra step, or `npm install`
silently serves STALE content.** `examples/*/package-lock.json` records an `integrity` hash for
the `file:` entry from the FIRST install; on a later `pnpm pack` + `npm install` cycle against
the same path, npm treats the lockfile entry as still satisfied and reuses its OWN cached copy
under that stale hash — it does not re-read the tarball's current bytes. `node_modules` even
reports `added N packages`, which reads as success. Symptom: a source change you just packed
never shows up in `node_modules/@symbiote-native/<pkg>/build/**`. Fix: `rm -f
examples/*/package-lock.json` (or at least delete the one stale entry) before `npm install` on
every re-pack of a package you're actively iterating on — `rm -rf node_modules/@symbiote-native`
alone is NOT enough, the lockfile entry survives that and still short-circuits the reinstall.
**And the converse also holds: deleting the lockfile alone is not enough either.** Measured
2026-08-14 — after re-packing `@symbiote-native/engine` and running `rm -f package-lock.json &&
npm install` in five examples, ONE picked up the new tarball and three silently kept an OLD
extracted copy (the tell was a build shape from an earlier release, `export { X } from
'./y.js'` with extensions the current build does not emit). npm treats an already-extracted
`file:` dependency folder as satisfying the specifier, which did not change. **Delete BOTH:**
`rm -rf node_modules/@symbiote-native/<pkg> && rm -f package-lock.json && npm install`.
Verify with a `grep` for a known-new string in the installed `build/**` file, not just install
output, before trusting a "no changes" observation on device.

**After that reinstall, run `pod install` in the app's `ios/` before the next iOS build.**
`@symbiote-native/splash-screen`'s podspec vendors react-native-bootsplash's native sources into
a `.rn-bootsplash/` folder next to itself, and it does so at PODSPEC EVALUATION time — during
`pod install`, not on package install. An `npm install` that replaces the package folder deletes
that folder, and the next `xcodebuild` fails with `Build input file cannot be found:
.../.rn-bootsplash/ios/RNBootSplash.mm`, buried under hundreds of lines of clang argument dumps
that make it look like a broken toolchain. It is just a stale pod sandbox; `pod install`
regenerates it (see that podspec's own comment for why the copy exists at all).

**The OTHER post-reinstall iOS failure, and it looks nothing like a pod problem — a LINKER error
naming React's own C++ internals.** Measured 2026-08-14 on `examples/svelte`:

```
ld: warning: Could not find or use auto-linked framework 'React_RCTAppDelegate': not found
ld: warning: Could not find or use auto-linked framework 'UIUtilities': not found
Undefined symbols for architecture arm64:
  "facebook::react::Sealable::Sealable()", "facebook::react::ShadowNode::getDebugName() const",
  "facebook::react::DebugStringConvertible::…", "…::BaseViewProps::getDebugProps() const", …
  referenced from: RNSSafeAreaViewShadowNode.o, RNSScreenStackHeaderConfigShadowNode.o, Props-*.o
```

The two `ld: warning` lines are a RED HERRING — those modules live inside the single merged
`React.framework`, and the same warnings appear in a build that links fine. **Read the
`referenced from:` object names instead**; they name the third-party Fabric library that is
actually unsatisfied (here `RNS*` = react-native-screens, pulled in by
`@symbiote-native/navigation`).

Cause: RN 0.86 links a PREBUILT `React.xcframework`, downloaded per configuration
(`reactnative-core-0.86.0-debug.tar.gz` ~94MB / `-release.tar.gz` ~30MB). The `getDebug*` /
`DebugStringConvertible` / `Sealable` surface only exists in the DEBUG flavor. A third-party
Fabric library compiled in a Debug build references it, so linking a Debug app against the
release-flavor framework fails exactly this way. CocoaPods will happily reuse a stale extracted
`Pods/React-Core-prebuilt/` from an earlier install rather than re-extract, because the pod's
source URL did not change.

Diagnose in one command — the flavor is unambiguous from size and symbols:

```
B=ios/Pods/React-Core-prebuilt/React.xcframework/ios-arm64_x86_64-simulator/React.framework/React
stat -f %z "$B"; nm -gU "$B" | grep -c getDebugProps     # release: ~24MB / 0   debug: ~137MB / 80
```

Fix: `rm -rf ios/Pods/React-Core-prebuilt ios/Pods/ReactNativeCore-artifacts` then `pod install`,
and re-run the probe above to confirm the debug flavor landed BEFORE spending another build on
it. Do NOT reach for `RCT_USE_PREBUILT_RNCORE=0` (RN's documented build-from-source escape hatch)
first — it costs a 30-minute from-source build to work around a stale download.

**But first check whether there is anything to fix at all — the swap is AUTOMATIC, and the probe
reading "debug" is the normal resting state.** The podspec's `source` URL is hardcoded to the
`-debug` tarball, so a fresh `pod install` ALWAYS leaves the debug flavor extracted, whatever you
intend to build. RN then swaps it per build: `React-Core-prebuilt` carries a `before_compile`
script phase, `[RNCore] Replace React Native Core for the right configuration`, which reads
`DEBUG=1` out of `GCC_PREPROCESSOR_DEFINITIONS` and runs
`react-native/scripts/replace-rncore-version.js -c Release|Debug`. Both tarballs sit side by side
in `Pods/ReactNativeCore-artifacts/`, so the swap is local — no network, no re-download.

Verified 2026-08-18 on `examples/react`: probe before `npm run ios:release` = 131MB / 80 symbols
(debug); the Release build succeeded and the same probe after = **24MB / 0 symbols** (release).
So "Pods holds debug while I am building Release" is NOT the bug and clearing pods over it wastes
a build. The failure above is specifically a stale or missing DOWNLOAD, and its signature is a
LINKER error naming `facebook::react::Sealable` / `getDebug*` — not a probe result on its own.

**`examples/expo-*/node_modules` bloats to 2.2-2.3GB each — 89MB × ~25 duplicated `expo` copies,
one per `@symbiote-native/*` Expo wrapper.** None of the six `expo-*` examples declares `expo`
itself as a dependency — every wrapper package (`@symbiote-native/sensors`, `.../battery`, …)
reaches it only transitively via `expo-sensors`/`expo-battery`/etc. → `expo`. With no root-level
request anchoring a version, npm's arborist nests a separate `expo` copy (its own `@expo/cli` +
`config-plugins` + `fingerprint` tree, ~89MB) inside every wrapper's own `node_modules` — even
though all ~25 copies resolve to the SAME version. `expo-modules-core`, depended on identically by
every wrapper, hoists fine to one top-level copy; the difference is specifically that nothing
requests `expo` from the root, not a generic dedup failure. Fix: add `"expo": "<pinned SDK
version>"` as an explicit dependency in the example's `package.json` — this is also the CORRECT
shape (a real `create-expo-app` project always declares `expo` directly; wrapper packages expect
it to already be present) — then `rm -f package-lock.json && rm -rf node_modules && npm install`.
Verified 2026-08-21 across all six `expo-*` examples: `node_modules` 2.2-2.3GB → 600-660MB each,
zero nested `expo` copies, no ERESOLVE/peer conflicts. If the pinned `expo` version and the
catalog's `expo-modules-core`/`expo-sensors`/etc. version ever drift apart, that surfaces as a
real Expo SDK compatibility bug (modules must ship in lockstep with one SDK release) — fix the
version skew, don't reach for a workaround.

**Reinstalling any `examples/*` app after a FAILED `npm install` needs the lockfile deleted, not
just `node_modules`, or a stale `integrity` field blocks the retry — `npm cache clean --force`
does NOT fix it.** A run that fails partway (e.g. `EINTEGRITY` against a rebuilt `.tarballs/*.tgz`,
see the re-pack gotcha above) can still write a partial `package-lock.json` recording the OLD
tarball's hash. The next `npm install` then errors `EINTEGRITY … wanted <old-hash> but got
<new-hash>` even after `rm -rf node_modules` and even after clearing npm's cache — because the
stale hash lives in the project's own `package-lock.json`, not in npm's cache. Fix: `rm -f
package-lock.json` before retrying, same as the `file:` re-pack case — this is the same failure
shape (stale lockfile integrity vs. changed tarball bytes), just triggered by a failed install
instead of a re-pack.
</examples_vs_dot_examples>

<components_split_logic_view_lifecycle>
Visual components (Pressable, Switch, TextInput, Modal, Button, the lists,
ScrollView…) split into THREE layers, mirroring wolf-tui's
`internal/shared` + per-framework adapter (study
`wolf-tui/internal/shared/src/{state,wnode}` and
`wolf-tui/packages/react/src/components/TextInput/*` — the reference shape):

1. **Logic — `core/components/state/`.** A pure reducer `(state, action) → state`
   - a `createInitial*` factory + pure helpers. Zero framework, zero render. The
     wolf-tui twin is `internal/shared/src/state/text-input.ts`.
2. **View — `core/components/view/`.** A pure render function
   `render*(viewState, theme) → Descriptor`. Visual AND state enter **only through
   props**; out comes a tree of `Descriptor` nodes (`core/components/descriptor.ts`
   — `{ type, props, children, key }` over our primitives `symbiote-view` /
   `symbiote-text` / `symbiote-image`, built with `el()` / `txt()`). No framework,
   no state, no events. The wolf-tui twin is `internal/shared/src/wnode/render-*.ts`
   (`WNode` + `wbox`/`wtext`).
3. **Lifecycle — the adapter.** The framework owns state-as-lifecycle and the
   descriptor→element bridge, NOTHING else: React → `use*State` hooks
   (`useReducer`/`useEffect`/`useRef` over the `core/components/state` reducer) +
   `descriptorToReact` (`Descriptor → React.createElement`); Vue → reactive
   `ref`/`watch` + `descriptorToVue` (`Descriptor → h()`). The bridge output is an
   ordinary host element that flows on through the adapter reconciler → engine →
   Fabric.

So **render functions are framework-agnostic and prop-driven; frameworks own only
the lifecycle.** A component's logic and visual are written once and a new adapter
gets them for free — it supplies only hooks + the one descriptor bridge. Adapter
code that re-implements state or render for a component that already lives in
`core/components` is the bug this split exists to prevent.

Note this supersedes the older placement where component bodies lived wholesale in
`@symbiote-native/react`; the imperative runtime modules of `<runtime_modules_layering>`
(Alert, Share, Dimensions… — no visual, no lifecycle) do NOT follow this split,
they just move to core as plain modules.
</components_split_logic_view_lifecycle>

<prop_types_split_agnostic_vs_per_adapter>
A component's **public prop type** belongs in the shared layer (`@symbiote-native/components`)
ONLY when every field is framework-agnostic — fields typed off `IAccessibilityProps` /
`IAriaProps`, `IStyleProp<…>`, `ISymbioteEvent`, or plain scalars. Such a type is defined
ONCE next to its render fn (`core/components/src/view/render-X.ts`) and EVERY adapter
re-exports it verbatim (`export type { IXProps } from '@symbiote-native/components'`). A second
definition of the same prop type inside an adapter is a duplication bug — the adapter must
re-export, never redeclare. Done so far: `IResponderProps`, `IActivityIndicatorProps`,
`ISwitchProps`, `IButtonProps` (+ the style / Platform / accessibility / native-view-config
types already in the engine).

A prop type is **inherently per-adapter** — it CANNOT move to the shared layer as-is — the
moment any field carries a _framework element or framework ref_: `children` (React
`ReactNode` vs Vue slots/`VNode`), a host `ref` (`Ref<IHostInstance>` vs a Vue template
ref), or a render callback returning a framework element (`renderItem: (info) => ReactNode`
vs `=> VNode`). For these, each adapter DECLARES ITS OWN public prop type, sharing only the
agnostic FIELD BASE from the shared layer and adding its framework-specific children/ref/
render fields. The reference precedent is `IPressableProps`: React's and Vue's are separate
declarations (Vue's comment: "mirrors React's IPressableProps minus children, which Vue
takes via slots") — by design, not by omission. Still-per-adapter: `IViewProps`, `ITextProps`,
the `ITouchable*Props` family, `IKeyboardAvoidingViewProps`, `ISectionListProps`,
`IVirtualizedSectionListProps`. Bringing one of these to a new adapter means writing that
adapter's flavored prop type over the shared agnostic base — NOT importing the React one
(an adapter never imports another adapter's types; see `<third_party_rn_packages_are_react_only>`
for the same React-dispatcher reason). Promoting such a type to "fully shared" requires
making the shared base generic over the element type — a deliberate design step recorded in
its own project skill, never a silent verbatim move.
</prop_types_split_agnostic_vs_per_adapter>

<native_module_name_is_platform_specific>
The native module a JS API talks to is chosen from the RN wrapper's `Platform.OS`
branch (`.vendors/react-native/.../Libraries/<X>/<X>.js`), **NOT** from the spec
filename `Native<X>.js`. The same JS API hits different native modules per platform
(iOS `Share` → `ActionSheetManager`; Android `Share` → `ShareModule`). Headless
fakes resolve any name, so a wrong name passes every smoke and only fails on a real
host: the log `native module "<X>" not found (… bridgeless=object)` means the
**name** is wrong, the bridge is fine. Module-name correctness is proven on
device/simulator, never headless. Full iOS↔Android map and the Android to-do list:
`.docs/native-module-platform-routing.md`.
</native_module_name_is_platform_specific>

## Diagnostics & logging (P0 — do not violate)

<keep_logs_gate_behind_DEBUG>
Diagnostic logs are an asset: **never delete them — only add.** When debugging
finds a useful seam, leave a log there permanently. The cost of keeping logs is
zero because they are gated, not removed.

All logging goes through `dlog` / `isDebug` from `@symbiote-native/engine` (`debug.ts`),
never a bare `console.log`. It is **off by default** and toggled by the `DEBUG`
env var:

- `DEBUG=1` — Node reads it natively (headless smokes); the canary's
  `babel.config.js` inlines it into the RN bundle, so changing it needs Metro
  `--reset-cache`. Runtime escape hatch: `globalThis.__SYMBIOTE_DEBUG__ = true`.
- Default (unset) — silent; one property read per call, nothing emitted.

New code with non-trivial runtime behavior (a commit path, an event, a native
bring-up step) should add a `dlog` at its seam as a matter of course.
</keep_logs_gate_behind_DEBUG>

## Build & platform

- **Bundler:** Metro + per-framework transformers (Vue SFC / Svelte / Angular
  templates). Metro owns the RN-native contract — Hermes bytecode, native-module
  resolution, `.ios.js`/`.android.js` extensions, Fast Refresh — that we cannot
  cheaply reimplement. Not Vite, not Re.Pack.
- **Never make correctness depend on a module's load-time side effect (a `register*` / `set*`
  callback) when that module is reached only through a barrel.** Metro turns on `inlineRequires`
  for production ONLY: it moves a `require()` from the top of a module down to the first place
  its binding is USED, and a barrel's `export { Thing } from './thing'` compiles to a lazy
  getter. If nothing ever names `Thing` as a VALUE, `./thing` never evaluates and its
  registration silently never happens — in RELEASE builds only. Device-diagnosed 2026-08-14:
  `interpolation-node.ts` registered the factory `AnimatedNode.interpolate()` needed; nothing
  named `AnimatedInterpolation` as a value (adapters only TYPE it, which `verbatimModuleSyntax`
  erases), so the first `.interpolate()` threw `interpolation factory not registered` and blanked
  `examples/vue-sfc`'s screen while dev was perfectly fine. Invisible to `tsc`, to vitest (eager
  evaluation), and even to grepping the bundle — the code IS bundled, it just never runs.
  **A bare `import './thing';` next to the re-export does NOT fix it** (tried on device first):
  Babel merges the two imports of the same specifier into one dependency, and the merged
  dependency stays lazy. Two shapes actually work: (a) the module is imported ONLY as a bare
  side-effect import and never re-exported from that barrel — the pattern in
  `packages/slider/src/{react,vue,svelte,angular}/index.ts` (`import '../register';`); or (b),
  preferred, **delete the indirection** so nothing needs registering — which is why
  `AnimatedInterpolation` now lives inside `core/engine/src/animated/graph.ts` next to the base
  class it extends, with `interpolate()` constructing it directly. See that file's comment.
- **File layout — folder-as-module for platform/shared groups (see the `symbiote-file-layout`
  skill).** A module that has platform (`X.ios`/`X.android`) and/or shared (`X-shared`)
  variants lives in its OWN folder `X/` with an `index` barrel: `X/index.ts` (base — re-exports the
  platform variant for headless), `X/index.ios.ts`, `X/index.android.ts`, `X/shared.ts`,
  plus the co-located `X/X.test.ts` / `X/X.detox.ts`. The import contract is
  UNCHANGED — `from '.../X'` (no suffix) resolves to the folder (Metro picks
  `X/index.ios` per platform, tsx/headless picks `X/index.ts`); only an EXPLICIT platform
  import changes form (`'.../X.ios'` → `'.../X/index.ios'`, `'.../X-shared'` →
  `'.../X/shared'`). Inside a folder, a sibling is `./shared` / `./index.ios`; a
  package-root module (one level up) is `../debug` / `../native-modules`. **Single-file
  modules with no platform/shared variant STAY FLAT** — only genuine groups get a folder.
  New components/modules follow this from the start; the flat
  `X.ts`/`X.ios.ts`/`X.android.ts`/`X-shared.ts` form is retired for grouped modules.
- **Platform:** iOS + Android both shipping (alpha). iOS stays the reference
  surface (shortest simulator loop on macOS, widest prop-edge coverage); Android
  is at canary parity. The `RCTFabricSurface` bootstrap and the Android native
  host-shims (`packages/android`) are both wired.
- **Primitives:** `View` · `Text` · `Image` · `ScrollView` all done. `Text` carries
  the only position-dependent view name — a `<Text>` inside another `<Text>` commits
  as `RCTVirtualText` instead of `RCTText` — and **no adapter implements that.** It is
  resolved once in the engine's commit walk (`viewNameFor` in `core/engine/src/commit.ts`,
  which threads `hasTextAncestor` down and re-creates the node when the kind flips);
  every adapter emits a flat `symbiote-text` and stays out of it. React's original
  `TextAncestorContext` is gone — do not reintroduce a per-adapter context for this.
- **Styling — CSS classes are the convention; `StyleSheet.create` remains fully
  supported.** Every current example app (`examples/react`, `examples/vue-sfc`,
  `examples/vue-tsx`, `examples/angular`) styles its static look with a CSS class
  (`className`/`class`/`[class]`) against a `.css` file or, for Vue, an SFC `<style>`
  block — none of them call `StyleSheet.create`. `StyleSheet.create({…})` (engine
  export, re-exported by every adapter) is still identity at runtime — the engine
  flattens a raw object literal the same way — and stays the right tool for a value
  genuinely computed at runtime, or for an app that would rather not introduce CSS at
  all; its only value beyond a raw literal is preserving literal types
  (`flexDirection: 'row'` stays `'row'`). A Vue-SFC `<style>` block is
  supported, including `<style scoped>` (a per-file scope-suffixed class name, both
  static and dynamic `:class` bindings), `<style module>`, and a `:global()` escape hatch —
  `@symbiote-native/css-parser` compiles the CSS at build time, a class-name registry resolves it at
  runtime — see the `symbiote-sfc-style-compiler` skill for the full mechanism. The class+style
  merge and resolution is CROSS-ADAPTER, not Vue-only: `core/engine/src/node.ts`'s `routeProp`
  centralizes it, so a registered class resolves identically from React's `className` prop,
  Vue's `class`/`:class`, and Angular's `class`/`[ngClass]` (via real `addClass`/`removeClass`
  token accumulation, not the earlier no-op). A standalone `.css`/`.module.css` file import
  (`import styles from './Card.module.css'`) works the same way from ANY adapter's own source
  file, not just inside a `.vue` SFC. `@symbiote-native/css-parser` is a regular dependency of each
  adapter package (not a per-app devDependency) — each adapter re-exports it via a
  `metro-css-parser.cjs`/`./metro-css-parser` subpath, so a consuming app needs zero extra
  install step. SCSS/Sass, Less, and Stylus are ALSO supported (2026-07) — each preprocessor
  source reduces to plain CSS text before the same parser/registry pipeline runs, so every
  scoped/module/`:global()` mechanism above applies identically regardless of source language;
  `sass`/`less`/`stylus` are lazy-optional devDependencies of `@symbiote-native/css-parser` only, never
  forced on a project that doesn't author them. **The whole surface — plain CSS, CSS Modules
  (`composes`, `:global()`), all three preprocessors, and what the compiler deliberately refuses
  — is exercised by one screen present in all five examples, `StyleShowcaseScreen` (2026-08-20);
  React's is device-verified, the other four are ported but not yet built.** Every tile is built
  so a dropped rule is VISIBLE rather than silent, which is what makes it a regression canary and
  not a gallery — read it before claiming any part of this pipeline is broken or missing. Three
  claims this paragraph used to carry are now WRONG and must not be repeated: `$style.card` type
  safety is closed for standalone `.module.css` (`css-dts` + the TS plugin; only the INLINE
  `<style module>` typo case is still open), Svelte's default-scoped styles are BUILT (the
  scoper's third pattern `[local]__svelte-<hash>`, same single lightningcss rename as Vue's
  `__module__` / `__data-v-`), and `background-image` shipped in 2026-07 alongside `filter` and
  `transform-origin`. What IS still open is recorded in that skill, and `filter` carries a
  platform caveat worth knowing before demoing it: on iOS RN paints only `brightness` and
  `opacity` unless the `enableSwiftUIBasedFilters` flag is on, so `grayscale`/`blur`/`saturate`/
  `contrast`/`hue-rotate` silently do nothing there. JS style objects via `StyleSheet.create`
  remain the baseline every adapter supports; the CSS path is additive.

## Milestones

The milestones separate the risks: **R1** native pipe/bootstrap/slot, **R2** the
engine's mutation→clone-on-write commit path, **R3** event→recommit, **R4** a
non-React framework driving the engine (proves the core is genuinely
framework-agnostic). Authoritative milestone
table lives in [`README.md`](./README.md).

**M1 + M2 — React, done (alpha).** `@symbiote-native/react`: a `react-reconciler` host
config in **mutation mode** (`supportsMutation: true`, `appendChild`/`insertBefore`/
`removeChild` → the engine's mutation API) drives the full canary surface — `View` ·
`Text` · `Image` · `ScrollView`, the responder/gesture lifecycle, accessibility,
and RN's JS style processors — green on **iOS + Android**, with RN's own renderer
never in the path. React is a known-good driver, so a failure isolates to the engine /
slot / bootstrap (the `@wolf-tui/react` shape with a Fabric-backed engine). **React
goes through the engine in mutation mode** — NOT its native persistent mode straight to
the slot, which would skip R2. The bar for "done" is the canary green on both
platforms, not a parity percentage.

**M3 — Vue, done (isolated R4).** Vue (`@vue/runtime-core` `createRenderer`) renders
the full canary surface on the shared engine — first non-React proof of the
framework-agnostic seam, built in layers (static paint → reactive update → event) so
a break stayed localizable. The `core/`+`adapters/` layout and the `@symbiote-native/engine`
rename (from the former `shared` package) both landed as part of this milestone.

**M4 — Angular, done (isolates R4 again).** A `Renderer2`/`RendererFactory2` driving
the engine — Angular's framework-agnostic seam (twin of Vue `createRenderer`), DOM-less
bootstrap over a `SymbioteSurface`, on `@angular/core >=20` (stable
`provideZonelessChangeDetection` — zoneless is required, zone.js fights Hermes; v17–19
are EOL). The new risk vs Vue was **AOT under Metro**: two stages — ngtsc
`compilationMode:'partial'` (whole-program, compiles templates, does NOT fit Metro's
per-file slot) → `@angular/compiler-cli/linker/babel` (per-file, drops into Metro).
Full component parity, the renderer seam, and native bootstrap are implemented and
tested against `examples/angular`, and Angular is on the live framework switcher on the
landing page alongside React and Vue. Reference source vendored at `.vendors/angular`.
**Read the `angular-adapter` skill before any Angular adapter / build work** — it holds
the full seam map, bootstrap, version rationale, and the AOT pipeline.

**Workstream B — `core/components` (in progress).** Extract every reusable
component out of `@symbiote-native/react` into the three-layer split of
`<components_split_logic_view_lifecycle>`, so Vue (and the next adapters) get the
whole component surface for free. Done step-by-step, each slice verified against a
running example (`examples/react`, the React reference). Pilot order:
ActivityIndicator (render-only — proves the `Descriptor` + `descriptorToReact`/
`descriptorToVue` bridge) → Switch (first state machine — proves the
`state/` + `use*State` half).

**Dropped: `DrawerLayoutAndroid` (2026-07).** Was implemented across all three adapters purely
for parity coverage (proving the seam drives an arbitrary third-party native `ViewManager`, not
just SymbioteNative's own primitives), demoed only in `examples/angular/App.ts`. Removed entirely after
hitting an unfixable real-device Android crash (`ReactDrawerLayoutManager` — RN's own native
Fabric mounting layer, "The Drawer cannot have more than two children", root cause outside this
project's control) in a component RN itself has deprecated in favor of `@react-navigation/drawer`.
Do not re-add it as a SymbioteNative component; if a native Android drawer is ever needed again,
wrap `@react-navigation/drawer` through `<third_party_rn_packages_are_react_only>` instead.
Full incident record: `angular-adapter` skill §19.

## !!! URGENT BACKLOG — delete our 36 hand-rolled RN ports (own branch, do it soon)

**СРОЧНО. Сделать как можно быстрее, но НЕ в перф/движковой ветке — это чистка, отдельная
задача, отдельная ветка.**

`core/engine/src` holds **36 files whose own headers say "JS-side port of RN's `<X>`"** and
**zero** imports from `react-native` — a module we already carry as a `peerDependency` and that
is therefore always present at runtime. Every one of those files re-derives by hand the corner
cases of an implementation we already ship. It is the same mistake the CSS parser had before it
was rebuilt around `lightningcss`, and it has already cost a real device bug: `process-transform` crashed
Android with `String cannot be cast to ReadableArray`. **The cause was the ABSENCE of the JS parse,
not a divergence** - RN parses `transform` in JS only for a STRING, and we forwarded a raw string.
This line read "diverged from upstream on array input" until 2026-09-10, which sends the next
reader auditing the wrong branch.

Measured against `react-native@0.86.0`, the candidates split cleanly:

- **Tier A — 12 modules, 1-5 files each, zero native, zero React.** `flattenStyle`,
  `processTransform`, `processFilter`, `processBoxShadow`, `processBackgroundImage`,
  `processTransformOrigin`, `processAspectRatio`, `processFontVariant`, `PanResponder`,
  `Easing`, `bezier`, `ErrorUtils`. Delete the port, import upstream.
- **Tier B — 15 modules, 13-38 files**, all sharing ONE ~1.2k-LOC TurboModule/BatchedBridge
  floor. Judgement call, module by module.
- **Tier C — 3 modules that must STAY ported**: `Keyboard`, `AccessibilityInfo`, `Image.ios`
  each reach `ReactNative/RendererProxy` → `Renderer/implementations/ReactFabric-{dev,prod}`,
  i.e. **React's own Fabric renderer**, which must never enter a Vue/Svelte/Solid/Angular bundle.

The blocker is not the import graph, it is that Vitest cannot parse RN's Flow source
(`symbiote-rn-import-testability`). **Step 0 is a ~30-minute experiment** — scope
`@babel/preset-flow` to `node_modules/react-native` in `vitest.config.ts` — and it decides
whether Tier A exists at all. It has not been tried.

Two traps that make this look impossible or trivial when it is neither: a naive import closure
counts Flow `import type` edges and reports 194 files where the truth is 1, and the
`core/components/src/bootstrap` subpath precedent that already imports `react-native` today does
**not** extend to Tier A (commit-path modules cannot leave the main barrel).

**Full tables, the measured closures, the `RendererProxy` paths, the step-by-step plan, and a
re-runnable closure script: `.claude/skills/symbiote-rn-port-elimination`. Read it before
porting ANY further RN module by hand.**

## Where we stand against stock React Native (measured 2026-08-23)

> ### !!! EVERY DEVICE NUMBER BELOW PREDATES THE BUFFER ARCHITECTURE. DO NOT READ IT AS CURRENT.
>
> The whole chapter — the table, every per-adapter column, every ratio against stock — was measured
> on the **JS retained-tree** engine, the one `mutation-buffer.ts`'s header describes as replaced.
> This branch (`feature/69-removing-shadow-tree`) moved the tree into C++ and the numbers MOVED WITH
> IT. Device-verified 2026-09-17 across react, vue-sfc, angular, svelte and solid, and the direction
> is not uniform:
>
> - **create-shaped rows REGRESSED** — `Create`, `Replace`, `Append`, `Swap`
> - **update-shaped rows IMPROVED** — `Select` and its neighbours, everywhere
>
> So the buffer architecture did not pay off where it was expected to, and the gains it does show are
> framework-level rather than architectural.
>
> ### The provisional replacement — THE WHOLE BENCHMARK SCREEN, headless (2026-09-17)
>
> The eight device steps, in the device's order, with the device's constants, driven through all six
> renderers. One file per arm, one process per arm, one ten-node row, the census asserted by absolute
> count on EVERY step before any millisecond is read. `pnpm run bench:itest`, one clean sitting:
>
> ```
>               stock   react     vue   solid  svelte  angular      ratio = ours / stock
> Create         93.4   114.4   131.7    99.9   114.9    253.9      1.22 1.41 1.07 1.23 2.72
> Replace       101.5   117.2   152.8   110.9   127.1    283.2      1.15 1.51 1.09 1.25 2.79
> Partial        11.3    10.4    12.3     7.3     8.2     10.2      0.92 1.09 0.65 0.73 0.90
> Select         12.9    13.8    12.9    15.4    11.8     19.3      1.07 1.00 1.19 0.91 1.50
> Swap           15.5    22.4     5.1     5.5     5.0      8.3      1.45 0.33 0.35 0.32 0.54
> Remove         16.8     4.1     4.5     8.2     4.4      8.0      0.24 0.27 0.49 0.26 0.48
> Append        122.5   117.0   142.0   105.9   121.1    271.3      0.96 1.16 0.86 0.99 2.21
> Clear          10.0    11.1    41.0   409.1    19.1     44.1      1.11 4.10 40.9 1.91 4.41
> ```
>
> **The first behavior port is in these numbers** (2026-09-17). `text-input`'s prop resolution — the
> W3C aliases onto RN's own names — moved out of a JS `payloadFold` and into the engine
> (`foldTextInputAliases`, `SymbioteFabricProps.cpp`). The signature is exact and the control is
> React, which never had the fold:
>
> ```
>  arm      walk before   after    folds     create before -> after
>  react       26.8        26.8      0 -> 0   115.2 -> 114.4    the control, flat
>  vue         41.3        26.4   1000 -> 0   143.6 -> 131.7
>  solid       41.0        26.8   1000 -> 0   107.7 ->  99.9
>  svelte      42.2        26.5   1000 -> 0   124.3 -> 114.9
>  angular     41.9        26.0   1000 -> 0   265.2 -> 253.9
> ```
>
> Every adapter's walk converged on React's, which is what "the fold was the whole difference" looks
> like when it is true. Solid is now 1.07x of stock on `Create`.
>
> WHY IT COULD MOVE, and the criterion is the browser's rather than "is it expressible as data":
> mapping `inputMode` onto `keyboardType` is what Blink does for `<input>` — a property of the
> PLATFORM, not of any app, framework or component instance. The machine stayed in JS (the
> controlled-value handshake, the event-count acknowledgement, autofocus) because it runs at gesture
> rate and calls back into app code, which is where a browser keeps it too.
>
> **NO TWIN**, and that is what the port is for: `fabric-props.ts` did not get a copy. The contract is
> `core/engine/cpp/tests/js/text-input-payload.itest.ts`, which reads the payload the commit actually
> sent through `committedPayloadOf` — the harness read added the same day, without which this rule
> would have been unverifiable in its new home. Seventeen assertions across six vitest files moved
> there; one of them, React's `submitBehavior="submit"` case, would have gone GREEN on an unfolded bag
> and is the reason a passing test is not proof that its rule still runs.
>
> The JS that went with it: `ALIAS_ONLY_KEYS`, two narrowing helpers, and the per-tag closure the two
> registrations needed — `text-input` and `text-input-multiline` now share one behavior object,
> because `multiline` was the only thing they did not share and the engine reads it off the component
> name instead.
>
> The fixtures are `core/engine/cpp/tests/js/{stock,react,vue,solid,svelte,angular}-suite.itest.*`,
> all six driven by one `bench-suite.ts` that owns the state machine, the steps and the oracle. A
> seventh arm — the engine's own mutation API with no reconciler above it — is not here;
> `update-shapes-cost.itest.ts` is that floor and it is unchanged.
>
> ### The SECOND port — `pressable` — and the wire slot it needed (2026-09-17)
>
> `disabled` folding into `accessibilityState`, `accessible`/`focusable` defaulting on, the Android
> ripple config, and the nine machine-only props being kept out of a payload no ViewConfig declares:
> all of it is `foldPressableProps` in `SymbioteFabricProps.cpp` now, and `pressable.ts` keeps no
> `foldPayload`. Same criterion as text-input — `Pressable.js` does this for every Pressable in every
> app, so it is the platform's and not any app's.
>
> **IT COULD NOT MOVE THE WAY TEXT-INPUT DID, and that is the reusable part.** That rule keys off the
> Fabric view name, which already crossed: `RCTSinglelineTextInputView` names nothing else. A
> pressable commits as `RCTView` — byte-identical to a plain view — so nothing on the native side
> could tell them apart. The missing fact was the TAG, which JS knew at `createElement` and kept.
>
> So the tag crosses now, once, as `OP_SET_TAG`, emitted from `attachHostBehavior` for the nodes a
> behavior actually attached to and no others. That is the browser's arrangement rather than a
> workaround: an element knows what tag it is, and its user-agent behavior follows from that rather
> than from whatever view its layout engine allocated. **Every remaining behavior port rides on this**
> — it is what makes a tag-keyed rule possible at all.
>
> **THE RULE SERVES THREE TAGS, because three tags ARE a pressable in RN's own terms**:
> `pressable`, `touchable-opacity` (a pressable plus a fade), and `button` (a touchable plus a label —
> `TouchableOpacity` on iOS, `TouchableNativeFeedback` on Android, `Button.js:283`). All three
> composed the same JS function before it moved; `usesPressableRule` is the record of that.
> `touchable-highlight` is deliberately absent and always was — its behavior REPLACES the fold rather
> than composing it, so it has never carried the machine-key strip. That is a gap in it, not here.
>
> **THE EIGHT-STEP SUITE CANNOT SHOW THIS PORT, and quoting it would be quoting nothing.** Those arms'
> row is the device row with its two `<Pressable>`s spelled as plain `view`s, so `folds` reads 0 on
> every arm whether or not the rule moved. The A/B is `pressable-fold-cost.itest.ts` instead — one
> process, one tree, two tags: `pressable` (the rule in C++) against a tag registered in that file
> with a `payloadFold` doing the identical work, with the two payloads asserted EQUAL key by key
> before any millisecond is read. `build-release`, three consecutive runs, 1 000 pressables:
>
> ```
>  native walk   5.6  5.7  5.8 ms    folds=0
>  js     walk  28.6 28.4 28.3 ms    folds=1000      ~22.7 us per node per commit
> ```
>
> The rule is ~5.7 ms; the CROSSING was ~23 ms, four times the work it carried. Same shape as
> text-input's ~17 us on a smaller bag, and the reason a fold's price is the trip and not the function.
>
> **TWO TRAPS THE PORT SET, and they generalise to every port after it.** A tag rule runs BEFORE the
> JS fold, so a JS fold that reads a key the rule STRIPS now reads it gone: `touchable-opacity`'s
> `focusable` and `button`'s `projectionOf` both read `disabled` out of the bag, and both would have
> resolved every disabled control as focusable — a focus-order bug visible on a TV remote and in no
> test that reads props. Both now read the NODE. **Anything a JS fold needs after a tag rule has
> stripped it must come from `propsOf(node)`, not from the bag.**
>
> And the composition was load-bearing in a way the type system did not protect: `button`'s owner fold
> called `touchable.foldPayload?.(props)` through an `undefined` check, so deleting the function would
> have silently dropped Button's whole accessibility half with every test still green.
>
> **ONE COVERAGE GAP, recorded rather than hidden.** The ripple's Android branch is `#ifdef ANDROID`
> and this host is not Android, so `nativeBackgroundAndroid`'s shape is now asserted nowhere headless.
> `core/components/src/behaviors/ripple-android.test.ts` used to do it by mocking `Platform.OS`; what
> it mocked was a JS function that no longer exists. The same already applies to text-input's
> `underlineColorAndroid` and its `search` keyboard split, which makes it a PROPERTY of porting a
> platform-split rule: a compile-time branch is only testable in a build that compiles it. Closing it
> means an Android arm of the test host, not a mock.
>
> ### The THIRD port — `switch` — and the first whose authored names are ALL invented (2026-09-18)
>
> `trackColor`, `thumbColor` and `ios_backgroundColor` are not Fabric props at any point. RN's Switch
> view declares `onTintColor`/`tintColor` on iOS and `trackColorFor*`/`trackTintColor` on Android,
> plus `thumbTintColor` on both — and `ios_backgroundColor` is not a prop at all, it is a STYLE
> (`Switch.js:266-276`: a background plus a 16pt radius so the pill shows through the track). A
> wrapper body took those per-platform NAMES from an adapter-supplied table; a tag has no adapter to
> ask. `foldSwitchProps` in `SymbioteFabricProps.cpp` now, keyed off the tag; `switch.ts` keeps the
> snap-back machine and no fold.
>
> **THE TWO RULES ARE NOW PRICED ON ONE RULER**, in one file, one process, one sitting —
> `tag-rule-cost.itest.ts`, which replaced `pressable-fold-cost.itest.ts`. Each rule runs on BOTH
> arms and the payloads are asserted equal key by key before any millisecond is read, so the only
> difference left is the crossing. `build-release`, three consecutive runs, 1 000 nodes per commit:
>
> ```
>             native walk          js walk             per node
>  pressable  4.7  3.9  4.1 ms     18.9 18.5 18.7 ms   ~14.5 us    folds 0 against 1000
>  switch     5.1  5.1  5.7 ms     23.9 24.3 24.4 ms   ~18.9 us    folds 0 against 1000
> ```
>
> The pressable row read 5.6/28.6 when measured alone on a busier machine. Both are real and neither
> is the other's before/after — that is exactly why they were re-measured together.
>
> ### The FOURTH port — `image` — and the first rule that does NOT move whole (2026-09-18)

`srcSet` > `src` > `source` precedence, the W3C header decoration (`crossOrigin`/`referrerPolicy`),
the `width`/`height` fold into style, `alt` becoming `accessibilityLabel` + `accessible`,
`resizeMode`/`tintColor` falling back to style keys, `loadingIndicatorSource` plucked down to a bare
uri: all of it is `foldImageProps` in `SymbioteFabricProps.cpp` now, contract in
`image-payload.itest.ts`.

**ONE STEP COULD NOT CROSS, and naming why is the reusable part.** `resolveAssetSource` turns the
number `require('./logo.png')` returns into a `{uri, width, height, scale}` by asking METRO'S ASSET
REGISTRY — a JS table populated at bundle time. There is no such table in C++ and there should not
be: it belongs to the bundler, not to the platform.

So the lookup moved EARLIER instead of across. `routeProp` resolves the three source props on the
way IN (`core/engine/src/image-source-write.ts`), which is the seam and the argument
`structured-style.ts` already established for `boxShadow`/`filter`/`transform`: **a value resolved
at payload-build time is resolved HEADLESS ONLY**, because the C++ builder has no JS to call, and
the device then commits the raw input for Fabric to drop in silence. By commit time the bag holds
resolved sources and the rest of the rule is pure. **This is the pattern for every remaining port
whose rule touches something only JS knows.**

It is gated on the NODE (`resolvesImageSources`, declared by the behavior, one boolean read per
write beside `hasCommitHook`) rather than on the key, because the resolution normalises to Image's
ARRAY shape and a `WebView` or a third-party video view spells `source` too.

**NO TWIN, and this is the port that had to earn it.** `mapImageProps` had a second caller — Angular's
`<Image>`, whose typed `@Input()`s meant it folded in a component body rather than writing props on
a tag. `renderImage` is a GATHER now: it flattens the typed view back into the bag an app would have
authored and names the `image` tag, and the engine folds once for every adapter. Six helpers went
with the rule (`normalizeSource`, `headersFromAliases`, `expandSrcSet`, `resolveSourceArray`,
`readStyleString`, `readSourceUri`), and `render-image.test.ts` went from ~70 fold assertions to
four about what `renderImage` still decides.

**`image-background` now BUILDS ITS INNER IMAGE WITH THE TAG, which is the reverse of what it did.**
It used to withhold the tag so the node would not get Image's `payloadFold` — a single slot it
needed for its own derived style — and call the mapping by hand. The mapping is reached off the tag
now, so the tag is how that node gets a platform half at all, and the JS slot is free for the
COMPOSITION, which is where the browser model wants it. `registerImageBackgroundBehavior` calls
`registerImageBehavior` as a result: a real dependency, declared rather than assumed, and the kind
that would otherwise surface first on a device.

**Two things fall out of it, both recorded rather than smoothed over.** A style `resizeMode` beats
the PROP, where RN's `??` says the opposite — and the fold is not why: `fabricProps` writes the
top-level keys and THEN hoists the style over them, so the `??` is dead for exactly the two keys
that can appear in both places. Pre-existing, survives the port unchanged because the hoist order is
the payload builder's rather than the rule's, pinned as characterization. And the inner image's own
`width`/`height` props now beat the proxied box size where RN nests it the other way — left that
way deliberately (RN's own comment calls its nesting a "Temporary Workaround", an explicit prop
winning over an inherited box is the less surprising reading, and reproducing it would need either a
JS copy of the rule or a per-node fold-ORDER knob in the payload builder).

**All three ported rules, on one ruler** — `tag-rule-cost.itest.ts`, one process, one sitting, each
rule run on BOTH arms with the payloads asserted equal key by key first, best-of-4 per arm:

```
            native walk          js walk             per node
 pressable  4.1  4.3  4.3 ms     20.6 21.6 23.1 ms   ~17 us
 switch     5.6  5.5  6.0 ms     27.1 38.4 28.8 ms   ~26 us
 image      6.9  7.3  7.8 ms     32.2 38.2 33.3 ms   ~27 us
```

The crossing was four to five times the rule in every case, and **the bigger the bag the worse the
ratio** — which is why image, whose rule touches the most keys, was the most expensive to have had
in JS. Read the native column as a measurement and the JS column as a floor: a JS fold allocates, so
its cost carries GC that best-of-N cannot suppress.

### A small-ms scaling test needs BEST-OF-N, not one sample (2026-09-18)
>
> `child-list-scaling.itest.ts` reads a doubling FACTOR rather than a millisecond, which is the right
> instrument for a complexity claim — and it was failing intermittently under the full suite while
> passing in isolation, twice costing a false alarm on a test with no defect.
>
> The cause is scale plus parallelism: a 1 000-wide clear is ~0.45 ms on the assert build, and the
> runner spawns a process per test file (62 of them), so a sample can be descheduled for longer than
> the thing being measured. **Timing noise is one-sided — it only ever ADDS — so the MINIMUM of
> several runs is the closest reading to the work itself, while a mean carries every interruption
> into the ratio.** Five samples per width, a fresh list for each (a cleared list has nothing left to
> remove, and re-timing the same one reports a beautifully flat curve for the wrong reason). Bounds
> unchanged; only the sampling. The insert row went from a spread to a dead-flat 3.77x.
>
> **THREE DIVERGENCES FROM RN FELL OUT OF READING `Switch.js` TO PORT IT, and all three are now
> FIXED — in the commit AFTER the port, so the move and the correction each have their own before and
> after.** A port is a MOVE; folding a correctness change into it makes the measurement and any
> future regression unattributable.
>
> - `accessibilityRole` defaults to `'switch'` on both platforms (`Switch.js:255,293`). We emitted
>   nothing, so a screen reader announced our switch as a plain view — the same class of silent gap
>   `accessible`/`focusable` were on Pressable before 2026-09-09. `??`, so an app that calls it a
>   checkbox keeps its answer.
> - iOS composes `{alignSelf: 'flex-start'}` UNDER the app's style (`:266`), so a stock Switch keeps
>   its intrinsic width. Ours stretched. UNDER is the whole of it — `alignSelf: 'stretch'` still
>   wins — and the composition is iOS's alone: `:263-281` is the `else` branch, so Android's style is
>   the app's untouched and `ios_backgroundColor` is not read there at all.
> - Android's native component is a DIFFERENT one with different prop names — `on` and `enabled`
>   (`:240-243`), never `value`/`disabled` — `_disabled` falls back to `accessibilityState.disabled`
>   and is written back into it (`:232-238`), and the iOS colour names are destructured OUT (`:230`).
>   We sent the iOS names on both platforms, so an Android switch painted from nothing and could not
>   be disabled.
>
> **AND THE ANDROID HALF IS TESTABLE HEADLESSLY, because the branch is the VIEW NAME rather than
> `#ifdef ANDROID`.** `Switch` and `AndroidSwitch` are genuinely two Fabric components with two prop
> surfaces, and the name is already on the wire — so `foldSwitchProps` reads it and a test can ask
> for either. That is strictly better than a compile-time branch and it is the shape to prefer
> wherever a platform difference has a name: the ripple in `foldPressableProps` stays `#ifdef`
> precisely because it has no such tell, an `android_ripple` sitting on an ordinary `RCTView`.
>
> **The A/B guard earned its keep the same hour.** `expectSamePayload` refuses to time two arms that
> send different bags, so the corrected rule turned `tag-rule-cost.itest.ts` red the moment it landed
> — a measurement that would otherwise have compared the new rule against the old one and called the
> difference a speed-up.
>
> **One latent C++ bug came out of it, found by needing two values at once.** `boolAt` returned a
> `const bool *` into a single `static thread_local` slot, so any two results held simultaneously
> aliased — the second read rewrote the first. Nothing had ever needed two, so nothing was wrong;
> Android's `disabled` beside `accessibilityState.disabled` is the first caller that does, and it
> would have resolved every switch through whichever was read last. It returns `std::optional<bool>`
> now, and all five call sites moved with it.
>
> **AND ONE HAZARD CLOSED BY CONSTRUCTION.** The adapters used to pin that `onTintColor` reaches
> Fabric as a PROP rather than being mistaken for a listener, because `routeProp` asks the Switch
> ViewConfig instead of guessing from the `on` prefix. The engine writes that name straight into the
> payload now, so `routeProp` never sees it; the only name it sees is `trackColor`.
>
> **This confirms the device report, and sharpens it.** The old table had Solid 0.76x, Svelte 0.80x
> and Vue 0.89x on Create — all UNDER stock. Here **every adapter is over stock on both create-shaped
> rows**, while `Swap` and `Remove` are 3-5x WINS for everyone but React. That is exactly the split
> the device screenshots showed: create-shaped regressed, update-shaped improved.
>
> **`Append` is the one create-shaped row that did not regress**, and it separates the two costs: the
> row count is identical to `Create`'s but the list already stands, so the four lighter adapters land
> at 0.93-1.19x where `Create` puts them at 1.18-1.57x. Stock pays more for appending than for
> creating (125.4 against 91.6) and we pay the same for both.
>
> **`Solid`'s `Clear` at 394.9 ms is the largest single anomaly this project has measured and it is
> NOT the engine.** The engine's own halves read `walk=0.3 apply=13.3` — 3% of the wall — with
> `created=0 cloned=2`. Reproduced four times across two different state spellings (394.9 / 395.1 /
> 399.1 / 415.9), so it is not noise and not the store. Everything else clears in 9-44 ms.
> `adapters/solid/src/renderer.ts`'s `getParentNode` comment already records "an increasingly slow
> Clear on the benchmark screen" as a bug that path once had; this is the next thing to chase.
>
> WHAT THIS TABLE IS, said plainly so nobody reads it as the device's: JavaScriptCore rather than
> Hermes, the native side a test host rather than a real Fabric pipeline, and no app-level Babel
> lowering applied by the runner — the arms are written as intrinsic TAGS, which is the lowered shape,
> but an SFC's static-prop hoisting and patch flags are not modelled. It is a sound comparison of the
> six columns AGAINST EACH OTHER, taken on one ruler in one sitting. Treat a ratio against stock as
> indicative and re-measure on device before publishing one.
>
> **THE SPELLING OF STATE MOVED TWO COLUMNS MORE THAN ANY ENGINE CHANGE HAS**, which is the finding
> that came free with building this. Every arm replaces the whole list on every step, so the reactive
> primitive has to be a SHALLOW one, and the device screens all spell it that way:
>
> ```
>  arm     wrong spelling          right one            what it cost
>  svelte  $state (deep proxy)     $state.raw           create 160.8 -> 124.3, and a flat ~20 ms on
>                                                       EVERY mutation step (select 30.1 -> 12.3)
>  solid   createSignal, replaced  createStore +        partial 16.7 -> 7.8, and `created` 1000 -> 0:
>          wholesale               reconcile({key:'id'}) `<For>` was rebuilding every row it re-keyed
> ```
>
> Both were measured, not reasoned about, and both are app-author mistakes rather than adapter ones —
> but they are the mistakes a real developer makes, and they dwarf everything in the perf chapter
> below. Vue's arm uses `shallowRef` and Angular's a `signal` over the same replaced object for the
> same reason.
>
> Three provenance notes that belong with the census. The adapter arms commit ONE more `View` than
> stock (the container `createSurface` puts under the RootView; stock's `render` mounts straight into
> the root) and Svelte commits TWO more (its DOM shim's own root wrapper, `createRootShimElement`) —
> named rather than fitted, and asserted on every step. The Angular row needs
> `registerComposedComponent('BenchRow')` or its component host falls through to a raw `createNode`
> and the row commits ELEVEN nodes; on device a Babel plugin injects that call, the itest runner does
> not run it. And `setProps` differs per adapter for one identical tree — vue/solid 10 000,
> react 12 000, svelte/angular 13 000 — which by the benchmark screen's own rule is work the ADAPTER
> generates, not a cost of the platform. That is the cheapest open lead on this page.
>
> **What this invalidates, concretely.** Any cross-check of a headless measurement against a device
> figure taken from this chapter is comparing two different engines. The `Swap` work below does
> exactly that — it reads a headless 2.42x against "3.68x on device" — and that pairing is void: the
> headless arm is this branch, the 3.68x is the old one. The headless numbers themselves stand, being
> measured directly; only the device column they are read against is stale.
>
> `README.md`'s published table has the same provenance. It describes the RELEASED packages, so it is
> not wrong today — it becomes wrong the moment this branch lands, and must be re-measured first.
>
> Everything below is kept because the METHOD in it is sound and hard-won — read the counters before
> the milliseconds, one ruler per comparison, no verdict off a small-ms row. The METHOD transfers;
> the numbers do not.

`examples/bare-rn` is plain react-native 0.86 on React's own Fabric renderer, with a port of the
same benchmark screen and the same 20 measurement constants — the baseline the adapters are read
against. **iOS 26.5 simulator, Release build, 1 000 rows × 9 native views, all-mounted:**

```
              stock   react     vue  svelte   solid  angular
Create 1000   186.8   217.8   180.0   154.1   159.8    418.2   Vue/Svelte/Solid BEAT stock; React 1.17x, Angular 2.2x
Replace       211.6   247.4   188.8   207.2   180.2    509.6   Vue/Svelte/Solid at/under stock; no RATIO (stock drifts)
Append 1000   290.8   310.3   184.9   163.0   166.8    499.3   Vue/Svelte/Solid BEAT stock (Svelte 1.78x, Vue 1.57x)
Partial        23.0    23.3    12.2    12.0     7.7     27.6   tie -> 3.3x WIN
Remove        108.6    83.7     7.4     7.4     8.2     27.3   Vue/Svelte/Solid WIN 13-15x
Select          8.0     8.3     5.8     5.9     9.0     25.6   tie, except Angular
Swap           13.3    28.3     9.3     8.0     7.2     24.8   tie, except React 2x worse
Clear           7.7     7.5    11.2    11.9    24.2     37.1   NOT REPRODUCIBLE — see below
```

**Before comparing two columns, check they are on the same ENGINE.** They are not, as of
2026-08-23 — each example carries its own installed `@symbiote-native/engine`, and this month's
three engine cuts (the `styleParts` field, the prototype move for the public-instance graft, and
the `fabricProps` payload rewrite) reached only some of them:

```
           styleParts  prototype  fabricProps
react         no          no         no
vue-sfc       yes         yes        yes
vue-tsx       no          yes        yes
svelte        yes         yes        yes
solid         yes         yes        yes   (re-levelled 2026-08-23)
angular       no          no         no
```

Measured with `grep` on each `examples/*/node_modules/@symbiote-native/engine/build/{node,fabric-
props}.js` — all six report version 0.3.0, so the manifest tells you NOTHING and the version is not
the check. On Vue those three cuts were worth Create 296.7 -> 274.8 -> 258.5 -> 255.0, i.e. ~42 ms,
and the prototype move is explicitly one Solid and Svelte were owed too (both graft eagerly).
So React's and Angular's columns are still read against a materially older engine than Vue's and
Svelte's, and a cross-column deficit computed today silently includes that gap. Re-level before
attributing any residual to an adapter — the loop for that is the LOCAL REGISTRY
(`pnpm run registry:publish` then `registry:refresh examples/<name>`, then `pod install`). It is
the only local route now: the overlay and bundle-isolation scripts were deleted 2026-09-02, and CI
runs `scripts/check-packed-consumer-bundles.mjs`, which installs a fresh tarball consumer per
example instead of overwriting installed folders. Read `symbiote-local-dev-registry` first.

**Solid was re-levelled this way, and the result is the second, independent confirmation of those
three engine cuts.** They had only ever been measured on Vue, by the session that wrote them:

```
              stale engine   levelled     reconcile window
Create           288.1        261.2       63.1 -> 49.6   -21%
Replace          291.5        265.2       64.0 -> 50.4   -21%
Append           277.9        258.6       65.3 -> 52.5   -20%
```

FABRIC byte-identical and WRITES unchanged in every row — the same work, priced lower. The split
matches what the changes are: ~13.5 ms came off INSIDE the window, which is `fabricProps` (it runs
within the walk, and Vue measured it at 16.3 ms), and ~13.4 ms came off outside it, which is the
prototype graft plus `styleParts` in pass 1 (Vue measured the graft alone at 21.9 ms). A ~21% window
move is far outside the window's own ±8% noise floor, so this one carries a verdict.

**Vue, Svelte and Solid are post-lowering (2026-08-23); React and Angular are not** — and Angular's
half of that clause EXPIRED on 2026-08-31, when `adapters/angular/babel-lower-host-primitives.cjs`
landed and began lowering `View`/`Text`. It still does not lower `Pressable`/`TextInput`
(`LOWERABLE_NAMES = ['View', 'Text']`, hardcoded), so "Angular is not lowered" is now false as
written and true only of tier 2. Read the
spread with that in mind. `<View>`/`<Text>` in an SFC now compile to their intrinsic TAG instead of a Vue
component, and the adapter's own components render the tag too, which removed one Vue component
instance per node on the two primitives that make up ~73% of a real tree. Create 397.4 -> 296.7,
Replace 399.4 -> 293.9, Append 385.1 -> 274.6, i.e. 25-29% off the three create-shaped rows, with
the reconcile window (67.4 -> 70.0 ms), the Fabric call counts (9000/8000/9) and the 32 001 prop
keys all UNCHANGED — the whole win is in pass 1, none of it in the engine. Against a stock sample
taken minutes later on the same simulator (Create 195.5 / Replace 208.8 / Append 282.6): Create
2.03x -> 1.52x, Replace 1.91x -> 1.41x, Append 1.36x -> a TIE. Headless predicted only 12-14%,
the first time today it UNDER-shot, because an `h()`-based A/B cannot model the static-prop
hoisting and patch flags an SFC element gets and a component never does. Mechanism:
`symbiote-sfc-style-compiler` §host-primitive lowering; why the cost existed:
`symbiote-perf-measurement`. TSX/JSX does NOT get the compile-time half yet — same recipe through
a Babel plugin, not built.

**Vue's column then took a second, engine-side cut the same day: the public-instance graft moved to
a prototype.** `toPublicInstance` used to `Object.assign` six closures onto every node — 54 000 per
create — and after the lowering, GC was 30% of the window and the profile's largest bucket. The six
methods are now prototype methods on the `SymbioteNode` class (`core/engine/src/node.ts`), and
`toPublicInstance` is the identity. Vue Create 296.7 -> 274.8, Replace 293.9 -> 279.7, Append
274.6 -> 266.2, with the Fabric counts (9000/8000/9, 32 001 keys) and the reconcile window (~65 ms)
byte-identical — again entirely pass 1. **This fixes Solid and Svelte too** (both graft eagerly);
React never did, it grafts lazily in `getPublicInstance`. Headless OVER-shot this one (-18.6% on min
vs -7.4% on device), the opposite direction to the lowering.

**And a third cut the same day, this one in the payload builder.** `fabricProps` used to flatten the
style slot into an intermediate object and then hoist it; it now recurses over the slot writing keys
straight into the one payload object, which is the shape RN itself uses
(`ReactNativeAttributePayload.addNestedProperty` — upstream's `flattenStyle` appears only on its
UPDATE path, never on create). That also revived a memo that had been DEAD: `processedStyle` was
reachable only when `props.style` was a bare object, and after `routeProp` it never is — the
class+style merge always writes a two-element array. On a 9 002-node create with 6 hoisted style
objects: 9 002 flatten calls and as many merged objects, down to 9 002 cache lookups and 6
resolutions. Vue Create 274.8 -> 258.5, Append 266.2 -> 252.5, and this time **the reconcile window
itself moved, ~65 -> 50.9/56.0/56.1 ms** — the right signal, since `fabricProps` is called from
inside the walk. Fabric counts again byte-identical.

Vue's column is therefore read against a **same-sitting stock sample of Create 196.8 / Replace
187.9 / Append 280.2**, not against the table's stock column, and only two of those three carry a
verdict. Stock Create across three sittings read 186.8 / 195.5 / 196.8 (stable, +0.7% across the
run that brackets these changes), so **Create 2.03x -> 1.52x -> 1.40x -> 1.31x is real**. Append
252.5 vs 280.2 is **0.90x — Vue is now genuinely FASTER than stock React Native on a create-shaped
row**, the first time any adapter clears that bar. Replace gets NO verdict: stock's own Replace
sample moved 211.6 -> 208.8 -> 187.9, a 10% drift far outside the ~4% Create noise floor, so the
apparent 1.41x -> 1.46x is the stock column moving, not Vue. Same caution for stock's Swap, which
read 13.3 in one sitting and 36.1 in another.

Batching is settled as a wash on this binary: Create 256.8 on / 258.5 off, Append 252.1 / 252.5.
It demonstrably works (Fabric 9000/**5000**/**1009** vs 9000/8000/9) and buys nothing.

**A fourth, smaller cut landed after those three and moved the Vue column 258.5 / 274.5 / 252.5 to
255.0 / 269.3 / 247.0.** Three allocation fixes of one shape — the
class/style parts moved off a `WeakMap` + `{...prev, ...patch}` onto a `node.styleParts` field
written in place, `hasAnyAriaKey`'s per-call closure replaced by an indexed loop, and Vue
Pressable's `HANDLED_ATTRS` array-behind-`includes` made a `Set`. Fabric counts and the reconcile
window (49.8 / 50.4 / 50.9) both unchanged, so the change is confined to pass 1 and nothing
structural moved. **Each create row moved −1.4 to −2.2%, i.e. INSIDE the ~4% noise floor, and
carries no verdict on its own** — what makes it credible is that all five rows moved the same
direction and Partial's 16.5 → 14.8 is outside its own spread. Headless predicted −8.6% and the
device gave ~−1.5%: fifth data point on headless mis-sizing, third over-shoot, and the reason is
that the whole win is GC pressure, which V8 and Hermes do not share.

**The column then reached 245.3 / 254.1 / 245.8, and that run is a worked example of a measurement
that CANNOT attribute — worth reading before shipping another combined build.** It carried two
independent changes: Vue's Pressable stopped reading through the attrs proxy
(`composables/use-raw-attrs.ts`, plus `normalizeVueAttrs` no longer handing its input back), and
the engine gained `isAlreadyPublished` so an unchanged class/style stops republishing
(`core/engine/src/node.ts`). Create 255.0 → 245.3 (−3.8%), Replace 269.3 → 254.1 (−5.6%), Append
247.0 → 245.8 (−0.5%), no stock sample in the sitting.

The engine guard has a FINGERPRINT and the Vue change does not: `WRITES` fell 14003 → 12003 on
Create and 14002 → 12002 on Replace, exactly 2 per row, with FABRIC still 9000/8000/9 @ 32 001 and
`VISITED` unmoved. Nothing on the adapter side can change a write count, so that half is the
guard's. The proxy work is invisible to every counter on the screen, so its share of the −3.8% is
unknown and this run does not establish it. **A change with no instrument signature must be
measured alone, or it cannot be measured at all** — the same discipline the Vue and Svelte lowering
runs got, and this one did not.

The missing arm arrived from the Solid sitting and settles the split: the guard alone costs Create
284.7 → 288.1 and Append 276.0 → 277.9, i.e. nothing. It removes no create-path work THERE because
there was none to remove — before either change the four adapters read `WRITES` react 14037/6000 ·
**vue 14003/2001** · svelte 12001/0 · solid 12001/0, and after the guard Vue converges on 12003.
Vue was the one diffing adapter still republishing an unchanged class, 2 per row; Svelte and Solid
write class once per mount and never had the excess. So the guard's Vue-only write drop and its
Solid no-op are the same fact, and **most of the −3.8% / −5.6% is the proxy work** — an inference
from the two arms, not a measurement of it.

**Then tier 2 landed for Vue and the column moved further in one step than everything before it
combined: 245.3 / 254.1 / 245.8 → 180.0 / 188.8 / 184.9 (SFC), and 272.9 / 292.2 / 274.6 →
176.9 / 191.8 / 192.8 (TSX).** `<Pressable>` now compiles to `symbiote-pressable`, an element, and
the press machine runs on the engine node — 2 000 Vue component instances gone from a 1 000-row
create. FABRIC read 9000/8000/9 @ 32 001 in both, byte-identical to the previous run, and `WRITES`
held at 12003/2, so the tree and the engine's work are unchanged and the whole delta is instances.

Against the stable stock bands (Create 186.8 / 195.5 / 196.8, Append 290.8 / 282.6 / 280.2),
**Create 180.0 is under all three and Append 184.9 is 1.57x** — Vue joins Svelte and Solid past
stock React Native on a create-shaped row. Replace still gets no ratio: stock drifted 211.6 → 187.9
and 188.8 sits inside that. Read against the morning's 397.4, Vue went 2.02x → 0.96x in a day.

Two things that must travel with those numbers. **The ceiling was 159.4**, measured by deleting the
row's Pressables outright, so tier 2 captured ~65 of ~86 ms — about 76%, the rest being the row
component itself and what a lowered Pressable still costs engine-side. And **the benchmark row does
not read `pressed`, so every one of its Pressables lowers, which a real screen's will not.** Census
of `examples/vue-sfc`, 56 `.vue` files: 10 sites lower, 3 refuse, all three on a functional
`:style`. By SITE that reads 77% lowered; by INSTANTIATION it inverts, because one of the three is
`ActionButton` and that is 90 call sites on its own. The per-site figure is the optimistic one and
the per-instance figure is the honest one — quote the second. Migrating `ActionButton`'s
`opacity: pressed ? 0.6 : 1` into `.action-button:active` flips all 90 (Svelte did exactly this).

Two smaller cautions from the same screenshots, one of which turned out to be the instrument.
Swap 5.8 → 6.9, Remove 6.1 → 7.6, Clear 15.6 → 17.2 all rose — the small-ms rows behaving as the
reproducibility note below already says they do. And the reconcile window did NOT fall with the
totals (49.8 → 50.9 Create, 50.9 → 56.0 Append), which looked like it needed a mechanism and does
not: see `symbiote-perf-measurement` on the window's own ±8% spread, measured across a pair of runs
whose `VISITED`, `WRITES` and every FABRIC counter were byte-identical. **A window that moves while
the counters hold still is noise; a window that moves WITH them is signal** — Solid's Select
(10.3 → 1.0 ms beside a 500× write drop) is the reference for the second shape.

**Svelte's column is post-lowering too (2026-08-23), and its disease was a THIRD currency.** Vue
paid a component instance per primitive, Solid a props Proxy; Svelte pays **anchor nodes**. Its
retained tree held 23 006 nodes against every other adapter's 9 001 — renderable 9 002 (identical)
plus 14 004 anchors, of which 12 002 were Svelte block/component comments, i.e. 12 per row.
**A component BOUNDARY is not what costs them** — measured per construct, a boundary is free; what
costs is `{@render children}` (1 anchor) and `{#if}/{:else}` (2). Our primitives all accept
children, so every one of them carried a snippet. Fabric saw the same 9000/8000 calls throughout, so the native side was never
involved; the cost was 14 004 extra retained objects plus `renderableChildren` losing its fast path
6 002 times per commit. `adapters/svelte/src/preprocessor/lower-host-primitives.ts` rewrites
`<View>`/`<Text>` to `<symbiote-view p={{…}}>` before the compiler sees the file, taking them off
the component path: anchors 14 004 -> 8 002. Create 475.8 -> 353.4, Replace 854.6 -> 392.7,
Append 579.5 -> 378.0, Clear 33.3 -> 20.2, with FABRIC 9000/8000 and 32 001 prop keys unchanged.

**Replace halving is the biggest single number this project has produced, and it is not a mystery**
— Replace tears a thousand rows down and rebuilds them, so it destroyed AND recreated 14 004
anchors where Create only creates them once.

Read against stock the same way Vue's column is: stock Create is stable across three sittings
(186.8 / 195.5 / 196.8) and so is stock Append (290.8 / 282.6 / 280.2), so **Create 2.55x -> 1.80x
and Append 1.99x -> 1.35x carry a verdict** even though no stock run was taken in Svelte's own
sitting. Replace does NOT get a ratio — stock's Replace drifted 211.6 -> 187.9 — but Svelte's own
854.6 -> 392.7 is far outside any drift, so the IMPROVEMENT is certain while the multiple is not.
Svelte is no longer worst of five on Create; it now sits between Solid and Angular.

**And then a SECOND Svelte pass the same day took it from worst of five to FASTEST of five.** Two
changes shipped together and this run cannot separate them: five allocation cuts in the DOM shim,
and lowering `Pressable` (the tier-2 promotion, once the shared `HOST_PRIMITIVES` spec carried
`observesState` and the refusals were in). Measured on one Release build, iOS 26.5 simulator:

```
            before   after            FABRIC / prop keys       reconcile window
Create       353.4   154.1  -56.4%    9000/8000/11 @ 32001     59.9 -> 46.7 ms
Replace      392.7   207.2  -47.2%    9000/8000/9  @ 32000
Append       378.0   163.0  -56.9%    9000/8000/11 @ 32001
Remove         9.6     7.4            Clear 20.2 -> 11.9, Select 9.5 -> 5.9
```

`createNode` / `appendChild` / prop keys are byte-identical to the pre-change run, so nothing
structural moved; the clone count going 9 -> 11 is container chrome against nine thousand creates
and is not a signal. **Against stock this is Create 0.78-0.82x and Append 0.56-0.58x — Svelte beats
stock React Native on both**, read against the stable stock bands rather than a same-sitting
sample (Create 186.8/195.5/196.8, Append 290.8/282.6/280.2). Replace still gets NO ratio, because
stock's own Replace drifted 211.6 -> 187.9; 392.7 -> 207.2 is far outside that drift, so the
improvement is certain and the multiple is not.

**The reconcile WINDOW moving is the part that distinguishes Svelte from the other two**, and it
was predicted before the run: Vue's and Solid's lowerings were pure pass 1 and left the window
untouched, because their currency was an instance and a props Proxy. Svelte's currency is anchor
nodes, and `renderableChildren` (`core/engine/src/commit.ts`) loses its fast path on every
anchor-bearing parent — so removing ~6 000 of the 8 002 residual anchors had to move the walk as
well. It did: 59.9 -> 46.7 ms, with pass 1 going 293.5 -> 107.4. Had the total fallen while the
window held, that would have meant the anchors were not where the model said.

The anchor count itself, measured afterwards: **8 002 -> 2**, with `renderableChildren`'s flatten
count 6 002 -> 2 — the direct causal link to the window. That is well past the ~2 000 residual the
prediction expected, and the miss is the instructive part: a COMPONENT boundary among a row's
children forces the each-block to keep per-item block anchors that a purely element child does not
need, so removing the last component from the row removed its own anchors AND the block's. Count
what a boundary forces on its PARENT, not only what it owns.

**Read the ratio as an UPPER BOUND, and the two sentences belong together.** The benchmark row does
not read `pressed`, so every `Pressable` in it lowers. On the real screen it is 7 of 10: the three
refusals are `CanaryScreen` twice (a functional `style` plus a parameterised children snippet) and
`ActionButton` once — and `ActionButton` is the shape that dominates by INSTANTIATION SITE, ~625
uses against ~76 screen-level Pressables on the Vue count. A lowering ratio measured on this row is
the best case; the honest per-app figure is proportional to how many call sites do not read state.
Migrating a `style={({pressed}) => …}` to a CSS `:active` rule is what converts a refusal into a
number.

Two things this cost that are worth not re-deriving. The preprocessor MUST run after
`scopedStyles`, because lowering turns `class="x"` into a bag expression the style scoper can no
longer find — reversed, every scoped class silently stops being scoped. And Metro's
`getCacheKey` surfaces only the UPSTREAM key, so the compile step is invalidated by
`--reset-cache` alone: without it the bundle keeps the old output and the measurement reads as a
no-op. Mechanism and the anchor census: `svelte-adapter-dom-shim` §32.

**Solid's column is post-lowering too (2026-08-23), and it is the cleanest measurement this project
has taken** — both arms back-to-back on one simulator, eight minutes apart, Release, with only the
adapter tarball swapped between them and `core/engine` left on its npm build so nothing else could
move. Solid's currency was a props **Proxy** per primitive: `createComponent` builds one, then the
component body runs `splitProps` + `withStableKeys` + `mergeProps` + `spread` — five things per
node, 22.3% of a create in proxy traps and `splitProps` alone. `adapters/solid/babel-lower-host-
primitives.cjs` rewrites `<View>`/`<Text>` to `symbiote-view`/`symbiote-text` before
`babel-preset-solid` sees them, taking both off the component path entirely (641 tags across the 52
`.tsx` of `examples/solid`, zero refusals):

```
            before   after      FABRIC unchanged throughout
Create       337.9   284.7   -15.7%      9000/8000/9 @ 32001 keys
Replace      390.6   315.8   -19.2%      9000/8000/7 @ 32000
Append       324.5   276.0   -14.9%      9000/8000/9 @ 32001
```

Those "after" figures are the lowering ALONE, on the engine the example carried at the time; the
column above adds the class guard and the engine re-levelling on top. Read end to end, Solid's day
was Create 316.7 -> 261.2, Replace 386.9 -> 265.2, Append 347.4 -> 258.6, Select 14.6 -> 6.2, in
four separately attributed steps.

Fabric counts and prop keys are byte-identical in both arms, so the whole win is pass 1 and nothing
structural moved — the same shape Vue's and Svelte's lowering produced.

**And it exposed a real engine tax that the component wrapper had been hiding.** Solid's `Select`
row went WRITES 2 -> **1001** and its reconcile window 1.5 -> 10.3 ms while Fabric stayed at
0/0/10 with 4 prop keys. Mechanism: `routeProp`'s `class` branch ends in `pushClassStyle`, which
publishes a **fresh `[classStyle, explicitStyle]` array** on every write, and `setProp`'s guard is
`Object.is` — which can never fire on a fresh array. So an unchanged class string still lands as a
write and still dirties the node. That re-push is DELIBERATE (it is the restore path after
`setNativeProps` overwrites the declarative style, and the function says so), and it costs nothing
for React/Vue/Svelte because each diffs props before calling the engine. Solid has no such diff: a
fine-grained effect re-runs whenever any signal it reads changes, so all 1 000 rows re-push their
class when `selectedId` moves. Before lowering, `splitProps`/`mergeProps` memoized that away.
Wall time barely noticed (16.7 -> 17.8 ms, inside noise) but the tax is proportional to list size.
Fixed the same day by `isAlreadyPublished` in `core/engine/src/node.ts`: `pushClassStyle` returns
early when the array it would publish is identical to the one standing, read back out of
`node.props.style` rather than tracked in a field. Safe against the restore path the function's own
comment protects, because `setNativeProps` writes that slot as an OBJECT, never an array.

**Measured on device, and the prediction held to the counter.** The guard ALONE was transplanted
onto the npm engine already installed in `examples/solid`, so the two arms differed by nothing else
(`symbiote-perf-measurement`, "Isolating ONE engine change on device"):

```
Select   WRITES 1001 -> 2   VISITED 4043 -> 1046   window 10.3 -> 1.0 ms   wall 17.8 -> 5.8 ms
```

The safety check is the half that matters: **FABRIC read byte-identical to the pre-guard run in all
eight rows**, so the guard turned away only republications and never a real change. Create
284.7 -> 288.1 and Append 276.0 -> 277.9 sit inside the noise floor, so the guard itself costs
nothing. Solid's 5.8 now BEATS stock's 8.0 on Select, and after this **Solid loses only the three
create-shaped rows — every row that mutates a mounted tree ties or wins.** Mechanism, the test's
two-sided oracle, and the packaging traps: `.claude/rules/solid-host-primitive-lowering.md`.

**Solid's column is post-Pressable-lowering (2026-08-23), and it is the first time an adapter has
BEATEN stock React Native on a create row.** `<Pressable>` now compiles to `symbiote-pressable`,
with the press machine living on the engine node as a host behavior instead of in a component; a
functional `style` or a render-prop child still refuses and keeps the component. Same sitting,
back-to-back, only the spec entry between the arms:

```
             before   after            FABRIC identical in every row
Create        261.2   159.8   -38.8%   9000/8000/9 @ 32001
Replace       265.2   180.2   -32.1%   9000/8000/7 @ 32000
Append        258.6   166.8   -35.5%   9000/8000/9 @ 32001
```

VISITED (9041) and WRITES (12001) are byte-identical too, and the reconcile window moved +5%, inside
its own ±8% floor. So the tree, the engine's work and what Fabric is asked to do did not change AT
ALL — the entire win is pass 1, which is the signature of removed component instances and nothing
else.

Against stock, whose Create (186.8 / 195.5 / 196.8) and Append (290.8 / 282.6 / 280.2) are stable
across three sittings: **Create 0.86x and Append 0.60x — Solid is now FASTER than stock React Native
on both.** Replace lands below even the lowest stock sample but gets no ratio, because stock's own
Replace drifts 11%.

**~50 us per instance, four times the ~13 us a `View`/`Text` wrapper costs**, and the arithmetic
says why: a `Pressable` is not a thin wrapper. Its body runs `splitProps` over a 19-name list,
`createSignal`, `createPressRuntime`, three `createMemo`s and a `createEffect`, and then renders a
`View` COMPONENT inside itself — so a row was shedding four instances plus a press machine, not two.

The small-ms rows all moved the wrong way (Select 6.2 -> 9.0, Remove 7.2 -> 8.2, Clear 7.5 -> 24.2)
and none of them carries a verdict: that is the same non-reproducibility this table already records
for stock's own Clear (46.7 -> 7.7 with no code change). Do not read them either way without a
repeat.

Angular's column is its **flat** row shape, and it is NOT comparable to the other columns — the
node count matched and misled. Flat is 9 nodes/row like everyone else, which is what this paragraph
used to cite as proof of comparability, but it reaches those 9 nodes with a bare `View` carrying a
`(press)` listener where every other column — stock's `examples/bare-rn` included — mounts two real
`<Pressable>`s per row. Measured 2026-08-30: **26 001 prop keys against 32 001**, with
`createNode`/`appendChild` byte-identical. Angular's flat/lowered row gives up Pressable's
hitSlop, pressRetentionOffset, delayLongPress, disabled, android_ripple, its responder claim and its
accessibility fold; the row's own comment says so. So flat-vs-lowered is a sound WITHIN-Angular
comparison and flat-vs-anyone-else is not, and the only Angular arm that may be read against stock or
another adapter is `composed`. Its default `composed` shape is 12 nodes/row and costs **942.9 ms** —
33% more nodes for 2.26x the time, i.e. composition costs 1.7x PER NODE on top of the extra nodes
(the per-component-host anchor, and it is non-linear).

**The general form, because node count is the cheap check everyone reaches for first: two trees can
agree on every structural counter and disagree on the payload.** `createNode`, `appendChild` and the
node count all matched here while 19% of the prop keys were missing.

**And the prop-key TOTAL is not the comparability test either — the SET OF KEY NAMES is.** That
correction cost a day. Dividing 32 001 − 26 001 by 1 000 rows gives "6 keys per row", which was then
used as an acceptance bar for a new Angular arm; enumerating the names instead gave a different
answer entirely. Per-key differencing on the real 2-Pressable row (2026-08-31): flat 18 keys/row,
composed-lowered 18, composed **26** — and the composed surplus is exactly four names,
`onAccessibilityAction` / `onAccessibilityEscape` / `onAccessibilityTap` / `onMagicTap`, on two
Pressables, i.e. 8 per row and not 6. Those four are Angular's own eager-forwarding debt
(`.claude/rules/fabric-boolean-event-gates.md`); no other adapter emits them.

Two things follow. Angular's composed therefore predicts to 34 001 on a 1 000-row create, not 32 001,
so it reaches its total by a mechanism unrelated to the other columns' — **agreeing totals from
unrelated causes are a coincidence, not comparability**, and here they do not even agree. And the
6-keys-per-row gap between Angular's flat row and everyone else's 32 001 is still UNIDENTIFIED: no
adapter in this row sets `hitSlop`, `disabled` or `android_ripple`, so 32 001 was never the "full
Pressable surface" for any of them. Until those six names are enumerated on a non-Angular row, NONE
of Angular's four row shapes may be read against another adapter's column.

**SUPERSEDED 2026-09-02 — Angular has ONE row shape now and it is finally on the common ruler.**
The four shapes were dropped 2026-09-01; the surviving row is the same 10-node row every other
adapter mounts, and the first Release run to reach a device carries `createNode 10000` and
`PROP KEYS 44001` — byte-identical to React's 2026-09-01 numbers. Angular's column may be read
against the others from here. Everything above stays as the record of why it could not be before,
and the METHOD is unchanged: read `createNode` and the prop-key count before any ms.

```
              angular   react   stock      iOS 26.5, Release, 1 000 rows, all-mounted
Create          388.4   264.7   257.3      1.47x React
Replace         501.5   266.3   256.3      1.88x
Append          490.9   390.2   415.0      1.26x
Partial          35.2    26.1    33.6
Select           11.4     7.9     7.3
Swap             13.7    35.3     9.6      WIN, 2.6x over React
Remove           21.7    98.6   121.4      WIN, 4.5x over React and 5.6x over stock
Clear            59.3     8.7    10.7
```

This is also the first Angular run in which lowering actually reached the device
(`angular-adapter` §24: as a Babel plugin it half-applied, silently, for two days). The benchmark
row lowers completely — `symbiote-view`, three `symbiote-text`, two `symbiote-pressable`, one
`symbiote-text-input`, and an empty `dependencies` array.

**The whole remaining deficit is pass 1, and the engine is not in it.** Fabric asks for identical
work (10000/9000/9 @ 44001), and `WRITES` reads 17002/0 against React's 17037/16000 — Angular does
not even pay React's 16 000 no-op writes. The reconcile window is 76.9 ms of the 388.4.

**`Clear` isolates what is left, and it is not the primitives.** 59.3 ms of wall against
`VISITED 41`, `WRITES 1/0` and a **0.1 ms** engine window: the engine does nothing at all, so all
59 ms is Angular tearing down a thousand `BenchmarkRow` instances — LViews, DI scopes, two
`EventEmitter`s and two getters each. React's same row is 8.7 ms. `examples/angular`'s benchmark
screen carries an `Inline rows` toggle to price exactly that: same tree, same Fabric counts, the
row markup moved into the parent's `@for` so no per-row component exists.

**Both arms were then measured, and the split is settled.** Same binary, back-to-back, with
`FABRIC 10000/9000/9 @ 44001` and `WRITES 17002/0` byte-identical in both — which is what makes
them one ruler:

```
              component row   inlined      delta
Create            388.4        307.2       -81.2
Replace           501.5        404.6       -96.9
Append            490.9        367.7      -123.2
Clear              59.3         36.7       -22.6
```

So **~81 ms of the 124 ms Create gap against React is the per-row component** — roughly 81 us per
instance for an LView/TView, a DI scope, two `EventEmitter`s and two getters. That is Angular's own
machinery and an app author's choice, not something the adapter can remove; do not read 307.2
against React's 264.7, because React's row is a component too.

**The measurement's real payoff was the OTHER half, which is ours.** `Clear` fell only to 36.7 ms
against a 0.2 ms engine window, so the engine was doing nothing and something in the adapter was
doing a lot. It was `dlog` ARGUMENTS: nine sites on the renderer's hot paths built a template
string on every `createElement`, `appendChild`, `insertBefore`, `removeChild` and `setValue` in a
Release build that emits none of them, plus one closure allocated per removed node. No other
adapter's renderer logs on those paths at all. Gated behind `isDebug()`:

```
              before gates   after gates    delta
Create            388.4        367.2       -5.5%     1.47x React -> 1.39x
Replace           501.5        460.2       -8.2%
Append            490.9        438.2      -10.7%
Clear              59.3         44.2      -25.5%
```

No single row carries a verdict (the ~4% floor, and this table's own note that Clear has drifted 6x
with no code change), but four rows moved the same direction with every counter byte-identical.
Mechanism and why the guard has to be a SOURCE assertion: `symbiote-perf-measurement`, "A `dlog`
ARGUMENT is not gated".

**Vue and Solid re-measured on the 10-node row 2026-09-02, so all five adapters are finally on one
ruler.** Both read `createNode 10000` and `PROP KEYS 44001`, identical to stock's workload. Their
earlier columns in the table at the top of this section were taken on the NINE-node row and are
superseded; do not read 180.0 / 176.9 against anything here.

```
              stock    solid   svelte      vue    react  angular      ratio = ours / stock
Create        257.3    195.7    205.0    228.7    264.7    367.2      0.76 0.80 0.89 1.03 1.43
Replace       256.3    229.3    214.0    238.1    266.3    460.2      0.89 0.83 0.93 1.04 1.80
Append        415.0    204.3    223.1    229.0    390.2    438.2      0.49 0.54 0.55 0.94 1.06
Partial        33.6     11.8     15.4     19.2     26.1     39.1      0.35 0.46 0.57 0.78 1.16
Remove        121.4     10.4      8.6     10.1     98.6     18.3      0.09 0.07 0.08 0.81 0.15
Swap            9.6      6.1      8.4      8.7     35.3     18.4      0.64 0.88 0.91 3.68 1.92
Select          7.3      5.5     14.7      8.4      7.9     10.5      0.75 2.01 1.15 1.08 1.44
Clear          10.7      9.1     12.6     14.1      8.7     44.2      0.85 1.18 1.32 0.81 4.13
```

**Solid is under stock on ALL EIGHT rows** — the first adapter to clear that bar outright. Svelte
and Vue take six of eight, losing only `Select` and `Clear`, both small-ms rows. This table is what
the README's "How Fast, Against Stock React Native" section publishes.

**One lead falls out of the engine counters and is not chased yet.** For the identical tree and a
byte-identical Fabric payload, `WRITES` on Create reads solid 15001/0 · vue 15003/2 · **angular
17002/0** · react 17037/16000. Angular emits 2 000 more prop writes than Solid — two per row — and
by the benchmark screen's own note a `WRITES` that differs between adapters is work the ADAPTER is
generating, not a cost of the platform. That is the next thing to enumerate on Angular, after the
per-row component (~81 us/instance, not ours) and the `dlog` arguments (fixed).

**Node CREATION was the one axis every adapter lost, and as of 2026-08-23 it is no longer that.**
Host-primitive lowering closed it, on all three adapters that can be lowered. Against stock's
stable bands, ALL THREE now beat it on a create-shaped row: Svelte Create 0.78-0.82x / Append
0.56-0.58x, Solid 0.86x / 0.60x, Vue 0.92-0.96x / 0.64x. React and Angular still trail 1.17x and
2.2x — neither had been lowered WHEN THIS TABLE WAS TAKEN; Angular's View/Text lowering landed
2026-08-31 and is not in these numbers. React cannot be lowered the same way (no build-time analysis; host
and composite are both fibers). Everything that mutates an already-mounted tree continued to tie
or win throughout.

**As of 2026-08-23 a `:active` CSS rule is an OPTIMIZATION, not a precondition.** A functional
`style={({pressed}) => …}` — the idiom this ecosystem actually writes — now lowers too: the
transform wraps the style expression ONCE in a runtime helper that calls the RESULT once per
state, and the engine takes the pressed one as `activeStyle` (slot 1 while pressed). So the
developer keeps the ternary and gets the lowering. The CSS route stays cheaper (no call per render)
and is still the right answer for a shared look, but nobody has to rewrite anything to be fast.

What comes with it is a REQUIREMENT ON THE OUTPUT, not a restriction on the input —
`REFUSAL_CATEGORIES.emitStyleExpressionOnce`. It was briefly written the other way: a transform that
prints the guard inline (`typeof f === 'function' ? f({pressed}) : f`) repeats the expression, so
`style={getStyle()}` runs the author's call once per copy per recompute, and the fix proposed was to
REFUSE `getStyle()` / `bag[i]` / `flag ? a : b`. Wrong level — Svelte wraps once and lowers all
three correctly, so a shared refusal would have cost the correct adapter real coverage to protect
against another's emit. Assert `occurrences(out, expr) === 1` on the emitted text instead. The only
contract left on the author is that the callback be PURE in `pressed`: its result is invoked twice
under any emission.

Read every ratio here as an UPPER BOUND, and the two sentences belong together: the benchmark row
never reads `pressed`, so all of its Pressables lower, while a real screen has some that refuse.

**And count INSTANTIATIONS, not call sites — the two disagree, and by call site the answer flatters
you.** Measured on `examples/vue-sfc`: 10 of 13 call sites lower, i.e. 77%, which reads as almost
solved. But one of the three refusals is `ActionButton`, and it is instantiated **90 times** in that
app — so the refusing side dominates the node count while the lowering side dominates the file
count. `examples/svelte` recounted the same way went the OTHER direction — 8 of 10 call sites became 96 of
98 instantiations (98%), because its dominant component is `ActionButton` at 83 uses and that one
had just been migrated to `:active`. So the instantiation figure is not a pessimism correction, it
is simply the comparable one; quote it, and count static mount sites weighted by reuse rather than
runtime multiplicity (`BenchmarkRow`'s 1 000 runtime rows would read 2096/2098 and measure the
benchmark, not the app). Migrating
those to an `:active` CSS rule is what turns the bound into the number — see
`symbiote-perf-measurement`, "A lowering ratio measured on the benchmark row is an UPPER BOUND".
This is the one hot path to attack, and it is also the metric every reader looks at first.

`Remove` 108.6 / 83.7 / 7.5 is the thesis showing up as a number, not an engine win: removing one
row of a thousand costs React a walk over a thousand fibers regardless of the host mutations it
emits — stock pays that plus persistent-mode cloning, our React adapter pays the same walk (hence
the twin numbers), and Vue/Svelte/Solid walk nothing and emit one `removeChild`. **Solid on RN
updates a list an order of magnitude faster than RN does.**

**The small-ms rows do not reproduce, and the run-to-run spread is the first thing to check before
believing any verdict on them.** Two Release runs of UNCHANGED stock code, same simulator, same
day: Clear 46.7 → 7.7, Swap 7.1 → 13.3, Remove 94.6 → 108.6, while Create moved only 179.7 → 186.8
(+4%). So Create / Replace / Append carry a verdict and Clear does not — the earlier "every adapter
WINS Clear" reading came from a single stock sample and is withdrawn. Take the ~4% Create drift as
the noise floor for anything quoted off this table.

Two things this table must not be used for. **Never benchmark adapters in a Debug build**: the same
Create comparison read 13% FASTER in Debug and is 30% SLOWER in Release — the sign flipped on the
headline metric, because Debug inflates JS-bound and native-bound work by different factors. And
the **virtualized column compares RN's own `FlatList` against our port of it** — two
implementations, not two renderers; all-mounted is the clean cross-renderer read.

**A headless bench win does not transfer at face value to a native-bound path.** The engine's
payload-building JS was cut ~1.4x headless (2026-08-23: `Object.keys` over `Object.entries`, no
style copy, style resolution memoized on object identity, `dlog` blocks gated); on device that
landed as ~1.06x, because `installFabric()` stubs the native side to zero and our JS is only ~24%
of a real create. It did shrink the react↔stock Create gap 53.2 → 31.0 ms. Full arithmetic:
`symbiote-perf-measurement`, "The create-path pass".

**React re-measured against stock on 2026-09-01, and the table's React column above is SUPERSEDED
— it was taken on a different row.** Both sides now build the 10-node row (the 2026-09-01
consolidation added an unconditional `TextInput`), which is the whole reason the numbers can be
read at all. iOS 26.5 simulator, Release, 1 000 rows, all-mounted:

```
              stock    react           node counts finally agree
Create        257.3    264.7   1.03x   createNode 10001 vs 10000 (the one is the container)
Replace       256.3    266.3   1.04x   PROP KEYS  87001 vs 44001 — our payload is half
Append        415.0    390.2   0.94x
Partial        33.6     26.1   0.78x
Remove        121.4     98.6   0.81x
Clear          10.7      8.7   0.81x
Select          7.3      7.9   1.08x
Swap            9.6     35.3   3.68x   the standing React anomaly, unchanged
```

So React is at PARITY with stock on the create-shaped rows — `Create` and `Replace` sit inside the
~4% floor, so neither is a win — and ahead on everything that mutates a mounted tree except `Swap`.
`Clear` and `Select` are small-ms rows and carry no verdict without a repeat.

**The first run of this pair reported React at 1.31x and it was an artifact worth not repeating.**
Stock had not been rebuilt after the row gained its `TextInput`, so it was measuring NINE nodes
against our ten — `createNode` 9001 vs 10000, `PROP KEYS` 62001 vs 44001. Two columns whose node
counts differ by a whole element are not two stacks measured on one workload, and the 1.31x was
that missing element. The cheap check that caught it is the one this file already prescribes for
Angular: read `createNode` and the prop-key count BEFORE reading any ms. A headless census of the
row (`RCTView`×3, `RCTText`×3, `RCTRawText`×3, `RCTSinglelineTextInputView`) then said ten, which
located the deficit on the stock side rather than ours.

**No attribution to the tag change.** `View`/`Text` became intrinsic tags the same day
(`.claude/rules/capitalized-intrinsic-tag-feasibility.md`), and this pair carries no before-arm —
building one was considered and deliberately skipped, since what the project needs from this row is
the comparison against stock and identical behaviour, not a per-change ledger. So the parity above
is the state of the adapter on 2026-09-01 and is NOT evidence that removing the wrappers produced
it.

**Svelte re-measured against stock on 2026-09-01, and its column in the table above is SUPERSEDED —
it was taken on a different row.** Both sides now build the 10-node row. iOS 26.5 simulator, Release,
1 000 rows, all-mounted:

```
              stock   svelte           trees agree: createNode 10001 vs 10000 (the one is the container)
Create        257.3   205.0   0.80x    PROP KEYS 87001 vs 43001 — our payload is half
Replace       256.3   214.0   0.84x
Append        415.0   223.1   0.54x
Partial        33.6    15.4   0.46x
Remove        121.4     8.6   0.07x    the thesis as a number: stock walks 1 000 fibers, we emit one removeChild
Swap            9.6     8.4   0.88x    tie
Clear          10.7    12.6   1.18x    small-ms row, no verdict without a repeat
Select          7.3    14.7   2.01x    the ONE loss
```

**Do not read this against the table's 154.1 / 207.2 / 163.0 — that row had NINE nodes.** Svelte's
row gained the unconditional `TextInput` (createNode 9000 -> 10000, PROP KEYS 32001 -> 43001), so
154.1 -> 205.0 is +50 ms for a thousand extra nodes and eleven thousand extra prop keys, not a
regression. Same artifact that made React's first 2026-09-01 run read 1.31x. Read `createNode` and
the prop-key count BEFORE any ms.

**Select is the one real finding and it attributes immediately to the adapter, not the engine.**
`WRITES 2/0`, `VISITED 1078`, reconcile window **1.6 ms** against 14.7 ms wall — so ~13 ms sit in
pass 1, inside Svelte's own reactivity. Compare Solid's Select before its class guard (window
10.3 ms beside a 500x write drop): there the counters moved and the cause was the engine. Here the
counters are clean, so the cause is above it.

Open work, priority order, and the per-adapter detail (React is an outlier three times over —
`Swap`, `Remove`, and the whole virtualized column — against its own siblings on the same engine):
`symbiote-perf-measurement`, "The stock-React-Native baseline".

### Headless measurement runs on `build-release`, and the assert build's SHAPE is wrong

```
pnpm run test:itest    # correctness — asserts ON, the reason this harness exists
pnpm run bench:itest   # timings — NDEBUG + -O, with RN_ENABLE_DEBUG_STRING_CONVERTIBLE kept ON
```

That `core/engine/cpp/tests/build` is Debug with no `-O` was already known and already caveated. What
was not: `NDEBUG` off also defines `REACT_NATIVE_DEBUG` (`ReactCommon/react/debug/flags.h`), and that
compiles `ensureYogaChildrenLookFine` + `ensureYogaChildrenAlignment` into
`YogaLayoutableShadowNode::appendChild` — each walks the parent's whole child list, so building an
N-child list one append at a time is **O(N²) there and O(N) in the build that ships**. Measured
2026-09-17: 10 000 appends onto one parent, 3 554 ms on the assert build against 27 ms optimized.

It put `materialize` at 61% of a create when it is ~27%, and reported an O(N²) in list width that
does not exist off the harness. **A number whose ORDER is right and whose SHAPE is wrong survives
review**, which is what makes this worse than no number. Both readings were published before the
second build existed.

### A create, fully attributed (10 003 nodes, `build-release`, 2026-09-17)

```
fill    24   ours, JS      prop writes 12 · appendChild 5 · creates 6
apply   16   ours, C++     decode 4 · setProp 1.5 · structure 1.2 · rawtext ~3 · op loop ~6
commit  34                 materialize 24 (of which UIManager::createNode 17) + Fabric commit 8.5
total   74                 0.90x of a bare-`nativeFabricUIManager` driver doing nothing else
```

The floor arm is `core/engine/cpp/tests/js/raw-fabric-vs-engine.itest.ts`: the same tree built
through `createNode`/`appendChild`/`completeRoot` with no retained tree, no diff, no buffer. It sits
BELOW React's own renderer, which still runs a fiber tree and builds every payload through
`ReactNativeAttributePayload` — so "are we worse at driving Fabric than React" is answered a
fortiori, and the answer is no.

### One visual selection, two spellings, 6.5x apart — and nothing in the app can see it

`canReplaceInPlace` refuses a clone that is not layout-clean (F-51), so whether a selected style
keeps the row's layout properties decides whether the commit rewrites one slot or hands Fabric the
whole child list. Measured on a standing 1 000-row list
(`core/engine/cpp/tests/js/update-shapes-cost.itest.ts`):

```
                          wall    walk   Fabric   layout   targetedReplaces
paint-only selection       0.4     0.2      0.0      0.0          2
drops one paddingLeft      2.6     0.9      1.5      1.4          0
```

Both paint the same screen. **Write a selected style as the base style plus the paint properties, not
as its own object** — an independently written selected style drops the fast path by omitting a
padding, silently. The engine is not wrong here and there is nothing to fix in it: a genuine layout
change must re-measure. The cost is the authoring spelling, and it is invisible to every other test.

Update shapes otherwise behave: a select clones 3 nodes and reuses 1 003, a partial update of every
tenth row clones 302, `clear` walks 0.1 ms. The expensive update is `append` (73 ms for 1 000 rows
onto a standing 1 000), and it is create-shaped — 10 000 `createNode`s plus a Yoga pass over 2 000
rows.

### The reconciler is 40% of a React create, and it is React's — measured, not assumed

Every headless number above builds the tree by calling the engine's own mutation API. The layer above
it had never been measured here, which matters because the engine is already BELOW the floor of a
zero-cost driver — so a create that got slower cannot have got slower there.
`core/engine/cpp/tests/js/adapter-create-cost.itest.tsx` builds the identical ten-node row both ways
in one process and asserts the committed node counts match before reading any millisecond:

```
engine's mutation API directly    67-75 ms      walk 24-28   apply 43-49
the same tree through React      115-120 ms     walk 23      apply 43
delta                             45-48 ms      1.6-1.7x
```

**The engine's own two phases do not move between the arms** — same tree, same work, and that is
asserted rather than observed. The 45-48 ms is fibers, and ~4.8 us per node of it. So for the React
adapter, engine work is 58% of a create and further engine optimization has a hard ceiling; for
Vue/Svelte/Solid, whose reconcilers are far lighter, the same engine is most of the cost, which is
why those three beat stock on create-shaped rows and React sits at parity with it.

One hypothesis was checked and is a NEGATIVE result, recorded so it is not rebuilt: `foldHostBag`
copies the props bag to seed an absent default, so every `<Text>` that does not spell
`allowFontScaling` — which is nearly all of them — allocates a copy. Three thousand of them on this
screen cost 0.8-5.4 ms of ~116, inside the spread of the arm it is compared against.

### A fold is charged for EXISTING, not for what it does — the one that did nothing cost 10.7 us/node

Four tag rules priced on one ruler, `build-release`, three runs, a thousand nodes per commit
(`core/engine/cpp/tests/js/tag-rule-cost.itest.ts` — both arms the same tree in the same process,
payloads asserted equal key by key before any millisecond is read):

```
             native walk   js walk    per node   the bag / what the rule does
 content        2.8         11.1        8.6 us   3 + a 2-key style / READS ITS PARENT
 imagebg        2.9         12.2        9.7 us   2 + a 3-key style / writes ONE key
 spinner        3.8         14.6       10.7 us   4, no style / the MOST work in the file
 accessory      3.4         14.8       11.4 us   4 / nothing at all
 button         4.1         16.8       12.4 us   5 + a 2-key style
 pressable      3.7         17.8       14.8 us   4 + a 3-key style
 scroll         4.2         19.1       15.4 us   4 + a 2-key style / the BIGGEST rule
 switch         4.8         23.9       19.6 us   6 + nested trackColor
 image          5.9         27.6       22.9 us   6 + what the rule BUILDS
 bgimage        7.5         36.9       30.6 us   6 + a 3-part style / TWO rules, READS ITS PARENT
```

`scroll` is the fourth point on the experiment and the one that closes it: its rule is the biggest in
the file — compose a base style, default a flag, strip the axis, resolve an asymmetric pair, erase two
keys, map a word to a friction constant — and it lands mid-table beside `pressable`, whose rule does
far less over a bag of the same size.

**The top three rows are a deliberate experiment, not three ports that happened to be cheap.** Their
rules do, in order: almost nothing (one key written), the most work in the file (builds a style
object, resolves a size two ways, writes two defaults, picks a colour), and literally nothing at all.
They land within 1.4 us of each other.

So the cost model for a fold is **bag in, bag out, body free** — the column orders by what has to be
marshalled, with the dearest row dear because its rule CREATES keys that then travel back. Two
consequences worth keeping: a trivial fold over a large bag is the worst value available, and
DELETING a fold that does nothing is worth as much as porting one that does a lot.

### A rule may read its PARENT — `ownerProps`, and "a per-node rule cannot reach another node" was wrong

Three iterations of this migration recorded that ScrollView's content fold, ImageBackground's image
fold and the two clone-folds must stay in JS because "a per-node rule cannot reach another node".
That was true of the JS FOLD shape and false of the engine: **the tree lives in C++, so a node
already knows its parent.** `fabricProps` now takes `ownerProps` from `node.parent`, and a rule that
is DERIVED from the node above reads it there.

ScrollView's content rule is the first user, which takes the whole primitive to **zero crossings on
both nodes**. Its two halves are why it was the right one: the row direction is a constant of the
content node's OWN tag (portable all along), and `collapsableChildren` comes from
`maintainVisibleContentPosition` / `snapToAlignment`, which stay on the scroller.

**The boundary did not move, only the reading of it.** A rule may read the parent's PROPS —
declarative, present at commit time. It still cannot read live JS state (`stickyFold`'s
`translateY`), an owned LISTENER (`focusable`'s `onPress !== undefined`, which lives in the stash and
in no bag), or anything a framework computes per render. That is the browser model's own line: a UA
rule sees the tree, not the application's closures.

**Reading a parent costs nothing measurable** — `content` has the CHEAPEST native walk in the cost
table (2.8 ms) while being the first rule that does it. A pointer hop on a tree already in memory,
against a JS closure plus a crossing for as long as the fold lived on the far side.

**ImageBackground's inner image is the SECOND user, and the pair settles what `content` alone could
not.** `content` reads its owner while doing almost nothing, so its cheapest-of-nine walk could have
been the rule's smallness rather than the read's cheapness. `bgimage` puts the same read inside the
most expensive rule in the file — its tag runs `foldImageProps` AND `foldImageBackgroundImageProps`,
so it carries image's whole bag plus a three-part composed style, and it is the dearest row at
30.6 us/node. Subtract the two native walks and the read isolates: **`bgimage` 7.5 minus `image` 5.9
is ~1.4 us per node for the parent read plus the style it builds.** Cheap whatever surrounds it.

That takes the primitive to **zero crossings on both nodes** — the owner shed its fold when the Smart
Invert opt-out moved, and the image was the last one. It also needed a TAG of its own
(`image-background-image`, served by `usesImageRule` as well), because a bare `<image>` must not get
an absolute fill; and that tag needs its own registration carrying `resolvesImageSources`, since the
flag is looked up by tag and without it an ImageBackground would commit the raw asset NUMBER.

One failure mode is new and has its own case on both users: a rule that reads its parent runs when
THIS node is dirty, so a late write to the owner must mark the child dirty or the rule never re-reads
it — here the box would freeze at its first size while the background visibly resizes around it.
`slotDerived` already named the props, so it worked, and it worked for the JS fold for the same
reason. The seam did not change the requirement; nothing said so out loud until it was asserted.
**Verified by breaking it** — commenting out `slotDerived` turns both re-derive cases red.

### A mirror that cannot be removed is made LOUD — the scroll base style, held by a test

`SCROLL_VIEW_BASE_{VERTICAL,HORIZONTAL}` exists in C++ (`foldScrollViewProps`) AND in JS
(`render-scroll-view.ts`), and both are needed. Android's RefreshControl path does not go through the
rule: RN wraps the scroll view and splits the app's style across two boxes with the base composed
onto BOTH (`ScrollView.js:1854-1863` — "the ScrollView still needs the baseStyle to be scrollable").
That split reads the OWNER's style from the WRAPPER's fold, one node reading another, so it is
composition and stays in JS — which needs the value.

`core/engine/cpp/tests/js/scroll-view-base-parity.itest.ts` commits a scroll view of each axis and
compares the committed payload against the JS objects key by key. It works because the itest harness
sees both sides in one process. **Verified by breaking it on purpose** — flipping the C++ `flexGrow`
to 2 turned both rows red naming the key, then reverted. A guard that has never failed is one you are
only hoping works.

Without it the two paths diverge only on an Android device with a RefreshControl attached, which is
the narrowest possible place to find out.

### A test that "flakes" in the full run and passes alone — read the walk before blaming the build

`load-time-registration.test.ts` failed intermittently and was dismissed as a stale-build artifact
TWICE in one session before anyone looked. It is a real race, and a repo-shaped one: the audit walks
`adapters/`, and the Svelte suites write a `.smoke-compiled-*.mjs` beside their own source and
`rmSync` it in an `afterAll` — dozens of them, by design. `readdirSync` followed by a separate
`statSync` leaves a window where one of those vanishes in between, and `statSync` throws ENOENT on an
entry the walk was about to discard for its extension anyway.

Fixed with `readdirSync(dir, { withFileTypes: true })`: the type comes from the SAME syscall, so the
window does not exist rather than being caught. One syscall cheaper per entry, too.

The general form is the part worth keeping: **a failure with no assertion in the message is not
evidence of flakiness, it is evidence that something threw** — and "passes alone, fails in parallel"
points at shared filesystem state, not at a build.

### The engine can WARN now — `SymbioteDebug.h`, and it was ScrollView's blocker

Until 2026-09-18 the only channel out of `core/engine/cpp` was `throw jsi::JSError`: a rule could
CRASH or stay SILENT, nothing between. That is a gap the moment the commit path, the payload builder
and every tag rule live there, because `<keep_logs_gate_behind_DEBUG>` asks new code to log at its
seam as a matter of course — unsatisfiable on that side of the wire.

It became concrete rather than tidy when ScrollView's rule came up for porting: it carries a
developer WARNING (a `horizontal` prop written on the vertical tag is ignored), so moving it as
written would have DELETED a diagnostic, which the same rule forbids.

```
SYMBIOTE_DLOG(expr)     guards BEFORE evaluating, so building the message is free when off
symbiote::debugLog      "[symbiote] …" to stderr, and RETAINED while the switch is on
takeNativeDebugLog()    drains them in JS — what makes a log assertable instead of merely visible
setNativeDebug(bool)    the later toggle; `installBindings` already read DEBUG=1 / __SYMBIOTE_DEBUG__
```

**The macro is the contract, not the function.** C++ has exactly the trap `debug.ts`'s header
describes for JS — an argument is evaluated at the call site — so a bare `debugLog("x " + y)` on the
per-node commit path pays its concatenation with nothing listening. `SYMBIOTE_DLOG` tests the flag
first, which makes the cheap thing the DEFAULT instead of a rule every call site must remember.

**The lines are retained because a diagnostic nobody can assert on is one that rots.** That is what
turns "the engine warned about that" into a test (`native-debug-log.itest.ts`) rather than a human
noticing a line scroll past. Retention costs nothing while the switch is off, because nothing is
called at all.

With that in place ScrollView's `ownerFold` moved whole: the base style composition,
`nestedScrollEnabled`, the `horizontal` strip, the asymmetric bounce pair, the two ViewConfig-less
strips and `decelerationRate`. Two consequences worth keeping:

- **`decelerationRate`'s constants are `#ifdef ANDROID`**, because on iOS BOTH scroll tags resolve to
  `RCTScrollView` — a component name cannot tell iOS-vertical from Android-vertical the way it tells
  `Switch` from `AndroidSwitch`. Android's pair is outside headless reach, like `android_ripple`.
- **Android's wrap path stopped delegating.** `wrappedOwnerFold` used to call `ownerFold` and then
  replace `style`; it now does only the split, and reads `propOf(owner, 'style')` because the engine's
  rule has already replaced the bag's `style` with `[base, authored]` — Trap A, the same correction
  the touchables and Button needed. A whole CLASS of bug went with it: the wrap used to swap the
  owner's fold out, so anything the ordinary fold did had to be repeated in the wrapped copy, and
  `decelerationRate` once was not — it reached Fabric as the string `'fast'` on every Android
  ScrollView carrying a RefreshControl. A rule that runs off the TAG cannot be swapped out.

This was the largest test migration of the port — 27 vitest cases across 12 files — and most of them
had a deliberate negative CONTROL beside them ("invents no key on the vertical tag", "honours an
explicit false", "lets an explicit value win"). **Every one of those controls went on passing after
the rule left**, because an absent key and an untouched passthrough are exactly what a harness with
no rule produces. They moved as pairs: a control only controls beside the thing it controls.

`input-accessory-view`'s fold took the bag apart and reassembled it unchanged, so the port DELETED
it rather than moving it — and it still cost 10.7 us per node to have had. Read down the column and
the price tracks BAG SIZE, not rule complexity. **So the worst value available is a trivial fold
over a large bag**, which inverts the intuition that a cheap-looking fold is cheap.

Two holes the vendor read turned up beside the port, both fixed in the same commit: TouchableHighlight
never folded `disabled` into `accessibilityState` (`TouchableHighlight.js:311-319`), so a disabled
highlight announced itself to a screen reader as enabled; and neither touchable stripped the six
props its feedback machine consumes (`activeOpacity`, `underlayColor`, `onShowUnderlay`,
`onHideUnderlay`, `delayPressIn`, `delayPressOut`), two of them FUNCTIONS, all forwarded to a native
view that declares none of them.

`id` -> `nativeID` is now ONE rule (`foldIdAlias`) applied to every TAGGED node instead of five JS
copies. It cannot reach a third-party view — that was the objection that kept it duplicated — because
`tagName` is written only by `attachHostBehavior`, so it is non-empty for our own primitives and
nothing else.

**The corollary bit the measurement before it bit anything else: a node built with a tag NOBODY
registered carries an EMPTY `tagName`, so no rule fires.** `recordSetTag` is emitted by
`attachHostBehavior` and by nothing else. The new `button` arm was written without a registration
and measured a native side doing no work at all; what caught it was `expectSamePayload` refusing to
time two arms that disagree, not a suspiciously good number. Any bare-tag fixture needs a stub
behavior registered or it measures nothing.

### A derived node's tag never reached C++ — and ActivityIndicator is the first primitive at ZERO folds

`recordSetTag` is emitted by `attachHostBehavior` and by nothing else, so a tag crosses only when JS
has a BEHAVIOR registered for it. ActivityIndicator's spinner is built by its owner's
`buildStructure` and named by no app: it had a tag, had platform semantics, and carried an empty
`tagName` in the host, so no rule could fire for it however the rule was written.

The fix is a **registration with no runtime** — `registerHostBehavior('activity-indicator-spinner',
{attach(){}, detach(){}})`. That is not a trick to smuggle a tag across: a registration is how this
codebase declares a tag HAS platform semantics, which is exactly the claim being made. Emitting the
tag from `createElement` for every node was the alternative and stays rejected for the reason
`attachHostBehavior` already gives — an app's own `<div>`-equivalent would pay an intern and an op to
name something the host has no rule for.

With that, **both** of the primitive's folds moved (`foldActivityIndicatorProps`,
`foldActivityIndicatorSpinnerProps`) and it is the first two-node primitive to reach **zero crossings
per commit** rather than merely moving work out of one. Every other port so far left a JS fold
standing for the half that reads a node, an owner or live state.

Four JS constants went with them (the two size boxes, the default size, the centering style) and a
whole vitest file lost most of its cases — **including ones that were still GREEN**. "OMITS colour
entirely on the theme default" passed after the port for the wrong reason: the key is absent because
no rule ran at all, not because Android's half omitted it. An absence assertion on a harness that can
no longer produce the key passes forever and means nothing, so cases whose subject was a fold move as
a GROUP with their positive twins, not one failing case at a time.

### A `<Button>` costs FOUR crossings per commit — the most expensive primitive we ship

Pinned in `core/engine/cpp/tests/js/button-payload.itest.ts`: one JS fold per node the behavior
builds — the owner, the iOS wrapper view, the text, and the raw label. At the per-node figures above
that is ~50 us per button per commit, so a screen holding fifty of them pays about 3 ms of pure
marshalling every commit they are dirty in.

Porting Button's own rules (`accessibilityRole`, the `importantForAccessibility` promotion, the
`touchSoundDisabled` rename, the `color` strip) did NOT move that count and the test says so: what
moved is the work inside the owner's trip. The owner's fold survives for `focusable` (an owned
listener, invisible to a props-only rule) and the Android view style; the other three hang on DERIVED
nodes, and a raw text carries no tag at all, so there is nothing for a tag-keyed rule to key on.
**Eliminating those three is the largest single crossing win left in the engine, and it needs a seam
that does not exist yet** — derived nodes have no tag.

Two JS functions were deleted outright rather than left behind: `BUTTON_ACCESSIBILITY_ROLE` and
`resolveButtonImportantForAccessibility` had no caller after the port except their own unit test.
That is the mirror shape to watch for — a JS copy of a rule that runs elsewhere, kept alive by the
test asserting it, green forever and meaning nothing.

### A `payloadFold` costs ~17 us per node PER COMMIT, and it is billed inside the C++ walk

Running the same fixture through Vue put its delta at 54.7 ms against React's 49.0 — on an identical
tree with byte-identical node counters, which should have made Vue the CHEAPER arm, its reconciler
being far lighter than fibers. Splitting the walk's `props` phase found the whole gap in one place:

```
react   props= 1.4   foldLookup=2.9   folds=0
vue     props=18.4   foldLookup=3.3   folds=1000
```

One node per row carries a `payloadFold` on Vue and none does on React. It is the `text-input`,
whose host behavior declares `foldPayload`; Vue reaches the behavior because `text-input` is a tag
resolved through `descriptorFor`, while React's adapter renders its own React component and attaches
nothing. 17 ms for a thousand folds.

**What a fold costs is the TRIP, not the function.** `fabricProps` converts the whole props bag to a
`jsi::Value`, calls into JS, and converts the result back — for a fold that rewrites two keys. And
`foldProbe` caches only the answer NO, so a node that folds pays this on every commit it is dirty in,
for the life of the screen.

That generalises past this fixture and past Vue, which is why it is here rather than in a Vue note:
**every lowered primitive is a host behavior.** A thousand-row screen with two lowered `Pressable`s
would pay this twice per row if those behaviors declared a fold. So read `foldsFound` before
attributing any per-adapter deficit — a fold count that differs between two adapters on one tree is
the difference, and nothing else in the walk has to be examined.

**Splitting the fold three ways says which part, and it is not the part it looks like:**

```
toJs = 1.6    call = 1.6    fromJs = 13.3
```

The SAME bag travels both directions — `foldPayload` returns `{ ...props, ...folded }` — and reading
it back costs eight times sending it and eight times the fold's own work. Sending is
`jsi::valueFromDynamic`, building an object out of a `folly::dynamic` the host already holds. Reading
back is `jsi::dynamicFromValue`: `getPropertyNames`, then per key `getValueAtIndex` + `getString` + a
`std::string` allocation + `getProperty` — the same per-key JSI walk `RawProps::parse` pays and
`mutation-buffer.ts`'s header describes. It is upstream's function; there is nothing to tune inside
it.

So the cost is not that a fold RUNS. It is that a fold's contract is **bag in, bag out**, so ~18 keys
come back to express a change to about five. **A fold that returned a PATCH would leave `toJs` and
`call` untouched and cut `fromJs` by the ratio of the bags — ~10 ms of the 18 measured here.**

**That was tried and pulled back the same hour, and the premise it rested on is worth not repeating.**
The plan was to merge the patch over the bag and call it backwards-compatible, since a whole-bag
return is a superset of the patch and merging a superset over its own base changes nothing — which
would let the ~14 fold sites convert one at a time. False: **a fold expresses a REMOVAL by not
putting the key back**, so replacing is load-bearing. Merge, and every stripped key returns. Button's
`ownerFold` strips `title` and `color`, `pressable` strips `MACHINE_ONLY_KEYS`, `text-input` strips
`ALIAS_ONLY_KEYS` — and a grep for `delete` finds only the last two, because the first drops them by
omission. The button tests caught it in one run. There is no safe subset to convert first.

The obvious removal channel is closed too: `jsi::dynamicFromValue` maps JS `null` AND JS `undefined`
onto the same `folly::dynamic` nullptr, so no value a key can hold distinguishes "drop this" from
"reset this to the platform default", and the second is a real instruction Fabric reads.

So the contract has to carry removal SEPARATELY — a two-slot return (`{ set, omit }`, unambiguous
through the conversion and cheap) or a static per-component omit list, which two of the three
strippers already have and Button does not. Whichever it is, **it lands in one commit across every
site**: a mixed contract silently drops props. And an opt-in flag per behavior does not rescue it —
the three folds that cost the most on device (`pressable`, `text-input`, Button's owner) are exactly
the three that strip keys, so the sites a partial migration could safely take are the ones worth
nothing. Full record, and the assertions that pin why replacing is load-bearing:
`core/engine/src/__tests__/payload-fold-merge.test.ts`.

**And the apply phase is ruled out as a second cause, which is what makes the fold the whole
remaining lever.** Splitting `applyOps`' own half three ways on the same fixture:

```
           ops   decode  setProp  convert  structure  publish  handles   decoded
 engine   19.3    4.0     1.3      0.4      1.2        2.4      1.6       7002
 react    23.3    5.9     1.6      0.7      2.5        3.8      2.3       7002
 vue      20.6    4.5     1.5      0.6      1.2        2.7      1.9       7002
```

`apply` is `walk` plus `ops` in all three, and `ops` barely moves between them — so Vue's 14 ms of
extra `apply` is entirely its walk, i.e. the fold again. **The books close on this fixture: React's
deficit against the direct arm is fibers, Vue's deficit against React is the fold.** The one residue
is React's `ops` running 4 ms over the direct arm for byte-identical op counts, which at ~20% of a
19 ms phase with allocation as the obvious suspect does not yet carry a hypothesis.

### React's `Swap` anomaly is not the engine, and the benchmark row's `memo` is why the first probe missed

`Swap` at 3.68x stock (35.3 against 9.6) is the largest unexplained loss in the device table and has
stood unchanged through every re-measurement. `core/engine/cpp/tests/js/adapter-swap-cost.itest.tsx`
exchanges two rows of a standing thousand through the React adapter, three ways:

```
 arm                  wall    engine    what the row hands React
 swap (plain)         76.0     3.3      ten thousand rebuilt elements
 hoisted              21.0     3.4      the same element objects, by identity
 memo                 24.5     2.4      a thousand rebuilt wrappers, every body bailing out
```

**The engine is ruled out, and by assertion rather than by the clock:** all three arms report
`created=0 cloned=2 reused=1000 targetedReplaces=1 setProps=0`, byte-identical to each other and to
what `update-shapes-cost.itest.ts` gets with no reconciler at all (1.8 ms for the whole step). Not one
prop write crosses. So ~22 ms of the comparable arm is React walking a thousand children to find the
two that moved.

**And the first arm was not the device's workload.** It read as the answer — 73% of a swap is the app
rebuilding elements it throws away — and both benchmark screens wrap their row in `memo`
(`examples/react/…:387`, `examples/bare-rn/…:395`), so neither pays it. Reading the OTHER side's
screen is what turned a comparison into two workloads wearing one name; the 55 ms split is real but
it is a fact about unmemoized lists, not about this row.

What stays open is the half this fixture cannot reach: both sides run the SAME reconciler, so the
9.6-vs-35.3 difference is what React does per fiber against a mutation-mode host config versus its
own persistent-mode one. Answering it needs React's own Fabric renderer standing up in this harness.

### Every headless React arm ever timed here ran the DEVELOPMENT React, and `bench:itest` now does not

`scripts/run-itests.mjs` pinned `__DEV__: true` and `NODE_ENV: "development"` for every run. That is
right for the correctness build — it is what keeps React Native's invariants and warnings armed, the
same reason the C++ side is Debug there — and it was applied to `build-release` too. `react/index.js`
picks `react.development.js` off `NODE_ENV`, so **every React arm in `core/engine/cpp/tests/js/` was
measured with validation and warnings on.** It is the JS twin of the mistake this file already
records for the native side ("never benchmark adapters in a Debug build; the sign of the headline
comparison flipped"), and it went unnoticed because nothing named it.

Fixed: the defines follow the build (`isBenchBuild`). The measured cost on the swap fixture is
**24.5 ms -> 20.6 ms, i.e. ~16% of that arm was development React** — so every reconciler delta this
directory has published carries a share of it, including the 45-48 ms attributed to fibers. Re-read
before quoting any of them.

It also blocked the stock arm outright, and silently: `ReactFabric-prod` sets React's internals up in
their production shape, a development `createElement` then calls `dispatcher.getOwner()` which
production does not carry, React catches the throw, retries three times, and reports it through RN's
error dialog into `console.error`. What the caller sees is a component that RAN and a surface holding
`RootView()`, empty, with no error anywhere — which reads as "components do not work here".

### React's own Fabric renderer LOADS headlessly — a stock baseline is now a build-out, not a question

Every stock comparison in this file is taken on a device because nothing here could run the other
side. `core/engine/cpp/tests/js/stock-renderer-probe.itest.tsx` settles the feasibility:
`ReactFabric-prod.js` imports and exposes `render` / `stopSurface` / `dispatchCommand`, and the
`nativeFabricUIManager` it drives is the same binding `raw-fabric-vs-engine.itest.ts` already uses.

**Neither wall was the expected one, and Flow was not a wall at all** — the itest runner already
strips it with Hermes' own parser. What actually failed:

1. 75x `The JSX syntax extension is not currently enabled`. Stripping Flow leaves JSX alone, and RN
   writes JSX in `.js` files that the loader handed esbuild as `js`. It reads as a Flow failure and
   is not one. Fixed by returning the `jsx` loader — strictly wider, since a `.js` file with no JSX
   parses identically either way.
2. Unresolvable dev modules and `.png` imports from LogBox, all behind
   `ReactNativePrivateInitializeCore` — RN's app bootstrap, required by the renderer on line 16 for
   its side effects. Stubbed to empty in the runner; a measurement that ran an app bootstrap would be
   measuring the bootstrap.

`ReactNativePrivateInterface`, the thing that was budgeted for, needed no stub: all twelve of the
renderer's uses resolved. **This is also the RN-port backlog's "step 0", which that section records
as never tried** — it is now tried, in the itest runner rather than in `vitest.config.ts`, and the
answer is that RN's Flow is not what blocks importing it.

**And RN's own view config for `RCTView` now resolves too — 194 `validAttributes`, the real one.**
That matters because `createAttributePayload` reads exactly that table, so a hand-written stand-in
would produce a different payload and the comparison would be measuring the stand-in. Reaching it
went five steps, each found by satisfying the previous and reading the next throw:

```
1. Can't find variable: global                  runner prelude, global = globalThis
2. __fbBatchedBridgeConfig is not set           an EMPTY bridge, so NativeModules can evaluate
                                                and every lookup misses cleanly
3. getEnforcing('SourceCode') not found         a turbomodule proxy answering to any name
4. Cannot destructure property 'screen'         getConstants() returning a screen shape
5. Platform_default.select is undefined         Metro's platform extensions, in the runner
```

Only the fifth was not a fake. `Libraries/Utilities/Platform.js` is a compatibility shim whose whole
body is `import Platform from './Platform'; export default Platform;`, relying on **Metro** resolving
`./Platform` to `Platform.ios.js`. esbuild has none, so it resolved the file to itself, the cycle
yielded `undefined`, and the throw named `BridgelessUIManager` — several modules from the cause.

**Platform extensions are OPT-IN per file (`// @symbiote-platform-extensions`), and the rest of the
suite paid to establish that.** Turned on for everything they broke 154 of 158 itests: the engine
imports RN's `processColor`, which imports `Platform`, and resolved properly `Platform.ios.js` wants
`NativePlatformConstantsIOS` → a native module → every bundle dies at import. Satisfying that
harness-wide would need a permissive `__turboModuleProxy`, and **the engine reads that global
itself** — so every itest asserting a module is absent would silently start finding one, which is
the trap `<native_module_name_is_platform_specific>` names.

**The latent fact underneath is worth carrying into the RN-port backlog:** in every itest bundle
without the directive, RN's `Platform` is `undefined`, and any upstream module that dereferences it
throws. Our colour path imports `processColor`, whose `Platform.OS === 'android'` check sits on a
branch our itests evidently never reach — on device they would. So "it imports and the tests pass"
is NOT evidence that an upstream module works headlessly; it may only mean the line that needs
`Platform` was never executed. Tier A's candidates should be checked against this specifically.

**AND IT RENDERS: `RootView(View())`, committed through `nativeFabricUIManager`.** React's own Fabric
renderer mounts a real view into the harness's surface, with RN's own view config and RN's own
`createAttributePayload` building the payload. **Every stock-vs-ours question in this file is now a
two-arm headless fixture rather than a simulator run** — starting with `Swap` at 3.68x, where both
sides run the same reconciler and the only difference left is mutation-mode against persistent-mode.

Two things the control caught, and both would have shipped as findings without it. **"render
returned" is not "a node committed"** — React schedules its work, so a clean return says only that
nothing threw; `flushTimers()` then `mounted()` is what settles it. And **the harness has exactly ONE
surface**, `kSurfaceId = 1` (`symbiote-host.h`), which every reader visits and no other: rendering
into a root tag of its own — the careful-looking choice, since the raw arm keeps its tags clear of
ours — committed into a surface nothing can read, and reported `RootView()` empty while `render` came
back perfectly clean.

### The headline metric, headless, on one ruler — and it lands on the device ratio

`core/engine/cpp/tests/js/stock-create-cost.itest.tsx` builds the same ten-node row a thousand times
through `ReactFabric-prod`. Census asserted by absolute count first (`View=3001 Paragraph=3000
RawText=3000 TextInput=1000`), then the clock:

```
 stock              85.9
 engine directly    67.3    0.78x
 our React          90.8    1.06x
 our Vue           109.4    1.27x     still carrying the 17 ms text-input fold
```

**The device says React 264.7 against stock 257.3, i.e. 1.03x; headless says 1.06x.** So the harness
reproduces the device ratio on the number everyone reads first, which is what a baseline is for — a
create-path change can now be judged before a simulator ever runs.

Read Vue's column with care: this fixture drives raw tags through `h()`, while the device's Vue is an
SFC with compile-time lowering and static-prop hoisting, so 1.27x here and 0.89x there are not the
same workload. What IS comparable is that its fold is still on the books.

And React's 90.8 is down from the ~120 this same fixture reported an hour earlier — that is the
development-React fix above paying out, at roughly a quarter of the arm.

### And the `Swap` anomaly reproduces headlessly: 2.42x, against 3.68x on device

`core/engine/cpp/tests/js/stock-swap-cost.itest.tsx` builds the same thousand memoized rows through
`ReactFabric-prod` and exchanges the same two. Census first, as always — `View=3001 Paragraph=3000
RawText=3000 TextInput=1000`, the ten-node row exactly:

```
 stock          8.5 ms      device says 9.6 — the harness lands on the real number
 our React     20.6 ms      engine 2.7 ms of it, `created=0 cloned=2 reused=1000 setProps=0`
 ratio         2.42x        device says 3.68x
```

Both sides run the SAME reconciler over the same tree, and the engine is 2.7 ms of our 20.6 — so the
remaining ~12 ms is the host config, mutation mode against React's own persistent mode, and it is
now bisectable without a simulator. A SEPARATE FILE per arm on purpose: the runner spawns a process
per file, which removes both the ~3%/arm contamination this directory has measured and the question
of whether two renderers can share the harness's single surface.

Three traps worth not re-paying. A failing stock render is **silent** (React retries, then reports
through RN's error dialog into `console.error`), so a swap measured against an empty tree reads
0.1 ms and passes every before/after comparison — the fixture captures `console.error` permanently
for that reason. The census must assert ABSOLUTE counts, not that before matches after: two empty
censuses match perfectly. And the shadow names are not the element names — `RCTText` commits as
`Paragraph`, its string child as `RawText`, `RCTSinglelineTextInputView` as `TextInput`.

**Split into render and move, the deficit is entirely the move — and our RENDER is faster than
stock's.** A re-render with the SAME order reconciles all thousand children, every one bailing out of
`memo`, and commits nothing:

```
                  re-render   swap    the move itself
 stock               3.5       5.9         2.4
 ours                1.8      19.9        18.1     engine 2.6 of it
```

**And the move does not track DISTANCE**: swapping rows 1 and 2 costs 20.8 ms against 19.9 for rows 1
and 998. Both move exactly two rows, so React's flag walk and our host-config calls are identical and
only the travel differs — which rules out the two obvious suspects, `getHostSibling`'s search in
React's mutation commit and the `std::vector::insert` tail shift `kOpInsertBefore` still pays. What
is left is a FIXED price that appears the moment any placement exists.

That looked like React's mutation-effect traversal — with no placement the parent's `subtreeFlags`
carry no `MutationMask` and React skips its thousand children outright, and one placement makes it
walk all of them, which persistent mode has no equivalent of. **The widening arm weakens it.** At
2 000 rows the swap costs 29.4 ms against 22.7, i.e. 1.29x for a 2x widening; the engine's own halves
did double (walk 0.9 → 2.0, apply 2.8 → 5.8) as a walk over twice the list must, and taking that out
leaves the JS above it at **1.19x**. A cost that came from walking the children would have doubled.

**What it is NOT is now most of the answer:**

```
 the engine            2.8 ms of 22.7, and it scales with the list as it should
 Fabric's own commit   fabric=0.8, layout=0.0 — the platform is not in this at all
 the render phase      1.9 ms, and faster than stock's 3.5
 a search or a shift   adjacent and distant swaps cost the same
 the child count       1.19x on a 2x widening, engine excluded
```

So ~18 ms is JS, above the engine, triggered by the existence of a placement, nearly flat in the list
size.

**One more bisection landed it without a profiler.** The host config's `insertBefore` was replaced by
an empty function, the arm re-run in the same sitting, then reverted:

```
 swap, as it is              23.3 ms    fabric 0.7  layout 0.0
 swap, insertBefore no-op    16.7 ms
 re-render, nothing moved     1.8 ms
```

**With our insertion removed entirely the swap still costs 16.7 ms against an idle 1.8** — so at
least ~15 ms is React's own mutation-mode commit, with a host config doing literally nothing, against
the 2.4 ms stock's persistent mode spends on the same move. That is the cost of `<M1 + M2>`'s
deliberate choice to drive React in MUTATION mode so R2 could not be skipped, and the engine cannot
remove it. **`Swap` is therefore React-adapter-specific by construction** — Vue/Svelte/Solid/Angular
emit their moves straight into the engine and the device table already shows them at 0.64-0.91x of
stock on that row.

The remaining ~6.6 ms is our insertion chain, and that split is NOT clean: with the no-op the
committed tree is wrong, so that arm's own commit differs (`fabric=9.2 layout=8.2` against 0.7/0.0).
Only the lower bound on React's share survives it — do not quote 6.6 as ours without an arm that
keeps the tree correct.

**And a direct counter has now confirmed the seed and priced it — pointing the opposite way from the
device figure that prompted the instrument.** `writesOfUnchanged` counts the `setProp` ops that leave
AFTER the JSI -> `folly::dynamic` conversion because the node already holds that value, so the
crossing was paid for nothing. It was added to chase the device benchmark's `WRITES 17037/16000` on
REACT. On this fixture's row:

```
 engine  unchanged=0        react  unchanged=0        vue  unchanged=6000
```

Six thousand is 3 000 text nodes times two, i.e. `seedTextDefaults` exactly: the renderer writes
`ellipsizeMode` and `allowFontScaling` on every text node at `createElement`, the app then authors
the same two, and each one crosses, converts and is dropped. **6 000 wasted crossings per 1 000-row
create**, on Vue, Angular and Solid alike (all three seed; React folds instead). The device's React
figure is about the device's row, which authors props the fold already supplies — do not conflate
them.

**Fixed the same day, and NOT with another `payloadFold`** — one of those costs ~17 us per node per
commit, worse than what it saves. RN's text defaults are the PLATFORM's semantics rather than any
adapter's, so the rule now lives in the payload builder beside the component-keyed folds already
there: `applyTextDefaults` in `core/engine/src/fabric-props.ts` and its twin in
`SymbioteFabricProps.cpp`, with `seedTextDefaults` deleted from Vue, Angular and Solid.
`writesOfUnchanged` on Vue's arm went **6 000 → 0**, and `setProps` held at 13 003 — the accepted
writes are the same ones, six thousand seed ops simply stopped being emitted for the app to overwrite.
Wall moved 121-130 → 116.6, which is at the edge of this fixture's spread and carries no verdict on
its own; the counter does.

**The counter is now a guard, not just a readout.** `update-shapes-cost.itest.ts` drives the engine's
own mutation API with no reconciler above it and asserts `writesOfUnchanged === 0` and
`deletesOfAbsent === 0` on every shape — select, partial, swap, remove, append, clear. That zero is
what makes a non-zero on an ADAPTER's arm attributable to the adapter rather than to the engine,
which is exactly how the seed was found and priced.

**Pointed at the commonest shape a real app makes, it found nothing — and that is the useful answer.**
A parent's state moves and a thousand UNMEMOIZED rows re-render, writing back exactly what they
already had (`adapter-swap-cost.itest.tsx`, the no-op arm): `setProps=0 unchanged=0 cloned=0`. React
diffs props itself and never reaches `commitUpdate` when they compare equal, so **nothing crosses the
boundary at all** — the whole 27.3 ms is React re-rendering a thousand rows the app chose not to
memoize. Both counts are asserted, because a regression that made the adapter write unconditionally
would leave the tree, the payload and the wall clock looking identical.

Two things that came with it. The adapters keep their clear-back-to-`undefined` path (a framework
that clears a prop it set must get the default BACK, and that is off the create path by its own
comment) — only the create-time seed is gone. And two tests had to move from `.props` to the
PAYLOAD, which is what they were always trying to assert: `adapters/solid/src/
renderer-defaults-fold.test.tsx` said so in its own header ("survives … being lifted into the
engine"), and `adapters/angular/src/__tests__/text-defaults.test.ts` read the recording host, whose
`props` is "as the ops named it" and therefore cannot see a payload-time rule at all.

A second, smaller thing came out of the same bisect and is a structural fix with NO measured time
win, recorded honestly as that. `internValue` excluded booleans from the intern table on the
reasoning that a `Map` lookup costs what converting a boolean costs. Booleans need no `Map` — there
are two of them, so a dedicated slot each is a branch — and the conversion was never the whole cost,
since `values` is a JSI array the host reads entry by entry. Three adapters seed
`allowFontScaling: true` at `createElement`, so the table held one entry per text node on the screen.
Folding them took it from 5007 to 2008 on React's arm and 9007 to 3008 on Vue's, and moved the wall
clock ~2%, which is inside the noise. Kept because the table is now an honest diagnostic — it counts
DISTINCT values rather than writes of un-interned kinds — which is what made the fold count readable
in the first place.

### A re-render that changes nothing is free now, whichever way the style is written

The commonest shape any app produces: a parent's state moves, the framework re-renders the subtree,
every child writes back what it already had. A component that builds its style inline hands over a
FRESH object each time, which `Object.is` cannot refuse — so the write used to cross into the host
and become a `folly::dynamic` before anything could say it was unchanged. Measured on 1 000 rows with
nothing changed (`core/engine/cpp/tests/js/no-op-rerender-cost.itest.ts`):

```
                    before   after
hoisted style          0.3     0.6      StyleSheet.create / a CSS class / a module constant
rebuilt literal        9.7     0.6      16x — the whole gap was the conversion
whole row rewritten   12.9     2.3      the 1 000 left are per-row testID strings, genuinely distinct
```

`routeProp` now compares a rebuilt style against the standing one key for key before recording
anything (`isSameShallowStyle`, `core/engine/src/node.ts`) — shallow and conservative, so a nested
value (transform list, shadow, style array) still crosses and the host's `diffProps` refuses it as
before. Being wrong there is slow, never incorrect. Nothing propagates in any of the three passes:
`created=0 cloned=0`, and the differ is told nothing.

### `Clear` was quadratic in list width, in our C++, and it is the one row stock wins

Every device run this project has taken has stock ahead on `Clear` — 10.7 ms against our 9.1-44.2 —
and the row was left alone because small-ms rows do not carry a verdict. A suspicious row plus a
suspicious ALGORITHM is a different thing, and the algorithm was in `SymbioteTree.cpp`:
`detachFromParent` ran `std::remove` over the parent's whole child vector and then `erase`d. That is
O(width) per removal from EITHER end — `std::remove` scans the whole range whatever it finds, and
`erase` shifts the tail — so clearing N children was O(N²).

Measured with `core/engine/cpp/tests/js/child-list-scaling.itest.ts`, which reads a doubling factor
rather than a millisecond (linear work doubles, quadratic quadruples):

```
clearing 1 000 / 2 000 / 4 000 children      apply ms        doubling factors
before   std::remove + erase                 0.45 1.27 4.29     2.8  3.4
after    hole + slot hint + lazy compaction  0.33 0.47 0.85     1.4  1.8
```

Per removal it went 0.45 → 1.07 us as the list grew, and is now flat at ~0.25 us. A node carries
`slotInParent` (a HINT, validated against the vector before it is believed, with a scan as the
fallback) and a detach nulls that slot instead of erasing; every reader of `children` calls
`compactChildren` first, which is one branch on a dense vector and one linear pass on a churned one.

**And the bigger half of `Clear` was a GATE asking the wrong question.** `removeChild` nominates a
teardown candidate when `hasHostBehaviors()`, which is true as soon as a behavior TYPE is
registered — and `@symbiote-native/components` registers `Pressable` at module load, in every app,
before a node exists. The commit sweep then crosses EVERY removed node into JS: ten thousand handles
to clear a thousand rows, whether or not the screen holds a single Pressable.

The gate now asks `hasAttachedBehaviors()` — has a behavior ever attached to a node — which is
monotone, needs no accounting on a `WeakMap` with no size, and can only ever be late. Nothing the
sweep does can matter before the first attach: `attached` is written only by `attachHostBehavior`,
`awaitingCommit` and `committedEachTime` only inside a `behavior.` branch, `parked` only by
`detachAnimatedProps` (which has its own gate). Measured with
`core/engine/cpp/tests/js/teardown-sweep-cost.itest.ts`:

```
clearing 1 000 rows (10 000 nodes)          before   after
no behavior type registered anywhere          1.98    1.98
a type registered, attached to nothing        6.23    1.96     3.2x -> 1.0x
a behavior attached to one node per row       9.23    9.23     unchanged, and correctly so
```

The third row is what a screen with Pressables still pays, and it is recorded rather than fixed.
Split from the inside (`hostReadMs` on `readSurfaceTelemetry`, added for this question):

```
a 5.2 ms sweep over 10 000 removed nodes
  subtreesOf, the crossing        1.70 ms   0.17 us per handle   32%
  the JS loop above it            3.53 ms                        68%
```

**Two fixes were ruled out by that split rather than by taste, and the reasons are worth keeping.**
Moving the torn-down mark into C++ so no handle crosses buys at most the 1.7 ms and costs a crossing
per INSERT — `reattachHostBehaviors` runs ~9 000 times on a benchmark create, where today it is a
`WeakSet` miss. And marking only the detach ROOTS instead of whole subtrees would cut the sweep to a
tenth, but it is unsound: a framework that removes a parent and then re-inserts one of its CHILDREN
elsewhere would find that child unmarked and its behavior never re-armed. `detachOne`'s own comment
records an earlier narrowing that failed for the neighbouring reason.

What is left is a 10 000-iteration JS loop doing about five operations each, with no fat item in it.
Removing the redundant per-call `seen` Set (`tornDown.add` two lines below the guard already dedupes
within a call) changed nothing measurable — 4.4-4.6 ms either way — and the `.filter(isSymbioteNode)`
on the result is the type NARROWING, not a defensive check, so it cannot go without an `as`.

**`insertBefore` is still quadratic and that is recorded, not fixed.** Finding the anchor is O(1) now
through its hint; the `std::vector::insert` that follows shifts the tail, which is the container's
problem and not the search's. An intrusive doubly-linked list would make insert, remove AND
`nextSiblingOf` all O(1) and every reader in that file is already a forward walk — but the device
table has us BEATING stock on `Swap` (6.1-8.7 against 9.6), so the core data structure does not get
replaced on the strength of a row nobody has lost. The scaling test characterises it with a loose
tripwire bound rather than asserting quadratic is right.

Two traps this cost, both worth not repeating. Renumbering the tail's hints after an insert to keep
them exact made a 4 000-row reorder 34.6 ms against 6.7 — five times worse to maintain a hint that
nothing requires to be exact, since the detach validates before believing it. And a move WITHIN one
parent must erase rather than hole: the insert shifts that vector anyway, so a hole adds a
compaction pass on top of the shift.

**Do not read `commitMs` / `layoutMs` for a step whose commit was SKIPPED.** `readSurfaceTelemetry`
answers off `getCurrentRevision().telemetry`, so a skipped commit leaves the PREVIOUS commit's
numbers standing — all three passes above report the create's `fabric=8.4 layout=7.6`. Use
`mountingLogs()` (the differ's output) to ask whether the platform was told anything.

## Reference material

- RN source: `.vendors/react-native` (and `.vendors/react` for the renderer
  host config). Authoritative for how the slot actually behaves.
- Internals notes: `.notes/Frontend/React Native` and
  `.notes/Frontend/React Native Internals`.
- Prior art: `./wolf-tui` — the shared-retained-tree + thin-reconciler pattern,
  already shipping across five frameworks against a native layout engine. It is the
  **same architecture, retargeted ANSI→native**, so when building an adapter
  cross-check its wolf-tui twin: `wolf-tui/packages/{react,vue,svelte,solid,angular}`.
  The Vue adapter there (`packages/vue/src/renderer/{nodeOps,patchProp}.ts`) is the
  reference shape for ours — `createRenderer` + nodeOps mapping each RendererOptions
  call onto the engine mutation API. Caveat: wolf-tui drives a TUI layout engine, so
  the framework seam transfers verbatim but the host-call targets differ (its
  `createComment` fakes an empty text node — we use a real anchor node the commit walk
  skips, because an empty RCTRawText would actually paint in Fabric).

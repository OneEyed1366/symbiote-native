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
@symbiote-native/engine (JS) : command buffer, one JSI crossing per commit — no retained tree in JS
        │
        ▼
SymbioteTree (C++, core/engine/cpp) : the retained tree + clone-on-write commit + tag-keyed
        │  platform-parity rules (SymbioteFabricProps.cpp) + event normalization — ALL of it HERE
        ▼
Fabric's UIManager  (createNode / cloneNodeWithNewProps / appendChildToSet / completeRoot)
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
isolated installs — an ecosystem anti-pattern. The future `@symbiote-native/cli`
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
> ### THE STOCK COLUMN BELOW WAS TAKEN ON A BENT RULER. Corrected 2026-09-21.
>
> `stock-suite.itest.tsx:52` built its text input as `h('RCTSinglelineTextInputView', …)` — a bare
> Fabric view with nothing above it — while all five adapter arms built `h('text-input', …)`, which
> reaches a host behavior that seeds a prop, wires four listeners and attaches a press machine. Both
> commit ONE node named `TextInput`, so **the census oracle could not see it**, and it stood for as
> long as the suite has existed. `examples/bare-rn:413` mounts `<TextInput>`, so the DEVICE baseline
> never had this gap — only the headless one, and in the direction that flatters stock.
>
> Priced in `stock-text-input-cost.itest.tsx`, same tree, byte-identical census, three runs:
> **RN's own `TextInput` costs 50-53 us per instance**; our `text-input` tag costs **15-17 us**
> (`reconciler-floor.itest.tsx`). So the substitution was worth ~52 ms of a thousand-row create,
> charged to nobody, and we are 3.4x CHEAPER than stock on the one component it hid.
>
> The eight device steps, in the device's order, with the device's constants, driven through all six
> renderers. One file per arm, one process per arm, one ten-node row, the census asserted by absolute
> count on EVERY step before any millisecond is read. `pnpm run bench:itest`, one clean sitting,
> **2026-09-21 after the teardown-sweep cuts below**, with stock's row corrected to RN's own
> component:
>
> ```
>               stock   react     vue   solid  svelte  angular      ratio = ours / stock
> Create        153.9   127.2   155.4   106.0   115.7    162.7      0.83 1.01 0.69 0.75 1.06
> Replace       162.6   137.8   169.5   113.3   131.1    181.0      0.85 1.04 0.70 0.81 1.11
> Partial        35.0    10.3    13.0     6.8     9.0     10.3      0.29 0.37 0.19 0.26 0.29
> Select         13.8    13.9    13.7    15.3    13.6     13.8      1.01 0.99 1.11 0.99 1.00
> Swap           17.8    23.7     6.4     6.4     7.0      5.6      1.33 0.36 0.36 0.39 0.31
> Remove         20.5     5.4     5.0     5.4     5.5      5.7      0.26 0.24 0.26 0.27 0.28
> Append        186.0   136.3   153.1   115.3   131.3    172.7      0.73 0.82 0.62 0.71 0.93
> Clear          14.8    16.6    20.9    28.9    16.2     22.3      1.12 1.41 1.95 1.09 1.51
> ```
>
> **NO ARM CARRIES AN EXEMPTION ANY MORE.** Angular's `select` and `remove` were exempt from the
> write oracle until 2026-09-21 and now report the same counts as every other column, which is what
> makes all six readable together for the first time — and its `select` lands on stock's own figure
> to the tenth. See "ANGULAR'S `select` DEFECT IS FIXED" below.
>
> **Every adapter is at or under stock on the three create-shaped rows, Angular's excepted, and
> Vue's Create/Replace sitting on the line.** THE RATIOS MOVE ±0.08 BETWEEN SITTINGS and the whole
> machine drifts with them — sittings an hour apart the same day read stock's Create at 141.1, 151.8
> and 153.9, and React against it at 0.90, 0.86 and 0.83. Read a band, not a figure, and never
> compare a row against one taken in another sitting. A sitting taken while the full suite was still
> settling put Svelte's Create at 203.4 against its usual 116 — when a column moves by 75% the
> machine moved, not the code.
>
> `Clear` has its own spread of ±1.5 ms; min-of-3 against a stock 13.8 reads react 15.5 · svelte
> 15.3 · vue 19.8 · angular 21.1 · solid 25.7.
>
> **THE SIX ARMS ARE STRUCTURALLY IDENTICAL ON CREATE, which is what licenses reading the columns
> against each other at all** — every adapter reports `created=10000 setProps=10000 batches=2
> nodes=10003`, with `walk` 25.8-26.9 and `apply` 44.0-47.6. The `WRITES` gap this page once
> recorded (Angular 17002 against Solid 15001, "the cheapest open lead on this page") is CLOSED: no
> adapter writes a prop another does not. So Angular's 57 ms over Solid is pass 1 and nothing else,
> and the engine is ruled out by assertion rather than by argument.
>
> **WHAT IS LEFT, and both are attributable rather than open.** React's `Swap` at 23.4 against 12.7
> is the mutation-mode tax `<M1 + M2>` chose deliberately — measured at ≥15 ms with `insertBefore`
> replaced by a no-op, so the engine cannot remove it and no other adapter pays it. Solid's `Clear`
> is 2 000 drains from `cleanChildren` reading between every two removals, ~5 ms of its 25.7 at the
> measured 2.6 us per drain.
>
> THE GENERAL FORM, and it is the third time this page has had to write one: **a census counts NODES,
> and two trees with the same nodes can still be built by different amounts of code.** The earlier
> two were a missing `TextInput` (read as 1.31x) and Angular's flat row (identical structural
> counters, 19% of the prop keys absent). This one is sharper than both — the node was present, the
> name matched, the count matched, and the component above it was missing. When an arm names a HOST
> COMPONENT where its counterpart names a primitive, the two are not one workload however the census
> reads.
>
> Solid's `Clear` at 402 ms was the largest single anomaly here and is **FIXED** — see below. The
> table above still carries the old figure; the corrected row is 38.2 ms.

### THE BOUNDARY, PRICED: a drain cost 5.5 us and 2.8 of it was four type checks

A read is a batch boundary, so a framework that navigates the tree it is building enters `applyOps`
once per MUTATION rather than once per commit. `solid-js/universal`'s `cleanChildren` does exactly
that — 2 000 entries to clear a thousand rows — and Vue and Solid both make 101 on a `partial`. So
what one entry costs is the price of asking the host a question at all, and nothing had measured it.

`small-batch-crossing-cost.itest.ts` does, in one process: the same thousand removals once as ONE
batch and once as a thousand, with the committed tree asserted identical first.

```
                         before    after
 drain, all in           5.54 us   2.76 us     one extra drain, end to end
   of which the crossing 4.88      2.05
   of which ours         0.70      0.70        `takeBatch` — six allocations, and NOT the cost
 prologue, empty batch   4.38      1.54        2.8x
 bare JSI host call      0.13      0.13        the floor, and the control that made this findable
```

**THE CONTROL IS WHAT TURNED THIS FROM A SHRUG INTO A TARGET.** `performance.now()` is a host
function taking no arguments, so it prices the CALL and nothing else: 0.13 us. Against a 4.4 us
entry that is a factor of 34, which says the cost is work we do on the way in rather than anything
JavaScriptCore charges for crossing.

**TWO GUESSES WERE WRONG BEFORE THE BISECT FOUND IT**, and both are worth not repeating. Caching
`UIManagerBinding::getBinding` per runtime and interning the three `PropNameID`s that
`int32ArrayData` builds from UTF-8 on every call together moved 4.46 -> 4.38 us. Both are kept —
they are strictly less work — but neither was the cost.

The cost was `arguments[n].asObject(runtime).asArray(runtime)`, four times. The checking pair runs an
`isObject` and an `isArray` per table, eight JSI round trips for four arguments, and dropping them to
`getObject`/`getArray` took the prologue to 1.54 us in one edit.

**IT IS NOT AN UNCHECKED SHORTCUT, it is the harness's own split used for once.** `takeBatch` is the
only producer on this wire, and `jsi::Value::getObject` / `Object::getArray` carry `assert`s that are
LIVE in `core/engine/cpp/tests/build` — Debug with `NDEBUG` off, which is the entire reason that
build exists. A malformed batch aborts there; the build that ships pays nothing. Verified by running
the whole suite on both builds, 91 files green on each.

`parentsOf` and `subtreesOf` keep their checks deliberately: those are the BATCHED reads, entered
once per teardown sweep rather than per mutation, so the check costs nothing measurable and is worth
having.

Solid's `Clear` fell 38.2 -> 32.9 ms on the suite, which is 2 000 drains times the 2.8 us saved and
is what the arithmetic predicted.

### A CENSUS CANNOT SEE A REPAINT — Angular's `select` measured a step that never happened

> **THE DEFECT IS FIXED** (same day, `SymbioteRendererFactory.dispose`). This section stands because
> the INSTRUMENT is the lasting part: a write counter beside every step is what found a step that
> committed the right tree and did nothing. The cause and the fix are under "ANGULAR'S `select`
> DEFECT IS FIXED" above.

The suite's per-step counters, added 2026-09-21 and printed on every row rather than only on the two
create-shaped ones, say it plainly: on the identical step every adapter writes `setProps=1
batches=2` and **Angular writes `setProps=0 batches=0`**. Its `select` was then the fastest column of
the six — 2.2 ms against 11-14 — which is what a step that does nothing looks like. The single write
surfaced two steps later, in `remove`, where Angular alone reported `setProps=1`.

**NO ORACLE IN THE SUITE COULD SEE IT.** A selection repaints one row and adds no node, so the node
census matched throughout. Third time on this page, and the sharpest: the tree was right, the counts
were right, and the work was absent.

`PROPS_PER_STEP` in `bench-suite.ts` is the second oracle now — what each step must WRITE, which is a
property of the workload rather than of any renderer, and all five adapters agree on it. It went red
on Angular and nowhere else the first time it ran.

Narrowed in `angular-select-reaches-fabric.itest.ts`, four cases, and the matrix is the finding:

```
 component row, no preceding replace          PAINTS
 component row, after a keyed replace         DARK
 component row, composed host NOT registered  DARK    <- so `registerComposedComponent` is innocent
 row markup INLINED into the @for             PAINTS  <- so @for + the signal + our renderer are fine
```

So: **once `@for` has torn its embedded views down and rebuilt them, a component INPUT driven by a
signal read in the parent's template stops updating; an inlined binding in the same template keeps
updating.** Sixteen alternating microtask/timer rounds do not change it, so it is not the fixture's
settle — that was checked before anything was concluded.

WHAT IT IS NOT, each ruled out by a case rather than by argument: our composed-host registry, our
renderer's structural path, the scheduler's patience, and the arm's single-signal state shape (the
same shape paints before a replace).

The Angular column's `select`, `swap` and `remove` are NOT comparable until this is fixed, and the
arm says so in its own output — `unappliedSteps` on `IBenchDriver` makes the suite print `NOT
APPLIED` for the step instead of silently passing. An exemption there without a named reproduction
is a bug being hidden.

### `firstChildOf` was `childrenOf(node)[0]` — the same quadratic `nextSiblingOf` had, one door along

Solid's `Clear` read 402-435 ms against stock's 14 while the engine's own halves read `walk=0.1
apply=13.8 fabric=2.1`. So ~410 ms was JS above the engine, and nothing said what SHAPE it had.

**A FACTOR, NOT A MILLISECOND** (`solid-clear-scaling.itest.tsx`): linear work doubles when the list
doubles, quadratic quadruples. Widths 250/500/1000/2000, three samples each, a FRESH list per sample
because a cleared list has nothing left to remove:

```
                 before                      after
 250 rows          8.9 ms                      3.6 ms
 500 rows         28.8 ms                      7.7 ms
1000 rows        110.6 ms                     16.3 ms      6.8x
2000 rows        435.1 ms                     35.4 ms     12.3x
 doubling    3.25 3.84 3.94              2.15 2.11 2.17
childHandles     2 001 001                         1
```

**THE CALL COUNTS WERE LINEAR AND THE WORK WAS NOT, which is why a crossing counter alone would have
missed it.** `childrenOf` was entered 2 002 times for 2 000 rows — perfectly linear — while the
HANDLES those calls returned came to 2 001 001, N(N+1)/2 to the unit. `solid-js/universal`'s
`cleanChildren` empties a parent with `while (removed = getFirstChild(parent)) removeNode(parent,
removed)`, and `firstChildOf` was spelled `childrenOf(node)[0]`, so it read a list of N, then N-1,
then N-2, building and discarding every handle each time. **Count what a read RETURNS, not how often
it is made.**

The fix is the one this repo already made for `nextSiblingOf` and did not sweep for: its own host
member, `Tree::firstChildOf`, scanning the vector in place and crossing exactly one handle. Anchors
included and a dead handle SKIPPED, both matching `childrenOf` element for element — `cleanChildren`
terminates on `undefined`, so answering it early would orphan every child behind a dead one.

`solid` is the only caller today (`renderer.ts:309`), so no other column moved. What stays linear is
`applyOps`, still one drain per read because a read is a batch boundary and every removal really does
change the answer — 2 001 batches for 2 000 rows, which is the next thing in that step.

**THE GUARD IS THE HANDLE COUNT, not the clock**: the fixture asserts the widest arm crosses fewer
than 4x the row count, so the quadratic cannot come back quietly while the milliseconds drift.

### The teardown sweep crossed TEN handles to release ONE machine (2026-09-21)

`clear` was the one row where all five adapters lost to stock, and the engine's own floor for it —
a thousand rows removed one at a time, no reconciler above — was 6.58 ms, of which **5.45 was the
sweep**. Three cuts took it to 4.32, all measured on `build-release` with
`teardown-sweep-cost.itest.ts`:

```
                                         sweep JS   host read   engine clear floor
 as it stood                                3.55       1.67            6.58
 `isTornDown` a FIELD, behavior-less
   nodes leave `detachOne` early            3.04       1.67            5.92
 `node.hostBehavior` a FIELD too            2.75       1.67            5.55
 the WALK narrowed                          1.72       1.41            4.32
```

**The first two are the `slotBatch` trick again**: `tornDown` was a `WeakSet` and `attached` a
`WeakMap`, both keyed by node, both read on paths whose size is the tree's — and `node.payloadFold`,
written on the very next line of `attachHostBehavior`, had already made the argument. Nine of every
ten nodes in a removed subtree carry no behavior, so `detachOne` now marks them and returns before
the two `Set.delete`s that were never going to find anything.

**The third is the one worth reading.** `subtreesOf` hands back every node of a removed subtree, and
the sweep's cost IS that width. `teardownSubtreesOf` narrows it to three kinds — each ROOT, each node
carrying an intrinsic TAG (which `kOpSetTag` sets from `attachHostBehavior` and nowhere else, so a
non-empty `tagName` is exactly "a behavior attached here"), and each node BETWEEN the two. On the
benchmark row that is 2 handles of 10, asserted by absolute count in the fixture.

**THE ANCESTOR LEG IS WHAT MAKES IT SOUND, and this page had recorded the narrowing as impossible for
want of it** — "marking only the detach ROOTS would cut the sweep to a tenth, but a framework that
removes a parent and then re-inserts one of its CHILDREN elsewhere would find that child unmarked".
True of a ROOTS-only mark and false of this one: an ancestor of a tagged node is marked, so the
interior node a framework brings back alone still walks. A node with no behavior anywhere beneath it
is the only thing dropped, and there is nothing under it to re-arm. Guarded in
`host-behavior.test.ts` ("re-arms a behavior under an interior node the framework brings back
alone"), written and run GREEN before the narrowing landed, which is what makes it a guard rather
than a description.

**Not for an app that animates.** `detachAnimatedProps` is per node and carries no tag, so
`host-access.ts` asks for the full walk whenever a binding exists — one boolean, the same gate
`anyBinding` already is.

On the suite, min-of-3, against a stock `clear` of 13.8:

```
             before   after    of stock
 react        18.8     15.5      1.12      was 1.24
 svelte       19.5     15.3      1.11      was 1.28
 vue          25.0     19.8      1.43      was 1.64
 angular      25.6     21.1      1.53      was 1.68
 solid        29.6     25.7      1.86      was 1.95
```

**Solid barely moved, and its clear is now fully split — the ceiling is SOLID'S, not ours.**
`small-batch-crossing-cost.itest.ts` runs `cleanChildren`'s own shape through our two entry points
with no framework above them (`while (removed = firstChildOf(list)) removeChild(list, removed)`,
`solid-js/universal/dist/universal.js:164` verbatim), with the emptied parent and the drain count
asserted first:

```
 ours, the whole pair        5.3 us per removal      of which applyOps 2.2 · ours above it 3.1
 solid's suite step         11.8 us per removal      `solid-clear-scaling.itest.tsx`, 2 000 rows
 the difference              6.5 us                  solid-js disposing 2 000 row components
```

So on a 2 000-row clear the engine and our wrappers are ~10.6 ms and Solid's reactive teardown is
~13 ms — **which is stock's entire clear on its own.** Taking our half to zero would land Solid level
with stock and no better, so the row is not ours to win, and a drain-elimination scheme would buy
~4 ms of 23.6 for a JS-side child cache the architecture exists to refuse.

**The loop is not overridable**, checked in the vendor rather than assumed: `cleanChildren` is
internal to `solid-js/universal`'s `createRenderer`, and what we supply is `getFirstChild` /
`removeNode`. Both of our implementations are three lines (`adapters/solid/src/renderer.ts`), and
`requestCommit` is guarded by `commitScheduled`, so neither is where the 6.5 us goes.

**AND THE FIXTURE LIED TO ITSELF ONCE MORE ON THE WAY** — `countCrossings` installs a wrapper over
the standing host, so the second case calling it wrapped the wrapper and every `applyOps` counted
twice. It reported 2 000 crossings for 1 000 removals and its own oracle called that a finding.
Same shape as the telemetry drain below: **a fixture's own setup is state the next case inherits.**

### `clear`, fully attributed — the engine is 3-5 ms of it and the framework is the rest (2026-09-21)

The suite's `clear` runs after `append`, so it tears down ~2 000 rows / 20 000 nodes. Read the
`apply` column — which carries our C++ half AND the Fabric commit inside it — against the wall:

```
            wall    apply   fabric   batches      the framework's own teardown
 stock      14.9      —        —        —          14.9, all of it
 svelte     16.9     3.2      1.7       2          13.7
 react      17.5     2.9      1.9       2          14.6
 angular    22.7     2.8      1.9       2          19.9
 vue        22.8     3.9      2.5       2          18.9
 solid      27.9     5.3      2.0     2000         22.6
```

**React's arm is React's own unmount plus our engine, and it adds up exactly**: stock's whole step is
14.9, our React arm's half above the engine is 14.6 — the same reconciler doing the same work — and
our engine is the 2.9 on top. So the entire React deficit on this row is 2.9 ms, of which 1.9 is
Fabric's own commit that stock pays too. **What is ours is about 1 ms on twenty thousand nodes.**

**Svelte's framework teardown is already UNDER stock's entire step** (13.7 against 14.9), which is why
it lands at 1.07x with our engine on top.

Vue, Angular and Solid lose this row to their own frameworks: 19-23 ms disposing 2 000 component
instances, against an engine contribution indistinguishable from React's. Angular's is the shape this
page already priced at ~81 us per row instance; Solid's is the 6.5 us per removal split out above.
**No engine change reaches any of it**, and the three cuts recorded here took the part that IS ours
about as far as it goes.

**One thing was measured and NOT taken**: `subtreesOf`'s `.filter(isSymbioteNode)` is 0.6 ms of the
walk (2.75 -> 2.16 with the host's array returned unnarrowed). It is the type narrowing, not a
defensive check, and removing it costs either an `as` or declaring `ITreeHost.subtreesOf` to hand
back our own type — which is what that `object` boundary exists to refuse. Recorded so the next
reader does not re-measure it.

### ANGULAR'S `select` DEFECT IS FIXED — one shared renderer, and `destroy()` meant two things (2026-09-21)

Two rows of the Angular column were exempt from the write oracle for a fortnight: `select` reported
`setProps=0 batches=0` and read 2-5 ms — a step that did not happen — while `remove` reported
`setProps=1` where every other adapter reports 0, two steps after the selection that asked for it.
It is fixed, and both exemptions are gone.

**FOUND BY ASKING EACH LAYER IN TURN**, which is the reusable half. The committed payload says only
that the row is dark; it cannot say whose fault that is. Four questions, four instruments, and the
answer is the FIRST one that says no:

```
 did Angular re-evaluate the binding?      an @Input() SETTER that counts        1 call, value true
 did the child re-render?                  a GETTER the template reads           1 read, value true
 did our Renderer2 get called?             `readAngularProfile().rendererWrites` 3 writes
 which props?                              `readAngularProfileDetail()`          the 3 selected keys
 did it reach the engine?                  `readSurfaceTelemetry().setProps`     0
```

Every layer but the last. So Angular was innocent — and this page had recorded the defect as living
in "the component-input path", which the setter disproves in one line.

**THE CAUSE: `SymbioteRendererFactory` hands ONE renderer to every component on the surface**
(`this.renderer ??= new SymbioteRenderer(...)`, deliberately, so every component's mutations collapse
into one coalesced commit). Angular calls `Renderer2.destroy()` per destroyed component, and a keyed
`@for` replace destroys a thousand of them. That `destroy()` released the renderer's `beforeFlush`
registration — the ONE door a style run has, since `setStyle` accumulates per node
(`ɵɵstyleMap` decomposes `[style]` into a call per key) and `flushOps` is what asks a renderer for
what it holds. The instance went on serving every surviving view, writing into an accumulator nothing
would publish. It only reached Fabric when some OTHER node's `openStyleRun` closed the run — which is
exactly why the write surfaced two steps later.

**THE FIX IS A LIFETIME, not a flush.** `destroy()` publishes what it holds and nothing more;
`SymbioteRendererFactory.dispose()` releases the registration, and `render/index.ts`'s `teardown`
calls it after Angular's own destroys. The registration now follows the SURFACE, which is what the
instance's scope always was.

**Break-tested**: restoring the release turns the new unit test red on its own assertion
(`adapters/angular/src/renderer/renderer.test.ts`, "keeps publishing styles after Angular destroys
the shared renderer") and nothing else. Its first spelling failed on a typo instead — **a RED that
throws is not a RED that fails**, and re-running it until the message was an assertion is what made
it a guard.

**Confirmed on device 2026-09-21**, which is the half a headless counter cannot give: `Create 1,000`
-> `Replace all` -> tap a row on `examples/angular`'s `BenchmarkScreen` repaints it immediately, and
leaving the screen and returning keeps styles publishing. Those two taps ARE the defect and the two
halves of the fix — the keyed `@for` + `@Input()` shape at `src/screens/BenchmarkScreen.ts:850-854`,
and `dispose()` following the surface.

```
              before        after      every other adapter
 select        2.1-2.3      13.8       13.6-15.3    setProps 0 -> 1, laidOut 1502 -> 7000
 remove       13.1-14.6      5.7        5.0- 5.5    setProps 1 -> 0, laidOut 6993 -> 1001
```

Angular's `select` now lands on stock's own 13.8 to the tenth, and its `remove` is 0.28x of stock
like everyone else's. **The two figures were never Angular being fast or slow; they were the same
write, mis-filed.**

One thing this cost that is worth not re-deriving: the characterization cases pinned to the BROKEN
answer are what made the fix recognisable — the experiment that confirmed the cause turned them red,
which is the signal a pin exists to give. They are ordinary positive cases now, and the four-layer
probe stays as a case of its own, because a regression can re-break any of the four and the printed
line says which.

### `laidOut` — the column that explains the whole table, and it exonerates `select` (2026-09-21)

`select` changes ONE row's style and spends 7.9 ms of its 11-15 in `layout`, on a step that clones
three nodes and writes one prop. Every engine counter says the commit did almost nothing, so the
time had to be Fabric's — or it had to be us handing Fabric more than changed, and nothing on the
line could tell those apart. RN's own commit telemetry already carried the answer
(`getAffectedLayoutNodesCount`, `getNumberOfTextMeasurements`) and the suite simply never printed it.

**AND THE STOCK ARM CAN BE ASKED THE SAME QUESTION**, which is what makes the column mean anything:
`readSurfaceTelemetry` takes a SURFACE id, so it answers about a tree React's own renderer drove with
our engine nowhere in the path. It is read off `__symbioteEngineNative` directly, because that file
carries `@symbiote-platform-extensions` and importing `@symbiote-native/engine` there kills the
bundle at `Platform.ios.js`.

```
 step       stock   react     vue  svelte   solid        wall: stock -> react
 create      7001    7002    7002    7002    7002        140.2 -> 119.0
 replace     7001    7002    7002       —    7002        151.2 -> 128.5
 partial     1501    1502    1502       —    1502         27.3 ->   9.3
 select      6999    7000    7000    7001    7000         12.1 ->  11.4
 swap        6995    1002    1002    1003    1002         14.5 ->  21.8
 remove      6988    1001    1001    1002    1001         15.5 ->   4.6
 append     13988    8001    8001    8002    8001        169.2 -> 129.5
 clear          1       2       2       —       2         14.2 ->  14.2
```

**`select` IS FABRIC'S, to within one node.** A layout-dirty style change on one row of a thousand
re-lays out the whole tree, and it does so for the stock renderer exactly as for ours — 6 999 against
7 000. The suite's selected style adds `borderLeftWidth` on purpose, because the device screen does;
this is what that costs, and it is not ours to remove. The paint-only spelling is still 6.5x cheaper
(`update-shapes-cost.itest.ts`), and that remains an AUTHORING choice, not an engine one.

**WHERE WE WIN, THIS COLUMN IS THE REASON.** On `swap`, `remove` and `append` stock re-lays out
~7 000 or ~14 000 Yoga nodes where we lay out ~1 000 or ~8 000 — a targeted replace against a
persistent renderer handing Fabric a rebuilt path. `Remove` is the sharpest: 6 988 against 1 001, and
the wall follows it 15.5 against 4.6. The thesis of this project shows up here as a node count before
it shows up as a millisecond.

**AND IT CORROBORATES THE ANGULAR DEFECT from a direction nothing else reaches.** Angular's `select`
reads `laidOut=1502` — the PARTIAL step's number, not select's — while its `remove` reads 6 993,
which is select's. The displaced write this page already records shows up as displaced LAYOUT, on an
instrument that knows nothing about prop counts.

One mechanical consequence: stock used to be exempt from the write oracle by passing no telemetry at
all, and it now passes Fabric's half. The exemption is a named flag (`drivesEngine: false`) rather
than a zero, because `setProps=0` is also exactly what a step that silently failed to apply reports —
and telling those two apart is the entire job of that oracle.

### The JS half of a create, split at last — and the engine is still 0.92x of a bare Fabric driver

Every create-shaped row splits into an `apply` the C++ side accounts for line by line and a
REMAINDER the adapter and the engine share, with nothing ever said about it. On the engine's own arm
— no reconciler above it at all — that remainder is ~23 ms of pure JavaScript for 10 003 nodes and
13 003 props, not a byte of which has crossed the boundary. It was the largest unattributed number
on this page. `fill-phase-cost.itest.ts` times the three calls an adapter makes per node in three
passes over one tree, nothing flushed until every clock has stopped:

```
 create   12.3-13.8 ms    1.19-1.38 us per node      45-48%
 prop     10.3-10.7 ms    0.79-0.82 us per write     36-38%
 append    4.7-4.9 ms     0.47-0.49 us per append    17-18%
```

**A creation costs more than a prop write, which inverts the intuition** — a prop write is the
engine's hottest path BY CALL COUNT (13 per row against 10 creations) and has been optimised as such,
while `createElement` allocates a node, records an op, asks the behavior registry and asks the
ViewConfig registry. Per-call it is the dearest of the three.

**AND THE PROP AVERAGE HIDES A 1.8x SPLIT**, so it is taken by key kind in the same pass:

```
 style    5.0 ms    1.25 us per write    4 per row + the list's
 scalar   5.6 ms    0.70 us per write    8 per row
```

A style write costs nearly what a node creation does. It is not one lump: `stylePartsOf` allocates
the parts record on a node's first style write, `isSameShallowStyle` compares against what stands,
`sharedStylePair` takes a `WeakMap.get` (which is already why a hoisted `StyleSheet.create` constant
shared by a thousand rows allocates ONE published array, not a thousand), `isAlreadyPublished` reads
the slot back, and only then does `setProp` record. Five steps of ~0.1-0.2 us each, none dominant.
**Not taken**: 5 ms of a 29 ms fill, of a 72 ms engine, of a 106-164 ms create — 3-4% at best, in
the most delicate code in the engine, where the class merge, the `setNativeProps` restore path and
the published marker all meet.

**AND THE WHOLE THING IS BELOW THE FLOOR ANYWAY, re-confirmed on today's engine.**
`raw-fabric-vs-engine.itest.ts` builds the identical tree through `createNode`/`appendChild`/
`completeRoot` with no retained tree, no diff and no buffer:

```
 raw driver     77.9-79.2 ms      build 68.8-70.2 · completeRoot 8.7-9.1
 the engine     71.4-72.9 ms      fill 22.5 · apply 15.3 · commit 33.5-35.1      0.92x
```

Same census both arms. So the engine — retained tree, clone-on-write, payload building and all —
costs LESS than a driver that does nothing but call Fabric, and roughly half of what it does spend
is Fabric's own commit. **There is no create-path win left in the engine worth the name**, and an
adapter's deficit against stock is its own reconciler: on a 10 000-node create the engine is ~72 ms
and the framework above it is ~35 ms (Solid), ~57 (React) or ~90 (Angular).

**TWO THINGS MEASURED AND NOT TAKEN**, both recorded so they are not re-derived:

- `configPayloadFold(component)` is one `Map.get` per node and **0.17 us of `createElement`'s 1.24**
  — 13% of the creation, ~1.3% of a create. Measured by subtraction with the call stubbed out
  (12.9 -> 11.2 ms over 10 000 nodes), then reverted.
- **THE REGISTRY MISS COSTS NOTHING, and this is a NEGATIVE RESULT that kills a change.**
  `createElement` asks the behavior registry about every node, and for nine in ten it is a guaranteed
  miss: the registry is keyed by intrinsic TAG (`pressable`) while an untagged node passes its FABRIC
  view name (`RCTView`). Timed as a real before/after — `hasHostBehaviors()` is monotone, so the cold
  arm has to be the FIRST case in the file — the armed build comes back **faster**, run after run
  (23.5 -> 22.4, 22.8 -> 22.1, 23.8 -> 23.4). Ten thousand failed lookups are smaller than the
  warm-up the first build pays. So making `tag` optional so an untagged node never reaches
  `attachHostBehavior` buys nothing, and it would break every test that registers under a Fabric name
  and creates with `createElement(THAT_NAME)` — which is most of `host-behavior.test.ts`, by an
  accident this page already records.

One cross-check falls out and is worth keeping: the untagged build is ~22-23 ms and the tagged split
totals ~27-28, so the thousand REAL attaches cost ~5 ms — about 5 us each, which is what
`reconciler-floor.itest.tsx` independently prices a tagged primitive's `attach` half at (6.8-7.7 us).
Two instruments, one number, neither built for the other.

**A MONOTONE GATE MAKES ITS BEFORE-ARM UNREPEATABLE, so that pair can never carry an assertion.**
`hasHostBehaviors()` turns on and never off, so the cold arm exists exactly once per process and
best-of-N is not available to it — which is the sampling this page already requires of any small-ms
comparison. A 1.5x tripwire on the ratio duly went red in the full release suite (29.2 against 49.6,
a process per file and a sample descheduled for longer than the work) while the same pair reads
23.5 / 22.4 run alone. The bound came out; the census and prop-count oracles on both arms stayed.
**Any before/after separated by a one-way switch is a print, not a gate.**

### A counter that ZEROES ON READ is charged to whoever reads next (2026-09-21)

`reconciler-floor.itest.tsx`'s behavior arm reported `setProps` 12 006 where the tree writes 12 003,
and the case's own oracle called the 3-prop difference a finding. It was the case ABOVE it: that one
ends by mounting an empty list to time the teardown, reads no telemetry afterwards, and
`readSurfaceTelemetry` resets on read — so the replacement container's two creations and three prop
writes sat in the counters until the next arm read them.

**A fixture that commits without reading hands its counters to the next one.** Drain them, or the
oracle you wrote to catch a real drift catches the file's own housekeeping instead.
>
> ### SUPERSEDED — the same suite before the stock row was corrected (2026-09-17)
>
> Kept because the adapter columns are sound and were measured directly; only the column they are
> read against was wrong. Every ratio in it is void.
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
> **CLOSED LATER THE SAME DAY — the arm exists, and all three gaps are now written.** `pnpm run
> test:android`, and the ripple's dict, its foreground slot and its null colour are asserted on the
> committed payload there. See "The test host has an ANDROID ARM now". `underlineColorAndroid` (its
> default AND that an authored value beats it) and the `search` keyboard split followed within the
> hour — three cases, each BREAK-TESTED by flipping its branch in `SymbioteFabricProps.cpp` and
> confirming it went red alone, because a guard that has never failed is one you are only hoping
> works. The iOS arm already asserted both NEGATIVES (`underlineColorAndroid` absent, `search` ->
> `web-search`), so the two arms are twins rather than one side of a split.
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
> **HALF OF THAT LEAD IS CLOSED (2026-09-18), and the counter is where it shows.** Re-run after the
> `foldHostBag` deletion and the Text-defaults collapse, same fixture, same tree:
>
> ```
>            before   after
>  vue       10 000   10 000     unchanged
>  solid     10 000   10 000     unchanged
>  angular   13 000   13 000     unchanged
>  react     12 000    9 000     -3 000
>  svelte    13 000   10 000     -3 000
> ```
>
> React and Svelte are exactly the two adapters whose CREATE path ran `foldHostBag` over
> `HOST_PRIMITIVES[*].defaults` (`react/src/host-config.ts`, `svelte/src/dom-shim/element.ts`), and
> the other three are unchanged in the way their own removals predict: Angular's `applyTextDefaults`
> returned early unless one of the two props was authored, and Vue's `textDefaultFor` and Solid's
> `foldTextValue` sat on the PATCH path, not create. So every column moved, or did not, for a reason
> named in advance.
>
> **It is an inference from a coincidence, not an isolated A/B**, and the honest weight is that the
> delta lands on exactly the predicted two adapters at exactly 3 000 each. No wall-clock verdict is
> claimed: this fixture's per-arm spread is far wider than three thousand writes could move.
>
> What is LEFT of the lead is Angular's 13 000 against Solid's 10 000 — three per row, still
> unenumerated, and now the whole of it. And React at 9 000 is BELOW vue/solid for the first time,
> which is a new question rather than an answer.
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

**PARTIALLY SUPERSEDED 2026-09-18 — the React arm's row had the wrong text-input tag, and the
absolute numbers above need a fresh full re-measurement, not a patched-in delta.** `reactRow` wrote
`h('textinput', …)` — no hyphen — which is not a registered intrinsic
(`core/components/src/component-names/index.ios.ts` only knows `'text-input'`), so it fell through
`descriptorFor`'s "raw Fabric view name" branch and committed a node literally named `textinput`.
No tag match means no `attachHostBehavior` call, so the row's TextInput never got
`core/components/src/behaviors/text-input.ts`'s machine — specifically its `attach()`-time
`setProp(node, 'mostRecentEventCount', …)` seed. Vue's sibling `vueRow` already spelled it
`'text-input'` correctly (line 97 of the same file) and has carried the real cost all along; this
was a one-sided gap between the two arms in this file, not a Vue-vs-React finding.

Confirmed on the device-adjacent symptom first: the *published* device table already showed
`WRITES 17037/16000` for React — that number came from `examples/react`'s real `<TextInput>`
component, a different code path, and was never affected by this bug. Only this ITEST FIXTURE's own
row was wrong.

Fixed (`h('text-input', …)`, three files: this one, `react-suite.itest.tsx`,
`adapter-swap-cost.itest.tsx`). Isolated before/after on this exact codebase, tag spelling the only
variable, three runs each: **delta 21.8 ms (buggy) → 27.2 ms (fixed) on this file's own reconciler
column — the fix's own clean contribution is +5.4 ms (+25% relative).** Both numbers sit well below
the documented 45-48 ms above, so most of that gap is unattributed drift from other engine work
since this paragraph was written, not this bug. **Do not read 45-48 ms, 58%, or 1.6-1.7x as current
without re-running this file fresh** — they need a full re-measurement on today's engine, not a
patch to the old figures.

### SUPERSEDED — the reconciler is ~11 ms of a React create, not 45, and it was never measured before

`reconciler-floor.itest.tsx` (2026-09-21) measures the thing the paragraph above only named. It
builds a SECOND reconciler whose every host method is empty — same flags, same container plumbing,
same element tree — so React drives nothing and what is left is fibers, elements, the work loop and
the commit walk. Angular has had this arm since its renderer-split (`host-does-nothing`); React
never did, because its host config is a closed object literal with no prototype to patch.

```
 engine direct      81-90 ms
 react/null         10.6-12.0 ms    React's OWN half, oracle-asserted at 7 001 elements + 3 000 texts
 react real        105-117 ms
 react over engine  25-31 ms  =  react's own 11  +  our seam 13-15
```

So **roughly a third of the "reconciler delta" is the reconciler** and the rest is our per-node JS
being dearer under a host config than under a direct loop. The old 45-48 ms figure was the whole
delta with nothing separated out of it.

THE ORACLE HAD TO BE A CALL COUNT, because an arm that builds no tree commits nothing for a census
to read — and an arm that quietly rendered less would read as fast rather than as broken.

**AND THE TWO ARMS WERE NOT THE SAME WORKLOAD UNTIL THIS FILE MADE THEM ONE.** The engine arm named
`RCTSinglelineTextInputView` while React named the `text-input` TAG, so only React reached the host
behavior — 13 003 prop writes against 12 003, and a thousand more interned values. The same asymmetry
sits in `adapter-create-cost.itest.tsx`'s `engineRow` and is carried by the 38 ms that file publishes.
`expect(react.setProps).toBe(engine.setProps)` is the gate now.

### A TAGGED PRIMITIVE COSTS 15-17 us TO MOUNT, and every adapter pays it on every one

Same fixture, same tree twice, the only difference being whether one node per row is created under
its intrinsic tag. A tag is how a node reaches its host behavior, so this prices attaching one — and
it is not a TextInput fact: Pressable, Switch, Image, Button and ScrollView all take the same path.

```
 bare (no tag)      68-72 ms      setProps 12 003
 tagged             83-85 ms      setProps 13 003     the behavior's own seed, part of what it costs
 per instance       15.3 / 16.8 / 15.3 us  =  attach 8.4-9.4  +  post-commit 6.4-8.6
```

`walk` and `apply` are unchanged between the two, so none of it is the C++. The attach half is four
closures for `setBehaviorListener`, a seeded prop and `attachPressMachine` — yes, every `<TextInput>`
mounts a press machine (`text-input.ts:364`), which is why `behaviors/pressable.ts` shows up in a
profile of a row that holds no Pressable. The post-commit half is `runDeferredAttaches` plus
`runCommittedHooks`, each asking the HOST whether a node landed.

**Read it against what it buys before calling it a regression: RN's own `TextInput` costs 50-53 us on
the same tree.** We are 3.4x cheaper for the same surface. The open question is not whether 15 us is
too much against zero, it is which of the two halves can go — and the post-commit half is two host
crossings per instance for one fact.

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
is DERIVED from the node above reads it there. (The two clone-folds needed one thing more than this
— the parent's TAG, to be dispatched at all — and moved the same day; see "A rule may key on its
PARENT'S TAG".)

ScrollView's content rule is the first user, which takes the whole primitive to **zero crossings on
both nodes**. Its two halves are why it was the right one: the row direction is a constant of the
content node's OWN tag (portable all along), and `collapsableChildren` comes from
`maintainVisibleContentPosition` / `snapToAlignment`, which stay on the scroller.

**The boundary did not move, only the reading of it.** A rule may read another node's PROPS —
declarative, present at commit time. It cannot read live JS state (`stickyFold`'s `translateY`) or
anything a framework computes per render. That is the browser model's own line: a UA rule sees the
tree, not the application's closures.

**AND "ANOTHER NODE" MEANT "AN ANCESTOR" FOR A DAY LONGER THAN IT SHOULD HAVE.** This paragraph said
"the parent's PROPS", and three separate notes then cited direction as if it were the boundary —
ScrollView's Android wrap reads DOWNWARD and was recorded as unportable three times over. Nothing in
the argument above mentions a direction: the tree is in C++, so any node is a pointer hop. See "A
rule may read its CHILD".

**This list used to carry a third entry — an owned LISTENER — and it was wrong.** See the section
below: a listener is two facts wearing one word, and only one of them is the application's.

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

### A listener's EXISTENCE is the platform's; only its BODY is the app's — `OP_SET_OWNED_LISTENER`

`focusable` on a touchable is `focusable !== false && onPress !== undefined && !disabled`
(`TouchableOpacity.js:336-339`). Two legs are ordinary props. The middle one is an app callback, and
on one of our tags `onPress` never becomes a prop at all — `setEventListener` diverts a name the
behavior OWNS into a JS stash, because `node.listeners` is single-slot and the behavior's own
dispatcher holds it. So this one key kept a per-node fold alive on `touchable-opacity` and
`touchable-highlight` after every other rule had moved, and three places in this repo recorded it as
unportable.

**The browser settles it, not taste.** A UA computes focusability itself, and it can, because
`addEventListener` is the UA's own API: the browser knows which of its elements carry a click
handler while the handler's body stays the page's. Same split here — one bit crosses per flip as
`OP_SET_OWNED_LISTENER`, the closure never leaves JS, and `foldPressableProps` resolves the whole
expression off the node.

**A FLIP IS A MOUNT-TIME EVENT**, which is what makes the op affordable: the engine already refuses
to notify on listener IDENTITY (a framework hands a fresh closure nearly every render), so this
fires when a handler appears or disappears and at no other time. Against a fold charged on every
commit its node was dirty in — and `touchable-focusable-payload.itest.ts` measured `foldsFound` **5**
for a SINGLE mounted touchable, not 1, because the opacity settle re-commits the node before it
comes to rest. So the saving is ~5 trips per touchable at mount.

The tag-rule ruler is unmoved by it (`pressable` native walk 3.6-3.7 ms against 3.7-3.9 before),
which is the expected answer for an op that runs at mount and not in the walk.

**Scope as it stood that hour, and BOTH of its exceptions expired the same day** — kept because the
wording is a worked example of the mistake this page keeps making. It read: `touchable-opacity` is at
ZERO folds; `touchable-highlight` keeps one for its UNDERLAY, "which is built from live press state
(`shown` flips inside a gesture) and is the genuine unportable article"; `button` keeps its own for a
three-way `disabled` and its Android view style.

Button went first (see "A raw text can carry a TAG"). The underlay went last, and its note was half
right in the way this whole section warns about: `shown` really is live and really is JS's, but the
RULE was made of four inputs and three were already portable — two ordinary props the engine ALREADY
strips, and listener existence, which this very section had just established crosses as a bit. See
"The UNDERLAY was three portable inputs and one bit". **All three touchables are at zero.**

**The general form, and it is the reusable half: "JS holds it" is not the same claim as "only JS can
compute it."** The first is a wiring question and wiring is cheap. The second is the real boundary.
Every remaining "cannot be ported" note is worth re-reading against that distinction.

### The port found a shipping accessibility bug, and the JS harness could not have

A disabled `<touchable-highlight>` committed `focusable: true` — reachable from a keyboard and a TV
remote, announced as a focus stop, doing nothing when activated. Reproduced on unmodified HEAD,
before a line of the port had landed, by writing the contract itest first.

Cause is Trap A, the one this file already records: a tag rule runs BEFORE the JS fold, so a fold
reading a key the rule STRIPS reads it gone. `foldPressableProps` erases `disabled`;
`touchable-opacity`'s fold had been corrected to read the NODE and `touchable-highlight`'s had not.
Two copies of one expression, and one of them drifted.

**What makes it worth a section is WHY it survived: its vitest case asserted exactly this and
PASSED.** That harness builds payloads through the TypeScript `fabricProps`, which deliberately
carries no copy of the tag rules — so there was no pressable rule to strip `disabled`, the key was
still in the bag, and the expression resolved correctly there and nowhere else.

So the property that makes the JS harness correct — **it holds no mirror** — is the same property
that blinds it to a rule-ORDERING bug. A fold that reads a key an engine rule removes is invisible to
every test on that side. Only the committed payload can see it, which means the itest is not merely
the better place for these assertions; for this class of bug it is the ONLY place. Read that together
with the false-green rule already on this page: an assertion can be in the wrong harness and green
for years.

### A mirror that cannot be removed is made LOUD — SUPERSEDED, it could be removed after all

`SCROLL_VIEW_BASE_{VERTICAL,HORIZONTAL}` existed in C++ (`foldScrollViewProps`) AND in JS
(`render-scroll-view.ts`), and this section argued both were needed: Android's RefreshControl path
does not go through the rule, because RN wraps the scroll view and splits the app's style across two
boxes with the base composed onto BOTH (`ScrollView.js:1854-1863`) — and "that split reads the
OWNER's style from the WRAPPER's fold, one node reading another, so it is composition and stays in
JS". `scroll-view-base-parity.itest.ts` held the two copies in step, break-tested by flipping the C++
`flexGrow` to 2 and watching both rows go red.

**THE PREMISE WAS THE SAME ONE `ownerProps` HAD ALREADY FALSIFIED IN THE OTHER DIRECTION, and it
took a day to notice.** "One node reading another" is not a reason to stay in JS — it is the exact
thing `ownerProps` was built for. What was actually true is narrower: this read goes DOWN, and every
seam the engine had went UP. `IFirstChild` closed that, the split moved, and the JS copy, the field
that carried it (`IScrollIntrinsics.scrollViewBaseStyle`, read by nobody) and this test all went with
it — the orphan shape again. See "A rule may read its CHILD".

**The lesson that outlives the mirror: a guard written to hold two copies in step is also the thing
that makes deleting one SAFE, and it should be re-read as a candidate for deletion every time its
subject moves.** This one was cited three times as proof the JS copy was permanent. It was proof of
nothing except that the two agreed.

### A test that "flakes" in the full run and passes alone — read the walk before blaming the build

`load-time-registration.test.ts` failed intermittently and was dismissed as a stale-build artifact
TWICE in one session before anyone looked. It is a real race, and a repo-shaped one: the audit walks
`adapters/`, and the Svelte suites write a `.smoke-compiled-*.mjs` beside their own source and
`rmSync` it in an `afterAll` — dozens of them, by design. `readdirSync` followed by a separate
`statSync` leaves a window where one of those vanishes in between, and `statSync` throws ENOENT on an
entry the walk was about to discard for its extension anyway.

Fixed with `readdirSync(dir, { withFileTypes: true })`: the type comes from the SAME syscall, so the
window does not exist rather than being caught. One syscall cheaper per entry, too.

**AND IT FIRED AGAIN THE NEXT DAY, so read "fixed" as "that window is closed" rather than "the test
is settled".** Once on 2026-09-18, in a full run, then NINE consecutive clean full runs afterwards —
and the message was not captured, so whether it is the same cause is unproven. Chasing it further by
guessing is the thing this section warns against. **Once more on 2026-09-21**, again in a full run,
again clean alone and clean on the three full runs that followed, and again the message escaped
capture because it did not reproduce. Three sightings, no assertion text yet.

What was done instead is narrower and is the reusable half: `parse()`'s `readFileSync` is a SECOND
listed-then-read window, and unlike the first it cannot be collapsed into one syscall. It now
rethrows with the path and says out loud that an ENOENT there is a race rather than a finding.
**Labelling beats swallowing here** — skipping an unreadable file would turn a report this guard
exists to make into silence — and it means the next occurrence arrives diagnosed instead of being
dismissed a third time.

The general form is the part worth keeping: **a failure with no assertion in the message is not
evidence of flakiness, it is evidence that something threw** — and "passes alone, fails in parallel"
points at shared filesystem state, not at a build. Its corollary, learned here: **a race you closed
is not the same claim as a test that stopped failing.** Say which one you have.

**AND THE FIX WAS NEVER SWEPT — four more walks carried it, found by asking the repo rather than by
waiting for the next failure (2026-09-18).** A different file went red the next day
(`tests/dlog-argument-budget.test.ts`, again with no assertion in the message), which is what
prompted the question. One line answers it, and it is worth keeping as the query:

```
\grep -rln "readdirSync" tests core adapters --include="*.ts" | \grep -v "/build/" |
  while read f; do \grep -q "statSync" "$f" && ! \grep -q "withFileTypes" "$f" && echo "RACY: $f"; done
```

Five files, of which four were genuinely the pattern and now carry `withFileTypes`.
**The fifth is the instructive one and was deliberately LEFT ALONE**:
`adapters/svelte/src/host-tag-invariants.test.ts` already wraps its `statSync` in a
`try`/`continue`, so it is race-proof by a different route — and it FOLLOWS symlinks on purpose,
for a broken link inside `examples/svelte/ios/Pods`. `dirent.isDirectory()` is FALSE for a symlink,
so converting it would have started collecting a broken `*.svelte` link instead of skipping it. **A
mechanical sweep of a pattern is wrong wherever the pattern is load-bearing** — read what each
`statSync` is FOR before replacing it.

Two things this sweep settles about the shape itself. The window is a property of the WALK, not of
the directory: `tests/build-output-has-no-orphans.test.ts` walks `build/**`, where no
`.smoke-compiled-*` ever lands, and it is fixed anyway, because a walk that can throw ENOENT on an
entry it was about to discard has no reason to. And **the second window — `readFileSync` on a listed
path — cannot be collapsed into one syscall**, so it takes the labelled rethrow instead, the same
treatment `load-time-registration.test.ts` gives its own `parse()`. Swallowing it would turn a count
this guard exists to make into a quietly smaller one.

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

`id` -> `nativeID` became ONE rule (`foldIdAlias`) applied to every TAGGED node instead of five JS
copies. **It did not survive that shape for a day — see "the seventh implementation" below.** The
objection it was built to answer (a rule must not reach a third-party view) turned out to be the
thing that made it wrong.

**The corollary bit the measurement before it bit anything else: a node built with a tag NOBODY
registered carries an EMPTY `tagName`, so no rule fires.** `recordSetTag` is emitted by
`attachHostBehavior` and by nothing else. The new `button` arm was written without a registration
and measured a native side doing no work at all; what caught it was `expectSamePayload` refusing to
time two arms that disagree, not a suspiciously good number. Any bare-tag fixture needs a stub
behavior registered or it measures nothing.

### The test host has an ANDROID ARM now, and five recorded coverage gaps close at once (2026-09-18)

Every port in this migration that touched a platform split landed with the same sentence: *a
compile-time branch is only testable in a build that compiles it*. `android_ripple`,
`underlineColorAndroid`, `decelerationRate`'s constants, Button's uppercase label and its Material
style, TouchableNativeFeedback's background — five gaps, each recorded honestly and each needing a
device. `Switch` was the lucky exception, because `Switch` and `AndroidSwitch` are genuinely two
Fabric components and its rule branches on a name already on the wire.

```
pnpm run test:android
```

**What made it cheap is a fact about where the rules live, not a trick: all twelve `#ifdef ANDROID`
sites are in `SymbioteFabricProps.cpp`**, which includes `folly/dynamic.h` and our own headers and
nothing else. So the define is scoped to that ONE translation unit
(`set_source_files_properties`, `SYMBIOTE_PLATFORM_ANDROID`) and never reaches ReactCommon, whose own
Android branches want fbjni and a real NDK. Defining it target-wide is the version that does not
build.

**One line genuinely could not cross and the split it needed is the reusable part.**
`android_get_device_api_level` is the NDK's, so it exists when `__ANDROID__` is defined — which the
real toolchain sets and `-DANDROID` does not. `androidApiLevel()` answers with the minimum RN
supports on a host, so the arm exercises the branch a modern device takes while the QUERY stays the
device's. A rule's logic and a rule's platform call are separable, and only the second needs hardware.

**The fixtures split by SUFFIX, `*.android.itest.ts`, and the split is hard in both directions**:
that file runs only on `build-android` and every other fixture runs only on the others. Each arm's
cases assume their own platform — an Android fixture asserts keys the default build never writes, and
the default fixtures assert their absence — so a one-way filter would leave half of them lying. It is
Metro's own `.ios.js` / `.android.js` shape, and nothing has to maintain a list.

**It is NOT a device and the file says so.** `Platform.OS` in JS still reads the host, so a behavior
whose JS half branches on it takes its iOS path here — Button composes the iOS touchable, which is
why one case asserts a late `color` write and not a late `disabled` one (the latter starts an opacity
settle wanting a `requestAnimationFrame` the host lacks). What this build settles is what the RULE
emits, which is where the ported logic now lives.

**Button reached ZERO folds on both platforms in the same commit**, and the arm is what made that
safe rather than a coverage trade: its Android owner fold — the Material style plus the selectable
background TNF clones onto it — moved into `foldButtonProps`, and the four vitest cases that watched
it were replaced by itest cases reading the committed payload. Strictly better than what they were:
a mocked `Platform.OS` steers the JS half, and a rule in `SymbioteFabricProps.cpp` never reads it.
It is the most expensive primitive this codebase ships (four crossings per commit three days ago) and
it now costs nothing in JS.

### A rule may key on its PARENT'S TAG — the descendant rule, and the two clone-folds it freed (2026-09-18)

Every ported rule until now keys off the node's OWN tag, and three iterations of this migration
recorded `TouchableNativeFeedback` / `TouchableWithoutFeedback` as unportable for that reason. Both
render no view: RN's bodies end in `cloneElement(child, {…})`, so our tag commits an ANCHOR and the
owner's props land on whatever the app wrote underneath — and that child usually carries NO TAG,
because a plain `<view>` registers no behavior. A self-keyed rule can never reach it.

**Giving the child the owner's tag is the obvious route and it is wrong**: the child may already own
one (`<pressable>` under a TWF), and a node has exactly one tag. So the DISPATCH moved instead.
`IOwner` now carries the parent's `tagName` beside its props, and `fabricProps` runs a second,
parent-keyed step after the self-keyed chain — a node can match both, in that order, which is the
order RN composes them in.

**That is the browser's shape rather than a workaround.** A user-agent stylesheet is full of
descendant rules (`td > *`), and an element's user-agent behaviour has always been allowed to depend
on what contains it. It is the same argument `ownerProps` already made for reading the parent's
PROPS, taken one step further to reading its NAME — and it costs the same, a pointer hop on a tree
already in memory.

Everything the rule needed had already crossed, which is why this was one commit and not a project:
`ownerProps` (the scroll-content seam), the engine's own aria fold, `usesTouchableFocusableRule`,
and `OP_SET_OWNED_LISTENER` — read off the PARENT, since `focusable` on a cloned child is a function
of whether the OWNER has a press callback.

**Priced on the same ruler as the other nine rules** (`tag-rule-cost.itest.ts`, `build-release`,
three runs, payloads asserted equal key by key first): **~13.6 us per cloned child per commit**,
landing mid-table beside `pressable` and `button`. The cost model held on a rule that could have
broken it — the child's own bag is ONE prop and the rule marshals EIGHTEEN off its parent, and the
price follows what crosses rather than whose node the keys came from. Read it as the price of one
touchable per commit, not per row: these tags have exactly one child.

**THE TEST MIGRATION WAS THE EXPENSIVE HALF, and its shape is the reusable part.** Thirty-six vitest
cases went red on ONE cause: every file located its subject by the `testID` the owner CLONES, and a
locator that depends on the ported rule stops working the moment the rule moves. The recording host
builds payloads through the TypeScript `fabricProps`, which deliberately carries no copy of the tag
rules — the property that makes it a sound harness for everything else is exactly what blinds it
here. Locate a derived node by POSITION, which the tag guarantees anyway.

Three things fell out of it, all recorded rather than smoothed over:

- **Five adapter tests needed a NEW WITNESS, not a deleted case.** Each proved `./register` ran by
  checking the clone; that is unobservable now, so they check a forwarded `onLayout` instead — the
  other thing only a registered behavior installs, still JS, and visible in the payload because it is
  a Fabric boolean-gated event. Same claim, different instrument.
- **A control got WEAKER and says so.** "Clones nothing when the behavior is not registered" had
  three absence assertions that now pass whether or not it is registered, because this host can no
  longer produce a clone at all. The listener half still controls; the absence half moved.
- **Two Android cases have NO new home and that is a coverage LOSS.** The background half is `#ifdef
  ANDROID`, so it is not compiled into the test host, and mocking `Platform.OS` no longer reaches it
  — what that mock steered was a JS function that no longer exists. Same hole `android_ripple`,
  `underlineColorAndroid` and `decelerationRate` already carry, and a PROPERTY of porting a
  platform-split rule.

**One mirror survived the port by a commit, and closing it made the code SHORTER rather than
longer.** The clone lists stayed behind to feed `slotDerived` — which owner writes must dirty the
child — so thirty names in JS had to agree with `kNativeFeedbackClonedKeys` and
`kWithoutFeedbackWhenSetKeys` in C++, failing silently on the one prop a list forgot.

`SLOT_DERIVED_ALL` replaced both lists, and it is the honest spelling rather than a shortcut: **a
`cloneElement` owner never derived its slot from a NAMED set** — it re-clones on every render,
whatever changed. Naming the keys was an optimisation, and one whose upkeep was a mirror. What it
costs is a false dirty on an owner prop the clone does not carry, and for these two tags that is
nearly empty: the owner is an anchor whose props reach Fabric nowhere else, so every name it holds is
either cloned or consumed by the press machine.

The guard is a case that a NAMED list gets wrong, not one it gets right: a late `hitSlop` write
reaching the child. **Break-tested by reducing `SLOT_DERIVED` to `['accessibilityLabel']`** — which
turned exactly that case red and left every other one in the file green, so it is the list it
measures and not the port. A first attempt used `opacity` (a prop TNF does not clone) and the commit
counter, and that one stayed GREEN under the reduced list: it was watching the wrong thing, and only
running the break-test found out.

And two dead JS legs went with the port: both clone-folds read `stringOr(source.id) ?? stringOr(
source.nativeID)` where `source` is the owner's NODE props, which `routeProp` had already resolved
that morning. **A second opinion about precedence, kept alive by nothing.**

### THE LAST `payloadFold` IS GONE — sticky headers, and zero JS folds in production (2026-09-18)

`stickyFold` was the only one left, and it had outlived three rounds of this migration because it
reads per-node RUNTIME STATE rather than props. Splitting its three outputs by ORIGIN is what moved
it, and that split is the reusable part:

```
 zIndex: 10     a constant of the wrapper      RN: `styles.header` (ScrollViewStickyHeader.js:318)
 collapsable    a constant of the wrapper      RN: a literal JSX prop (:291)
 translateY     the DEBOUNCED settled value    RN: `passthroughAnimatedPropExplicitValues` (:302)
```

Two of the three were never anything but the platform's. **The third is live and crosses anyway,
because it is live at SETTLE rate rather than frame rate** — the smooth pin rides the AnimatedProps
leaf and never passed through the fold at all, while this one is what hit-testing reads, pushed once
per debounce behind a same-value guard in the reducer.

**AND RN ITSELF SPELLS IT AS A PROP, which is what decided the seam — no new opcode and no new host
field.** The underlay precedent had just added `OP_SET_UNDERLAY_SHOWN` for a comparable bit, so an
op was the obvious move; reading `ScrollViewStickyHeader.js` first said otherwise. The machine writes
`stickyTranslateY` like any other prop, `foldStickyHeaderProps` composes it into the style, and the
key is stripped before Fabric — the treatment `kPressableMachineKeys` already gives Pressable's nine
machine props. **Check whether upstream already carries the value as a prop before inventing a
channel for it.**

**COMPOSED OVER, not under, and it inverts every neighbouring rule.** `foldActivityIndicatorProps`
and `foldScrollViewProps` put their base UNDER so an app can still override it; here a header whose
own style set a transform would cancel the pin, which is the entire point of the element. The test
is whether the style is a DEFAULT or a MECHANISM.

Contract: `core/engine/cpp/tests/js/sticky-header-payload.itest.ts`, nine cases, no JS twin.
**Break-tested three ways** — a wrong `zIndex`, the composition flipped to UNDER, and the strip
removed — each turning red exactly the cases it should and no others. The middle one is the reason to
bother: only "beats a transform the app wrote itself" catches an order flip, and it was written for
that.

**THE COST IS A FOLD COUNT, not a millisecond, and saying so is the honest part.** The tag-rule
ruler cannot price this one for the same reason it could not price the underlay: every arm there
needs a JS twin with a `payloadFold`, and the twin cannot exist once the rule lives only in C++.
What is exact is `foldsFound` 1 -> 0 per commit per header, and a header re-commits on every
settle — so it is per-settle, not per-mount. A screen holds a handful of these, so the absolute
saving is small and the reason to do it is that **`IHostBehavior.foldPayload` is now declared by
nothing in production.**

**And the CONTROL, because the port adds a branch to a chain every node walks.** The self-keyed
dispatch in `fabricProps` is an `if`/`else if` over tag names with no early-out, so an untagged node
— which is nearly all of them — already pays every compare in it, and this made it one longer.
`adapter-create-cost.itest.tsx` on `build-release`, three runs: engine wall **72.9 / 73.4 / 75.4**,
walk 26.3-27.8, against the 67-75 and 24-28 this page already records. Inside the band, so **no
regression and no claim of one either.**

An `if (tagName.empty())` skip over that chain was considered and NOT written: at ~13 compares over
10 000 nodes it is a few tenths of a millisecond against an arm whose own spread is ~2.5 ms, so this
instrument could not attribute it. **A change this page could not measure is a change this page does
not ship** — the same rule applied to the combined Vue run that could not be attributed.

**THE SEAM STAYS ANYWAY, and the reason is recorded on the field rather than left to be re-derived.**
It reads as a leftover, and this codebase's question about one is what it REACHES, not who uses it
today. It reaches two things: it is the JS ARM of every measurement in `tag-rule-cost.itest.ts` —
delete it and the ~9-31 us-per-node figures that justified every port in this migration can never be
taken again — and it is the declared extension point for a third-party primitive, which has no
option to write a C++ rule.

**THE TEST MIGRATION WAS FOURTEEN CASES ACROSS EIGHT FILES AND ONE CAUSE**, the same one the
clone-onto-child port hit: **every file located the sticky wrapper by `payload.zIndex === 10` or
`payload.collapsable === false`** — the fold's own output. A locator made of the thing under test
expires with it, and the vitest host builds payloads through the TypeScript `fabricProps`, which
deliberately carries no copy of the tag rules.

The replacement was already sitting there: **the recording host has retained `tagName` all along,
for exactly this** ("so a test can ask what the host was TOLD, separately from what a rule made of
it"). `ILiveNode` did not expose it, which is a one-line addition, and every locator became
`node.tagName === STICKY_HEADER_TAG`.

Three things fell out, all improvements rather than trade-offs:

- **Two locators lost an exclusion they needed.** Both section-list files had to skip
  `RCTScrollContentView`, because the content node carries `collapsable: false` too. A tag needs no
  exclusion — a content node's is `scroll-content`.
- **React's `<sticky-header>` case got its OWN claim back.** Its `why:` says the point is that React
  resolved the hyphenated tag and the behavior found it; `collapsable` was a proxy for that, and the
  tag says it directly.
- **One case was strengthened while being re-aimed.** The section-header test asserted a COUNT of
  two wrappers, which two wrapped ITEMS would also satisfy; it now asserts the titles. The `why:`
  had always been about which children got marked and the assertion had never said so.

### READING THE VENDOR TO PORT A CONSTANT FOUND A SHIPPING BUG INSTEAD (2026-09-18)

The census's next lead was `setProp(content, 'collapsable', false)` in `buildStructure` — a platform
CONSTANT written from JS onto a node whose tag already has a rule. Opening `ScrollView.js` to confirm
it is unconditional turned up something worth more than the port:

```
 RN    maintainVisibleContentPosition != null || (Platform.OS === 'android' && snapToAlignment != null)
 ours  maintainVisibleContentPosition != nullptr ||                            snapToAlignment != nullptr
```

**`snapToAlignment`'s leg is ANDROID-ONLY upstream and we honoured it on both platforms**, so every
iOS ScrollView that merely SNAPS was telling Yoga not to flatten its children — work RN never asks
for, on the commonest scroll configuration there is. Shipped, and invisible: the tree is correct,
only more expensive.

**A TEST PINNED IT AS CORRECT.** `scroll-content-payload.itest.ts` asserted
`snapToAlignment: 'center'` -> `collapsableChildren: false` on the default build. It was written
from the code rather than from upstream, which is the one thing a characterization must not be —
**an assertion copied from the implementation cannot disagree with it.** The case now asserts RN's
answer on the iOS arm and its twin on the Android arm, and break-testing the gate fires the iOS one.

**The JS twin in `tag-rule-cost.itest.ts` refused to time the fix**, which is exactly what
`expectSamePayload` is for: its arm used `snapToAlignment`, so the C++ rule and the JS copy disagreed
the moment the gate landed. That arm now uses the platform-INVARIANT prop, because a cost ruler that
only prices correctly on one build is a ruler that will mislead on the other.

**Then the constant moved**, and its case needed a second assertion to mean anything. `collapsable`
reaches the payload whether a `setProp` seeds it or a rule writes it, so the obvious case is green
both ways; what discriminates is that a rule's output lives in the payload and **nowhere else**, so
`propsOf(content).collapsable === undefined` is the half that says the seed is gone. Same witness the
sticky port used a commit earlier.

**It retired the rule's identity fast path** — there is no content node with nothing to add any more —
and the ruler CANNOT price that, which is worth saying rather than implying. Its arm sets an anchor
prop, so the fast path never fired there in the recorded 2.8 ms either; the retirement costs one bag
copy per SCROLL VIEW, not per node. Measured anyway: `content` native walk 3.0/3.0/3.4 against a
recorded 2.8, with the untouched `scroll` control moving 4.2 -> 4.3/4.4/4.5 in the same sitting. **A
control that drifts with the subject is machine state**, so no row here carries a verdict.

Six vitest cases went with it, all reading `collapsable` as the seed — the same group migration the
sticky port had. Two adapter files already carried the note for `nestedScrollEnabled` moving the same
way, which made the third and fourth obvious: **once a file has lost one assertion to the engine, the
next one is a pattern rather than a surprise.**

### THE CENSUS AFTER THE LAST FOLD — one more mirror, and the two things that cannot move

With no `payloadFold` left, "what still serves a TAG from JS" needs a different query than a fold
count. The one that worked: **ask what every remaining `Platform.OS` / `IS_ANDROID` branch in
`core/components` is FOR.** A platform branch is where a platform rule hides once the obvious
channel is closed.

Five sites, and four are correctly placed: `switch.ts` picks an imperative command NAME at gesture
time, `nativeFeedbackRefinement` configures the press MACHINE and dispatches view commands,
`button.ts:257` picks WHICH machine, and `render-keyboard-avoiding-view` takes the host as an
ARGUMENT so both branches stay testable. Machines and imperative calls are JS by the model, not by
omission.

**The fifth was a mirror: `backgroundProps`.** It mapped TouchableNativeFeedback's resolved
background plus `useForeground` onto the Android slot — which is the `#ifdef ANDROID` tail of
`foldCloneOntoChild`, api-level gate included, since `Platform.Version` on Android IS the api level.
No runtime caller, no test, reachable only through the package barrel. Deleted.

**`canUseNativeForeground` beside it STAYS, and the line between them is the reusable half.** It is
a QUESTION an app asks the platform — RN's own public `TouchableNativeFeedback.canUseNativeForeground()`
— not a rule that decides a payload. Same class as the slider reading a folded `accessibilityState`:
**asking is not reimplementing.** Two functions in one file, one a mirror and one not.

Break-tested before deleting, and the FIRST attempt did not run: inlining the slot pick left
`androidApiLevel` unused and `-Werror` failed the build. The same trap `IFirstChild`'s A/B already
recorded — **a build that fails is a test that did not run** — and it is easy to miss here, because
the runner prints a clean-looking result from the stale binary. Re-broken by inverting the gate
instead (which keeps every symbol used), it fires exactly one case on the Android arm.

**WHAT IS LEFT IS TWO THINGS, and neither is a fold, a mirror or an oversight:**

- **A tag's derived STRUCTURE is built in JS** (`buildStructure`). Button assembles four nodes on
  iOS and three on Android; ScrollView, ActivityIndicator and ImageBackground do the same. That is
  the platform's — RN builds it in a component body — but moving it means a tree builder in C++,
  which is a different piece of work from a prop rule and has no seam yet.
- **The tag -> Fabric component NAME table is in JS** (`component-names/index.{ios,android}.ts`),
  and it cannot simply move. `createElement` needs the native name BEFORE anything crosses, so a
  C++ table would cost a crossing per node — ten thousand on a benchmark create. Same shape as
  `resolveAssetSource`: a lookup that belongs on the side that needs it first.

So "all behavior lives beside the C++" is TRUE OF PROPS and not yet of structure. Say which one is
meant before calling this migration finished.

### A rule may read its CHILD — `IFirstChild`, and the last structural blocker goes (2026-09-18)

Every seam before this one reads UP: `ownerProps` (the parent's props), `IOwner.tagName` (the
descendant rule), `IAncestorLookup` (the nearest tagged ancestor). ScrollView's Android RefreshControl
wrap needs the other direction and was recorded as unportable in three separate places for it.

An Android ScrollView holds exactly ONE child, so a sibling refresh control is an `addViewAt` crash
rather than a layout mistake. RN inverts the tree — `AndroidSwipeRefreshLayout` WRAPS the scroll view
— and splits the app's style across the two boxes, layout on the wrapper's frame and visual on the
scroller, with the axis base composed onto BOTH (`ScrollView.js:1854-1863`). **The wrapper is the
scroll view's PARENT and needs the scroll view's AUTHORED style.**

**IT IS NOT A NEW KIND OF CLAIM, which is the whole reason it was affordable.** `ownerProps`' own
argument — the tree lives in C++, so reading another node costs a pointer hop rather than a closure
and a crossing — never mentioned a direction. Upstream builds this parent FROM its child
(`cloneElement(refreshControl, {style: outer}, scrollView)`), so "derived from what it contains" is
RN's shape rather than one invented here; a UA has the same, in `:has()` and in a table frame that
has always followed its cells.

**THE DIRTY PATH IS THE HALF THAT IS NOT FREE, AND IT ALREADY EXISTED.** A rule runs when ITS node is
dirty, so a wrapper reading its child re-derives only if a write to that child marks the wrapper —
which `routeProp` does through its `node.wrapper` branch under `slotDerived`. Without it the wrapper
freezes at its mount frame while the scroller visibly restyles inside it. `slotDerived: ['style']`
was already there for the JS fold and is now load-bearing for the engine's rule; the seam did not
change the requirement.

**TOPOLOGY GATES BOTH HALVES, NOT `#ifdef ANDROID`** — iOS claims the refresh control BESIDE the
content, so a scroll view is never one's child there and neither branch can fire however the host was
compiled. Strictly better than a compile-time split for the reason `Switch`/`AndroidSwitch` already
showed, and it is why the fixture runs on the ORDINARY test host: the behaviour under test is a tree
shape, and a tree shape is reachable on any build. (`index.android` is imported by PATH, exactly as
`wrap-android.test.ts` does — the platform FILE is still Metro's choice and the harness resolves iOS.)

**FIRST child rather than a list, deliberately.** The only shape that needs this is a wrapper, and a
wrapper has one. A rule surveying N children would be reading the tree rather than deriving from it,
which is the line this seam should not cross.

**IT COSTS NOTHING, and that had to be measured rather than assumed, because `firstChildOf` runs for
EVERY node in the walk** — unlike `IAncestorLookup`, which is a callback nothing pays for until a
rule asks. Two instruments:

```
 tag-rule-cost, native walk, 3 runs   every one of the eleven rows inside its own prior spread
 adapter-create-cost, best-of-5       68.2 ms with the read · 68.2 ms without   walk 25.3 · 25.5
```

The create arm's own spread is 68.2-89.3 — about 20% — so **only the MINIMUM carries anything**, and
the A/B was run in one sitting with the call replaced by `IFirstChild{}` and the binary rebuilt. The
first attempt at that arm silently measured nothing: `-Werror` rejected the now-unused function, the
build failed, and five runs went to the STALE binary. A build that fails is a measurement that did
not happen — read the compiler's exit, not the numbers that follow it.

**WHAT WENT WITH THE PORT is more than the two folds.** `splitLayoutProps` and `splitScrollViewStyle`
(and RN's twenty-eight-key layout partition) left `scroll-view-commands.ts`; `SCROLL_VIEW_BASE_*` and
`IScrollIntrinsics.scrollViewBaseStyle` left `render-scroll-view.ts` with the parity test that held
them; and `IHostBehavior.onWrapChange` — whose own doc said "neither node can work that out alone" —
left the engine with its only implementor. **A hook that exists to work around a missing seam should
be deleted when the seam lands, not left to misdirect the next reader.**

**ScrollView is now at ZERO crossings on all three of its nodes** — scroller, content view and
wrapper — which no other composed primitive of this size has reached.

**THE TEST MIGRATION HAD THE GROUP LESSON IN ITS SHARPEST FORM YET.** `wrap-android.test.ts`'s
style-split `describe` held three cases. TWO went red on the move, honestly. The THIRD — "stops
splitting the style when the wrap goes away" — went on PASSING, because with no rule in that host
there is no split to stop, so an unwrapped owner carries its whole style whatever the engine does. It
would have stayed green forever and meant nothing. **A case whose subject is a fold cannot stay
behind beside the twins that failed**; the whole group moves. Same shape ActivityIndicator's "OMITS
colour entirely" case had, and the second time this migration has had to delete a case that was
GREEN.

What stays in that file is what the JS host is authoritative for and the itest is not: the TOPOLOGY —
who ends up whose parent, that the owner keeps its identity across a wrap, that removing the
RefreshControl puts it back.

### The UNDERLAY was three portable inputs and one bit — and this page said otherwise three times

TouchableHighlight's underlay fold outlived every other per-node rule, and three separate notes here
called it "the genuine unportable article" because `shown` flips inside a gesture. Splitting the
fold's inputs is what settled it:

```
 shown            live, held past release by a `delayPressOut` timer      JS — and still is
 hasPressHandler  the EXISTENCE of any of four press listeners            crossing since OP_SET_OWNED_LISTENER
 underlayColor    an ordinary prop — one the engine ALREADY strips        a prop
 activeOpacity    the same                                                a prop
```

**Three of four were portable before the port began, and the fourth is ONE BIT.** `shown` is not the
press state (`setNodePressed`) and could not reuse it: RN holds the underlay past release so a fast
tap still flashes, so it LAGS the press by a timer. It crosses as `OP_SET_UNDERLAY_SHOWN`, on a flip
— twice a tap — against a fold charged on every commit the node was dirty in.

**THE TELL THAT MADE IT WORTH DOING was in the code rather than in the reasoning.** The engine strips
`underlayColor` and `activeOpacity` (`kTouchableFeedbackKeys`, because RN forwards neither to the View
it renders), so the JS fold could not read them off the bag it was handed and reached back to the NODE
for them. **One side erasing a prop while the other reaches around it for the same value is two halves
of one rule.** That is a cheap thing to grep for and a good signal for whatever is ported next.

**The press-listener state had to become a MASK, and the field's own comment had predicted it.** It
read "`press` is the only owned name any platform rule reads; a second would be a second bool, and
only a third would be worth a bitmask." Two bools is not enough and not for a size reason: `focusable`
asks about `onPress` ALONE (`TouchableOpacity.js:336-339`) while `_hasPressHandler` asks about any of
four (`:296-302`) — and "any of four" can go DOWN when one name departs, which nothing on the C++ side
can recompute, because the listeners live in JS and each op is about ONE name. A bit per name is the
smallest state that answers both questions from what the ops carry. **Break-tested both ways**:
collapsing the mask to one bit turns exactly the two four-name cases red, and making it OR-only (never
clearing) turns the take-away case red here and one case red in `touchable-focusable-payload.itest.ts`.

`bool hasPressListener` became `ISelf` in the same change — the lone bool beside three structs was the
shape that grows a fourth unreadable positional argument, which is what `IOwner` had already learned.

**THE COST MEASUREMENT IS A FOLD COUNT, NOT A MILLISECOND, and saying so is the honest part.** The
tag-rule ruler cannot price this one: every arm there needs a JS twin with a `payloadFold`, and the
twin cannot exist once the bit lives only in C++. What is exact is `foldsFound` — 1 -> 0 per commit,
and the recorded FIVE at mount for a single touchable (the opacity settle re-commits it before it
rests) -> 0. A screen holds a handful of these, not a thousand, so the absolute saving is small and
the reason to do it is architectural.

The ruler did move ~5% across every row in the same sitting, INCLUDING `image`, `content` and `clone`,
which this change cannot reach. That is a built-in control: a uniform shift across untouched rows is
machine state, and no row carries a verdict at that size.

**ONE PARITY GAP FOUND HERE AND CLOSED IN THE NEXT COMMIT** — `testOnly_pressed`, which we supported
nowhere. Deliberately deferred rather than folded in: a port is a MOVE, and mixing a behaviour change
into one makes both unattributable. See "One prop, two mechanisms" below.

**The test migration split cleanly for once, and the reason is worth keeping.** Every case asking WHEN
the underlay shows survived on a new witness — the recorded bit, which the recording host takes from
the op without applying any rule — while the two asking what it LOOKS like moved to the itest whole.
A bit cannot tell a crimson underlay from a black one, so a colour case has no business being
rewritten onto it; that is what makes "move the group" the right call rather than a shortcut. Across
the three adapters the surviving claim sharpened rather than weakened: what an adapter owes is that
its wiring reaches the machine and that the app's props reach the node, which is exactly what
`underlayShown` plus `payload.underlayColor` say.

**And the fixture lied to itself first.** `folds` was written as a lazy getter over
`readSurfaceTelemetry`, which answers about the LAST commit — so the cost assertion read 0 while the
`print` on the line above showed 1, and passed. **An assertion that reads its subject twice is not
asserting about the same thing twice.** Captured at commit now.

### One prop, two mechanisms — `testOnly_pressed`, and a budget test that caught the wrong seam

RN's snapshot affordance, supported nowhere here until 2026-09-18 and found by reading the vendor for
the underlay port. It is one prop NAME over two unrelated mechanisms, and treating it as one thing is
how it would have been got wrong:

```
 TouchableHighlight  PAINTS an underlay with no gesture, and `_hideUnderlay` returns early on it
                     so the pin LATCHES              ->  a C++ rule, off the authored bag
 Pressable           SEEDS the pressed state, which selects `activeStyle` and any `:active` class
                     (`usePressState(testOnly_pressed === true)`)  ->  JS, where the class registry is
```

**THE ASYMMETRY IN UPSTREAM IS EASY TO "FIX" AND MUST NOT BE.** `_showUnderlay` gates on
`_hasPressHandler` (`TouchableHighlight.js:271`), but the INITIAL state does not — `:187-190` is a
bare ternary with no such check — so a decorative highlight with no callbacks still snapshots pressed.
That is what a snapshot of one needs. Reproducing the gate would look more consistent and be wrong.

**THE FIRST SEAM WAS WRONG AND A BUDGET TEST SAID SO, in the one currency that matters.** Pressable's
half went into `attachAfterCommit`, because `attach` runs at `createElement` before any prop is
routed. That costs a post-commit WAITER on every pressable in the app:
`adapters/solid/src/crossing-and-payload-census.probe.test.tsx` budgets crossings per
behaviour-carrying node at two and reported **six**.

The reasoning that put it there is the reusable mistake: the alternative was a string compare in
`routeProp`, and that was rejected as "the hottest path in the engine, for a testing prop". **A JS
compare is not a boundary crossing, and weighing it as one picks the seam that actually costs
something.** In `routeProp` it costs one comparison on a write that already reached the tail, lands on
the FIRST commit rather than the second, and crosses nothing.

**AND IT IS A SIDE EFFECT PLUS A PASSTHROUGH, not a consume.** The first spelling returned early;
that kept the prop out of `node.props`, so TouchableHighlight's rule — which reads the AUTHORED bag —
went blind and three of its cases went red. Setting the state and letting the write continue is the
shape `GATED_EVENT_PROPS` already uses. Keeping the name out of the PAYLOAD is a separate job done by
`kPressableMachineKeys`, and **break-testing that strip fires two cases**, one of them the Pressable
case that has nothing to do with the underlay — a leaked prop no ViewConfig declares is otherwise
silent.

**The type surface is part of the feature**, eleven declarations across five adapters plus Angular's
`PressableElement` base. Svelte's `canonical-prop-names` audit failed until its shim list learned the
name, which is what that guard is for: a prop an app cannot spell is not shipped.

### `id` -> `nativeID` had SEVEN implementations, and the one in C++ was the wrong seam (2026-09-18)

A tag rule keys off `tagName`, which `recordSetTag` writes and `attachHostBehavior` alone emits — so
`foldIdAlias` reached a node only if some behavior had been registered for its tag. `view` and
`text` register none. **The rule never touched the two commonest elements in any app**, and the
adapters' own folds were what saved them: `foldHostBag` off `HOST_PRIMITIVES[*].aliases` (nineteen
entries, the same pair on every one) for React/Svelte/Angular, plus Vue's `patchProp`, Solid's
renderer with a `WeakSet` for precedence, and Angular's own `PROP_ALIASES`.

**THE OBVIOUS CLEANUP WAS THE WRONG ONE AND A TEST STOPPED IT.** With the C++ rule in place,
`foldHostBag`'s alias half read as a leftover mirror — the shape this project deletes on sight.
`id-alias-coverage.itest.ts` was written to confirm that before deleting it, and it reported the
opposite: the coverage sets were different, not duplicated. **A second implementation of one rule is
not automatically a mirror; ask what each one REACHES before removing either.**

So the seam is `routeProp`. Every adapter's prop write ends there whatever shape it starts in, which
is the one thing a bag fold and a per-key renderer have in common — a bag fold cannot serve Vue or
Solid, and a per-key fold cannot serve React's `applyProps`. Seven implementations, one left.

**It is a behaviour CHANGE for three adapters and the divergence was the bug, not the rename.** Vue,
Solid and Angular folded per key with no gate, so they were ALREADY renaming `id` on third-party
views while React and Svelte were not. One answer for everybody now, and it is upstream's: RN's
convention is `nativeID`, and a raw `id` is dropped by any ViewConfig whatever the view.

**The engine carries the PRECEDENCE that only Solid had built.** `nativeID={id ?? nativeID}`
(`View.js:77-79`) is a whole-BAG expression; a renderer folding one key at a time never sees both, so
precedence fell out of WRITE ORDER — `<view id nativeID>` keeping the stale legacy value while
`<view nativeID id>` did not. `routeIdAlias` remembers which source fed the slot, so `id` wins in
either order and clearing it hands the slot back to an authored `nativeID` rather than to undefined.

**STRUCTURALLY INERT, which is the measurement that carries a verdict here.** Every counter on the
eight-step bench suite is byte-identical to the recorded run — `setProps` vue/solid 10 000, react
12 000, svelte/angular 13 000, with `unchanged=0`, `folds=0`, `created=10000 cloned=2 nodes=10003`.
Same writes, same crossings, no fold. The wall clock on the machine that sitting ran on had a ~50%
per-arm spread (react's create read 154-209 across four runs), far wider than two string compares
could move, so **no timing verdict is claimed and none should be quoted from it.**

Two dead JS legs fell out afterwards, and both were the same shape: `touchable-without-feedback` and
`touchable-native-feedback` clone `stringOr(source.id) ?? stringOr(source.nativeID)` onto their
child, where `source` is the OWNER'S NODE PROPS — which `routeProp` has already resolved. The `.id`
leg read a key that can no longer exist. **A second opinion about precedence, kept alive by nothing.**

And three tests were quietly measuring one thing twice. Each ran an `id` case over TWO arms, raw and
`foldHostBag`-folded, because the adapters renamed in three different places; with one place left,
`foldHostBag` returns its input and the two arms became one bag mounted twice. **A loop whose arms
have converged reports agreement with itself** — collapsed rather than left green.

### `foldHostBag` is GONE, and the deletion needed the break-test its own predecessor prescribed

With the aliases moved to `routeProp`, the function's other half was `HOST_PRIMITIVES[*].defaults` —
nineteen entries seeding a bag before it was written. It read as a leftover, and the section above
had just established that reading-as-a-leftover is not a finding: **ask what it REACHES.**

So the same instrument was used, and it answered the other way this time. Emptying `defaults` and
running the whole itest suite produced **zero failures**, and the behavioural claim it looked like it
was making turned out to live somewhere else entirely —
`core/engine/cpp/tests/js/committed-payload.itest.ts:89`, "shows a text node the platform defaults no
adapter writes", which commits an `RCTText` with `{}` and asserts `ellipsizeMode === 'tail'` and
`allowFontScaling === true`. That is `applyTextDefaults` in the payload builder, which took over the
job the day the seed was deleted from three adapters. The fold's copy had been dead since.

**One fixture looked like the instrument and was not**, which is the trap worth naming: a Text arm
whose bag authors both keys explicitly cannot go red when a DEFAULT disappears, however loudly it
mentions them. An unchanged counter is evidence only once you have checked the fixture could have
moved it.

Four files and 664 lines went: the function, its tests, the Svelte shim's copy, React's host-config
call, Angular's `textDefaultFor`, the `defaults`/`IFoldOp` half of `host-primitives.cjs`, and two
package subpaths. **Seven implementations of the alias, then the bag fold itself — the whole
mechanism, not just its users.**

### RN's two Text defaults had SIX implementations, and the headless builder was the wrong place for the last

`ellipsizeMode ?? 'tail'` and `allowFontScaling !== false` (`Text.js:289,291`) were written out in
`SymbioteFabricProps.cpp`, in `core/engine/src/fabric-props.ts`, in `core/components/src/text-props.ts`
(`resolveTextProps`), in Angular's `TextHost`, in Vue's renderer and in Solid's. Every copy had a
sound-sounding local reason and most had a comment saying the OTHERS were the seed. All five JS ones
are gone.

**The seam is the payload builder, keyed on the component**, and what makes it the right one is that
it reads the AUTHORED bag: a null, an explicit `undefined` and an absent prop are alike by the time
it looks. That is the question every copy existed to answer. Angular declared two real `@Input()`s
specifically because "a default can only be applied by code that can SEE whether the caller supplied
a value, and a pass-through host binding is invisible to the component" — true, and answered one
layer down, so `TextHost` is an ordinary primitive host again. Solid went through THREE shapes for
the same reason (a create seed, a substitute-on-`undefined`, then a fold per key because `??` has to
catch a null too); the null that cost it two revisions is `ellipsize->isNull()` in C++, once.

**THE HEADLESS BUILDER'S COPY IS THE ONE WORTH READING TWICE, because it looks like the one that
should stay.** `core/engine/src/fabric-props.ts` is not dead code — it builds every payload the
recording host serves, so its copy is what made ~29 vitest cases green. But it is a TEST-ONLY
builder (the TypeScript reference applier it was also written for no longer exists), and a payload
rule asserted against a second copy of itself is asserted against nothing. That is already the
stated policy for the ten tag rules — `fabric-props.ts` deliberately holds none of them — and these
two were simply on the wrong side of a line the file had already drawn.

**The hazard was live, not theoretical.** `foldTextInputValue`'s `defaultValue` leg appeared in NO
itest, so the device rule could have broken with every suite green; `text-input-payload.itest.ts` now
pins the precedence, the erasure, the explicit-`text` case, the component gate and the multiline tag.
**Break-tested by neutering the C++ rule** — four of the five new cases go red, and the fifth stays
green because it is the control (a view is untouched either way).

**One test file's header contained its own refutation, and reading it is what turned the deletion
from a guess into a decision.** `core/engine/src/__tests__/text-payload-defaults.test.ts` said it
"keeps the copies honest"; being a vitest over one of the two copies, it could only ever keep the one
honest. The C++ file's comment cited it for the same claim. Two places asserted a guarantee that no
code provided.

**WHAT THE ADAPTER TESTS BECAME, and the rule generalises to the next port.** Each case split into a
claim about the PLATFORM (moved to an itest) and a claim about the ADAPTER (kept, re-aimed). The
adapter half is almost always one of two things: *does this adapter commit the node under the
component the rule is keyed on*, and *does an authored value reach the engine unchanged* — including
the `false` that `!== false` exists for, which is the value a renderer is most likely to swallow.
Vue's and Solid's clear-back cases INVERT: they used to assert the adapter substitutes the default
for an explicit `undefined`, and now assert it forwards the clear untouched, which is the opposite
behaviour and the correct one.

**Two cases had to be deleted rather than re-aimed, and the tell is the same both times: after the
change they passed for a reason unrelated to their subject.** "Does not seed text defaults onto a
View" is trivially true once nothing seeds anything anywhere. An absence assertion whose harness can
no longer produce the key passes forever and means nothing — the same shape already recorded for
ActivityIndicator's colour case.

**`foldTextInputValue` DID NOT GO WITH THEM, and splitting there was the point rather than a
shortcut.** Removing both at once turned 47 tests red across 25 files; removing the defaults alone,
29. The remainder are mostly TextInput MACHINE tests — the controlled-value handshake, which stays in
JS by design — using `payload.text` as their observable, so re-aiming them is a different piece of
work with a different argument. Two rules deleted in one commit is one commit that cannot be
attributed, which is the discipline this file already applies to measurements.

**IT WENT IN THE NEXT COMMIT, and the split paid for itself in the counting.** Measured alone it is
**18 cases across 8 files**, not the ~32 the combined run implied — the inflation was the two rules
overlapping in the same files, which is exactly what makes a combined change hard to reason about
before doing it. `core/engine/src/fabric-props.ts` now holds NO platform rule at all, and its header
says so as the file's own contract.

**The re-aim is one substitution with one idea behind it: `payload.text` becomes `payload.value`.**
A machine test asking "did the app's controlled value settle correctly" can read it under the name
the MACHINE writes, and the rename into RN's private `text` is the engine's. Nothing lost: the
census probe still reads two keys (`mostRecentEventCount` + `value` where it was `+ text`), so even
the key COUNT is unchanged — which is what makes it visibly a rename rather than a deletion.

**One case flipped rather than moved, and it is the group-migration rule again.** `v-model`'s
CONTROL arm asserted `committedProps()?.text` is undefined without the directive. After the port
`text` is absent from every payload this harness builds, so that control would have passed forever
while controlling nothing — it moved to `value` WITH its two positives, where it still discriminates
because nothing writes `value` without the directive either. And Solid's "never forwards the JS-only
props" lost its `defaultValue` leg for the same reason its `inputMode` leg went earlier: the stripping
is the engine's. What is still that layer's is the FUNCTION, because dropping a function is not a
rule about text inputs — it is a property of building a payload at all.

### The aria fold is the THIRD rule written twice, and the first whose JS copy is not a mirror

`foldAriaProps` exists in `core/engine/src/accessibility-props.ts` and in `SymbioteFabricProps.cpp`,
the two written to be read side by side. Until 2026-09-18 every assertion about it ran against the
FIRST, in vitest — so the device copy could have broken with the whole suite green, the same gap
`foldTextInputValue`'s `defaultValue` leg had. `core/engine/cpp/tests/js/aria-payload.itest.ts` closes
it: eleven cases off the committed payload, **break-tested by returning the bag unfolded**, which
turns nine red and leaves exactly the two gate controls green.

**BUT THE TWIN DOES NOT GET DELETED, and that is the distinction worth carrying.** The JS copy has a
real runtime caller that is not the payload builder — `resolveAccessibilityProps` in `core/components`,
which component bodies use to fold a bag before handing it on. "A second implementation is not
automatically a mirror; ask what each one REACHES" cut the other way for the Text defaults, where
nothing else reached them, and it cuts this way here. What is still arguably wrong is the payload
builder's CALL to it, which puts a platform rule back in the headless payload; removing that costs
**27 cases across 16 files**, measured, so it is its own piece with its own argument.

**THE CALL WENT ANYWAY, the same day, and the headless builder now holds NO platform rule at all.**
The distinction above still stands — the FUNCTION stays, because `pickAccessibilityProps` folds a bag
and then picks fields BY NAME, which it cannot do from a bag holding only `aria-label`. What was
wrong was the payload builder calling it. 27 cases across 16 files, as measured.

**IT DRAGGED A WRITE-ONLY FIELD OUT WITH IT, which is the part worth generalising.**
`node.hasAriaAlias` existed to let the builder skip the fold on the ~99% of nodes carrying no alias,
and `routeProp` maintained it with an `isAriaAliasKey(key)` on EVERY prop write — the hottest path in
the engine, 13 000 writes on one benchmark create. With the fold gone nothing read it, and nothing
would have noticed: a write-only field type-checks, tests green, and reads as load-bearing to the
next person maintaining that line. **A field with a cost and no reader is worse than a slow one.**
The field, both writers and `isAriaAliasKey` itself all went; the C++ recomputes the gate from the
bag it already holds, which its own comment had said all along.

Structurally inert on the bench suite — `setProps` 13000/9000/10000/10000/10000, `created=10000
cloned=2 nodes=10003`, `folds=0`, every counter byte-identical. **No timing verdict and none is
expected**: a boolean check over 13 000 writes is microseconds against a 150-400 ms create, and that
sitting's wall clock swung ±60% in both directions between runs.

**THE RE-AIM HAS ONE SHAPE ACROSS ALL 16 FILES, and it is sharper than what it replaced**: assert the
AUTHORED, hyphenated key arrives. That is not a consolation claim — the rule reads `aria-label`
literally, so a compiler that camelised or dropped it ends accessibility in silence, and Svelte's
really does lowercase every static attribute name. Two cases kept their full force with only the key
name changed: Solid's `withStableKeys` widening (its `spread` has no removal pass, so a prop going
undefined can leave its key standing) is now watched on `aria-label`, **the key the spread actually
holds** — the better place for it.

**ONE CALLER CONVERTED, AND THE COUNT I GAVE FOR THE REST WAS WRONG.** After the call left the
builder, this section said the remaining JS fold was "one Svelte file, 4 uses". That was a census of
`pickAccessibilityProps` — the wrapper — not of `resolveAccessibilityProps`, which is what actually
folds. Counted properly: **~15 runtime callers across all five adapters and the slider package**
(Modal, KeyboardAvoidingView, VirtualizedList, Image, Slider). Measuring the wrapper and reporting
the number as the rule's is the same mistake as reading a call site instead of a call graph.

The Svelte list wrapper did convert, Red-Green: a new case in `flat-list.smoke.test.ts` asserts an
`aria-label` survives the component hop to the committed `RCTScrollView`, which **failed first**
because the pick folded it. It forwards the aria half RAW now and the engine folds once at the leaf.

**The key list is DERIVED, which is the part that generalises.** Adding fifteen hand-written
`if (props['aria-…'])` lines would have traded one mirror for another — a second copy of the alias
list, the exact thing `ARIA_ALIAS_KEYS`' own comment says goes stale one member at a time. The loop
reads that exported list instead, so the wrapper gains a new alias the day the engine does.

**It needed `ARIA_ALIAS_KEYS` narrowed from `readonly string[]` to `as const`**, because a `string`
cannot index a prop type and this repo forbids `as`. That is a strict improvement rather than a
concession: the members are literals now, so the engine's list and `IAriaProps` CHECK EACH OTHER —
a name in one that is not a key of the other stops compiling at the use site instead of going
quietly unforwarded. (`Object.assign(picked, {[key]: value})` rather than `picked[key] = value`:
the key is a union correlated with its value type, which TypeScript cannot follow across a loop, and
this is the spelling that stays sound without a cast.)

**WHAT IS NOT DONE, stated plainly rather than implied by the commit.** The other ~15 callers still
fold in JS, so the codebase is MIXED: one path forwards raw, the rest fold first. That is not a
correctness problem — folding is idempotent and the engine folds whatever reaches it.

**AND THE REST SHOULD NOT BE CONVERTED, which is the opposite of what this section assumed.** The
whole value of converting them was to DELETE the JS fold. That is off the table, and one call site
settles it rather than a judgement call:

```
packages/slider/src/core/slider-state.ts
  resolveSliderDisabled(disabled, accessibilityState) -> accessibilityState?.disabled === true
```

`<Slider aria-disabled>` must disable the slider's GESTURE MACHINE, and that decision is made in JS
before any commit. **A component whose machine branches on the folded value needs the folded value in
JS — it cannot wait for the payload.** That is the browser's arrangement too: a page may ask for an
element's computed accessible state, and asking is not reimplementing.

With the fold staying, converting the remaining callers buys almost nothing: `foldAriaProps` returns
its input BY IDENTITY when the bag holds no alias, which is the ~99% case, so the cost it would
remove is already not paid. Fifteen sites across five adapters for that is churn.

**One claim in the paragraph above was WRONG and is corrected here.** It said
`adapters/react/src/components/modal/index.ts:94` destructures the folded result by canonical name.
It destructures the component's OWN props (`visible`, `style`, `children`) with `...passthrough`
taking the rest, and never reads an `accessibility*` name — it could forward raw. The real reader is
the slider, found by looking instead of inferring from a call shape.

**So the mirror is load-bearing and is made LOUD instead**: `core/engine/cpp/tests/js/
aria-fold-parity.itest.ts` computes the JS fold and commits the same bag through the C++ rule, over
seventeen bags chosen one per branch, and compares every key both sides produce. **Break-tested** by
flipping the C++ `aria-live="off"` answer from `none` to `assertive` — it fails naming the key and
both values. It is the only place the comparison is possible, because the itest harness holds both
in one process.

It deliberately treats `undefined` and `null` as ONE answer. Both sides build a composite by listing
every known field, so an unset field is present-with-no-value, and each spells that in its own
language — JS `undefined`, C++ a `folly::dynamic` null. Every consumer reads them identically
(`state?.disabled === true`, `coalesce`), so forcing agreement would make one side lie about its own
types. **What must agree is every field that HAS a value**, and that is what is compared.

**Two findings fell out that had nothing to do with the port:**

- **React's `aria-fold-double-pass.test.tsx` never tested a double pass.** Its subject is real on
  device — a wrapper folds, then the C++ rule folds again — but both of its cases mounted a BARE
  `<view>`, which has no wrapper, so pass 1 never ran. Green for two passes while exercising one.
  The claim moved to `aria-payload.itest.ts`, where both passes exist; it holds by CONSTRUCTION,
  because pass 1 blanks its aliases and `recordSetProp` ERASES a key written `undefined` rather than
  storing a null, so the gate sees them genuinely absent.
- **Five Solid component files carried the same case copied**, each asserting the engine's rule
  through a different component. One claim, five copies, and the `why:` on each said the fold happens
  "in JS" — which had been false since the port.

**Three things the writing of that file taught, none of which came from reading the rule:**

- **A case can assert an inner rule while never satisfying the OUTER gate.** "Replaces the state
  composite" was written with only an `accessibilityState` in the bag — but the whole fold is behind
  `hasAriaAlias`, so nothing ran and the composite passed through with its invented field intact. The
  fix was an `aria-busy` in the bag, and the discovery became its own case: **a composite written
  with no aria key beside it reaches Fabric exactly as authored**, unnormalised. Both implementations
  agree, so it is the contract rather than a bug — and it is the surprising half, because the
  composite rules do not apply to a node that only uses RN's own spelling.
- **The itest harness's `toEqual` is `JSON.stringify`, so it is KEY-ORDER sensitive.** The two
  implementations build `accessibilityState` in different orders and agree on every value; that read
  as two failures. Assert a composite field by field. (It also means `toEqual` cannot see a key whose
  value is `undefined`, since `JSON.stringify` drops it — worth knowing before trusting one.)
- **"The explicit value survived" is a one-sided oracle**, true of a rule that never ran at all. It
  needs the ERASURE asserted beside it, which is what makes the case fail under the break. Found by
  running the break-test and noticing which cases stayed green, not by review.

### TWO GUARDS THAT HAVE STOPPED GUARDING — found while porting, recorded rather than quietly fixed

Both were noticed by asking what a passing test can still SEE, which is the question the text-defaults
port made routine. Neither is fixed: each repair is a decision with its own scope, and folding either
into a port would be the unattributable-commit mistake the section above exists about.

**`core/engine/src/applier-is-not-forked.test.ts` is trivially green, for the FOURTH time**, in a
file that documents its own three previous expiries and states the lesson each time ("a guard keyed
on HOW something is built expires when the build changes"). Its scan looks for `registerCommitHook` /
`completeSurface` in our native sources after stripping comments; both markers now appear ONLY in
comments in `SymbioteTree.cpp` and `SymbioteEngineBindings.h`, so `nativeApplierFiles()` returns
empty and the "whole point" case early-returns before asserting anything. Verified by running the
file's own `withoutComments` over both sources.

And the obligation itself has no subject any more: the differential it demands,
`core/test-utils/src/tree-applier.fuzz.test.ts`, does not exist — nor does `tree-applier.ts`, the
TypeScript reference tree host it was written to hold honest. **There are not two tree hosts over one
buffer now; there is one.** So the pair this file forbids is, for the fourth time, not a pair. The
open question is whether anything survives re-aiming, or whether the file should go.

**`adapters/solid/src/bare-tag-payload-parity.test.tsx` compares a payload with itself**, in all its
cases. It mounts `payloadOf(WRAPPER_ROOT, () => <text …/>)` against
`payloadOf(TAG_ROOT, () => <text …/>)` — identical JSX, and `adapters/solid/src/components/` holds no
`text` or `view` component any more, only `*-props.ts`. Its own header predicted exactly this ("once
`View` is a string, there is no component left to compare against"). The comparison DID its job
across the switch and the record is in git; what is left is a test that cannot go red for its stated
reason. The repair is the shape its sibling `tag-folds.test.tsx` already uses — one arm, absolute
expectations naming the keys the layer now produces — and the Text case has had it done; the other
seven are noted in the file and left standing.

**The general form, and it is the cheap check both came from: a test that passes tells you nothing
until you know what would make it fail.** For the first, the scan's own input had drifted out from
under it; for the second, the two arms converged. Neither is visible in a green run, and both are one
question away.

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

### A raw text can carry a TAG, and two of Button's four folds were not rules at all

Button's derived nodes are `button -> view -> text -> rawtext` on iOS and `button -> text -> rawtext`
on Android. Two of their folds went on 2026-09-18, and neither went the way a port usually does.

**`viewFold` was DELETED, not ported, because it was doing nothing on the only platform that runs
it.** It wrote `style: resolveButtonViewStyle(color, disabled)`; that function returns the constant
`buttonViewStyle` on every platform but Android, `buttonViewStyle` is `{}` off Android, and the view
node is built only in the non-Android branch. So it read two props off its owner, discarded both, and
spent a JSI round trip per button per commit to write an empty object. Second time this migration has
found that shape after `input-accessory-view`, and the cost model says why it keeps happening: **the
price is the TRIP, so a fold whose body is empty costs exactly what a fold that does real work
costs.**

**`labelFold` moved, and it needed `createRawText` to take a tag.** `button-payload.itest.ts`
recorded "a raw text carries no tag at all, so there is nothing for a tag-keyed rule to key on" —
true of the old signature, not of raw texts. A raw text has no props an app can write, but its
CONTENT can still be the platform's decision: RN renders a button's title uppercased on Android
(`Button.js:352-353`), which is a user-agent choice about a control. `foldButtonLabel` does it now.

The guard on that new parameter is NOT `createElement`'s. There, every element might have a behavior,
so the gate is `hasHostBehaviors()`. A raw text is the leaf under every `<Text>` on a screen and
exactly one kind is tagged, so an untagged one compares `tag !== RAW_TEXT_COMPONENT` first — the same
string literal, therefore pointer equality — and skips the intern, the op and the registry miss.
Measured on the 3 000-raw-text create fixture: `engine wall` 69.0/69.3 ms against the recorded
67-75 band, i.e. unmoved.

**The count was wrong in both directions and the measurement corrected it.** This file recorded FOUR
crossings, one per node. A button driven through `routeProp` measured **five** before and **three**
after: the fold counter is per SURFACE over the commits a button actually performs, and its
touchable's `afterCommit` settle re-commits it — the same reason a single touchable reads 5 rather
than 1. What is exact is the delta: two folds removed, two crossings gone, one each.

**And the two fixtures disagree on purpose.** `button-payload.itest.ts` writes with `setProp`, which
skips the slot redirect that lives in `routeProp`, so its label never receives the title, an empty
raw text is dropped from its parent's child set, and that label's fold never ran there at all. Its
count went 4 -> 3 and shows only the view's deletion. Read the two numbers together or neither.

**The owner's fold then went too, the same day, and off Android Button now binds NO fold at all —
one crossing left, down from five.** Its last line was `focusable`, and both of its blockers had
already dissolved: the middle leg is an owned listener, whose existence crosses as a bit since the
touchable port, and Button's three-way `disabled` (`props.disabled ?? aria-disabled ??
accessibilityState.disabled`, `Button.js:331,337`) was only ever three PROPS. `foldButtonProps`
layers the three-leg answer over the one-leg one `foldPressableProps` writes, which is why
`usesTouchableFocusableRule` excludes `button` — the same order the JS composition had.

It reads the AUTHORED bag, not the one it is handed: by then `disabled` has been erased into
`accessibilityState` and `aria-disabled` folded into the same place, so the `??` precedence would
collapse to whatever ended up there. Trap A again, and the JS fold carried the identical correction
as `projectionOf(propsOf(node))`.

**That one fold was worth TWO crossings**, 3 -> 1 in both fixtures, because the touchable's
`afterCommit` settle re-commits the node and a fold is charged per commit rather than per node. On
Android the fold survives for the view style and the ripple background — a theme computation and a
native config object, neither a prop rewrite — so `buildStructure` binds it behind `IS_ANDROID` and
binds nothing otherwise.

**And then the last one went, so off Android a `<Button>` binds NO fold on any of its four nodes —
zero trips into JS, down from five.** The label text's style needed the BUTTON's `color` and
`disabled` while its parent is the wrapping view, so `ownerProps` could not reach it.

**The seam is an ANCESTOR QUERY, not a second parent pointer**, and that choice is the reusable part.
"Two up" would encode one platform's tree shape into a rule: the button is this node's grandparent on
iOS (`button -> view -> text`) and its PARENT on Android, where TNF clones onto the button itself.
"The nearest ancestor that is a button" is true on both — it is a CSS ancestor selector, which is
what a browser would use for exactly this.

`IAncestorLookup` is a function pointer plus a context, not a `std::function`: this is the per-node
commit path and a `std::function` would allocate for every node whether or not any rule asks. The
WALK belongs to `SymbioteTree`, which owns `Node`; the choice of tag belongs to the rule. Costs
nothing measurable — the tag-rule ruler is unmoved (`content` 2.8, `pressable` 3.7, `button` 3.8-4.0).

**This was the largest test migration of the whole port — 25 cases across 8 files**, and the split is
worth reading before the next one. Each case divided into a half this harness can still see and a
half it cannot:

```
kept here    the subtree SHAPE, the Text defaults (real props written at build time),
             the accessibilityState merge, Solid's node IDENTITY across a reactive update
moved        every style assertion, to `button-derived-payload.itest.ts`
deleted      the unit tests of `resolveButtonTextStyle`, which no longer exists
```

One case MOVED rather than being deleted and it is the important one: the re-tint after a late
`color` write pins that `addDerivedNode` extends `slotDerived`'s mark past the slot to the text.
That is not fold content — it is the failure mode an ancestor-reading rule introduces, since
`markPropsDirty` bubbles UP and nothing would reach the label otherwise. **Verified by breaking it**:
commenting out `addDerivedNode(node, text)` turns it red.

`resolveButtonTextStyle`, `buttonTextStyle` and seven colour constants were deleted with it — the
orphan shape again, and the label's constants now live only in C++.

**One coverage gap went with the port and is recorded rather than hidden.** `foldButtonLabel`'s
uppercase arm is `#ifdef ANDROID`, because a raw text commits as `RCTRawText` on both platforms and
there is no view NAME to branch on the way `Switch`/`AndroidSwitch` gives one. Two vitest cases
covered it by mocking `Platform.OS`, and what they mocked was a JS function that no longer exists —
they would pass forever against a mock of nothing. Same class as `android_ripple` and
`decelerationRate`'s constants: **a compile-time branch is only testable in a build that compiles
it.** And one behaviour difference shipped deliberately: RN uppercases through JavaScript's
full-Unicode `toUpperCase`, the C++ rule is ASCII-only, so a Cyrillic label will not uppercase on
Android. Judged a cosmetic difference on one platform against dragging ICU into the engine.

`resolveButtonTitle` was deleted with it — no caller left but its own two unit tests, which is the
orphan shape this migration keeps turning up.

### A `<Button>` cost FOUR crossings per commit — SUPERSEDED, it is ZERO, see above

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

### `Swap` re-measured on the C++ engine, and it answers the persistent-mode question (2026-09-21)

Both sides run the SAME reconciler over the same thousand memoized rows; only the host config differs.
`stock-swap-cost.itest.tsx` and `adapter-swap-cost.itest.tsx`, `build-release`, one sitting:

```
                      swap    same-order re-render    the move itself    our engine inside it
 stock (persistent)    6.0            3.8                   2.2                 —
 ours   (mutation)    23.4            1.9                  21.5           walk 0.8 + apply 2.5
```

**The engine is 3.3 ms of 23.4 and the other 20 is React's own mutation-mode commit** — `created=0
cloned=2 reused=1000 targetedReplaces=1 setProps=0`, so not one prop write crosses and the C++ side
does a targeted replace of a single slot. The earlier bisect on the JS-tree engine put React's share
at ≥15 ms by replacing `insertBefore` with a no-op; the figure has only grown as the engine shrank
under it.

**SO THE PERSISTENT-MODE QUESTION HAS TWO ANSWERS, NOT ONE, and this page only ever wrote the first.**
On the create-shaped rows persistent mode is the FLOOR WE ALREADY BEAT — the engine is 0.88-0.90x of
a bare `nativeFabricUIManager` driver doing nothing else, and React at 0.86x of stock says the same
from above. On a keyed MOVE it is the other way round entirely: a persistent renderer hands the host
one new child set and is done, where a mutation renderer walks a thousand fibers to find the two that
moved. That is the whole of `Swap`, and no engine change reaches it.

**What it would take is a DECISION, not an optimisation.** `<M1 + M2>` chose mutation mode
deliberately so the engine's clone-on-write path could not be skipped, and the invariant's words are
"NOT its native persistent mode straight to the slot, which would skip R2". Driving the ENGINE in
persistent mode is a third thing that invariant does not describe: React would hand complete child
sets to a new engine op and the per-move fiber walk would go, but it is a rewrite of
`adapters/react/src/host-config.ts`, it needs a set-shaped op on the wire, and it would have to be
re-measured on the create rows where mutation mode currently wins. Raised here rather than attempted.
**It is React-only either way** — Vue, Svelte, Solid and Angular emit their moves straight into the
engine and all four sit at 0.37-0.43x of stock on this row.

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

### Vue's remaining JS-side cost is component SHAPE, not the adapter (2026-09-18)

Re-audited `@symbiote-native/vue` end to end — `patchProp`/`insert`/`remove`/`nextSibling`, the
`dlog`-argument policy (`tests/dlog-argument-budget.test.ts` already excludes it, deliberately —
none of its sites sit on a per-node commit path), every primitive (View/Text/Image/Pressable/
Switch/TextInput/ScrollView/touchables/Button) confirmed intrinsic-tag-only with no component
wrapper, `VirtualizedList` confirmed lean (chrome built with `h()` directly, item content is
whatever the APP's `renderItem` returns). Found nothing left to fix in the adapter's own code.

**What is left is Vue's own per-instance machinery**, isolated with a byte-identical-payload A/B
(`vue-row-component-shape-cost.itest.ts`): a stateful list row (`defineComponent`/options object)
against the same row as a bare function (a Vue functional component — no instance, no
`shallowReactive` props proxy, no per-component `ReactiveEffect`). On a 10%-of-1000 relabel
(`vue-suite.itest.ts`'s own `partial` step, cloned=502 reused=1100 setProps=100 in every arm),
functional cuts the non-engine JS time roughly in half (~7.1ms → ~3.7ms, react's own ~3.3ms). At
MOUNT the same A/B gives a real but much smaller ~12% (functional's JS-only ~50ms against
stateful's ~57ms for 1 000 fresh rows); at TEARDOWN it gives **nothing measurable, run to run** —
not the uniform win a first guess predicts.

**Do not chase a compiler pass that auto-converts a "pure" component to a functional one.** Checked
before writing any such thing: Vue's own migration guide says the functional-vs-stateful create-time
gap is "negligible" in Vue 3 (it was a Vue 2 optimization) — which matches the ~12% mount number
above, not the ~50% update number. The real lever is the UPDATE path's `hasPropsChanged` walk, and
that already has an official, supported flag: `optimize: true`
(`@vue/babel-plugin-jsx`'s PatchFlags/`dynamicProps`), now the default in `adapters/vue/babel-jsx.cjs`
for every TSX app on this adapter. `.vue` SFCs already had the equivalent unconditionally from
`@vue/compiler-sfc`'s template compiler; TSX did not, until this. Verified against the REAL renderer
in `adapters/vue/optimize-flag-safety.test.ts` — a changed prop, a conditional branch, a keyed-list
reorder, a spread-carried bag (the riskiest pattern: the compiler cannot see which keys a spread
produces, so it must fall back to FULL_PROPS), and the exact stateful-child-component shape the
itest above measures — all still commit correctly with the flag on. Full repo suite (644 files,
5313 tests) green after the default flip.

A real app's own list row (`examples/vue-sfc/components/BenchmarkRow.vue`) is `<script setup>`,
which is ALWAYS a stateful component — Vue 3 has no functional-SFC syntax, so this ceiling is not
this adapter's to remove without inventing a new compiler feature, which the paragraph above says
not to.

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

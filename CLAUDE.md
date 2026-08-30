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

**Local development against an unpublished or just-changed `@symbiote-native/*`
package — the everyday loop, not a fallback:** build a tarball with `pnpm pack`
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
was rebuilt around `lightningcss`, and it has already cost a real device bug (`process-transform`
diverged from upstream on array input and crashed Android with
`String cannot be cast to ReadableArray`).

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
Svelte's, and a cross-column deficit computed today silently includes that gap. Re-level with
`node scripts/overlay-local-packages.mjs examples/<name>` and a rebuild before attributing any
residual to an adapter.

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

**Vue, Svelte and Solid are post-lowering (2026-08-23); React and Angular are not** — read the
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

Angular's column is its **flat** row shape (9 nodes/row, matching every other column). Its default
`composed` shape is 12 nodes/row and costs **942.9 ms** — 33% more nodes for 2.26x the time, i.e.
composition costs 1.7x PER NODE on top of the extra nodes (the per-component-host anchor, and it is
non-linear). Angular is worst of five even flat.

**Node CREATION was the one axis every adapter lost, and as of 2026-08-23 it is no longer that.**
Host-primitive lowering closed it, on all three adapters that can be lowered. Against stock's
stable bands, ALL THREE now beat it on a create-shaped row: Svelte Create 0.78-0.82x / Append
0.56-0.58x, Solid 0.86x / 0.60x, Vue 0.92-0.96x / 0.64x. React and Angular still trail 1.17x and
2.2x — neither has been lowered, and React cannot be the same way (no build-time analysis; host
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

Open work, priority order, and the per-adapter detail (React is an outlier three times over —
`Swap`, `Remove`, and the whole virtualized column — against its own siblings on the same engine):
`symbiote-perf-measurement`, "The stock-React-Native baseline".

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

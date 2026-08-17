---
name: symbiote-third-party-native-view
description: "Symbiote third-party native-VIEW wrapper workflow — read BEFORE making a React-Native library that ships a native VIEW component (@react-native-community/slider, react-native-*, any codegenNativeComponent) usable from a NON-React adapter (Vue/Angular/Svelte/Solid), or building/debugging a @symbiote-native/PKG wrapper package, or deciding where such a wrapper and its native dependency go. This is the realized track of ADR 0014 + the third_party_rn_packages_are_react_only invariant; the reference implementation is @symbiote-native/slider (packages/slider, ADR 0027). Covers: (1) WHY a wrapper at all — the library's default export is a React component (useState/hooks) that throws under a non-React adapter's null dispatcher; you reach the native view through the engine createNode-by-ViewConfig path instead, never by importing the React component. (2) PACKAGE SHAPE — a self-contained packages/PKG package (NOT core/components, NOT an adapter), one framework-agnostic src/core (pure folds + renderX returning a Descriptor) + one thin per-adapter entry (./vue, ./react, ./angular) via the exports map. (3) VIEWCONFIG REGISTRATION — package-level register.ts side-effect imports the codegen native-component SPEC (…/dist/XNativeComponent), pulled by barrels only. (4) ONE-DEPENDENCY NATIVE PROXY PACKAGING — the app lists ONLY @symbiote-native/PKG; @symbiote-native/PKG depends on the native RN library, ships react-native.config.cjs + a proxy podspec + codegenConfig, and autolinking sees @symbiote-native/PKG as the native package. Plain transitive native deps still do NOT autolink; the proxy files are the escape hatch. (5) prop-type split, no-`as` narrowing, headless tests, native simulator verification, and build/wiring checklist. Trigger on: wrap a native library for Vue/Angular, 'use X slider/picker/etc on a non-React adapter', a native view that renders on React but is blank/unlinked elsewhere, or any @symbiote-native/PKG packaging/dependency question."
---

# Symbiote — wrapping a third-party RN native VIEW for non-React adapters

A third-party RN library that ships a **native view** (a `codegenNativeComponent`, e.g.
`@react-native-community/slider`'s `RNCSlider`) runs out-of-the-box only under the React
adapter: its default export is a **React component** whose body calls `useState`/hooks off
the React dispatcher, so a non-React adapter (Vue/Angular/Svelte/Solid) renders it with a
null dispatcher and it throws `Cannot read property 'useState' of null`. The
`third_party_rn_packages_are_react_only` invariant states this; this skill is the realized
way to make such a view work everywhere. Reference: **`@symbiote-native/slider`** (`packages/slider`,
ADR 0027). SymbioteNative only makes the *native view* framework-agnostic — never the library's
React *component*.

The whole trick: the engine already derives a view's events + prop processors from RN's
`ReactNativeViewConfigRegistry` at runtime (`setNativeViewConfigSource`,
`core/engine/src/registry.ts`), and `descriptorFor` passes any non-`symbiote-` type through as
a **raw Fabric name**. So a non-React adapter drives the native view through the same
`createNode`-by-ViewConfig path SymbioteNative uses for its own primitives — you just (a) register the
ViewConfig and (b) map the friendly prop/event surface onto the native node.

## Package shape — a separate `@symbiote-native/<lib>`, NOT core/components, NOT an adapter

`core/components` is SymbioteNative's OWN primitive layer; it must stay library-agnostic (no
`RNCSlider` name, no third-party dep). An adapter is a thin reconciler. A third-party wrapper is
neither — it is its own package: **one framework-agnostic core + one thin entry per adapter**
(the project's "one core, N adapters" shape, applied inside the package).

```
packages/<lib>/                         @symbiote-native/<lib>
  package.json    exports: "."->core, "./vue", "./react", "./angular" (Slider ships all three)
                  dependencies include the native RN lib; codegenConfig points at its spec src
  react-native.config.cjs  makes @symbiote-native/<lib> the autolinked Android native proxy
  symbiote-<lib>.podspec   makes @symbiote-native/<lib> the autolinked iOS native proxy
  tsconfig.json   extends base; references engine, components, + each adapter used
  src/core/       AGNOSTIC: pure folds (state.ts) + renderX -> Descriptor (render-X.ts)
                  + the agnostic public IXProps + IXViewProps (passthrough bag) + IXPlatform
  src/register.ts SIDE-EFFECT import of the codegen native spec (registers the ViewConfig)
  src/vue/        @symbiote-native/<lib>/vue   defineComponent + descriptorToVue + normalizeVueAttrs
    index.ts (barrel: import '../register'; export Slider; export type IXProps)
    <comp>/{shared.ts, index.ios.ts, index.android.ts, index.ts, <comp>.test.ts}
  src/react/      @symbiote-native/<lib>/react  forwardRef FC + descriptorToReact
    index.ts (barrel: import '../register'; export Slider; export type IXProps, marker type)
    <comp>/{shared.ts, index.ios.ts, index.android.ts, index.ts, <comp>.test.tsx}
```

The agnostic core is written once; each adapter supplies ONLY its lifecycle (React
useReducer/useState/forwardRef; Vue setup + ref/shallowRef) + the descriptor bridge. Parity is
**structural** (same rule as the components 3-layer split), not copied per adapter. The native
name is usually platform-invariant (codegen registers the same name on iOS+Android), so the
platform `.ios`/`.android` files differ only in platform constants (default style, step
resolution), not the native name.

## ViewConfig registration — the codegen SPEC, never the React component

`register.ts` does a single side-effect import of the library's **codegen native-component spec**
— the module that runs `codegenNativeComponent('XName', …)` — which registers the ViewConfig
getter the engine reads. That module has **no hooks**, so it is framework-agnostic.

```ts
// packages/<lib>/src/register.ts
import '@react-native-community/slider/dist/RNCSliderNativeComponent'; // side-effect: ViewConfig
```

- Import the SPEC (`…/dist/XNativeComponent`), NOT the package default export (the React
  component — hooks, crashes a non-React adapter). Deep path depends on the lib's published
  `dist/` layout (no `exports` map) — it is the single point to update on a lib bump.
- `register.ts` lives at the PACKAGE root and is pulled by the per-adapter **barrels** only
  (`src/<adapter>/index.ts`), never by the component modules. So the component and its headless
  tests (which import the component directly, not the barrel) stay free of the spec and don't try
  to load real RN headless.
- The app must already wire `setNativeViewConfigSource(ReactNativeViewConfigRegistry.get)` once
  at entry (the examples' `index.js` do). Then events (`onValueChange`/sliding/etc.) and color/
  image processors derive automatically; you pass colors/images RAW and the engine runs the
  derived processor — do NOT pre-call `Image.resolveAssetSource` (unlike the plain-RN wrapper).

## THE PACKAGING LAW — app lists ONE package: `@symbiote-native/<lib>`

RN autolinking still does **not** recursively link native modules hidden in arbitrary transitive
dependencies. That part was verified and remains true: if `@symbiote-native/<lib>` merely has a regular
`dependency` on `@react-native-community/slider` but ships no native proxy metadata, then
`cd examples/<app> && npx react-native config` does NOT list a native slider dependency.
(Verify in `examples/<app>`.)

The validated escape hatch is: make `@symbiote-native/<lib>` itself the native package RN autolinks.
For the reference `@symbiote-native/slider`, the app lists only:

```json
{
  "dependencies": {
    "@symbiote-native/slider": "workspace:*"
  }
}
```

`@symbiote-native/slider` then owns the native dependency and proxy metadata:

| Where | What | Why |
|---|---|---|
| consuming app `package.json` | `@symbiote-native/<lib>` only | user-facing one-package install |
| `@symbiote-native/<lib>` dependencies | native RN lib: `catalog:` / pinned semver | JS spec + native sources are present under the wrapper |
| `@symbiote-native/<lib>` `react-native.config.cjs` | Android `sourceDir` points at the nested native lib; `libraryName` / `componentDescriptors` copied from the lib | RN Gradle plugin autolinks the wrapper as the native package |
| `@symbiote-native/<lib>` podspec | iOS proxy pod whose `source_files` point at the nested native lib's iOS/common sources | CocoaPods autolinks the wrapper as the native pod |
| `@symbiote-native/<lib>` `codegenConfig` | copied from the native lib, with `jsSrcsDir` pointing at nested `node_modules/<native-lib>/src` | RN Codegen discovers the component from `@symbiote-native/<lib>` |

For `@symbiote-native/slider`, this was verified in three layers:

- `npx react-native config` in `examples/react`, `examples/vue-sfc`, and `examples/vue-tsx` lists
  `@symbiote-native/slider` only (not `@react-native-community/slider`) and includes iOS + Android config.
- Android `./gradlew clean app:generateAutolinkingPackageList app:generateAutolinkingNewArchitectureFiles`
  generates `ReactSliderPackage`, `RNCSliderComponentDescriptor`, and `RNCSlider` CMake entries.
- iOS `pod install --no-repo-update` autolinks `symbiote-slider`, runs Codegen for `RNCSlider`, and
  simulator runs were confirmed by the user for React, Vue SFC, and Vue TSX with
  `DEBUG=1 pnpx react-native start --reset-cache`.

So the rule is precise: **plain transitive native deps do not autolink; a wrapper that is itself an
autolinkable native proxy does.** Do not put the third-party native lib in the consuming app unless
there is no proxy package yet.

Dependency hygiene (the `symbiote-dependency-catalog` skill): external deps inside the wrapper use
`catalog:` in this repo; peerDependencies are ranges when needed for framework/runtime contracts;
`@symbiote-native/*` uses `workspace:*`. `pnpm deps:check` (syncpack) guards it. The repo is
`node-linker=hoisted`, but the proxy config/podspec must not rely on hoisting alone — prove it with
`react-native config`, Gradle autolinking generation, `pod install`, and simulator render.

## Prop-type split + no-`as` narrowing

- **Agnostic public prop type in core** (`IXProps extends IAccessibilityProps, IAriaProps`),
  re-exported verbatim by adapters whose surface is fully agnostic (Vue's slider re-exports
  `ISliderProps` from core). A field that carries a **framework element** is per-adapter: the
  custom step marker is React `StepMarker?: FC<IStepMarkerProps>` (a prop) vs Vue `#stepMarker`
  (a scoped slot) — each adapter declares its own flavored `IXProps` under the SAME name
  (precedent: `IPressableProps`), sharing the agnostic base via an aliased import. The
  marker's INPUT props (`IStepMarkerProps`: plain scalars) live in core.
- **Internal `IXViewProps` (what renderX paints) types opaque values as `unknown`**, not the
  precise type — colors (`IColorValue` = string | opaque), `style` (`IStyleProp`), resolved
  images — because narrowing them off untyped Vue attrs without `as` is painful and pointless
  (the engine processes them). The PUBLIC `IXProps` keeps the precise typing. Only fields the
  logic actually folds are explicit in `IXViewProps`; everything that just passes through
  (other tints, accessibility*, testID, the native event handlers) rides in a `passthrough` bag
  spread onto the host node.
- **accessibilityState**: type it `{ disabled?: boolean }` with NO index signature, so RN's
  `IAccessibilityStateValue` (no index sig) assigns cleanly; the resolve spread
  (`{ ...accessibilityState, disabled }`) preserves the other state fields at RUNTIME even
  though the static type only tracks `disabled`. (A `Record<string,unknown>` would force `as`;
  narrowing the disabled bit in a spread keeps it `as`-free for both adapters.)

## Faithful folds (port the library's React wrapper, do not invent)

Read the library's `Slider.tsx`-equivalent and move its PURE JS into `src/core` so every adapter
inherits it. For the slider these were: value sanitation (the `!value` quirk → `0`/`NaN` become
`undefined` so native uses its own initial value), `disabled`/`accessibilityState` resolution,
limit defaults, `thumbTintColor` → transparent when a custom marker + thumbImage, the
"pass native thumbImage only when no custom marker" decision, the step-option layout, and the
event mapping (BOTH native value rails — the bubbling `onChange` AND `onXValueChange` — drive the
friendly `onValueChange(value)`; sliding start/complete; the accessibility action re-bound to the
view's custom `onXAccessibilityAction`). Public callbacks (`onValueChange` etc.) are JS-only and
MUST be stripped from the forwarded attrs — leaking a function prop to Fabric crashes Android.

The native render is `renderXNative(view, platform) -> Descriptor` (the raw native leaf, e.g.
`el('RNCSlider', props)`) plus a wrapper `renderX` (centering View + the leaf + optional default
overlay). An overlay whose cells host the framework's OWN element (a custom marker) is assembled
PER-ADAPTER at the element level (React `createElement(StepMarker,…)`, Vue `slots.stepMarker?.(…)`)
— like list cells — while the default overlay (no custom element) is a shared `renderXIndicator`
Descriptor both adapters bridge.

## Adapters must expose their descriptor bridge + attr fold

The wrapper's per-adapter entry imports from the adapter's PUBLIC barrel. You will likely need to
ADD exports there (done this session):

- `@symbiote-native/vue` must export `descriptorToVue` AND `normalizeVueAttrs` (the kebab→camel fold).
- `@symbiote-native/react` must export `descriptorToReact`.
- Both expose `Image` (its statics include `resolveAssetSource` if the overlay needs it),
  `mount`/`unmount`, `setNativeViewConfigSource`.

Vue lifecycle reads untyped `attrs` (narrow with runtime guards, hold any engine host node by
`shallowRef`/`markRaw` per the `vue-adapter-reactivity` skill); React reads typed props
(`resolveAccessibilityProps(rawProps)` then destructure handled fields, rest → passthrough),
forwards a native ref via `forwardRef` → the host node.

## Headless testing (ADR 0025)

- Inject a codegen-shaped ViewConfig and assert the engine derived it. Mirror
  `adapters/react/src/__tests__/slider.test.tsx`: `installFabric()` +
  `setNativeViewConfigSource(name => name === 'RNCSlider' ? FAKE_CONFIG : undefined)`, then
  `mount` a component rendering the wrapper, `fabric.find(n => n.viewName === 'RNCSlider')`,
  `fabric.fireEvent(node.instanceHandle, 'topChange', { value })`.
- Import the component from the platform dir (`from '.'` / `'./<comp>'`), NOT the package barrel,
  so `register.ts` never loads headless.
- React commits SYNC (assert immediately); Vue commits on a microtask (`await tick()` after mount).
- Add `packages/**/src/**/*.test.{ts,tsx}` to the root `vitest.config.ts` `include`.
- Cover: native props pass-through, the value-sanitation quirk, tint processing via the derived
  processor, BOTH value rails → `onValueChange`, sliding events, disabled-from-accessibilityState,
  the step overlay renders, and that the JS callback does NOT leak to the native node.
- Native RENDER on device is the final word (ADR 0012 — headless fakes resolve any name).

## Build / wiring checklist

1. `packages/<lib>/package.json`: exports map (`.`/`./vue`/`./react`), `codegenConfig` copied from
   the native lib (with `jsSrcsDir` aimed at nested `node_modules/<native-lib>/src`), deps (native
   lib + `@symbiote-native/components` + `@symbiote-native/engine`), peers for adapters/framework runtimes only,
   devDeps for adapter test/build tools. **`"files"` MUST explicitly list `react-native.config.cjs`
   and the `*.podspec` filename**, in addition to `src`/`build`/`build-ngc` — see the gotcha below;
   neither is in npm's default-included set and both silently vanish from the published tarball
   otherwise.
2. `packages/<lib>/react-native.config.cjs`: Android proxy config. Use `.cjs` because the package is
   `type: module`; `react-native.config.js` will be treated as ESM and can be silently ignored by
   the sync CLI path. Point `sourceDir` at the nested native lib's Android folder and copy
   `libraryName`, `componentDescriptors`, `cmakeListsPath` from the native lib's config.
3. `packages/<lib>/symbiote-<lib>.podspec`: iOS proxy pod. Resolve the nested native lib from the
   wrapper directory, keep `source_files` relative to `__dir__` (CocoaPods rejects absolute file
   patterns), copy the native lib's source patterns/subspecs/dependencies. **Do NOT point
   `source_files` (relative OR via a symlink) at the nested lib's real location under pnpm — vendor
   it instead.** See the Dir.glob gotcha below; this step silently produces an empty, non-crashing-
   at-build-time pod if skipped.
4. `packages/<lib>/tsconfig.json`: extends base; references engine, components, + each adapter used.
5. Root `tsconfig.json`: add `{ "path": "packages/<lib>" }`.
6. Root `vitest.config.ts`: add `packages/**/src/**/*.test.{ts,tsx}`.
7. Add the descriptor-bridge / attr-fold exports to the adapter barrels (above).
8. `examples/<app>`: add ONLY `@symbiote-native/<lib>` (a `pnpm pack` tarball via `file:` while
   developing, CLAUDE.md's `<examples_vs_dot_examples>`); do NOT add the native lib directly
   unless no proxy exists. Import `{ X } from '@symbiote-native/<lib>/<adapter>'`; `npm install`
   inside `examples/<app>` (never `pnpm install` from repo root).
9. Verify: `pnpm deps:check`; package `tsc --build`; package vitest; `cd examples/<app> && npx
   react-native config` shows `@symbiote-native/<lib>` with iOS+Android native config; Android autolinking
   generation succeeds; iOS `pod install --no-repo-update` succeeds; simulator renders.
10. **Standing step, not optional — after every `pod install`, `grep -c <NativeClassName>
    Pods/Pods.xcodeproj/project.pbxproj` in `examples/<app>/ios`, expecting > 0.** A `0` means the
    vendoring fix (gotcha below) is missing or broken and the pod silently compiled to an empty
    target — a green `pod install` and a green Xcode build both give zero indication of this; it
    only shows up as a runtime crash. This check is what actually caught the bug in `symbiote-slider`
    that "verified working on-device" wrongly claimed was fixed.
11. **Standing step for any wrapper that HAS been published — before trusting a `catalog:`-installed
    copy, verify the tarball actually contains the proxy files.** `npm pack --dry-run` from
    `packages/<lib>` (or simply `ls` the installed copy under `node_modules/.pnpm/@symbiote-native+<lib>@…`)
    must show BOTH `react-native.config.cjs` and the `*.podspec` — a workspace-only wrapper never
    hits this (local source bypasses `files` filtering entirely), so the bug stays dormant until
    first publish. See the gotcha below; this exact omission shipped in a real `@symbiote-native/slider`
    release undetected.

## Gotchas hit this session

- **Stale `build/` dirs break vitest module resolution.** A prior `tsc --build` leaves
  `adapters/*/build` etc. with an OLD file layout; vitest may resolve `@symbiote-native/vue` to that stale
  output and fail with `Cannot find module './components/image'` (old path was `./image`). Fix:
  `rm -rf adapters/*/build core/*/build packages/*/build **/*.tsbuildinfo` before running vitest.
- **`react-native config` is the headless autolinking oracle** — use it to PROVE a native dep is
  discoverable before claiming a packaging change works. Plain transitive native deps are ignored;
  the one-dependency model works only because `@symbiote-native/<lib>` is itself an autolinkable proxy.
- **Proxy config file must be `.cjs` under `type: module`.** A `react-native.config.js` in an ESM
  package can be skipped by the sync RN CLI config reader; use `react-native.config.cjs`.
- **CocoaPods file patterns must be relative.** A proxy podspec may resolve the nested native lib
  with Node, but `s.source_files` / subspec `source_files` must be relative to the podspec dir;
  absolute paths fail validation.
```
gotcha_symlink_vendor := {
  bug: "CocoaPods' file glob never crosses a symlink — pointing source_files at the nested native lib in place
        (relative OR same-dir symlink) silently matches zero files",
  root_cause: "Sandbox::PathList#read_file_system enumerates a pod's files with ONE recursive Dir.glob(root + '**/*',
        FNM_DOTMATCH); Ruby's ** never descends into a symlinked subdirectory met mid-walk (confirmed by direct
        reproduction) — true for `../..` crossing the app's node_modules AND a same-dir symlink next to the
        podspec. Under pnpm the wrapped lib ALWAYS sits behind a .pnpm-store symlink, so this breaks the wrapper
        pattern by default",
  symptom: "source_files matches 0 files ⟶ CocoaPods downgrades the pod to an empty PBXAggregateTarget (grep
        Pods.xcodeproj/project.pbxproj for the pod name's isa: PBXAggregateTarget=broken, PBXNativeTarget=real
        Compile Sources) ⟶ native view class never compiles in ⟶ at startup RCTThirdPartyComponentsProvider's
        dict literal calls NSClassFromString(@'YourViewClass'), gets nil, @{...} throws EXC_CRASH/SIGABRT
        inside -[__NSPlaceholderDictionary initWithObjects:forKeys:count:] — a RUNTIME crash on first launch;
        pod install AND the Xcode build both succeed",
  fix: "in the podspec, before Pod::Spec.new, vendor (copy) the lib's source folders into a .rn-<lib> dir inside the
        wrapper package via FileUtils.rm_rf + mkdir_p + cp_r (re-runs fresh every pod install; gitignore
        packages/*/.rn-*), then point source_files/exclude_files/project_header_files at .rn-<lib>/... (purely-
        downward relative, no ..). Companion: a subspec's HEADER_SEARCH_PATHS must ALSO point at the vendored
        copy, not the original node_modules path — mixing gives two files defining the same class with no shared
        include guard ('redefinition of SomeClassName')",
  scope: "hit BOTH symbiote-navigation (react-native-screens) and symbiote-slider same session",
  regression: "found 2026-07-04, packages/splash-screen session — the 'verified working on-device' claim below was WRONG.
        symbiote-slider.podspec still used a relative Pathname#relative_path_from for source_files, never
        vendored; examples/react had simply never built far enough to hit it (an unrelated build error blocked
        it first). Once fixed: app built, launched, crashed on the JS thread when Fabric registered third-party
        components — RCTThirdPartyComponentsProvider's @{...} dict literal inserted nil from
        NSClassFromString(@'RNCSliderComponentView'), which Obj-C literals reject. `grep -c
        RNCSliderComponentView Pods/Pods.xcodeproj/project.pbxproj` = 0, hard proof the class was never compiled
        in. Fixed by applying the vendoring pattern to packages/slider/symbiote-slider.podspec (previously only
        in symbiote-splash-screen.podspec)",
  lesson: "a wrapper's own 'verified on-device' claim is NOT proof the vendoring fix is present — grep
        Pods.xcodeproj/project.pbxproj for the native view's ComponentView class name after every pod install,
        for every wrapper, every time (checklist step 10), never trust prior session notes alone. Do NOT rely on
        nm/strings on the built .dylib as the primary check (slow, needs a full build first) — the pbxproj grep
        catches it right after pod install"
}

gotcha_swift_module_identity := {
  trigger: "the wrapped library's own README/native-init docs say `import RNBootSplash` (or similar) in
        AppDelegate.swift — that import resolves the Clang MODULE compiled for the pod, and CocoaPods derives
        the module name from the pod's s.name unless told otherwise. The proxy pod is deliberately named
        symbiote-<lib> (packaging law above), so the module compiles as symbiote_<lib> ⟶ upstream import breaks:
        'error no such module X'",
  fix: [
    "s.module_name = 'X' — pins the compiled module NAME to what upstream's Swift import expects. Verify:
          Pods/Local Podspecs/symbiote-<lib>.podspec.json -> module_name: 'X'",
    "s.pod_target_xcconfig = (s.attributes_hash['pod_target_xcconfig'] || {}).merge('DEFINES_MODULE' =>
          'YES') — makes CocoaPods GENERATE a module map at all. A static-library pod (no use_frameworks!)
          emits none unless DEFINES_MODULE=YES, and install_modules_dependencies(s) (the RN-provided helper,
          active branch when available) does NOT set this. module_name alone is insufficient — import still
          fails 'no such module' until DEFINES_MODULE is ALSO set. Verify: Pods/Target Support
          Files/symbiote-<lib>/symbiote-<lib>.debug.xcconfig -> DEFINES_MODULE = YES; absence of any
          .modulemap under Pods/ for the pod's name is the tell",
  ] ⟶ "BOTH settings required, neither alone suffices",
  nested_gotcha: "s.pod_target_xcconfig has a DSL WRITER but NO plain reader on Pod::Specification — calling it to read back a
        value previously set (e.g. by install_modules_dependencies(s), to merge into it) raises NoMethodError:
        undefined method 'pod_target_xcconfig'. Fix: read the raw internal store
        s.attributes_hash['pod_target_xcconfig']",
  scope: "only wrappers whose upstream docs require a Swift `import <Name>` need this (react-native-bootsplash does);
        most native-VIEW wrappers, reached only via JS Descriptor rendering, never need a Swift import and can
        skip both settings"
}
```
- **Frontmatter / descriptions**: invariant names use angle brackets; a skill `description` field
  forbids them — refer to invariants by name without the brackets.
```
gotcha_files_allowlist := {
  found: "2026-07-06, packages/splash-screen session",
  bug: "wrapper's package.json 'files' allowlist silently drops react-native.config.cjs and the *.podspec from the
        published npm tarball unless BOTH are listed explicitly",
  root_cause: "npm's automatic-include set is only package.json / README / LICENSE / the main file — a proxy podspec and RN
        config at the package root are NOT in it, so 'files': ['src', 'build', 'build-ngc'] (the pattern both
        packages/slider and packages/splash-screen actually shipped with) omits them entirely",
  severity: "MORE SEVERE than gotcha_symlink_vendor — that one still produces a podspec (empty/pointing nowhere); this
        one means the podspec does not exist at all in the installed package",
  incident: "@symbiote-native/slider published as 2.0.1 with this bug — any app installing via catalog: (real npm
        install, not a workspace symlink) had no podspec for CocoaPods to autolink, so RNCSliderComponentView
        never compiled in, and the app rendered RN's fallback view, 'Unimplemented component: <RNCSlider>', at
        runtime",
  diagnostic: "npx react-native config in the consuming app returns undefined for the dependency's WHOLE entry (not just a
        missing ios key) — the tell to check the INSTALLED copy's own directory listing (ls
        node_modules/.pnpm/@symbiote-native+<lib>@…/node_modules/@symbiote-native/<lib>/) for the podspec/config
        file before assuming a source-code or vendoring problem",
  why_hidden_for_splash_screen: "identical 'files' gap existed but stayed dormant — package was still workspace:* (unpublished), local source
        read directly, npm's files filtering never applies until first publish",
  fix: "add react-native.config.cjs and the exact *.podspec filename to 'files' (checklist step 1); republish any
        already-shipped wrapper missing them (version bump + changeset — the already-published broken version
        stays broken until a new one ships)",
  standing_practice: "checklist step 11 (verify tarball/installed copy) for every wrapper ever published, same as step 10's
        pbxproj grep for every pod install"
}
```

## References

- `symbiote-new-package-skeleton` — read FIRST if the package doesn't exist yet at all: resolves
  whether a brand-new package should start as a bare-skeleton (reserve-the-npm-name only, no
  functional code), core-only, or the full parity this skill otherwise assumes.
- `packages/slider/**` — the reference implementation (core + vue + react + register + native
  proxy config/podspec + tests).
- `.docs/decisions/0027-third-party-native-view-wrapper-package.md` — the decision + autolinking
  citation; `0014` (third-party libs: no fork), `0012` (native module name correctness is
  device-proven), `0025` (testing), `0026` (folder-as-module).
- Sibling skills: `symbiote-add-component` (SymbioteNative's OWN components — the contrast),
  `symbiote-dependency-catalog` (catalog rules), `vue-adapter-reactivity` (node identity / async
  commit), `symbiote-engine-core` (the mutation API + ViewConfig derivation), `symbiote-parity-check`,
  `symbiote-expo-native-module` (the same wrapper problem for an Expo-modules-core package —
  native MODULE, zero view, EventEmitter/async surface — not this skill's native VIEW/ViewConfig
  path).
- Once the wrapper package works, write its docs page per `symbiote-docs-site-package-template`
  (canonical `## API` section, one sub-table per surface group).

---
name: symbiote-react-migrator-research
description: "Research record (2026-11-23) on whether a React-Compiler-based migrator can automate porting third-party RN packages from the port queue to core + adapters. Read BEFORE proposing or building a migrator CLI, before re-measuring react-to-solid-codemod on RN packages, or before claiming a share of a package port is automatable. Holds the tool's pipeline, what was measured (9 queue packages, self-picked), the class-component finding, the hand-written MapMarker emission, and what is NOT measured."
---

# React-Compiler migrators for RN package ports

Verdict: **no ready tool, share of automatable work NOT measured.** Do not quote "most of the port" for any number below.

## Method (the user's call, 2026-11-28)
The goal is our own generic migrator: run it on an unseen package and get working code at 1:1 parity
with the source. Targets: vue-sfc first, then vue-tsx, angular, svelte, solid.
- Every new package is ported THROUGH the migrator, never by hand. Hand-written `fixtures/**/expected` are
  reference only.
- A wrong or refused output is fixed in the migrator as a general rule. No branch keyed on one package's names.
- Parity is judged by the upstream oracle: upstream under `@symbiote-native/react` vs the port, one scenario set.
- Generator input is the Babel AST of the package source. vidact's `analyzeSync` model lacks context reads and events.

All code lives in `packages/react-migrator` (`@symbiote-native/react-migrator`, publishable, CLI layer
`--react-migrator` into `devDependencies`). Paths below are relative to it.
- `src/` is the published library (`rootDir: "src"`). `fixtures/` is its own tsc project emitting to
  `fixtures/build/`: a `rootDir: "."` emit into `build/` fails `tests/build-output-has-no-orphans.test.ts`.
- Fixtures are allowed twins in `.claude/reuse.json` (`packages/react-migrator/fixtures/**`, the user's yes).

## Tool
`github.com/devagrawal09/react-to-solid-codemod`: MIT per `workflow-v2/codemod.yaml:6` (no LICENSE file), created 2026-11-10, needs `codemod@2.0.0-alpha.4`, `babel-plugin-react-compiler@1.0.0`. Re-clone with the `vendor` skill if needed. Its prototype CLI main guard breaks on a relative or symlinked path, run it by absolute `realpath`.

Pipeline: compiler `debugLogIRs` -> `extract.mjs` (745 LOC) -> `decide.mjs` (200) -> `contracts.mjs` (304) -> `rewrite.mjs` (151) -> `rules/mechanical.mjs` (R1-R34, DOM/Solid) -> eslint-plugin-solid -> worklist.
- `rewrite.mjs:53` skips a function if compiler status != compiled; `:58` skips destructured / non-const values; `:59` skips if any value is flagged. All-or-nothing per function.
- Targets Solid. `decide.mjs`, `contracts.mjs` name Solid terms (`createMemo`, `<Dynamic>`, "useState hands back accessor"). That the analysis is target-neutral is a READING of the source, never tried on another target.

## Measured (9 queue packages, picked by hand; the queue had 106 before ledger iteration 86 added six SDKs)
- `safe-area-context` converted: tsc errors 39 strict / 28 loose, in 6 of 8 changed files; the original has 0 under the same tsconfig. Hook-return contracts disagree (`SafeAreaContext.tsx:252/277/286`).
- `keyboard-controller`: 36% bailout or not compiled, 33% hook-unknown, hooks 140 of 231 flags. `webview`: 38% bailout. Earlier "covered well" for keyboard-controller / pager-view / webview is withdrawn.
- Prototype CLI only annotates `// solid:` notes; reads of `useState` accessors stay unrewritten there (`HooksDemoScreen` lines 57/60/62). Full pipeline rewrites local `useState` reads.

## Classes (`maps`, `svg`, `picker`, `webview`, `lottie`: 33 classes in 30 files)
- React Compiler events on all 30 files: 24 none; 3 picker Flow `.js` files unparseable by `scripts/compiler-events.cjs` (unmeasured); 3 svg files have events, all at lines OUTSIDE class ranges (`xml.tsx` 50/67/82 vs class at 109; `LocalSvg.tsx` 58 vs 67; `css.tsx` 768/782 vs 807). Control `SafeAreaContext.tsx` gives `CompileSuccess`. So classes yield no compiler events.
- Class LOC (`scripts/class-model.cjs`): median 29, max 451 (`MapView`), sum 1650; 5 classes over 100 (`MapView` 451, `MapMarker` 165, `LottieView` 136, `WebShape` 108, `Shape` 101). `MapView` render 95, methods 185, arrow fields 64. Method COUNT is a bad measure, use LOC.
- State in 8 classes, lifecycle in 7. `SvgFromXml` (`xml.tsx:109-142`): `componentDidMount` 3 lines + `componentDidUpdate` 6 lines (`xml !== prevProps.xml`) -> effect with deps `[xml]`. Other four svg loaders have the same sizes, bodies unread. `maps` has no lifecycle, only `MapView` state `isReady`.
- Unopened bodies: `Shape`, `WebShape`, `Fe*`, `Defs`. The label "25 stateless proxies" came from subtraction, do not reuse.

## Emission experiment (hand-written, not generated)
`fixtures/react-native-maps/expected/map-marker-core.ts` = `MapMarker` (165 LOC class) as `createMapMarkerCommands` over `dispatchViewCommand` (`core/engine/src/imperative.ts:147`) + pure `renderMapMarker -> Descriptor`. `tsc --noEmit` vs real `core/engine/src` and `core/components/src`: 0 errors, with a shim for `process`/`queueMicrotask`/`performance`.
- Comment labels in body: 3 `[auto]`, 5 `[hand]`. These are the author's labels, NOT a measured share (the `[hand]` tail comment groups four decisions: `onPress` stopPropagation, `decorateMap` injection, legacy `Commands.*` branch, `static Animated`).
- Not emitted: legacy `Commands.*` branch (iOS + Google without SDK), `setNativeProps`.
- Original caches `fabricMarker` at FIRST render (`MapMarker.tsx`, `if (this.fabricMarker === undefined)`); the sketch's `isFabricMarker` is pure and does not reproduce that, the adapter must snapshot at mount.
- Six command methods are 73 of 77 method LOC, but each includes the legacy branch.

## vidact (2026-11-28, function components only; classes deferred by the user)
`github.com/mohebifar/vidact`, MIT, `@vidact/compiler@0.2.0-beta.11` (prebuilt Node-API addon, no Rust needed).
Rust React Compiler port in patched OXC, own IR, codegen to direct DOM. Rejects classes at compile time.
- IR: `ComponentFacts` = `sources` (prop, state, derived, context, external) + `updaters` (text, attribute,
  property, branch, keyed-list, indexed-list, effect) with `reads`/`writes` source ids (`analysis.rs:34-84`).
- `analyzeSync` summary is coarser than `compileSync`: in the RN counter the branch `count > 3` is `text[r0,1]`
  in analyze and `__vidactChoose` in compile, no features involved.
- The useful artifact is the compile OUTPUT: React with explicit reactivity (`__vidactCreateProp`, `x.get()`/`x.set()`,
  `__vidactCreateMemo(..., deps)`, `__vidactBinding(scope, mask, () => e)`, `__vidactChoose`). About 60 names in the Rust
  source; about 20 in the output of 5 safe-area files (lower bound, output cut at 2_500 chars per file).
- Candidate migrator = a printer of those helpers BY LAYER, not by framework: memo, binding, choose, keyed list and props
  go to core (`renderX`, pure derived); only state, effect, event and context get per-adapter forms. NOT written, a guess.
- Measured: an RN counter (`View`/`Text`/`Pressable`, state, derived, branch) analyzes and compiles; RN primitives are plain components to it.
- `safe-area-context`, 5 files with components, feature `dependency-source`: compile OK 4. Bare, `useMemo` inside
  `forwardRef` fails (`SafeAreaView.tsx:25`). `SafeAreaContext.tsx:234` fails even with it: an exported custom hook
  needs the "cross-module hook ABI". That file holds the Provider and hooks; RN packages export hooks, so it is the blocker.
- That check is unconditional (`custom_hooks.rs:399`), no option lifts it. De-exported copy: next refusal is the HOC
  `withSafeAreaInsets` (hook inside a nested `forwardRef`). Without the HOC it compiles, but no standalone hook is left:
  vidact expands local hooks inline. A package's public hooks need another path; same gap as codemod's 33% hook-unknown.
- Re-run: `FEATURES=dependency-source PRINT=1 node scripts/vidact-probe.mjs <files>` (`@vidact/compiler` is a devDependency).
- Side note, not a migrator: a runtime implementing `@vidact/runtime` over the engine would give React syntax without react-reconciler.

## Hooks: shapes and bridges (2026-11-28, the user picked hooks before the component printer)
`classifyPackageHooks` (`src/classify-hooks.ts`) sorts every exported `use*` by the calls in its body. Heuristic, bodies not read one by one.
`src/classify-hooks.test.ts` pins the counts below on the catalog's exact `react-native-keyboard-controller` 1.24.0 and safe-area 5.11.1, both exact.
Public = reachable by re-exports from `src/index`, `.native` before the plain file as Metro picks it. Import aliases are
resolved (`useReanimatedAnimatedProps` is `useAnimatedProps`); a body with no hook calls is `no-hooks`, not `derived`.
- `safe-area-context`: 3 public, context 2 (`useSafeAreaInsets`, `useSafeAreaFrame`), composite 1 (`useSafeArea`).
- `keyboard-controller@1.24.0`: 11 public of 27 file-level exports; composite 5, reanimated 3, context 1,
  subscription 1, effect-only 1. 8 of 11 public reach `useKeyboardContext` (6 direct, 2 transitively),
  read off the call lists by hand; the script does not resolve composite transitively.
- First run counted all 27 and missed aliases (composite 10, reanimated 9, derived 4): those numbers are withdrawn.
- Bridges that exist in all 5 adapters: subscription = core store implementing `IEventValueSource`
  (`core/engine/src/event-value-source.ts`) + each adapter's `createEventValueHook`; precedent `packages/sharing/src/core/incoming-share-*.ts`.
  Reanimated = `@symbiote-native/reanimated`; all 5 adapter barrels export `useEvent`/`useHandler`, behavior parity unchecked.
- Missing bridge: context. Today hand-written per adapter (`packages/navigation/src/{react,vue,solid,svelte}/navigation-context.ts`,
  `angular/navigation-context.service.ts`), with the value type repeated 4 times.
- `useWindowDimensions` is hand-written 5 times; only `Dimensions` (engine) is shared. It predates `createEventValueHook` (git: 2026-06-29 vs 2026-10-02).

## Context bridge sketch (hand-written emission, not generated)
`fixtures/safe-area-context/expected/{core,react,vue,svelte,solid,angular}.ts`, 246 LOC: `useSafeAreaInsets` + `useSafeAreaFrame`.
- Core: types, `SAFE_AREA_CONTEXT_NAME`, `NO_INSETS_ERROR`, pure `selectSafeAreaInsets` (the `cornerAdaptation` choice),
  `requireSafeAreaFrame`, `requireProvider`.
- Each adapter: `createContextBridge<T>(name)` returning provide + read over its own mechanism (React/Solid context,
  Vue provide/inject with `ShallowRef`, Svelte `setContext` with a `{ current }` box, Angular `InjectionToken` + `Signal`).
- React's read member is `useValue`: named `read`, it fails `react-hooks/rules-of-hooks`, which is `error` for
  `packages/*/src/react/**` in `eslint.config.js`. Checked by piping the file to eslint with a virtual `--stdin-filename`.
- The key lives in the adapter, not core: a core symbol-to-React-context map would lose `TValue` without an `as`.
- Per package per adapter the rest is a template: one bridge line per context, one function per hook.
- `tsc --build fixtures`: 0 errors against the 5 frameworks' real typings, devDependencies of the package.
- Missing Provider: the 4 reactive adapters call `requireProvider` in setup, so they throw where React throws, at render.
  A null VALUE stays lazy (thrown on read), as upstream; the corner context is never required, upstream falls back to regular.
- Vue runtime proven: `src/safe-area-vue-bridge.test.ts` mounts the Vue file through `@symbiote-native/vue` over
  `installRecordingFabric`. Reads, a Provider update, the corner pick and fallback, the throw in setup: 5 of 5 pass.
- Angular runtime proven: `src/safe-area-angular-bridge.test.ts` runs the file in `runInInjectionContext` over
  `Injector.create`, no renderer needed. Same 5 cases pass; red when the corner pick is broken.
- Not proven: runtime of React, Svelte, Solid; keyboard-controller's context value of shared values.

## Upstream oracle (vue-sfc pilot, step 0)
The user's goal: a fully automatic, functionally correct port to vue-sfc. The answer given: only per package,
with explicit refusals. The proof is the settled live tree of upstream under the React adapter vs the port.
`src/upstream-safe-area-oracle.test.tsx` renders the real upstream package headless, 5 scenarios pass:
mount, an insets event, an identical event (no re-render, red when broken), nested Provider, `edges` array.
Four traps, each hit once:
- The bare package name resolves to `lib/commonjs`, whose `require('react-native')` reaches Node
  untransformed: `SyntaxError: Unexpected token 'typeof'` with no stack. Import `lib/module/index.js`.
- A codegen spec module throws `TurboModuleRegistry.getEnforcing(...): 'SourceCode'`: mock it to the
  bare view name string, which the React host config passes to Fabric as the view name.
- The `react-native` index does not load headless (unmocked: `Failed to parse source for import analysis`
  at `react-native/src/private/components/virtualview/VirtualView.js:157`): mock it with the adapter's exports.
- With the spec mocked, events route only through `setNativeViewConfigSource` (`directEventTypes`); without
  it the insets-event scenario goes red, the other 4 stay green. The config the test hands in is upstream's:
  `android/.../SafeAreaProviderManager.kt:22-25` exports `topInsetsChange` -> `registrationName: onInsetsChange`
  (`InsetsChangeEvent.kt:30`), the spec types `onInsetsChange` as `DirectEventHandler`, iOS exports it
  `RCTDirectEventBlock`. Codegen itself was not run.
  The port side must get the same source, or the comparison measures the harness.
Seen red once each: identical event, insets event (no view config), `edges`, nested Provider. Mount was not.
Vue half, hand-written in `src/safe-area-vue-oracle.test.ts` (Provider on `h()` over `expected/vue.ts`): mount
and insets event give upstream's exact `serialize` strings; red when `registrationName` is broken.
The identical-event case caught a naive port (`expected 2 to be 1`, plain assignment): it passes only with
upstream's `pickInsets` / frame compare, now pure in `expected/core.ts`. A green mount proves little.
Expected strings live once in `fixtures/safe-area-context/scenarios.ts` (`SAFE_AREA_SCREEN`), both tests read it.
A frameless event keeps the frame on both sides; red when only that branch of `pickFrame` is broken.
Vue matches upstream on 4 scenarios only: mount, insets event, identical event, frameless event.
The hand Provider has no `initialMetrics`, parent contexts or corner insets; nested and `SafeAreaView` not run.
vidact on `SafeAreaContext.tsx` (`FEATURES=dependency-source`): refused at 234:8 (exported hook). With the
three hooks de-exported: refused at 278:20 (`withSafeAreaInsets` HOC, hook inside `forwardRef`).
With the HOC also deleted: `compile OK`, and `analyze SafeAreaProvider` lists 9 sources (3 state, 6 props).
The output imports `@vidact/runtime` and `@vidact/runtime/dom/*`, not Vue: no line of the Vue Provider
comes from it unedited. Nor is its `analyzeSync` model a printer input: source kinds are only `prop` and
`state`, the 3 parent context reads are missing. In the code they are the reads:
`__vidactPrimitiveHook0 = __vidactCreateContext(scope, 512, SafeAreaInsetsContext)`, then `.get()`.
Updaters: `attribute` reads source id 8 (`style`), `text` reads 0, 2, 5 (`children`, `frame`, `insets`);
a source `id` equals its index. `onInsetsChange` is only in the code, as `__vidactEvent`; no updater names it.
`vidact-probe.mjs` prints only `code.slice(0, 2_500)`: dump the full code and model before judging either.
Reproduce: copy `src/SafeAreaContext.tsx`, delete its lines 270-281 (the HOC), drop `export` from
`useSafeAreaInsets(`, `useSafeAreaFrame(`, `useSafeArea(`; then from the package dir run
`node --input-type=module -e` with `analyzeSync` / `compileSync` (`features: ['dependency-source']`) and write
`JSON.stringify(component)` and the whole `code` to files.
`.vue` does not load in the default vitest project (`Install @vitejs/plugin-vue`): an SFC side needs a step.

## Open
1. Generator class -> core controller not built; `MapView` untried; automatable share unmeasured. Deferred.
6. Hooks: context bridge runs on Vue and Angular only; composite not resolved transitively; 7 measured packages not classified.
5. vidact: exported-hook blocker; helper printer unwritten; other queue packages not run through it.
2. Hook-contract table for RN and our hooks; dependency retarget (`react-native` stays a peer).
3. Platform file selection (`*.web.js`, `*.windows`) when migrating a package.
4. All queue packages outside the 9 measured are unseen.

## Re-run
```
node scripts/compiler-events.cjs <vendor-dir> <file>       # compiler events per file
OUT=model.json node scripts/class-model.cjs <dir> <files>  # class model (Flow for .js, TS otherwise)
```

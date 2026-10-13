---
name: symbiote-reanimated-port
description: "Porting react-native-reanimated 4 and react-native-worklets to every Symbiote adapter (React, Vue, Svelte, Solid, Angular): confirmed decisions, the verified JS/native contract, the Fabric seam risks and the E-1 device experiment. Read BEFORE writing any @symbiote-native/reanimated code, before touching getShadowNodeWrapper or familyGeneration in core/engine, before wiring react-native-reanimated or react-native-worklets into an example, and before answering whether Reanimated works on our renderer. Holds the stale-vendor trap (a local reanimated clone was two minors behind npm), why a ShadowNodeWrapper is a new native read, why a reparent breaks family-keyed registries, why hooks are ported as core controllers over upstream Common modules, and the pass criteria of E-1. Trigger on: reanimated, worklets, useAnimatedStyle, useSharedValue, shared value, layout animation, entering exiting, CSS animation, pseudo selector, ShadowNodeWrapper, familyGeneration, E-1."
---

# Reanimated port

Status: React adapter BUILT and verified headless only (see "Built so far"); All five adapters have the full export surface and a demo screen (headless tests); the device checks of Vue, Svelte, Solid and Angular are still open. E-1 ran once on the iOS simulator
(bind works). Decisions marked PROV stand on hypothesis H-1 (Reanimated's native half works unmodified on a tree
our C++ engine commits) and are re-decided, not patched, if a device run disproves it. The package is not
published and has no changeset or docs-site page on purpose: repo P0 parity needs all five adapters first.

## Target versions (verified on npm, 2026-10-07)

`react-native-reanimated 4.7.1` (peers: react-native 0.86 - 0.88, react-native-worklets 0.13.x) and
`react-native-worklets 0.13.0` (peers: @babel/core, @react-native/metro-config, react-native 0.86 - 0.88).
A local clone of the reanimated repo shared across projects sat at a June main snapshot (4.5.0-main, 414 files
behind the 4.7.1 tag), so every fact first read there was re-read at the tag. Check `npm view <pkg> dist-tags`
before trusting any local clone, and read a release with `git show 4.7.1:<path>` inside the clone (worklets tag
`worklets-0.13.0`), never `git checkout`, since other projects read that clone.

## Decisions

Default rule: do what upstream does, with upstream signatures. Ask the user only where upstream has no answer
or a deviation is unavoidable, and say in one line what the choice changes for an app author.

| id | decision |
|---|---|
| D-1/D-9 | consume upstream; hooks are PORTED once as core controllers (create, update, dispose) that import upstream helpers (the package has no `exports` map). Hook-free and reused: `useAnimatedStyleCommon`, `useHandlerCommon`, `WorkletEventHandler`. NOT hook-free (verified in 4.7.1): `useDerivedValueCommon`, `useAnimatedReactionCommon`, `useAnimatedRefCommon` are small React hooks and `useComposedEventHandlerCommon` calls `useHandler` and `useEvent`, so the core re-implements them; adapters supply native lifecycle only. Headless tests run in the vitest project `reanimated` (stub `react-native`, worklets mock, JS `ReanimatedModule`); `tsc` maps `react-native-reanimated/src/*` to the shipped `lib/typescript` declarations and our published `.d.ts` must not name those deep paths |
| D-3 | native half = peerDependencies of `@symbiote-native/reanimated`; the APP lists `react-native-reanimated` and `react-native-worklets`; no proxy podspec or gradle (two C++ trees, Ruby helpers and baked feature flags make a proxy fragile) |
| D-4 PROV | new native read `shadowNodeWrapperOf(handle)` in `SymbioteTree.cpp` returns `react::valueFromShadowNode(node->committed)`; TS `getShadowNodeWrapper` in `core/engine/src/imperative.ts` |
| D-5 PROV | settled animation values are written back by the ENGINE into the node's retained props (upstream polls `getSettledUpdates` every 500 ms and `setState`s them into React); colors are un-processed engine-side. BUILT in the engine: `settleNodeStyle(node, values)`, a per-node style layer over the explicit style that survives republishes. The poll, `unprocessProps` and the style-versus-animated-props split live in `@symbiote-native/reanimated` (the engine cannot import Reanimated); animated-props keys go through `setProp` |
| D-6 PROV | the `createAnimatedComponent` jobs live in an engine seam in `routeProp` (modelled on `registerHostBehavior`), registered by a bare side-effect import never re-exported from a barrel (Metro `inlineRequires` drops anything else); no wrapper component in any adapter |
| D-7 | no prototype getters, no Metro alias: controllers take the wrapper from `getShadowNodeWrapper` and pass it directly; our own thin `getViewProp` and ref-taking platform functions in core |
| D-10/D-19 | CSS animations in full: `animation*`/`transition*` style keys pass through the seam, and `core/css-parser` compiles `@keyframes`, `animation`, `transition` AND all five pseudo selectors (`:focus-within :focus :hover :active :active-deepest`) into Reanimated config; this reverses the parser's deliberate `:active` off switch (see the header of `selectors.ts` and its diagnostic near line 583) |
| D-11 | `Animated.View/Text/Image/ScrollView/FlatList` are aliases of our primitives; `createAnimatedComponent(X)` returns `X` |
| D-12 | tests: vitest with `react-native-worklets` aliased to its `src/mock.ts` (JS thread) over the fake Fabric; the native seam is proven only by a device canary the USER runs |
| D-13 | `skipEntering`/`skipExiting`: each adapter's `LayoutAnimationConfig` renders a marker host node; the seam resolves ancestry in `registerBeforeFlush` (one `parentsOf` walk, only for nodes with pending `entering`); skip scope = marker is an ancestor and was created in the same flush batch |
| D-14 | drift control: peer range pinned to `compatibility.json`, plus a vitest hashing the installed `react-native-reanimated/src/hook/*.ts` and asserting the deep-imported `*Common` files are reachable |
| D-15 | the seam sets `collapsable:false` on bound nodes (Android flattening makes `measure()` NaN) |
| D-21 | Release memory is unreadable on the user's setup; Debug iOS simulator churn measured +-15 MB with no climb (one run), so R-1 is "no growth seen", not closed (no Release, Android, device, long run); tier 3 is unblocked |
| D-22 | tier 3 build order: engine seam (D-6, D-5, D-16, headless tests), core controllers over `*Common`, React as reference, then css-parser, then Vue, Svelte, Solid, Angular |
| D-23 | seam shape: module flag plus registered `claimProp(node, key, value) => boolean` in `routeProp` after `routeStyleSlot`, before `routeEvent`/`setProp` (gate pattern of `hasAnimatedNodes`); not tag-keyed host behavior, not adapter-side stripping |
| D-24 | CSS `animation*`/`transition*` style keys are stripped at the publish point: a gated hook in `pushClassStyle` hands them to Reanimated and publishes the style without them (a copy only for nodes carrying such keys); headless the engine strips nothing, so this hook is required |
| D-25 | the engine seam binds a controller to a node: the animated-style handle sits in `style`, the seam sees it at style publish (shares the D-24 hook) and binds via `whenCommitted`; adapters only create and dispose the controller with their own scope and never hold a node; BUILT (steps 1.1 to 1.3): `registerStyleClaim` / `registerStyleHandleClaim` in `core/engine/src/style-claim.ts` and `style-handle.ts`. D-35: the handle's starting values go to the host with the node's FIRST publish only, as upstream `PropsFilter` does, and `EMPTY_STYLE` after, so the D-5 settled write-back is never overwritten |
| D-32 (replaces D-26, D-30, D-31) | author code in Vue, Svelte, Solid, Angular is IDIOMATIC for its framework, not a React copy: a changing value is read inside the updater the way that framework reads it (`props.scale` in Vue, Svelte, Solid; `scale()` for an Angular signal), no `watch`, no helper, no overload, upstream signatures. A value copied into a plain variable outside the updater (`const s = props.scale`) is frozen in these setup-once frameworks, which is their own rule; each adapter README says so. The hooks observe: the updater already runs once on the JS thread (`initialUpdaterRun`), the adapter runs it inside its framework's tracking primitive (Vue `watchEffect`, Solid `createComputed`, Svelte `$effect`, Angular `effect`) and a change re-registers the mapper with a fresh closure clone; the core controller takes an injected `track(fn, onChange)`. Works for reads through a reactive container and for shared values; `signal()`, accessors and `ref.value` inside a worklet cannot cross to the UI runtime in any framework (ledger F67). Probed: Vue `reactive()`, Solid props getters and Svelte `$state` are plain objects and tracked (ledger F68); Angular signals are functions. D-33: an Angular author reads `signal()` / `input()` directly in the updater like React code; the hook tracks the read in `effect` and hands the UI runtime the read value, not the function (planned shape, to verify: swap signals in `updater.__closure` for generated worklet getters) |
| D-27 | slicing is adapter by adapter (D-22 as written): React gets the whole surface first, then css-parser, then Vue, Svelte, Solid, Angular; until all five exist the skill keeps a coverage table (hook x adapter) and the package is not published as parity-complete (repo P0 parity rule) |
| D-28 | one package `@symbiote-native/reanimated` at `packages/reanimated` (names verified free on npm), tier-3 shape, re-exports the worklets API; the app keeps the native peers `react-native-reanimated 4.7.1` and `react-native-worklets 0.13.0` (D-3); no separate worklets package |
| D-29 | `screenTransition` is re-exported (pure worklets) in all five adapters; wiring into `packages/navigation` waits for gesture-handler, which is the NEXT epic (3.3.0: `RNGestureHandlerDetector` host, `findNodeHandle`/`getShadowNodeFromRef` through the React renderer, events via Reanimated `NativeEventsManager` keyed by tag) and is not built here |
| D-34 | `__DEV__` warning in the non-React adapters' hooks for closure entries that cannot cross to the UI runtime as data (non-worklet functions, non-plain instances such as a Vue `Ref`); a primitive copied outside the updater is undetectable and stays a README note only |
| D-16 PROV | native adds `familyGeneration`; the seam checks only bound nodes in `registerPostCommit` (one batched read) and re-publishes `{tag, wrapper}` and CSS configs on change. BUILT as release plus `attach` again in `style-handle.ts` on a changed generation, one `committedRecordOf` read per bound node (no batched read exists yet), proven by `style-handle-follows-its-family.itest.ts` |

## Upstream contract (4.7.1, verified at the tag)

- JS to native: `global.__reanimatedModuleProxy`, 24 methods (`reanimatedModuleProxy.ts`), installed by TurboModule
  `ReanimatedModule.installTurboModule()`; worklets by `WorkletsModule.installTurboModule(bundleMode)` then `start()`.
  Bundle mode defaults to false and the worklets babel plugin must be LAST in `plugins`.
- Every per-view native call takes a `ShadowNodeWrapper`; natively keyed by FAMILY: animated-props registry
  (`PropsMap`), removable nodes, CSS registries. Keyed by TAG: layout animations, event handlers.
- Style path: worklet `updateProps` -> `UpdatePropsManager` -> `global._updateProps([{shadowNodeWrapper, updates}])`.
  A host only has to supply `{tag, shadowNodeWrapper}` per animated view through `handle.viewDescriptors.add(item,
  handle.styleUpdaterContainer)` (handle = `{viewDescriptors, initial, styleUpdaterContainer}`).
- Commit hook (`ReanimatedCommitHook`) re-applies the animated-props registry inside every React-source commit via
  `cloneShadowTreeWithNewProps`; our `completeSurface(..., CommitSource::React)` satisfies
  `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS`. Traits `1<<27` and `1<<28` sit on the root; nothing found that conflicts.
- ENTERING config must reach native BEFORE the mounting pass of the commit that creates the node, keyed by
  `nativeID` (digits only, at most 9); native queues configs and applies them in `LayoutAnimationsProxy.cpp`
  `lockAndFlushConfigUpdates`. LAYOUT and EXITING are keyed by tag, known only after commit.
- Events: raw Fabric events intercepted in `ReanimatedModuleProxy::handleRawEvent` by `eventTarget->getTag()`.
- Hook helpers: `useAnimatedStyleCommon.ts` (`styleUpdater`, `prepareAnimation`, `runAnimations`,
  `createAnimatedStyleHandle`), `useDerivedValueCommon`, `useAnimatedReactionCommon`, `useAnimatedRefCommon`,
  `useComposedEventHandlerCommon`, `useHandlerCommon`. Native `useAnimatedStyle` ignores user dependencies.
- Upstream `getShadowNodeWrapperFromRef` now goes through RN `getNodeFromPublicInstance` and React's renderer
  proxy, which our hosts never load (hence D-7).
- `SynchronousWritesTracker` exists only when the synchronous-update flags are on (default off).

## Traps (each found by reading, not by running)

- FAMILY IDENTITY: our engine re-creates a node's Fabric family on reparent and when a parent re-mints, keeping the
  tag (`familyGeneration` in `SymbioteTree.cpp`). Reanimated's family-keyed state goes stale, and the mount hook's
  `handleNodeRemovals` can wipe a live tag's CSS registry entries. React never hits this (a move is a remount).
- WRAPPER LIFETIME: a `ShadowNodeWrapper` pins the revision it was made from and Hermes cannot see that memory
  (Software Mansion write-up, 2026-08). Create at bind, drop every reference at unbind; try
  `setExternalMemoryPressure` only after checking the pinned RN; E-1 has a mount-churn case.
- A `symbiote::Node` NativeState is not a `ShadowNodeWrapper`: RN's `Bridging<shared_ptr<const ShadowNode>>::fromJs`
  does `dynamic_pointer_cast<ShadowNodeWrapper>`, so a handle can never be passed to Reanimated as is.
- Worklet closures that capture a Vue ref, Svelte rune, Solid signal or Angular signal capture the framework wrapper,
  which does not exist on the UI runtime; shared values are the only bridge. Auto-workletization is NAME based, so a
  composable must keep the upstream identifier (`useAnimatedStyle`, `withTiming`, ...) or authors write `'worklet'`.
- `:active` can have two sources on a `Pressable`: Reanimated derives pseudo state from the WINDOW (Android wraps
  `dispatchTouchEvent` and hit-tests with `TouchTargetHelper`, focus from global focus listeners), independent of our
  JS responders. D-20: CSS `:active` is served by Reanimated; `style({pressed})` and `children({pressed})` STAY (RN
  Pressable public API, `pressed` is Pressability state with delay, retention offset and cancel, which a window touch
  does not know); `activeStyle` stays internal; both on one node is an author error, not arbitrated.
- CSS animation/transition events (`onAnimationEnd`, `onTransitionEnd`, ... 8 types, one `setCSSEventHandler` batch
  channel keyed by tag) are not ViewConfig events: the seam must claim those props before `routeEvent`/`setProp`,
  or a function lands in the Fabric payload.
- The RN source vendored locally is main (1000.0.0), not the pinned 0.86: re-check any RN claim against the pin.
- RN's own renderer takes over the one event handler of the runtime the moment it loads, and Metro loads upstream modules lazily. `getViewProp` through upstream reached `fabricUtils`, which requires `ReactFabricPublicInstance`, so the first press of it broke every touch after it (`Cannot read property 'canonical' of undefined` from `getListener`). Ours asks `__reanimatedModuleProxy` directly. Before calling any upstream function from a press handler, check that its chain does not require RN's renderer.

- CLOSURE FREEZE (Vue, Solid, Svelte): the worklets serializer caches a clone by object identity and, in a dev build, turns every key of what it cloned into a getter whose setter ignores writes. A framework's props object in a closure would stop updating. `snapshotWorklet` (`core/worklet-snapshot.ts`) hands the runtime a copy of the current values, and a change takes a new snapshot, so the mapper restarts over a fresh clone. Proven against the real serializer in `vue/real-runtime-closure.test.ts`; the UI-thread read of the copy is device-only.

- STYLE ARRAYS (Vue): `createVNode` flattens a `style` array into one record, copying every key of a handle into it. A handle carries its own name under `symbioteWornHandle` (`markFlattenable`), and the style handle claim has `unwrap`, which gives the engine the handle and the plain keys apart. Without it the handle is lost and its keys reach Fabric.

- COMPONENT REFS (Vue): a function ref on a component gets what the component exposes, not its node. A component that wraps a node (`Animated.ScrollView`) exposes it as `hostNode`, and `createAnimatedRef` reads it from there.

## E-1 (prepared, run by the user)

Code: `core/engine` (`shadowNodeWrapperOf`, `familyGeneration`, `getShadowNodeWrapper`, `getFamilyGeneration`,
test `shadow-node-wrapper-routes-through-the-host.test.ts`), `examples/react` screen `ReanimatedE1Screen` (one node,
`useAnimatedStyle`, handle attached by hand, peers 4.7.1 and 0.13.0, worklets plugin last in `babel.config.js`).
Loop: `pnpm run registry:sync`, `cd examples/react/ios && pod install`, build Debug and Release.
PASS: log shows `bound tag=.. family=..`; Start loop animates; a JS re-render mid-animation neither snaps nor crashes;
Settle at 120 then a JS re-render keeps 120 (feeds D-5); mount churn does not grow memory without bound; Release equals
Debug. Same-node reparent cannot be tested under React (it remounts): needs the Vue or Solid adapter later.
Result (iOS simulator, user report): bound tag logged on every mount, no crash; D-4 holds on iOS. Still open: Release
build, memory under churn (R-1), Android, same-node reparent (D-16). The vitest file was never run.

## Built so far (React, headless only)

Engine seams, all registered by the package and unknown to the engine: prop claim, style claim (`owns(key)` plus
`variantsOf(value)`), style-handle claim (`prepare`, `attach`), `bindToNode`, `whenCommitted`, `registerBeforeFlush`
and a keyframes registry (`keyframesNamed`).

Package parts: shared values and 17 hooks, `Animated.View/Text/Image` as host tags, `Animated.ScrollView` and
`Animated.FlatList` as thin components (D-11 holds for the rest), layout animations with `LayoutAnimationConfig`,
shared element transitions behind upstream's flag, the D-7 ref functions and `PerformanceMonitor`. CSS runs through
upstream `CSSManager`: animations, transitions, `onCSS*` callbacks and five states. css-parser compiles `@keyframes`,
`animation`, `transition` and the five states.

The list to work from, in the order it is built. Names and types are guarded by `src/surface-parity.test.ts`, which compares every export of upstream's entry with each adapter's entry (a started adapter lists what it lacks, an unstarted one must not have an entry yet).

| Piece | React | Vue | Svelte | Solid | Angular |
|---|---|---|---|---|---|
| shared snapshot, `followReads`, hook factories in core | built | built | built | built | built (a signal in a closure goes over as `valueGetter`, see `readAccessor`) |
| useSharedValue, useAnimatedStyle, useAnimatedProps | built | built | built | built | built (injection context: constructor, field initializer or `runInInjectionContext`) |
| useDerivedValue, useAnimatedReaction | built | built | built | built | built |
| useAnimatedRef, useEvent, useHandler, useAnimatedScrollHandler, useComposedEventHandler | built | built | built | built | built |
| useFrameCallback, useTimestamp, useScrollOffset (+ `useScrollViewOffset`), useAnimatedSensor, useAnimatedKeyboard, useReducedMotion | built | built | built | built | built |
| Animated.View/Text/Image/TextInput, createAnimatedComponent | built | built | built (host tags, `<view>`) | built (host tags) | built (the tag names, a template writes `<view>`) |
| Animated.ScrollView, Animated.FlatList (+ their prop types) | built | built | built (`.svelte` components; the list forwards the FlatList handle method by method, `reuse.json` allows that copy) | built (plain `.ts` components over `descriptorToSolid`; `ref` rides down to the list, no delegation) | built (`AnimatedScrollView` takes the tag's props as `[scrollViewProps]`; `AnimatedFlatList` extends `FlatList` with a template of its own over `FLAT_LIST_TEMPLATE`, so it keeps every input, output and slot) |
| LayoutAnimationConfig, SharedTransitionBoundary, PerformanceMonitor, ReducedMotionConfig | built (`ReducedMotionConfig` is upstream's own) | built (own `ReducedMotionConfig`, as upstream's is a React component) | built (all four are `.svelte` components) | built (`.ts`, `hostNode` helper over `descriptorToSolid`) | built (`@Component`s with a bag over `SymbioteHostPropsDirective`) |
| entry file `src/<fw>/index.ts`, `surface-parity.test.ts` `NOT_YET` empty | built | built | built | built | built |
| `*.type-check` file next to `animated.ts` (the shared host props in `core/animated-host-props.type-check.ts`) | built | built | built | built | built (the scroll view inputs) |
| the same 14-section demo screen in `examples/<fw>` plus a test that mounts it (`test-support/demo-screen-suite.ts` for all but React) | built | built (`vue-tsx` JSX and `vue-sfc` with sections as child SFCs, tests `demo-screen.test.ts` and `demo-screen-sfc.test.ts`) | built (`ReanimatedScreen.svelte`, `demo-screen.test.ts`) | built (`ReanimatedScreen.tsx`, `demo-screen.test.tsx`) | built (`ReanimatedScreen.ts`, `demo-screen.test.ts`; field-initializer factories, tag bags over `symbioteHostProps`) |
| README section for the adapter | built | built | built | built | built |

Traps found while building (each cost a red test or a hook round):

- Headless the engine keeps a function prop out of the payload by itself (`functionProps`), so a test that "keeps `onCSS*` out of the payload" cannot fail. Prove delivery, not hiding.
- Upstream drops the WHOLE `animationName` list when one entry is `none` or not keyframes, so an unknown name must be removed together with its slot in every `animation*` list.
- Keyframes cross files as a rule with no tokens whose style keys read `@keyframes <name>`; the token registry skips such a rule, so `keyframes-registry` takes them first.
- A state rule compiles to `{ ':hover': value }` and the cascade joins it with the base of the same property (`style-registry/variants`); a state sits on the last compound only.
- A state value nobody serves must never reach Fabric as an object: the engine throws in a dev bundle and ignores the whole property (base too) in a release one. The user chose this over painting the base, which looked static and surprising.
- `tsc -b packages/reanimated` reads the engine through built declarations, so a new engine export needs `tsc -b` before the package sees it.
- The magic-value hook counts a literal repo-wide until the original copy is deleted: write the slim file first when splitting a module.
- `parentOf` answers undefined for a top-level node AND for one built apart from any surface, so "has a parent" is not "is placed": a decision that walks ancestors (skip-entering scopes) must wait for `isInSurface(node)`.
- Upstream types `AnimatedRef` as returning a wrapper though it is null until commit; `IAnimatedRef` copies that through a function overload (no cast) so `scrollTo(ref)` and `measure(ref)` typecheck.
- Headless, Vite resolves the web file of `scrollTo`, `measure` and the like, which wants a DOM element: do not press such buttons in a screen test, the device runs the `.native` file.
- The demo screen is the integration test nobody else writes: `demo-screen.test.ts` mounts it over the workspace and presses every button, and `tsconfig.demo.json` type-checks it. A type or runtime gap in `Animated.*` shows up there first.
- The non-React demos sit in trees with no install, so `vitest.reanimated.ts` does what Metro does for them. `babelStep` runs the worklets plugin after the Vue JSX pair, after `compileSfc` plus a TypeScript transpile, or on what the Svelte compiler emitted.
- `EXAMPLE_IMPORTS` reads a bare import of those demos from the install of the package (`vue` becomes `@vue/runtime-core`). Break the plugin on purpose to see the test go red with `useAnimatedStyle needs a worklet`.
- The `template` depth limit of the hooks (5) pushes a Vue SFC demo into child SFCs, one per section. A scroll view takes `class` through its attrs, so no wrapper `view` is needed.
- SFC TRANSFORMERS RENAME THE FILE: the Vue and Svelte Metro transformers pass Babel `X.vue.tsx` / `X.svelte.tsx` (a name not on disk, so RN's preset strips TS). The worklets plugin reads `inputMap.sources` from disk for its source map and dies with `ENOENT ... X.vue.tsx`. Both transformers call `relabelForUpstream` (`core/css-parser/src/metro-transformer/relabel-for-upstream.ts`), which adds the app's own worklets plugin entry with `disableSourceMaps` on and keeps its other options; its test compiles a worklet under the invented name. No vitest pipeline of ours goes through the rename, which is why the demo-screen tests stayed green. The app writes nothing by hand.
- CLI: `--reanimated` on `new` and `add` (`packages/cli`, `core-layers.ts` row `reanimated`). It merges `templates/layers/reanimated/package.json.fragment.json` (package `latest`, `react-native-reanimated` 4.7.1, `react-native-worklets` 0.13.0: bump them with the peers) and `addWorkletsPlugin` appends the plugin last in `plugins` of `babel.config.js`, or the outro asks for it by hand when the config has no list.
- `Animated.FlatList` `itemLayoutAnimation` and `CellRendererComponentStyle` ride on the list's `CellRendererComponent`; the style function reads its item from the list's `data` by index, so it is single-column only, as upstream's layout animation is.
- ANGULAR INPUTS (setup-once): an `@Input` arrives after the constructor, so anything that needs one (`smoothingFrames`, `scrollViewOffset`) starts in `ngOnInit` under `runInInjectionContext`. Signal inputs `input()` need the compiler's JIT transform, which the vitest project lacks: declare `@Input` and, for reactivity, hold it in a `signal` set by the setter.
- ANGULAR COMMIT TIMING: a hook test on fake timers lets the clock move (`vi.advanceTimersByTimeAsync(0)`) for effects to run; `renderComposable` in `test-support/render-angular-composable.ts` does that. A component host needs its own selector per test, or NG0912 on the id.
- SVELTE / SOLID: `mount` returns before the engine commit (a microtask), so a Svelte test awaits `tick()` (`mountSvelte` does). A test host sets `window` at mount, not at import, or upstream takes the web branch at load.
- THE SIX DEMO SCREENS ARE ONE SCREEN: same sections, same `ra-*` test ids, byte-identical `sections.css` and `keyframes.css` (the user's rule, only the app's brand colour may differ, and this screen has no brand slot). `describeDemoScreen` presses every button of each, so a test id that drifts fails there. A section is a file per framework idiom, never a copy of another framework's code.
- `useTimestamp(isActive)` reads its flag once in Vue, Svelte, Solid and Angular, so those demos pause the clock readout with a shared `frozenAt` and `isPaused` instead. Reading `timestamp.value` on the JS thread at the pause is what freezes it.
- Angular demo components take no input at all: the `lib-reuse` hook blocks a new `@Input` in favour of `input()`, and a signal input throws NG0950 under the JIT harness. A section draws its own wrapper, and `RaBadge` owns its style and ref and exposes methods to `@ViewChild`.
- A bare import from `examples/solid` has its own install, so a second `solid-js` split the reactive graph and no signal moved. `EXAMPLE_IMPORTS` now covers Solid too.
- `ng:build` ends with `rewrite-upstream-declarations.mjs build-ngc`: without it the `.d.ts` name `react-native-reanimated/src/*`, so an Angular app's ngtsc type-checks upstream `.ts` under the app's options (dozens of TS7017 on `globalThis`). The app needs `registry:sync` and a reinstall to see it.
- Editing a workspace `package.json` makes the next `pnpm exec` run `prepare` across the whole workspace (about 30 s). Never pipe it into `head`: the cut leaves `build-ngc` folders half built.
- An Angular `scrollViewProps` is typed `IAnimatedHostProps<IAngularScrollViewProps>`, which is what lets a worklet handler (`onScroll: useComposedEventHandler(...)`) in; `animated.type-check.ts` holds the case.
- The vitest harness runs Angular under JIT, which checks no template: an `[entering]` on a tag or `imports: [createAnimatedComponent(X)]` passes there and fails in the app (NG8002, NG1010). The AOT check that needs no build or launch: `examples/angular/node_modules/.bin/ngc -p examples/angular/tsconfig.angular.json --noEmit`. A host tag takes layout animations only through `[symbioteHostProps]`, and `imports` names a class.

## Open

`useAnimatedKeyboard` is deprecated upstream (keep for parity); the `'worklet'` directive survives Vue `compileScript`, Svelte 5, `babel-preset-solid`, TypeScript emit and ngtsc partial compilation (`pnpm --dir packages/reanimated run ng:build`, the composed `AnimatedFlatList` template compiles); the Angular linker and the Metro transformer chains are not run end to end;
gesture-handler is the next epic (D-29), after this one; `screenTransition` wiring into `packages/navigation` waits for it.

## Ledger: an exiting Flip tile hides the buttons below it (device, iOS, every adapter)

Symptom: after the exit of `FlipOutXDown` (hide, or next preset) the buttons under the stage are invisible, still tappable; a second press brings them back. Reproduced in React, so not an adapter.

Status: no longer reproduces. On the iOS simulator `Flip` and every other preset are fine in all five adapters, with the diagnostic presets and `collapsable={false}` already removed from the React example. The cause was never pinned down, so H6, H9, H11, H12 and H14 are closed as "not reproducing", not as refuted. If the symptom returns, start from H14 and the pull after the end of the exit.

| id | hypothesis | status | evidence |
|---|---|---|---|
| H1 | the exit worklet reports NaN or never ends, given real metrics | refuted | `src/core/exit-animation.test.ts`, 6 cases: finite every frame, ends with remove |
| H2 | new proxy at fault | refuted | `USE_LEGACY_LAYOUT_ANIMATIONS_PROXY` (needs shared transitions off) fails the same |
| H3 | `perspective` alone | refuted | perspective with a fade exit is fine on device |
| H4 | any translateY | refuted | `translateY` by constant 60 and `translateX` 60 are fine |
| H5 | native `currentHeight` arrives empty or NaN | refuted for our node | `reanimated-proxy.itest.ts`: the real proxy hands the exit `currentHeight: 60`, `currentOriginY: 17`, a correct window; a missing value would make `translateY` NaN, but ours is not missing. The device print is still not read |
| H6 | perspective together with `scale` to 0 | open | ends fine headless; fails on device, unexplained |
| H7 | our engine flattens differently from stock around the exiting node | refuted | `reanimated-exit-mutations.itest.ts` on the real differ: section, tile and both buttons mount as SIBLINGS under the root (host indexes 0 to 3), as RN's flattening does for any painted view that forms no stacking context |
| H8 | the withheld `Remove` shifts later index-based mutations, or the proxy loses a view | refuted | `reanimated-proxy.itest.ts` runs the real `LayoutAnimationsProxy` (4.7.1, compiled into `symbiote_tester`) over the real differ and the stub platform: a hide, and a preset change with a pressed button and a new entering tile, keep every button mounted; the old tile goes at the animation's end with one Remove and one Delete |
| H13 | the Flip frames themselves (perspective, rotateX, translateY) break the proxy or the props parse | refuted | `reanimated-proxy.itest.ts`: three frames through the real proxy give one Update each, on the tile only; the final transform parses to `rotateX -1.5708rad, translateY 60`; every button keeps its props |
| H9 | in that flat host list the proxy reorders or re-inserts the section view (an unflattened ancestor of the exiting tile) over the buttons: invisible, yet the buttons keep the touch | open | device experiment: `collapsable={false}` on `ra-section`, which nests tile and buttons inside the section view (itest: Remove at index 0 of the section, not of the root) |
| H10 | the engine emits a stream that is not minimal (an extra Create or Insert of a withheld tag makes the proxy flush it, `reconcileContradictedRemovals`) | refuted | same itest: a hide is one Remove and one Delete, a swap is one each of Remove, Delete, Create, Insert, a restyle one Update |
| H11 | a leftover of Reanimated's synchronous props on iOS (4.7.1 changelog: synchronously updated props reset when a commit moves a view within its parent; the proxy writes opacity 0 for entering views) lands on a button | open | no itest can reach it without the proxy and a mounted UIKit tree |
| H12 | upstream reports | open | no issue for FlipOut found. Near: #5349 (iOS, exits break as a sibling of an absolutely positioned view, an extra wrapping view fixes it), #4927 (view loses its space when an exit starts). Docs: a removed non-animated parent does not wait for its children's exits, fix `collapsable={false}`. The changelog lists iOS exit fixes up to 4.4.2 (re-add the LightNode before an exit, #9646), all older than the installed 4.7.1 |
| H14 | the exit never removes its tile until the next commit; only exits that move the tile onto the buttons make it visible | open | geometry: stage is 70 high, the tile 60, the gap 12, so `translateY` 60 puts the tile over the button row; a faded exit leaves an invisible tile, a stuck one is unnoticed. Fits screenshots 7 and 9 (tile visible, buttons gone) and the second press, which commits. The itest end-of-exit case needs a pull to remove it; on a device the pull comes from `notifyDelegatesOfUpdates` in `performOperations`. Device test: preset "Exit to half" (ends at opacity 0.5): a half-faded tile left behind after the exit confirms it |
| H15 | upstream #10275 (closed, not reproduced): a late end of the entering animation of the same tag drops the exit's removal; our tile carries both | refuted for the order the JS manager emits | `reanimated-proxy.itest.ts`: entering over and pulled, entering over and not pulled, exit started while entering still runs: the tile goes at the end each time. The JS manager sends no end on a cancelled animation (`finished` guards it), so the order that does drop the removal (end false after the exit started) cannot come from it. 4.7.1 has no counter either |
| H16 | something in the whole chain of the real screen: React section, our claim, the proxy, Reanimated's own animation manager running FlipOutXDown on a stepped clock | refuted | `reanimated-exit-screen.itest.tsx`: hide, hide during the entering, next preset, and hide/show/hide/next in a row. The tile leaves at the natural end of its exit (about 18 frames), both buttons stay mounted and opaque on EVERY frame, one tile remains after a swap. Rests on the end being delivered and pulled, as a device does. `reanimated-real-section.itest.tsx` runs the example's own `EnteringExitingSection`, all 10 presets, hide then show then next: each tile is present on the first frame of its exit, gone at the end, buttons intact on every frame |

The proxy runs headless now: `symbiote_tester` compiles Reanimated's `LayoutAnimationsProxy` from the installed package (`tests/CMakeLists.txt`, `reanimated-worklets-stubs.cpp` answers the few Worklets calls, `reanimated-stubs/` the one generated props type), and a test turns it on with `useLayoutAnimationsProxy(true)`. What it settles is structure and numbers. What it cannot settle is what UIKit does with the views, which is where the bug now has to be.

No device facts are pending. The diagnostic presets (`Exit perspective`, `Exit to half` and the rest) lived only in the React example and are gone; the itests keep the structural proof.

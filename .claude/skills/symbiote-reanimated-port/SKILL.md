---
name: symbiote-reanimated-port
description: "Porting react-native-reanimated 4 and react-native-worklets to every Symbiote adapter (React, Vue, Svelte, Solid, Angular): confirmed decisions, the verified JS/native contract, the Fabric seam risks and the E-1 device experiment. Read BEFORE writing any @symbiote-native/reanimated code, before touching getShadowNodeWrapper or familyGeneration in core/engine, before wiring react-native-reanimated or react-native-worklets into an example, and before answering whether Reanimated works on our renderer. Holds the stale-vendor trap (a local reanimated clone was two minors behind npm), why a ShadowNodeWrapper is a new native read, why a reparent breaks family-keyed registries, why hooks are ported as core controllers over upstream Common modules, and the pass criteria of E-1. Trigger on: reanimated, worklets, useAnimatedStyle, useSharedValue, shared value, layout animation, entering exiting, CSS animation, pseudo selector, ShadowNodeWrapper, familyGeneration, E-1."
---

# Reanimated port

Status: React adapter BUILT and verified headless only (see "Built so far"); Vue, Svelte, Solid, Angular not started (the user said React first). E-1 ran once on the iOS simulator
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

| Piece | React | Vue | Svelte | Solid | Angular |
|---|---|---|---|---|---|
| hooks, Animated.*, layout, CSS | built | no | no | no | no |

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
- Not ported yet: `Animated.FlatList` `itemLayoutAnimation` and `CellRendererComponentStyle`, which need `CellRendererComponent` on the list components.

## Open

`useAnimatedKeyboard` is deprecated upstream (keep for parity); the `'worklet'` directive survives Vue `compileScript`, Svelte 5, `babel-preset-solid` and TypeScript emit (probed; ngtsc and the linker not run, the Metro transformer chains not run end to end);
gesture-handler is the next epic (D-29), after this one; `screenTransition` wiring into `packages/navigation` waits for it.

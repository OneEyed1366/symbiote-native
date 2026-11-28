---
name: symbiote-itest-runner
description: "Why `scripts/run-itests.mjs` bundles and runs `*.itest.ts` the way it does. Read BEFORE editing the runner, adding a per-file directive, changing the esbuild plugins or the platform prelude, or when an itest dies at import with an error that names a file nobody asked for. Holds the opt-in directives (`@symbiote-platform-extensions`, `@symbiote-count-fabric-calls`), the RN bootstrap stub, the Release vs Debug switches, the bytecode flags and the Android split."
---

# The itest runner

`scripts/run-itests.mjs` bundles each `core/engine/cpp/tests/js/**/*.itest.ts` with esbuild and evaluates it in `symbiote_tester`, a binary with one JSI runtime and no module loader. The shape is React Native's own `private/react-native-fantom/runner`.

## Per-file directives

Both directives are opt-in because turning them on for every bundle breaks other fixtures. A comment directive greps and survives a rename, which a filename convention does not.

`// @symbiote-platform-extensions` makes esbuild resolve `./X` to `X.ios.js` for React Native's own files only.
- `Libraries/Utilities/Platform.js` is a shim whose body is `import Platform from './Platform'`. Without the extension it resolves to itself and `Platform.select` throws far from the cause.
- Enabled everywhere it broke 154 of 158 itests: `Platform.ios.js` wants `NativePlatformConstantsIOS`, which wants a native module.
- A permissive `__turboModuleProxy` would fix that, but the engine reads the global itself (`core/engine/src/native-modules`), so every "this module is absent" test would find one.
- Scoped to the importer so our own sources never get suffix resolution: a module with platform variants lives in a folder with `index.ios.ts` beside `index.ts`.
- iOS only. An Android arm would be a second bundle, not a second extension.

`// @symbiote-count-fabric-calls` wraps `nativeFabricUIManager.createNode` in the banner and counts creates by view name.
- It must live in the banner. React destructures `createNode` into a module-scope local before the first test body runs, so a fixture that installs the wrapper itself reads zero.
- The global holds a JSI HostObject that `UIManagerBinding::getBinding` casts back on every commit. A wrapper left in place kills the process with nothing in the log.
- The file owes one call to `__symbioteRestoreFabric()` once the renderer has loaded.
- The headless twin of `examples/*/fabric-call-counter.ts`.

## RN bootstrap stub

`ReactNativePrivateInitializeCore` is emptied. React's `ReactFabric-prod.js` requires it for side effects, and it drags in LogBox, the DevTools hook and RN's component tree, which reach `.png` imports and a dev-only module. Installing global polyfills there would also measure them. The `virtualcollection/` files are stubbed too: esbuild bundles RN's lazy getters and `VirtualCollectionView.js` imports a `VirtualViewMode` its sibling does not export.

## Flow, Solid, Svelte, Vue

- RN ships Flow and no bundler parses it. The strip uses Hermes' own parser (`babel-plugin-syntax-hermes-parser`) because `@babel/preset-flow` dies on `flattenStyle.js`. The result loads as `jsx`: RN writes JSX in `.js` files, and the `js` loader gives 75 copies of "JSX syntax extension is not enabled".
- Solid is compiled in two passes: esbuild strips types with `jsx: 'preserve'`, then `babel-preset-solid` compiles the JSX. This mirrors `adapters/solid/babel-preset.cjs` (`generate: 'universal'`, `moduleName: '@symbiote-native/solid/renderer'`); do not let them drift. The preset resolves from `adapters/solid` because pnpm keeps devDependencies beside the package.
- Svelte compiles at bundle time with `generate: 'client'`; the server build has no `mount()`. The `browser` condition is the matching half.
- Vue calls `compileSfc` from `metro-vue-transformer.cjs`, the same function Metro runs in an app. `ts` is the second pass that Metro's babel transformer does there.
- `@symbiote-native/*` resolves by source through a resolver, not an `alias`, because packages expose subpaths and an alias matches exactly. A path returned from `onResolve` is final, so the candidates are spelled out.
- A `.svelte.ts` or `.svelte.js` rune module goes through `compileSvelteModuleFile`, the function Metro runs. Without it the bundle keeps a bare `$state` and the first render dies with `Property '$state' doesn't exist`.
- `packages/navigation` is the one package under `packages/` that resolves by source. A fixture imports past the `navigation/svelte` barrel (`svelte/stack`, `svelte/runes`, `svelte/screen.svelte`).
- The barrel imports `register`, which loads the `react-native-screens` specs and with them all of `react-native`. Without `@symbiote-platform-extensions` the build fails on missing exports, with it the bundle throws `__fbBatchedBridgeConfig is not set`.
- One file drains at most 1000 rounds of timers. Past that it ends as `CRASH` with `the test file never settled`, which is the harness limit and not an engine fault: 3000 push and pop trips cross it.

## Builds and flags

- `SYMBIOTE_ITEST_BUILD=build-release` picks the optimized tester. Debug (`build`) keeps `react_native_assert` armed but makes list appends O(N^2). Correctness runs on `build`, timings on `build-release`.
- `__DEV__` and `NODE_ENV` track the build. A development React in a release run times the wrong code. `ReactFabric-prod` also sets up production internals, so a development `createElement` reaching for `dispatcher.getOwner()` renders nothing and reads as "components do not work".
- `__DEV__` stays true in the debug build on purpose: it keeps RN's invariants armed, like the Debug native side.
- Angular's dev switch is a third one. `initNgDevMode` turns itself on when the global is undefined. A compile-time `define` of `ngDevMode: false` also strips component metadata built at class-definition time, so it would measure a build a device cannot have. `mount()` calls `enableProdMode()` off `__DEV__` instead, which is what ships.
- Angular's JIT reads legacy decorator metadata, so `experimentalDecorators: true` and `useDefineForClassFields: false` go together.
- `build-release` runs bytecode BY DEFAULT when `hermesc` is found, `SYMBIOTE_ITEST_BYTECODE=0` opts out and `=1` makes a missing compiler an error. Heap budgets (primitive suites, `touchable-attach-cost`) are calibrated on bytecode, so source mode fails 4 of them (Vue and Angular `runs the primitive steps`, two `touchable-opacity` cases) with no code at fault.
- A release build runs a quarter of the cores in parallel (`SYMBIOTE_ITEST_JOBS` sets the count), bundling still uses all of them. A sweep at every core flaked one timing test (`fill-scaling-cost`, `teardown-sweep-cost`, a ratio in the create breakdown) in about half the runs and at half the cores in one of three, while five sweeps at a quarter were clean in the same ~35 s.
- `SYMBIOTE_ITEST_BYTECODE=1` compiles each bundle with `hermesc -O` and runs the bytecode, which is what a device runs. `-Xes6-block-scoping` is required: `hermesc` defaults it off, `const` in `for...of` stops being per-iteration, and every closure in `report()` captures the last case. A single-case fixture passes, which hides it.
- `hermesc` comes from the `hermes-engine` pod, or from the destroot that `scripts/fetch-hermes.mjs` unpacks.
- `SYMBIOTE_KEEP_BUNDLES=1` leaves the bundles on disk: a tester stack trace names a line in the bundle.

## Android split

`*.android.itest.ts` runs only against `build-android`, and every other file only against the other builds. Each arm's fixtures assume their own platform: an Android fixture asserts keys the default build never writes. The suffix is the whole mechanism, the shape of Metro's `.ios.js` / `.android.js`.

## Prelude

`PLATFORM_PRELUDE` is what a bare JSI runtime lacks and a device gets from `InitializeCore`: `global`, `queueMicrotask`, queued timers, `performance`, `console`, `window`, `navigator`, `URLSearchParams`.
- Timers are queued, not clocked. A test drains them with `flushTimers` from `js/harness.ts`, so there is no wall-clock race.
- The `queueMicrotask` polyfill prints a throw as `uncaught in a microtask`. A bare `then` dropped it, so a Svelte component that failed during an update left no line and its test could pass on nothing.
- It showed `fadeTo` throwing for lack of `requestAnimationFrame` in the Vue and Angular primitive suites, so older `update` timings of `touchable-opacity` read low. The suite now fails on any `console.error`.
- Hermes needs `setImmediate` by name: its Promise lives in `InternalBytecode.js` and schedules through it, so the first `await` dies with "Property 'setImmediate' doesn't exist".
- `performance.now` prefers the tester's `steady_clock` in fractional ms. The `Date.now` fallback is whole ms and reads a few-ms phase as 0 or double.
- Microtasks have no priority over timers. A promise job, the `queueMicrotask` polyfill and `setTimeout(0)` share one queue.
- A probe printed `timer-0, then-1, microtask, then-2`, while a device runs the timer last. Test "a timer runs after the commit microtask" in vitest.

## Break-testing a retention guard

- With cleanup disabled, frame callbacks and infinite repeats of every visit stay, and each stepped frame runs all of them. The run time grows far faster than the visit count.
- A break run with 450 visits was still going after 8 minutes. With `[5, 20]` visits it took 2 s and went red (36 nodes per visit).
- Shrink the visit counts for the break run, give the command a 2 minute timeout, and restore both files by hash.

## Reanimated seams

- `scripts/reanimated-itest-seams.mjs` sends upstream's `../updateProps` to a recorder: the web writer throws on an engine view.
- The worklets mock keeps `serializableMappingCache` in a `Map`, the native one is a `WeakMap`. Under the mock every `useAnimatedRef` read as a leak of about 1912 B per visit. A guard imports `reanimated-weak-cache` first.
- No worklets babel plugin runs, so a worklet is marked by hand with `__closure` and `__workletHash`.

## Scheduling

Testers run concurrently through a limiter that refills a slot the moment one frees. A fixed `Promise.all` batch idles every slot behind its slowest member, and this suite mixes multi-second benchmarks with sub-second unit tests. Printing walks bundles in submission order.

- `adapter-create-cost` gates a `walkMs` ratio in the assert build too. It failed once on a loaded host, and four later cases fell with it as `an earlier arm did not run`.
- The file alone and the next full sweep passed. On such a failure check `uptime`, run the file alone, then repeat the sweep.

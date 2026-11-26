---
name: symbiote-gc-boundary-leaks
description: 'Why a removed screen is never freed when an adapter keeps a JS link from a node to its ancestor, and how to measure it. Read BEFORE adding a parent map, a `parent` field or a closure over an ancestor to any adapter renderer, and before measuring retention after a screen swap (`liveNodes`, `collectGarbage`). Holds the root cycle through `attachedHandle`, the no-`WeakRef` fact, the 8-collection rule, the swap-per-tick method and the `*-navigation-leak.itest` guards.'
---

# GC-boundary leaks in adapters

## The cycle

C++ (`core/engine/cpp/SymbioteTree.cpp`) gives each child an `attachedHandle`, a strong `jsi::Object`, while a parent holds it. That handle is a GC root.

A JS edge from a child's wrapper to an ancestor's wrapper closes a loop through it:

```
child wrapper -> ancestor wrapper -> C++ ancestor -> children -> attachedHandle -> child wrapper
```

A `WeakMap` value counts, because its key is rooted. A removed screen is then never freed, not even after `unmount`.

## The rule

- An adapter keeps no child -> parent link. It asks the engine: `parentOf(node)`.
- JS may remember only what the engine lacks. In the Svelte renderer that is the `HostFragment`, a wrapped owner, and a slot mark (`places` in `symbiote-renderer.ts`).
- This Hermes build has no `WeakRef`, so a weak back-edge is not available.

## Measuring retention

- C++ frees a dropped tree one level per collection. Run at least tree-depth `collectGarbage()` calls, 8 in the guards. With 2 the tail reads as a leak (1748 -> 2588), with 8 it is flat (97 -> 98 -> 98).
- Swap one screen per tick and `commit()` in between. A single synchronous flush batches create and remove and distorts the reading.
- Compare `readSurfaceTelemetry(ROOT_TAG)?.liveNodes` after 0, 20 and 40 swaps. Two screen sizes: 30 rows with a slack of 150, and 1 row with a slack of 2 (a leak is about 80 there).
- `unmount(ROOT_TAG)` after every reading. A mount left on the same root adds a constant to the next one, and a loose slack hides it.
- Render real rows. An empty screen of 6 nodes proves nothing (the Angular guard once measured one).
- Never read telemetry before a surface is mounted: it aborts in `TransactionTelemetry`.

## Wrapped owner

An Android `scroll-view` with a `refresh-control` has the wrapper as its engine parent. `owner.wrapper` points up, so `detachOne` (`host-behavior.ts`) clears it on teardown, and `removeChild` (`node-tree.ts`) nominates the wrapper for teardown. `parentOf(owner)` answers the wrapper, which `removeChild` maps back to the wrapper's holder. Guards: `vue-wrap-navigation-leak.itest.ts` (with a tree-shape case) and `svelte-wrap-navigation-leak.itest.ts`.

A JS list kept on the owner must not hold the wrapper: it is the owner's C++ ancestor, so the list closes the loop too. The Svelte renderer keeps `WRAPPER_SLOT` there and asks `owner.wrapper`. `owner.wrapper` is set inside `appendChild`, so a check made before the insert does not see it. Take the baseline after one mounted-and-unmounted app: the first unmount leaves four nodes once.

## Vue dev build

`runtime-core` hangs `__vnode` and `__vueParentComponent` on every element when `NODE_ENV` is not production. That is a child -> parent component link and it leaks as above. `dropDevLinks` (`adapters/vue/src/renderer/dev-links.ts`) removes both on `remove`. Swap component types in a guard: a swapped element is not enough, a component instance carries the link.

## Per-node state needs a release mark

`teardownSubtreesOf` (`host-access.ts`, C++ `collectTeardownSubtree`) walks only roots, tagged nodes and the nodes between. An untagged `view` holding JS state is skipped when its ancestor leaves, so the state is never released. `hasAnimatedBindings()` falls back to the full `subtreesOf`. Anything else per node must call `recordSetReleaseMark(node)` once (`bindToNode` does, media subscriptions do). A new per-node registry without the mark leaks silently: the guard is `engine-node-binding-release.itest.ts`, bind a node two levels under the screen and remove the screen. The recording fabric in vitest narrows the same way, so a unit test sees it too.

## Dead screens wait for the collector

A wrapper with `NativeState` holds native memory the Hermes heap does not count, so natural collections leave dead screens alive. `svelte-natural-gc.itest.ts` swaps screens without `collectGarbage()` during the swaps and is RED: 800/1600/3200/6400 swaps leave about 15-21k, 22k, 28-41k, 54k extra live nodes (2 runs per order, the 3200 point varies by run). No plateau up to 6400, the curve beyond is unknown.

`liveNodes` is one counter per process: clear it with 8 collections and read the base after the first commit, or runs add up. The 2 KB `setExternalMemoryPressure` hint per node (react-native PR 59702) made it worse here, 77631 vs 28238 at 3200 swaps, so it is not applied.

Cause: `~Node` dropped each child pin, so a dead tree was freed one level per collection and natural old-generation collections are rare. Fix: a removed subtree root takes over the pins of all descendants (`Node::descendantPins`, `kOpRemoveChild`), so the tree is freed in two collections. A put-back (`kOpAppendChild`, `kOpInsertBefore`) returns them. The guard went from 14.7k/21.8k/28.2k/53.9k to 2.3k/91/92/-91 extra live nodes at 800/1600/3200/6400 swaps.

The 2 KB per node pressure hint is not applied, it made the window worse. Cost of the walk on remove is not measured in Release.

JS side: `svelte-heap-retention.itest.ts` reads `heapInfo()['hermes_allocatedBytes']` after 8 collections, 400 vs 1600 swaps. Flat on Svelte (-24.6 KB / -24.5 KB), and a per-`appendChild` array in `node-tree.ts` turned it red (3.8 MB / 16.2 MB). `liveNodes` alone cannot see closures or per-node maps.

A big RAM jump on a reanimated screen is not this engine. Hermes V1 keeps about 0.5 MB debug data per worklet in Legacy Eval Mode. Fix: Worklets Bundle Mode (`bundleMode: true` in the babel plugin plus `bundleModeMetroConfig` in Metro), or Hermes `250829098.0.15`, or RN 0.87. The headless tester has no Worklets runtime, so the memory effect is checked only on a device.

Measured by hand on `examples/svelte` after a walk through its screens: the plateau was 551 MB without Bundle Mode and about 431 MB with it. One reading per arm, both Debug with bundles from Metro, so the Release effect is unknown.

A Debug footprint is not what a user of the app pays. One reading of `examples/solid`, Debug, iOS 26.5 simulator, 387 MB footprint:

- 153 MB: 9822 Hermes `CodeBlock`s of 16 KB. A lazy one gets all three property caches at 256 entries (`isCodeBlockLazy` in `lib/VM/CodeBlock.cpp`).
- Every one of the 9822 held those sizes. Two runtime modules with `BCProviderFromSrc` own them, 7010 and 2812.
- 27 MB: three copies of the 9 MB dev bundle source.
- Both come from compiling source on the device. A Release build ships bytecode, so measure Release before optimizing memory.
- `examples/svelte` in Release, same simulator: `footprint` read 100 MB and 109 MB before the screens were walked. After the operator walked them it read 127 MB, peak 139 MB. At 127 MB `Malloc Small` held 64 MB and `Untagged` 39 MB, not analyzed further.
- The 431 MB Debug reading is the closest pair to it: one reading each, and the two walks were not scripted.

A simulator app is a host process, so nothing needs Xcode attached: `footprint $(pgrep -f Canary.app/Canary)`. To tell a Release build, its bundle has `main.jsbundle` and no `Canary.debug.dylib`.

To attribute a footprint, run these on the host against the simulator app's pid:

1. `footprint <pid>` splits it by region, and `vmmap --summary <pid>` shows heap fragmentation.
2. `heap <pid> -showSizes -sortBySize` finds a size class with an outsized total. Most native allocations print as `non-object`.
3. `heap <pid> -addresses 'non-object[16384]'` lists them. `lldb --batch -p <pid>` with `memory read` and `detach` shows what a block holds. A pointer to a vtable names the owner.

Bundle Mode without a `metro` patch fails with `Failed to get the SHA-1 for .../.worklets/<id>.js`. The plugin writes those files during transform, and Metro has not indexed them. Each retry gets further: a clean `react-native bundle` of `examples/react` passed on run 4, an Angular probe entry on run 4. A Release build runs the bundler once, so it fails.

The upstream patch is in `react-native-worklets/bundleMode/patches/patch-package` of the reanimated repo. `metro+0.84.4.patch` applied to the installed 0.84.6 and the clean `react` bundle passed on run 1. A separate `metro-runtime` patch is for Fast Refresh in worklet runtimes. See the [setup page](https://docs.swmansion.com/react-native-worklets/docs/bundleMode/setup/).

Every Bundle Mode example carries both patches in `patches/` and runs `patch-package` on `postinstall`. The files are named for `metro` 0.84.6. A `metro` bump needs the matching upstream patch.

The upstream patch does not cover a warm cache ([reanimated#11313](https://github.com/software-mansion/react-native-reanimated/issues/11313), open). A transform cache hit skips the plugin, so a wiped `.worklets` stays empty and the build fails with `ENOENT`. Any reinstall does that, `registry:sync` included, as the Metro cache in `$TMPDIR` survives. The repo keeps the patch upstream: `--reset-cache` once after a reinstall, noted in the example READMEs.

If that step gets in the way, a trial fix worked: in `Transformer.transformFile` of `metro`, treat a cache hit as a miss when a `.worklets` dependency is missing on disk. It was not adopted, to avoid carrying our own patch hunk.

Bundle Mode also needs inline requires in `react-native-worklets`. A worklet runtime evaluates the app bundle with `__r` stubbed, then calls only `require(-2)`, the worklets entry.

- With `inlineRequires: false`, the `require('./NativeWorkletsModule')` of `src/specs/index.ts` runs outside its `__RUNTIME_KIND` ternary and loads React Native.
- The app dies at start: `Accessing __fbBatchedBridgeConfig is not allowed on Worklet Runtimes`, with `TurboModuleRegistry` in the stack.
- The Svelte apps need eager requires elsewhere. `examples/svelte/metro.config.js` passes `inlineRequires: { blockList }` with every file except those of `react-native-worklets`.
- `metro` only asks `path in blockList` (`transformHelpers.js`), so a `Proxy` with a `has` trap works as the list.

The check is headless: bundle with `react-native bundle --dev true`, then run `node scripts/check-worklet-boot.cjs <bundle> <app>/node_modules/react-native-worklets`.
It reproduced the device message on the broken bundle. It does not cover JSI or the main React Native runtime. Run it for every example after enabling Bundle Mode or editing `inlineRequires`.

Layout animation configs need no JS cleanup on detach. Native `LayoutAnimationsProxy.cpp` drops `entering`, `exiting` and `layout` of a removed tag, and clearing `exiting` from JS would lose the exit.

An `entering` config sits under the `nativeID` until a view carrying it mounts. Only `transferConfigFromNativeID`, called on each `Insert`, drops the entry. An `undefined` config does not: `lockAndFlushConfigUpdates` stores the key with `nullptr`. So a skipped child is never configured, as upstream does it: `dropEntering` (`layout-animations.ts`) only takes its `nativeID` off.

The verdict is taken in `registerPreCommit`, not in `registerBeforeFlush`, which also fires on reads. Angular calls `parentNode` in the middle of a render, before the `LayoutAnimationConfig` view has its scope prop, so a verdict taken there missed rows. The `afterCommit` hook is too late for a config, native needs it before the mount.

Keeping the `nativeID` on a skipped child is not the fix either. A non-empty `nativeId` forms a view (`ViewShadowNode.cpp`). Probed in the tester on a bare `view` child: with the id taken off it mounted nothing, and with the id kept it got a `Create` and an `Insert`. A native view costs more than the entry. The recording fabric of vitest does not flatten, so check any `nativeID` change with `mountingLogs()` in an itest, with `useLayoutAnimationsProxy(true)` on first, or the tester dies with `SIGSEGV`.

It does not drop `sharedTransitions_` or `tagToName_`: only an `undefined` config from JS does, and upstream sends none on unmount. The port keeps that parity.

The second case of `svelte-reanimated-retention.itest.ts` covers these props, `LayoutAnimationConfig` and a shared transition tag. It stands in for the UI runtime with a `LayoutAnimationsManager` that ends each animation a frame later. Native memory is not measured.

Do not release `props` or `committed` when a node is removed: `reattachHostBehaviors` (`host-behavior.ts`) supports putting a swept node back. Only `teardownSubtree` (unmount) means gone for good.

## Guards

`svelte-natural-gc` and `svelte-heap-retention` (same folder) cover the collector's own schedule and the JS heap.

`core/engine/cpp/tests/js/{svelte-adapter,vue-navigation-leak,react-navigation-leak,solid-navigation-leak,angular-navigation-leak}.itest.ts[x]`, run with `node scripts/run-itests.mjs <file>`.

Wrap and animated guards: `{react,solid,angular}-wrap-navigation-leak`, `{react,vue,solid,angular,svelte}-animated-leak`, `react-animated-interpolation-leak`, `svelte-idle`, `engine-container-consumer-leak`.

Break-test: a `WeakMap` child -> parent set in `appendChild` and `insertBefore` of `node-tree.ts` turned all of them red (1913-1957 extra nodes). Without it they are green.

# Contributing

## Requirements

Node >= 22.13, pnpm 11, CMake and a C++20 toolchain, and
[watchman](https://facebook.github.io/watchman/docs/install) (macOS: `brew install watchman`).

Watchman is not optional in practice. Without it Metro's fallback watcher opens one OS file handle
per watched directory and reliably dies with `EMFILE: too many open files` on a monorepo this size.

```bash
pnpm install
pnpm typecheck          # tsc --build across the workspace
pnpm lint
pnpm run format:check
```

## Tests

Four layers, each answering a different question. Run the first two for an ordinary change, and the
itest layer whenever anything in `core/engine/cpp` moves.

```bash
pnpm test               # vitest + node:test, the everyday suite
pnpm run test:cpp       # ctest over the C++ engine's own unit tests
pnpm run test:itest     # builds the C++ host, then runs *.itest.ts inside it
pnpm run test:android   # the same fixtures on a host compiled with the Android branches
pnpm run bench:itest    # the Release host. Timings only, never the assert build
DEBUG=1 pnpm test       # any of the above, with diagnostic logs on
```

**`pnpm test`** drives the engine against a fake `nativeFabricUIManager` (`installFabric`) and reads
committed Fabric props back, which is the real commit path without a simulator. `node:test` covers
the native ESM/CJS tooling: the publish-output rewriter and the app linker. Narrow with
`pnpm test:vitest` or `pnpm test:node`.

**`pnpm run test:itest`** is the one worth understanding before touching the engine. It bundles each
`core/engine/cpp/tests/js/*.itest.ts` with esbuild and evaluates it inside `symbiote_tester`, a real
JSI runtime linked against the real `SymbioteTree`. A test run this way commits into the engine that
ships, so it can assert on the payload Fabric was actually handed, which no TypeScript stand-in can.
React's own Fabric renderer loads in the same harness, and that is how the stock baseline in the
README's benchmark table is measured.

**`pnpm run test:android`** compiles the `#ifdef ANDROID` branches of `SymbioteFabricProps.cpp` and
runs the `*.android.itest.ts` fixtures against them. A compile-time branch is only testable in a
build that compiles it; mocking `Platform.OS` reaches the JS half and nothing else.

**Detox** runs the on-device journeys, per example app:

```bash
cd examples/react && pnpm run e2e:build:ios && pnpm run e2e:test:ios
```

One shared `canary-journeys` spec is mirrored across `examples/react`, `examples/vue-tsx`,
`examples/vue-sfc` and `examples/svelte`. The _same_ journeys is what proves the adapters behave
identically on device. `examples/angular` carries its own larger suite (navigation, deep linking,
tabs, sheets, state persistence) rather than the shared spec. `examples/solid` has no Detox harness
yet.

### Two rules that are not style preferences

**Never benchmark in Debug.** The assert build has `NDEBUG` off, which also defines
`REACT_NATIVE_DEBUG` and compiles Yoga's child-list validators into `appendChild`. Each walks the
parent's whole child list, so building an N-child list one append at a time is O(N^2) there and O(N)
in the build that ships. Measured: 10 000 appends cost 3 554 ms on the assert build against 27 ms
optimized. It reports shapes that do not exist off the harness.

**Read the counters before the milliseconds.** Two arms whose node counts, prop-key counts or
`created`/`cloned`/`setProps` differ are not one workload, and comparing their ms is meaningless.
This has caught a stale stock build measuring nine nodes against ten, and an adapter whose apparent
win was a step that committed nothing.

## Running a canary

Each `examples/*` is a stock React Native 0.86 app driven by SymbioteNative. The steps are identical
bar the directory, and each adapter's README carries them: [react](./adapters/react),
[vue](./adapters/vue), [angular](./adapters/angular), [svelte](./adapters/svelte),
[solid](./adapters/solid).

To run a canary against **this working tree's** build of a package rather than the published one,
use the local registry. Never a `file:` tarball, which writes machine-local state into tracked
manifests:

```bash
pnpm run registry:setup    # once per machine
pnpm run registry:sync     # publish everything, point every example at it, install
cd examples/<app>/ios && pod install
```

The manifest is never touched: it keeps its ordinary public version, and a gitignored
`examples/<app>/.npmrc` decides where that version resolves from. `pnpm run registry:off` returns
everything to npmjs.

`pod install` afterwards is not optional. Replacing a package folder deletes the native sources
`@symbiote-native/splash-screen`'s podspec vendors at pod-install time.

## Logging

All diagnostics go through `dlog` / `isDebug` from `@symbiote-native/engine`, never a bare
`console.log`. Off by default, gated by `DEBUG`. Each example's `index.js` mirrors it onto
`globalThis.__SYMBIOTE_DEBUG__` at start, so changing it needs a fresh Metro `--reset-cache` rather
than a rebuild.

**Logs are an asset: never delete one, only add.** When debugging finds a useful seam, leave a `dlog`
there permanently. Gated, it costs one property read.

The C++ side has the same facility, `SYMBIOTE_DLOG` in `SymbioteDebug.h`, and the macro rather than
the function is the contract. It tests the flag before evaluating its argument, so building a message
on the per-node commit path is free when nothing is listening.

## Repository layout

```
core/
  engine/        @symbiote-native/engine      JS command-buffer shim over the C++ retained tree
    cpp/                                      SymbioteTree: retained tree, clone-on-write commit,
                                              tag-keyed platform rules, events
    cpp/tests/                                the C++ test host + the *.itest.ts fixtures
  components/    @symbiote-native/components  framework-agnostic component logic (state + render)
  css-parser/    @symbiote-native/css-parser  CSS / SCSS / Less / Stylus into the class registry
  test-utils/    @symbiote-native/test-utils  shared harness helpers

adapters/        react, vue, angular, svelte, solid
                 one thin reconciler each, over the engine's four-call mutation API

packages/        27 companion packages
  navigation/    native stack / tab / drawer over react-native-screens
  slider/        third-party native-view wrapper, the reference shape for wrapping one
  splash-screen/ vendors react-native-bootsplash's native sources at pod-install time
  android/       autolinked native host shims for Android
  expo-modules-link/  postinstall autolinker for the Expo wrappers below
  ...            22 Expo-module wrappers: clipboard, haptics, sensors, battery, device,
                 localization, secure-store, web-browser, and the rest

examples/        13 apps
  react/         the reference canary
  vue-tsx/  vue-sfc/  angular/  svelte/  solid/    the same canary per framework
  expo-*/        the same six under Expo
  bare-rn/       stock RN 0.86 on React's own renderer, the benchmark baseline
```

`examples/bare-rn` is the one example that must hold **zero** `@symbiote-native/*` dependencies.
Being untouched by this project is the only thing it is for, so adding one, or "closing its parity
gap", destroys it. Every parity audit in the repo excludes it explicitly.

Tests are **colocated** next to the code they cover (`*.test.ts(x)` beside the source, `e2e/` per
example app) rather than gathered in one directory.

## Design decisions

A few invariants hold the architecture together. Changing any of them is a deliberate decision, not
a drift.

- **The native core is never forked.** `react-native` is an ordinary dependency; only the JS renderer
  is replaced. If a task seems to require editing ReactCommon or Yoga, stop: the design has drifted.
- **Clone-on-write lives once, in the engine's C++ tree.** Adapters never reimplement the persistence
  dance, and neither does the platform-parity layer. A rule keyed on a node's Fabric tag runs once
  for every adapter, not once per adapter.
- **Adapters stay thin.** Layout, commit batching, event normalization and ViewConfig handling all
  live in the engine. Adapter code growing framework-specific commit logic belongs in the engine.
- **An adapter is written in its own framework's idiom.** React groups lifecycle under `hooks/`, Vue
  under `composables/`, because that is what each ecosystem calls them. Symmetry for its own sake is
  wrong here.
- **Full feature parity across adapters is mandatory.** A "minimal" or "stub" port is not a smaller
  version of the work, it is a different and worse thing. Extract the shared half so every adapter
  inherits the whole surface, rather than copying the surface per adapter.
- **Layout is stock Yoga.** Taffy is out of scope. Touching the C++ layout node turns free upstream
  merges into a permanent fork tax for an unmeasured win.

Longer-form rationale for individual subsystems lives in the project skills under `.claude/skills/`,
not in ADRs. Read the matching one before proposing an architectural change.

## Commits

One line, conventional, under 72 characters, no body. CI rejects multi-line messages.

```
fix(engine): let a null underlayColor suppress the highlight tint
```

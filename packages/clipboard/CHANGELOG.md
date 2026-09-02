# @symbiote-native/clipboard

## 1.0.0

### Patch Changes

- 2d34a11: Derive internal peer compatibility from the current workspace package versions so packed
  manifests reject older engine and adapter releases that do not provide the APIs they import.
- 255c37f: Declare npm `keywords` and refresh the README of every companion package. Registry metadata only —
  no runtime change.
- Updated dependencies [255c37f]
- Updated dependencies [255c37f]
- Updated dependencies [2d34a11]
- Updated dependencies [fd70625]
- Updated dependencies [255c37f]
- Updated dependencies [093144d]
- Updated dependencies [6e6df80]
- Updated dependencies [255c37f]
  - @symbiote-native/angular@1.0.0
  - @symbiote-native/react@1.0.0
  - @symbiote-native/solid@1.0.0
  - @symbiote-native/svelte@1.0.0
  - @symbiote-native/vue@1.0.0
  - @symbiote-native/engine@0.4.0

## 0.3.0

### Minor Changes

- 3acd869: Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
  component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
  companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
  census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
  landing alongside it) build on.

## 0.2.0

### Minor Changes

- 388c353: Declare the adapter peer dependencies as ranges instead of exact versions. Every package listed
  `@symbiote-native/{react,vue,angular,svelte}` as `workspace:*` under `peerDependencies`, which
  packs to whatever version was current at build time — so `@symbiote-native/battery@0.1.0` shipped
  demanding exactly `@symbiote-native/react@0.2.8`, and an app on any other adapter version could
  not install it without a peer conflict. They now read `>=<version>`, matching the shape
  `@symbiote-native/engine` has carried since the singleton-peer rule was written.

  The `workspace:*` entries under `devDependencies` are unchanged — those are what pnpm links for
  in-repo development, and the engine rule requires them.

  This also keeps release versioning honest. Changesets bumps a package to major whenever one of its
  peer dependencies is bumped, so an exact peer pin turned every adapter release into a major bump
  for all 25 packages regardless of what actually changed. With ranges plus
  `onlyUpdatePeerDependentsWhenOutOfRange`, an adapter bump that stays inside the declared range no
  longer forces one.

- 80ed828: Add `@symbiote-native/clipboard`, a framework-agnostic wrapper around `expo-clipboard` (built on
  `expo-modules-core`, never the `expo` meta-package). Ships `getStringAsync`, `setStringAsync`,
  `hasStringAsync`, the iOS-only URL variants (`getUrlAsync`, `setUrlAsync`, `hasUrlAsync`), the
  image variants (`getImageAsync`, `setImageAsync`, `hasImageAsync`), and one listener-based
  subscription, `addClipboardListener` — a mix between `@symbiote-native/local-auth`'s pure free
  functions and `@symbiote-native/sensors`' per-adapter hooks: every stateless function is a plain
  re-export shared by all three adapters, while the listener gets its own lifecycle wrapper per
  adapter (`useClipboard` for React and Vue, `ClipboardService.connect()` for Angular). Upstream's
  native paste-button view (`ClipboardPasteButton`, iOS 16+) is not ported in this pass.
- 388c353: Add a `./svelte` entry point to every package, so a Svelte app reaches the same surface React, Vue
  and Angular already have. The split follows each package's existing shape rather than a uniform
  template: packages whose surface is free async functions with no per-instance state
  (`application`, `crypto`, `device`, `haptics`, `local-auth`, `secure-store`, `sharing`, `sms`,
  `standard-web-crypto`, `store-review`, `system-ui`, `web-browser`) re-export the same core
  verbatim, exactly as their React/Vue/Angular entry points already do.

  Packages carrying live state or an event subscription get a runes-based lifecycle instead — the
  Svelte twin of the React hook and the Vue composable, written as `*.svelte.ts` so `$state` and
  `$effect` are compiled: `battery`, `brightness`, `cellular`, `clipboard`, `keep-awake`,
  `localization`, `network`, `screen-orientation`, `sensors`, `slider`, `splash-screen`,
  `tracking-transparency`, and the `navigation` stack/tabs/drawer family.

  The core stays untouched in every case — the entry point supplies only the lifecycle, so the
  Svelte surface cannot drift from the other adapters' by construction.

### Patch Changes

- 80ed828: Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
  `default` export condition resolves back into it, which also swept in every `*.test.ts` beside
  those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
  excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.
- 80ed828: **Breaking:** native-module registration moves from a per-package `postinstall` to a single
  app-level one. Every wrapper package drops its own `postinstall` script and its
  `@symbiote-native/expo-modules-link` dependency; the app declares both instead:

  ```json
  {
    "dependencies": { "@symbiote-native/expo-modules-link": "^0.2.0" },
    "scripts": { "postinstall": "symbiote-expo-link" }
  }
  ```

  Installing a wrapper package no longer registers it by itself - the app-level run does, and it
  picks up every installed package at once. Apps already using these packages must add the two
  lines above and reinstall; existing generated blocks are replaced by the new marker regions on
  the first run.

  **Why.** Package managers run sibling `postinstall` scripts concurrently, so the old design had
  N independent OS processes doing read-modify-write on one shared `build.gradle` /
  `MainApplication.kt`. Two could read the same version before either wrote back, and the later
  write silently dropped the earlier package's registration - surfacing much later as a runtime
  `Cannot find native module '<Name>'`. Closing that race needs cross-process mutual exclusion,
  which plain `fs` cannot provide (no compare-and-unlink, no `flock`); successive attempts
  narrowed the window to roughly one lost registration per hundred installs but never shut it.
  Scanning `node_modules` once, from one process, removes the concurrency instead of synchronising
  it - the same approach `expo-modules-autolinking` takes.

  Owning a whole `BEGIN`/`END` region rather than appending lines also means entries come out
  sorted (committed native files stop churning with a different order per machine), uninstalling a
  package actually removes its registration (an append-only patcher could never do that), and no
  lock files are left to leak or clean up after an interrupted install.

  Also fixed along the way: permission descriptions written into `Info.plist` are now XML-escaped
  (an `&` or `<` in a description previously produced an unparseable plist), and a description that
  disagrees with the package's default is reported instead of silently ignored - the file itself is
  still left as the developer wrote it.

- 80ed828: Each package now depends on `@symbiote-native/expo-modules-link` and runs `symbiote-expo-link`
  from its own `postinstall` script, driven by a new co-located `native-link.json` manifest that
  declares its Android Gradle project name and native module(s). Consumers no longer need to
  hand-edit `android/app/build.gradle` or `MainApplication.kt` when adding one of these packages to
  an app — the native module registers itself on `npm install`. `@symbiote-native/local-auth` and
  `@symbiote-native/sensors` additionally declare an `ios.infoPlistKeys` entry
  (`NSFaceIDUsageDescription` and `NSMotionUsageDescription` respectively), so their `Info.plist`
  usage-description string is also registered automatically, with a generic default a consumer can
  freely override. No public API changed.
- 388c353: Four unrelated defects, each small and each previously invisible in tests.

  **`keep-awake` leaked a listener across teardown.** Activation is async and nothing guarded the
  window: a consumer that unmounted before it resolved still got a listener registered afterwards,
  attached to something gone, with nothing left to remove it. React was half-clean - it had the
  unmount guard but discarded the subscription, so a listener attached during a NORMAL mount was
  never removed either. A shared attachment helper now refuses to attach after release and removes
  anything that already landed; all four adapters use it.

  **`clipboard.hasStringAsync` threw synchronously** where its eight siblings reject. It was declared
  `function`, not `async`, so the `UnavailabilityError` escaped at the call site before a promise
  existed - `hasStringAsync().catch(handler)` never reached the handler. (Upstream expo has the same
  split at `Clipboard.ts:57`; diverging here because a guard that fires differently from every other
  method in one API is a trap, not a wart.)

  **`AnimatedValue.resetAnimation` reset only the JS side.** The native graph keeps its own copy of
  the value, so a native-driven node stayed wherever the animation stopped while JS believed it had
  been reset - visible on device, invisible to every JS-driven test. `setValue` already pushed for
  this reason; RN pushes here too.

  **Vue's `setElementText` built an invalid Fabric tree in silence.** `insert()` throws when a raw
  text lands under a non-`<Text>` parent, but Vue routes an element's single string child through
  `setElementText`, which had no such check - so the same invalid tree the array path rejects was
  accepted quietly. It now enforces the same invariant. Only reachable from a hand-written `h()` on a
  raw intrinsic; the `View` wrapper passes children as slots and already hit the guard.

  **Svelte's web-only-construct guard missed namespace imports.** It inspected named import
  specifiers, which a namespace import has none of, so `import * as R from 'svelte/reactivity'`
  carried the banned `MediaQuery` straight through - a browser-only API that answers `false` to every
  query on a native host, indistinguishable from a legitimate no. A namespace import of a module with
  banned members is now refused, since the preprocessor cannot tell statically which members it
  reaches.

## 0.1.0

### Minor Changes

- 80ed828: Add `@symbiote-native/clipboard`, a framework-agnostic wrapper around `expo-clipboard` (built on
  `expo-modules-core`, never the `expo` meta-package). Ships `getStringAsync`, `setStringAsync`,
  `hasStringAsync`, the iOS-only URL variants (`getUrlAsync`, `setUrlAsync`, `hasUrlAsync`), the
  image variants (`getImageAsync`, `setImageAsync`, `hasImageAsync`), and one listener-based
  subscription, `addClipboardListener` — a mix between `@symbiote-native/local-auth`'s pure free
  functions and `@symbiote-native/sensors`' per-adapter hooks: every stateless function is a plain
  re-export shared by all three adapters, while the listener gets its own lifecycle wrapper per
  adapter (`useClipboard` for React and Vue, `ClipboardService.connect()` for Angular). Upstream's
  native paste-button view (`ClipboardPasteButton`, iOS 16+) is not ported in this pass.

### Patch Changes

- 80ed828: Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
  `default` export condition resolves back into it, which also swept in every `*.test.ts` beside
  those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
  excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.
- 80ed828: **Breaking:** native-module registration moves from a per-package `postinstall` to a single
  app-level one. Every wrapper package drops its own `postinstall` script and its
  `@symbiote-native/expo-modules-link` dependency; the app declares both instead:

  ```json
  {
    "dependencies": { "@symbiote-native/expo-modules-link": "^0.2.0" },
    "scripts": { "postinstall": "symbiote-expo-link" }
  }
  ```

  Installing a wrapper package no longer registers it by itself - the app-level run does, and it
  picks up every installed package at once. Apps already using these packages must add the two
  lines above and reinstall; existing generated blocks are replaced by the new marker regions on
  the first run.

  **Why.** Package managers run sibling `postinstall` scripts concurrently, so the old design had
  N independent OS processes doing read-modify-write on one shared `build.gradle` /
  `MainApplication.kt`. Two could read the same version before either wrote back, and the later
  write silently dropped the earlier package's registration - surfacing much later as a runtime
  `Cannot find native module '<Name>'`. Closing that race needs cross-process mutual exclusion,
  which plain `fs` cannot provide (no compare-and-unlink, no `flock`); successive attempts
  narrowed the window to roughly one lost registration per hundred installs but never shut it.
  Scanning `node_modules` once, from one process, removes the concurrency instead of synchronising
  it - the same approach `expo-modules-autolinking` takes.

  Owning a whole `BEGIN`/`END` region rather than appending lines also means entries come out
  sorted (committed native files stop churning with a different order per machine), uninstalling a
  package actually removes its registration (an append-only patcher could never do that), and no
  lock files are left to leak or clean up after an interrupted install.

  Also fixed along the way: permission descriptions written into `Info.plist` are now XML-escaped
  (an `&` or `<` in a description previously produced an unparseable plist), and a description that
  disagrees with the package's default is reported instead of silently ignored - the file itself is
  still left as the developer wrote it.

- 80ed828: Each package now depends on `@symbiote-native/expo-modules-link` and runs `symbiote-expo-link`
  from its own `postinstall` script, driven by a new co-located `native-link.json` manifest that
  declares its Android Gradle project name and native module(s). Consumers no longer need to
  hand-edit `android/app/build.gradle` or `MainApplication.kt` when adding one of these packages to
  an app — the native module registers itself on `npm install`. `@symbiote-native/local-auth` and
  `@symbiote-native/sensors` additionally declare an `ios.infoPlistKeys` entry
  (`NSFaceIDUsageDescription` and `NSMotionUsageDescription` respectively), so their `Info.plist`
  usage-description string is also registered automatically, with a generic default a consumer can
  freely override. No public API changed.
- Updated dependencies [80ed828]
  - @symbiote-native/angular@0.6.2

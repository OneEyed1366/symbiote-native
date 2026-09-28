# @symbiote-native/slider

## 8.0.4

### Patch Changes

- [`99fdbbb`](https://github.com/OneEyed1366/symbiote-native/commit/99fdbbb54b72d5d06cfd95fbf0d82f2d9fe17a6a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Force a clean republish of every publishable package. `engine@1.3.0`/`components@3.1.1` proved a
  missing changeset on a producer package can leave its published tarball silently behind its own
  source (see the `symbiote-release-publishing` skill's changeset-skips-callee gap) with no CI
  signal. A blanket patch here is the cheap way to rule out the same gap sitting anywhere else:
  every package rebuilds and republishes from current HEAD, and `updateInternalDependencies: patch`
  bumps every internal `workspace:*`/`workspace:^` pin along with it.
- Updated dependencies [[`99fdbbb`](https://github.com/OneEyed1366/symbiote-native/commit/99fdbbb54b72d5d06cfd95fbf0d82f2d9fe17a6a)]:
  - @symbiote-native/components@3.1.2

## 8.0.3

### Patch Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: Install now leads with `npx @symbiote-native/cli new`/`add` (split into separate "New app"/"Existing app" blocks to avoid an accidental double copy-paste), with the manual `npm install` + native-wiring steps collapsed into a `<details>` block for anyone not using the CLI. Every `--flag` was verified against `expo-package-layers.ts`, and each package's native-wiring claims (Info.plist keys, manifest permissions/services) were cross-checked against its own `native-link.json`.

- Updated dependencies [[`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4)]:
  - @symbiote-native/components@3.1.1

## 8.0.2

### Patch Changes

- [#85](https://github.com/OneEyed1366/symbiote-native/pull/85) [`0468bca`](https://github.com/OneEyed1366/symbiote-native/commit/0468bca22da67f9f3f58b2020a5403380cd2c634) Thanks [@github-actions](https://github.com/apps/github-actions)! - Depend on `@symbiote-native/components` 3.1.0. The versions published earlier pinned 3.0.1.

## 8.0.1

### Patch Changes

- Updated dependencies [[`fba54ee`](https://github.com/OneEyed1366/symbiote-native/commit/fba54ee2d39a3b2ea12bb11a846b32658e3f8902), [`d4f46e7`](https://github.com/OneEyed1366/symbiote-native/commit/d4f46e7ca1601aa469b5c8c5ab97f8a8217c968f), [`3de549b`](https://github.com/OneEyed1366/symbiote-native/commit/3de549b2ab9785c845a1f3acd5626d85d2b9b9e4)]:
  - @symbiote-native/components@3.1.0

## 8.0.0

### Patch Changes

- Updated dependencies [[`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a), [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a), [`72eab44`](https://github.com/OneEyed1366/symbiote-native/commit/72eab44031a0bb30cd90ac9d0fbc55de15606e26), [`710e002`](https://github.com/OneEyed1366/symbiote-native/commit/710e002c8c265f154f2a8bdcb26d48be3f770171), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023)]:
  - @symbiote-native/angular@3.0.0
  - @symbiote-native/solid@3.0.0
  - @symbiote-native/vue@3.0.0
  - @symbiote-native/engine@1.0.0
  - @symbiote-native/components@3.0.0
  - @symbiote-native/react@3.0.0
  - @symbiote-native/svelte@3.0.0

## 7.0.0

### Patch Changes

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Rebuild the slider's thumb and the drawer's panel from intrinsic tags instead of the wrapper
  components an adapter's own wrapper-retirement deleted out from under them.

  Both packages composed their native view on top of `View`/`Pressable` imported from the app's
  adapter — once an adapter stopped exporting those, the import broke at the source, not at the
  consuming app. `packages/slider/src/{react,solid}/slider/shared.ts` and
  `packages/navigation/src/solid/drawer/index.ts` now build their structure from the same tags every
  other primitive writes.

- Updated dependencies [[`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f)]:
  - @symbiote-native/engine@0.5.0
  - @symbiote-native/components@2.0.0
  - @symbiote-native/react@2.0.0
  - @symbiote-native/vue@2.0.0
  - @symbiote-native/svelte@2.0.0
  - @symbiote-native/solid@2.0.0
  - @symbiote-native/angular@2.0.0

## 6.0.0

### Patch Changes

- [#59](https://github.com/OneEyed1366/symbiote-native/pull/59) [`2d34a11`](https://github.com/OneEyed1366/symbiote-native/commit/2d34a115848c1062f0ae7f67840f0e81df1f754c) Thanks [@mustafa0x](https://github.com/mustafa0x)! - Derive internal peer compatibility from the current workspace package versions so packed
  manifests reject older engine and adapter releases that do not provide the APIs they import.

- [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Declare npm `keywords` and refresh the README of every companion package. Registry metadata only —
  no runtime change.
- Updated dependencies [[`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`2d34a11`](https://github.com/OneEyed1366/symbiote-native/commit/2d34a115848c1062f0ae7f67840f0e81df1f754c), [`fd70625`](https://github.com/OneEyed1366/symbiote-native/commit/fd70625deff7d13c29a8606259a44f30249e040f), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`093144d`](https://github.com/OneEyed1366/symbiote-native/commit/093144d13bc3278353388e4b38ec904bf541f881), [`6e6df80`](https://github.com/OneEyed1366/symbiote-native/commit/6e6df80861f25d146c2b0d7c4837346dc0a86b16), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1)]:
  - @symbiote-native/angular@1.0.0
  - @symbiote-native/components@1.0.0
  - @symbiote-native/react@1.0.0
  - @symbiote-native/solid@1.0.0
  - @symbiote-native/svelte@1.0.0
  - @symbiote-native/vue@1.0.0
  - @symbiote-native/engine@0.4.0

## 5.2.0

### Minor Changes

- 3acd869: Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
  component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
  companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
  census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
  landing alongside it) build on.

### Patch Changes

- Updated dependencies [3acd869]
  - @symbiote-native/components@0.5.0

## 5.1.0

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
- Updated dependencies [388c353]
- Updated dependencies [388c353]
  - @symbiote-native/components@0.4.0

## 5.0.3

### Patch Changes

- 80ed828: Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
  `default` export condition resolves back into it, which also swept in every `*.test.ts` beside
  those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
  excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.
- Updated dependencies [80ed828]
  - @symbiote-native/angular@0.6.2

## 5.0.2

### Patch Changes

- 26af374: Fix `clean` script pointing at `build`, which `prepublish-build`'s `typecheck` step (`tsc --build`)
  emits before `ng:build`'s own `clean` step ran — wiping the just-built `build/{core,react,vue}`
  output and shipping a tarball with `build-ngc/` but no `build/`, breaking every `.`/`./react`/
  `./vue` import for real consumers. `clean` now targets `build-ngc` only, matching its own `ngc`
  output directory. See the `symbiote-release-publishing` skill's "Gotcha" section.

## 5.0.1

### Patch Changes

- 465c9e8: Clean the ngc output dir before every Angular build, and move the anchor-host registry into a leaf module.

  Composed Angular components (app screens mounted via `NgComponentOutlet`, and statically-tagged
  navigation components like `Stack`) rendered blank on iOS / redboxed on Android
  (`Can't find ViewManager '<selector>'`) under the `.examples/angular` workspace harness, while the
  freshly-built npm/canary `examples/angular` worked. Root cause: `ngc -p` never deletes orphaned outputs,
  so after the renderer moved `src/renderer.ts` → `src/renderer/index.ts` the stale `build/angular/renderer.js`
  lingered and — because a file shadows a folder in Node/Metro resolution — was loaded instead of
  `build/angular/renderer/index.js`. It carried its own inline `ANCHOR_HOST_COMPONENTS` Set, so the bundle had
  two registry modules: `registerComposedComponent` wrote one, `createElement` read the stale other, and every
  composed selector fell through to a raw native view name.

  Every Angular-shipping package (`@symbiote-native/angular`, `@symbiote-native/slider`,
  `@symbiote-native/navigation`, `@symbiote-native/splash-screen`) now runs `rm -rf build` before `ngc`, so a
  stale output can never shadow the current one again. The anchor-host registry
  (`ANCHOR_HOST_COMPONENTS` + `registerComposedComponent` + `isAnchorHostComponent`) also moved out of
  `renderer/index.ts` into a dependency-free leaf module `anchor-host-registry.ts`, reached by a single relative
  import route, as cheap cycle-safety hygiene. Public API unchanged.

- Updated dependencies [465c9e8]
- Updated dependencies [465c9e8]
- Updated dependencies [465c9e8]
- Updated dependencies [465c9e8]
  - @symbiote-native/angular@0.6.1
  - @symbiote-native/components@0.3.0
  - @symbiote-native/react@0.2.8
  - @symbiote-native/vue@0.3.8

## 5.0.0

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- 56ef0d9: Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
  `LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
  into a package's tarball at pack/publish time when the package has none of its own — confirmed
  against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
  `package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
  own license check was missing on all eleven packages.
- 4e02c48: Angular's `Slider` no longer self-registers as an anchor host at module load — `@symbiote-native/angular/babel-register-composed` now covers it automatically, the same as every other composed Angular component. A consuming app must wire that Babel plugin into its `babel.config.js` (see the `angular-adapter-build` skill) for `Slider` to render correctly under Angular.
- 6010442: Pin the wrapped native library (`@react-native-community/slider`, `react-native-bootsplash`) to an exact version instead of a caret range in the workspace catalog these packages publish with. Both vendor that library's codegen JS specs into a published `codegen-specs/` snapshot at `prepare` time (`scripts/vendor-codegen-specs.cjs`); a caret range let a standalone consumer's own `npm install` silently resolve a newer native side than whatever version the snapshot was baked from, risking the exact class of build failure already hit and fixed for `@symbiote-native/navigation`/`react-native-screens` (`error: no type named 'RNS...' in namespace 'facebook::react'`) — no drift observed yet for these two, but the pin closes the gap before it happens.
- Updated dependencies [f9569fb]
- Updated dependencies [a2cadf6]
- Updated dependencies [09feeb9]
- Updated dependencies [ad17e8f]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [56ef0d9]
- Updated dependencies [f43fe5b]
  - @symbiote-native/angular@0.6.0
  - @symbiote-native/engine@0.1.7
  - @symbiote-native/components@0.2.6
  - @symbiote-native/react@0.2.7
  - @symbiote-native/vue@0.3.7

## 4.0.0

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- 4e02c48: Angular's `Slider` no longer self-registers as an anchor host at module load — `@symbiote-native/angular/babel-register-composed` now covers it automatically, the same as every other composed Angular component. A consuming app must wire that Babel plugin into its `babel.config.js` (see the `angular-adapter-build` skill) for `Slider` to render correctly under Angular.
- 6010442: Pin the wrapped native library (`@react-native-community/slider`, `react-native-bootsplash`) to an exact version instead of a caret range in the workspace catalog these packages publish with. Both vendor that library's codegen JS specs into a published `codegen-specs/` snapshot at `prepare` time (`scripts/vendor-codegen-specs.cjs`); a caret range let a standalone consumer's own `npm install` silently resolve a newer native side than whatever version the snapshot was baked from, risking the exact class of build failure already hit and fixed for `@symbiote-native/navigation`/`react-native-screens` (`error: no type named 'RNS...' in namespace 'facebook::react'`) — no drift observed yet for these two, but the pin closes the gap before it happens.
- Updated dependencies [f9569fb]
- Updated dependencies [a2cadf6]
- Updated dependencies [09feeb9]
- Updated dependencies [ad17e8f]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [f43fe5b]
  - @symbiote-native/angular@0.5.0
  - @symbiote-native/engine@0.1.6
  - @symbiote-native/components@0.2.5
  - @symbiote-native/react@0.2.6
  - @symbiote-native/vue@0.3.6

## 3.0.0

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- 4e02c48: Angular's `Slider` no longer self-registers as an anchor host at module load — `@symbiote-native/angular/babel-register-composed` now covers it automatically, the same as every other composed Angular component. A consuming app must wire that Babel plugin into its `babel.config.js` (see the `angular-adapter-build` skill) for `Slider` to render correctly under Angular.
- Updated dependencies [f9569fb]
- Updated dependencies [a2cadf6]
- Updated dependencies [09feeb9]
- Updated dependencies [ad17e8f]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [f43fe5b]
  - @symbiote-native/angular@0.4.0
  - @symbiote-native/engine@0.1.5
  - @symbiote-native/components@0.2.4
  - @symbiote-native/react@0.2.5
  - @symbiote-native/vue@0.3.5

## 2.0.6

### Patch Changes

- Updated dependencies [090c789]
  - @symbiote-native/vue@0.3.4

## 2.0.5

### Patch Changes

- b68dfdb: Fix iOS/Android codegen failing under pnpm with `ENOENT ... @react-native-community/slider/src`. `codegenConfig.jsSrcsDir` pointed at `node_modules/@react-native-community/slider/src`, a nested path that pnpm's isolated store never creates (the native slider is a symlinked sibling, not nested). Vendor the native component's spec sources into a package-local `codegen-specs/` at `prepare` time and point `jsSrcsDir` there — the same fix already applied to `@symbiote-native/splash-screen`.

## 2.0.4

### Patch Changes

- Updated dependencies [706e52f]
  - @symbiote-native/components@0.2.3
  - @symbiote-native/engine@0.1.4
  - @symbiote-native/react@0.2.4
  - @symbiote-native/vue@0.3.3
  - @symbiote-native/angular@0.3.3

## 2.0.3

### Patch Changes

- d738bc5: Fix the published package missing `react-native.config.cjs` and `symbiote-slider.podspec` (omitted from `files`), which left iOS with no native `RNCSliderComponentView` to autolink and rendered the slider as `Unimplemented component: <RNCSlider>` in any app installing the package from npm.
  - @symbiote-native/angular@0.3.2
  - @symbiote-native/react@0.2.3
  - @symbiote-native/vue@0.3.2
  - @symbiote-native/engine@0.1.3

## 2.0.2

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.
- Updated dependencies [46a4f27]
  - @symbiote-native/angular@0.3.2
  - @symbiote-native/react@0.2.3
  - @symbiote-native/vue@0.3.2
  - @symbiote-native/components@0.2.2
  - @symbiote-native/engine@0.1.3

## 2.0.1

### Patch Changes

- Updated dependencies [204901b]
- Updated dependencies [c66082c]
  - @symbiote-native/angular@0.3.1
  - @symbiote-native/react@0.2.2
  - @symbiote-native/vue@0.3.1
  - @symbiote-native/engine@0.1.2
  - @symbiote-native/components@0.2.1

## 2.0.0

### Patch Changes

- Updated dependencies [b0f2568]
  - @symbiote-native/vue@0.3.0
  - @symbiote-native/angular@0.3.0
  - @symbiote-native/react@0.2.1

## 1.0.0

### Patch Changes

- Updated dependencies [ab42ee8]
  - @symbiote-native/components@0.2.0
  - @symbiote-native/react@0.2.0
  - @symbiote-native/vue@0.2.0
  - @symbiote-native/angular@0.2.0

## 0.1.1

### Patch Changes

- Update package descriptions to the SymbioteNative brand name.
- Updated dependencies
  - @symbiote-native/engine@0.1.1
  - @symbiote-native/components@0.1.1
  - @symbiote-native/react@0.1.1
  - @symbiote-native/vue@0.1.1
  - @symbiote-native/angular@0.1.1

## 0.1.0

### Minor Changes

- First public release under the @symbiote-native npm scope.

### Patch Changes

- Updated dependencies
  - @symbiote-native/engine@0.1.0
  - @symbiote-native/components@0.1.0
  - @symbiote-native/react@0.1.0
  - @symbiote-native/vue@0.1.0
  - @symbiote-native/angular@0.1.0

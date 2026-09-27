# @symbiote-native/cli

## 0.2.1

### Patch Changes

- [`99fdbbb`](https://github.com/OneEyed1366/symbiote-native/commit/99fdbbb54b72d5d06cfd95fbf0d82f2d9fe17a6a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Force a clean republish of every publishable package. `engine@1.3.0`/`components@3.1.1` proved a
  missing changeset on a producer package can leave its published tarball silently behind its own
  source (see the `symbiote-release-publishing` skill's changeset-skips-callee gap) with no CI
  signal. A blanket patch here is the cheap way to rule out the same gap sitting anywhere else:
  every package rebuilds and republishes from current HEAD, and `updateInternalDependencies: patch`
  bumps every internal `workspace:*`/`workspace:^` pin along with it.

## 0.2.0

### Minor Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `--audio`, `--background-fetch`, `--background-task`, `--file-system`, `--location`, `--media-library`, `--notifications`, `--sqlite`, and `--task-manager` layer flags to `new`/`add`, covering every currently-shipped `@symbiote-native/*` Expo-backed package.

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `new` now offers to `git init` the scaffolded app and prints the manual command if declined or if the target is already a git repo. Never commits on the developer's behalf — only the repository itself.

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `npx @symbiote-native/cli grant <id>` for opting into a package's policy-sensitive Android permission bundle (currently `audio`'s background recording and `location`'s background tracking) after declining the interactive prompt or running `new`/`add` non-interactively. Idempotent — safe to run again on an already-granted bundle.

### Patch Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: fixed a dead anchor link and a false premise — it pointed at the root README's "Try It In Your Own App" section, which no longer exists (the root Install section already leads with this package, so there's no manual-process gap left to close). Also drops a stale hardcoded layer/framework count in favor of pointing at `templates/layers` directly, so the claim can't go stale as layers are added.

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Scaffolded `ios`/`ios:release` scripts now run `pod install` before `react-native run-ios`, matching `run-android`'s implicit reinstall-everything behavior — a scaffolded app's first `ios` run no longer needs a separate manual `pod install`.

## 0.1.2

### Patch Changes

- [`7c15933`](https://github.com/OneEyed1366/symbiote-native/commit/7c15933f329fbeca9c643f366f7161fd23a9896e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The Angular templates pass style arrays through `[styleProp]`.

## 0.1.1

### Patch Changes

- [`7080650`](https://github.com/OneEyed1366/symbiote-native/commit/7080650e86d9baf157155e7fabdd6b695a49d7e6) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every scaffold shipped a stray `bootsplash-logo/` folder at its root, holding all four other frameworks' boot-splash logo assets on top of its own.

  `templates/native/bootsplash-logo/<framework>` lived inside `native/`, which `generate.ts` copies wholesale into every app before the framework-specific overlay runs. Moved to `templates/bootsplash-logo/<framework>`, alongside `native/` rather than inside it.

- [`2f22bd4`](https://github.com/OneEyed1366/symbiote-native/commit/2f22bd47856f8acb40b963e261a30dffa656a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `--styling css-modules`/`stylesheet` scaffolds now render the same branded screen as the default `css` one, instead of a bare "Taps: N" stub.

  The two modes had drifted onto a hand-written skeleton `App.module.css` that overwrote whatever the real per-framework template shipped.

- [`c47b318`](https://github.com/OneEyed1366/symbiote-native/commit/c47b318d3c800d7a4fb7639d85b30d0f920b6b5d) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `--navigation` scaffolds' Menu/Details screens in `css-modules`/`stylesheet` now match the branded `css` scaffold (logo, header options, details screen), instead of a bare "Welcome to SymbioteNative!" stub.

  Also fixes vue-tsx's `--navigation` Menu/Details screens calling `navigation.push()`/`.pop()` on an unwrapped `ComputedRef` in those two styling modes - the same class of bug already fixed for the base App.

- [`e5c9c1e`](https://github.com/OneEyed1366/symbiote-native/commit/e5c9c1eaa7b174439bb9e7d7ac76b329fa8b5b5c) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every scaffold committed dead: `require()`'d images never resolved, and any host behavior beyond a plain press (Switch, TextInput, ScrollView, ...) silently did nothing.

  `index.js` only imported each adapter's `/bootstrap` and `/jsx-runtime` subpaths. Neither reaches `import './register'`, which lives solely in the adapter's main barrel and registers the engine's host behaviors - so a fresh scaffold never ran it. Fixed by adding a bare `import '@symbiote-native/<adapter>';` to every framework's `index.js`.

- [`a018a2d`](https://github.com/OneEyed1366/symbiote-native/commit/a018a2df797272848f8974058cf4da97bcce2fbd) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every scaffold's `.brand-logo`/`.brand-logo-*` rule now sizes with an explicit pixel `width` instead of `aspect-ratio`, across every framework, every styling option (base, css-modules, stylesheet) and both the base app and navigation layers.

## 0.1.0

### Minor Changes

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `new`/`add` can now select each Expo-backed `@symbiote-native/*` package individually (`--battery`, `--sensors`, `--haptics`, …, one flag per package in `packages/*`) instead of only the all-or-nothing `--expo-modules` bundle, which used to install all 21 wrapper packages unconditionally. Picking any one of them implies the `expo`/autolinking wiring `--expo-modules` provides, without a second explicit flag or prompt tick.

### Patch Changes

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `add`'s interactive layer prompt now lists every layer always, disabling the ones already present with an "already added" hint, instead of filtering them out of the menu — a shrinking list with no visible reason read as a bug, not a filter.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `add`'s interactive layer prompt is now grouped into "Core layers" and "Expo packages" sections instead of one flat 26-option list — the 21 Expo-backed packages alone outnumbered every other layer, so finding something like "Navigation" meant scrolling past all of them. clack's `groupMultiselect` doesn't enforce a `disabled` option the way plain `multiselect` does, so an already-added layer can still render checkable there; `add` now drops an already-added layer from the result regardless of what got checked, same as it already does for explicit `--flag`s, so picking a disabled-looking option silently has no effect instead of re-applying it.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Rewrite the README to match every other package's shape (Install/Use it/Shape/Status/References) — the design-decision log that used to be mixed into it moved to the `symbiote-create-cli` project skill.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix `add` silently re-applying an already-added layer when its flag is passed explicitly alongside genuinely missing ones (e.g. `add --navigation --slider` on an app that already has navigation), overwriting App/MenuScreen/DetailsScreen and wiping out developer customization. An already-added layer is now dropped from an explicit flag list unless `--force` is passed to intentionally reset it back to the template defaults.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix `add --splash-screen` never wiring `hide()` into the App entry — the native splash screen never hides itself, so an `add`-extended app froze on it forever, silently, on every framework. `add-layers.ts` only spliced the native side (Manifest/styles/MainActivity/AppDelegate) and left the JS side as a printed manual snippet; it now calls the same `apply-splash-screen-hide.ts` splice `new` already uses, idempotently. That splice also no longer needs an explicit vue flavor — SFC vs. the render-function flavor is now detected from the App file's own extension, which is what let `add` (which only ever sees a real app on disk) wire it in at all.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix every scaffolded app's native boot splash showing React's logo regardless of the chosen framework — iOS displays `BootSplash.storyboard` as the launch screen unconditionally, so a Vue/Svelte/Solid/Angular app booted with React's own branding until the JS bundle took over. `new` and `add --splash-screen` now overlay the matching framework's logo (same assets `examples/*` already ship) on both iOS and Android; React needs no overlay since it already is the base.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix the published package's entry point naming a file that isn't in the tarball. `files` is `["bundle.js", "templates"]`, but npm force-includes whatever `main` points at regardless of it — and `main` was `src/index.ts`, so 0.0.1 shipped that one source file, orphaned: it imports `./cli.js` and `./commands/*.js`, neither of which is published. `publishConfig` now overrides `main`/`module`/`exports` onto `./bundle.js`, the same shape every other package in the repo uses, which also stops the force-include. The library fields stay in the source manifest because `require-package-fields` applies its full-library tier to any package with a `src/` directory. `npx @symbiote-native/cli` was never affected either way — npx resolves `bin`, not `main`.

  `bundle.js` is also built by `prepublish-build` now rather than by hand, and `clean:build` sweeps a stale one. It is gitignored and nothing in the pipeline ran its script, so the published bytes were whatever the last manual build left behind, with nothing able to notice they had drifted from `src/`.

  Adds `keywords`, which this was the only publishable package without — so the one package that could not surface in an npm search, while being the first thing the root README tells you to run. The description now leads with what you get, inside the ~120 characters npm's search results actually render, instead of a parenthetical framework list trailing into a reference to the root README's manual steps.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix `pod install`/build succeeding but the Xcode build then failing on any app scaffolded (or `add`-extended) with `--expo-modules`: `'ExpoModulesCore/Platform.h' file not found`, `could not build Objective-C module 'Expo'`. `use_native_modules!` only autolinks React Native's own native modules — Expo modules need Expo's own autolinking, wired by requiring `expo/scripts/autolinking` and calling `use_expo_modules!` inside the target, which the Podfile template never did. Both `new` and `add` now wire it in, idempotently, matching the pattern `examples/expo-react`'s Podfile already carries.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix `pod install` failing outright on any app scaffolded (or `add`-extended) with `--expo-modules`: expo's own podspec requires iOS 16.4+, but nothing raised the Podfile's `platform :ios` line past React Native's own default (15.1), so CocoaPods rejected the `Expo` pod with "required a higher minimum deployment target". Both `new` and `add` now raise it to `[min_ios_version_supported.to_f, 16.4].max.to_s` — the same fix `examples/expo-react`'s Podfile already carried — idempotently, and without lowering an already-higher version a developer set by hand.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix `xcodebuild` failing after a green `pod install` on any app scaffolded (or `add`-extended) with `--expo-modules`: `compiling for iOS 15.1, but module 'ExpoModulesCore' has a minimum deployment target of iOS 16.4`. The Podfile's `platform :ios` line only sets the deployment target CocoaPods generates for pods — the app's own `.xcodeproj` target keeps RN's default (15.1) independently. Both `new` and `add` now also raise `IPHONEOS_DEPLOYMENT_TARGET` to 16.4 in the app's `project.pbxproj`, idempotently, matching `examples/expo-react`'s project.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix Svelte scaffolds rendering zero logos on device (every other element — text, counter, buttons — rendered fine). `require('./assets/x.png')`'s numeric-asset-id path had no working precedent anywhere in this project for Svelte — every other Svelte image use, `examples/svelte` included, is a plain `{uri}` object, and exhaustive headless investigation across the JS/prop/CSS pipeline found no discrepancy, pointing at something specific to that untested path in the real Metro bundle. Both the base and `--navigation` Svelte templates now inline each brand image as a `data:` URI (`{ uri: '...' }`), the one shape proven to work — sidestepping `require()`/Metro asset resolution entirely for this screen.

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix `--navigation --vue-flavor tsx` scaffolds throwing `TypeError: undefined is not a function` when navigating: `useStackNavigation()` returns a Vue `ComputedRef`, and vue-sfc's `<template>` auto-unwraps a top-level ref referenced in it (so `navigation.push(...)` compiles there), but the tsx flavor's App is a plain JSX render function that Vue's compiler never touches — the same call left `navigation` a bare `ComputedRef` with no `.push`/`.pop`. The template now calls `navigation.value.push(...)`/`navigation.value.pop()`.

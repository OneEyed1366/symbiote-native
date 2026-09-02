# @symbiote-native/web-browser

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

- 80ed828: Add `@symbiote-native/web-browser` — a framework-agnostic wrapper around `expo-web-browser` (built
  on `expo-modules-core`, never the `expo` meta-package), reachable identically from React, Vue, and
  Angular. An in-app browser (`SFSafariViewController` on iOS, Chrome Custom Tabs on Android) plus the
  OAuth auth-session flow: `openBrowserAsync`, `dismissBrowser`, `openAuthSessionAsync`,
  `dismissAuthSession`, the Custom Tabs service functions `warmUpAsync`/`mayInitWithUrlAsync`/
  `coolDownAsync`/`getCustomTabsSupportingBrowsersAsync`, and the `WebBrowserResultType` /
  `WebBrowserPresentationStyle` enums.

  Android has no native auth-session API, so `openAuthSessionAsync` is polyfilled there exactly as
  upstream does it — a Custom Tab racing a `Linking` deep-link listener against an `AppState` return
  to the foreground. Colors (`toolbarColor`, `secondaryToolbarColor`, `controlsColor`) are run through
  `processColor` before reaching native.

  All three adapter entry points are plain re-exports of the core: every export is a stateless free
  function and the polyfill's redirect subscription belongs to a single in-flight promise, so there is
  nothing for a hook, composable, or service to wrap — the same shape
  `@symbiote-native/secure-store` has.

  Three deliberate omissions, all named rather than silently dropped:

  - Upstream's config plugin (`plugin/src/withWebBrowserAndroid.ts`) is not reproduced. It exists
    purely for the opt-in `experimentalLauncherActivity` flag, writing a `BrowserLauncherActivity.kt`
    into the consuming app and registering it as the launcher activity — unnecessary for any of the
    surface above. An app that wants that redirect workaround adds the activity by hand.
  - `maybeCompleteAuthSession` is web-only: it closes the `window.open` popup the web implementation
    creates, and on a native platform can only ever return `{ type: 'failed' }`. Left out rather than
    shipped as a function that can never succeed.
  - The web-only open options `windowName` and `windowFeatures`, for the same reason.

  Android registration is generated by `@symbiote-native/expo-modules-link` from the package's
  `native-link.json`. No iOS usage-description string is needed, and the `<queries>` entry for the
  Custom Tabs service ships in `expo-web-browser`'s own manifest and merges in automatically.

### Patch Changes

- 80ed828: Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
  `default` export condition resolves back into it, which also swept in every `*.test.ts` beside
  those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
  excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.

## 0.1.0

### Minor Changes

- 80ed828: Add `@symbiote-native/web-browser` — a framework-agnostic wrapper around `expo-web-browser` (built
  on `expo-modules-core`, never the `expo` meta-package), reachable identically from React, Vue, and
  Angular. An in-app browser (`SFSafariViewController` on iOS, Chrome Custom Tabs on Android) plus the
  OAuth auth-session flow: `openBrowserAsync`, `dismissBrowser`, `openAuthSessionAsync`,
  `dismissAuthSession`, the Custom Tabs service functions `warmUpAsync`/`mayInitWithUrlAsync`/
  `coolDownAsync`/`getCustomTabsSupportingBrowsersAsync`, and the `WebBrowserResultType` /
  `WebBrowserPresentationStyle` enums.

  Android has no native auth-session API, so `openAuthSessionAsync` is polyfilled there exactly as
  upstream does it — a Custom Tab racing a `Linking` deep-link listener against an `AppState` return
  to the foreground. Colors (`toolbarColor`, `secondaryToolbarColor`, `controlsColor`) are run through
  `processColor` before reaching native.

  All three adapter entry points are plain re-exports of the core: every export is a stateless free
  function and the polyfill's redirect subscription belongs to a single in-flight promise, so there is
  nothing for a hook, composable, or service to wrap — the same shape
  `@symbiote-native/secure-store` has.

  Three deliberate omissions, all named rather than silently dropped:

  - Upstream's config plugin (`plugin/src/withWebBrowserAndroid.ts`) is not reproduced. It exists
    purely for the opt-in `experimentalLauncherActivity` flag, writing a `BrowserLauncherActivity.kt`
    into the consuming app and registering it as the launcher activity — unnecessary for any of the
    surface above. An app that wants that redirect workaround adds the activity by hand.
  - `maybeCompleteAuthSession` is web-only: it closes the `window.open` popup the web implementation
    creates, and on a native platform can only ever return `{ type: 'failed' }`. Left out rather than
    shipped as a function that can never succeed.
  - The web-only open options `windowName` and `windowFeatures`, for the same reason.

  Android registration is generated by `@symbiote-native/expo-modules-link` from the package's
  `native-link.json`. No iOS usage-description string is needed, and the `<queries>` entry for the
  Custom Tabs service ships in `expo-web-browser`'s own manifest and merges in automatically.

### Patch Changes

- 80ed828: Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
  `default` export condition resolves back into it, which also swept in every `*.test.ts` beside
  those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
  excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.
- Updated dependencies [80ed828]
  - @symbiote-native/angular@0.6.2

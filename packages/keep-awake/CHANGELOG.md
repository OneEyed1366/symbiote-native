# @symbiote-native/keep-awake

## 0.1.0

### Minor Changes

- 80ed828: Add `@symbiote-native/standard-web-crypto`, `@symbiote-native/system-ui`, `@symbiote-native/store-review`,
  `@symbiote-native/keep-awake`, `@symbiote-native/screen-orientation`, `@symbiote-native/localization`, and
  `@symbiote-native/tracking-transparency` — seven framework-agnostic wrappers around
  `expo-standard-web-crypto`, `expo-system-ui`, `expo-store-review`, `expo-keep-awake`,
  `expo-screen-orientation`, `expo-localization`, and `expo-tracking-transparency` (all built on
  `expo-modules-core`, never the `expo` meta-package). All of them register their Android native module
  automatically through `@symbiote-native/expo-modules-link`'s postinstall mechanism, with no manual
  `build.gradle`/`MainApplication.kt` edits — except `standard-web-crypto`, which has no native module of
  its own at all.

  `@symbiote-native/standard-web-crypto` ships a pure-JS `Crypto.getRandomValues`/`polyfillWebCrypto` polyfill
  for `globalThis.crypto`. Unlike this repo's other Expo ports it needs no native Android/iOS registration —
  it delegates straight to `@symbiote-native/crypto`'s `getRandomValues` instead of vendoring its own native
  module.

  `@symbiote-native/system-ui` ships `setBackgroundColorAsync`/`getBackgroundColorAsync` for the root view's
  background color.

  `@symbiote-native/store-review` ships `isAvailableAsync`/`requestReview`/`hasAction`, with a deliberately
  trimmed API: the caller passes an explicit `{ iosAppStoreUrl, androidPlayStoreUrl }` options object instead
  of the URLs being read from `expo-constants`, which this project doesn't depend on — the same reasoning as
  the `expo-constants` skip already recorded in the `symbiote-expo-package-catalog` skill.

  `@symbiote-native/keep-awake` ships `activateKeepAwakeAsync`/`deactivateKeepAwake`/`isAvailableAsync`/
  `addListener` plus a per-adapter lifecycle hook/composable/service (`useKeepAwake` on React and Vue,
  `KeepAwakeService` on Angular) that activates a lock on mount and deactivates it on unmount.

  `@symbiote-native/screen-orientation` ships `lockAsync`/`lockPlatformAsync`/`unlockAsync`/
  `getOrientationAsync`/`getOrientationLockAsync`/`supportsOrientationLockAsync`/
  `addOrientationChangeListener` plus a reactive per-adapter hook/composable/service holding the current
  orientation and lock state, seeded from the one-shot getters and updated from the change listener.

  `@symbiote-native/localization` ships the synchronous `getLocales`/`getCalendars` getters plus
  `useLocales`/`useCalendars` reactive hooks/composables/services per adapter, each with its own native
  change listener (`addLocaleListener`/`addCalendarListener`).

  `@symbiote-native/tracking-transparency` ships `getAdvertisingId`, `requestTrackingPermissionsAsync`, and
  `getTrackingPermissionsAsync`, plus a per-adapter `usePermissions` hook/composable/service mirroring the
  existing `brightness`/`cellular` permission-hook shape. Android and web always short-circuit to a granted
  response — there is no tracking-consent concept on either platform — while iOS drives the real App
  Tracking Transparency prompt. Its `native-link.json` also declares an `ios.infoPlistKeys` entry
  (`NSUserTrackingUsageDescription`), so the required usage-description string registers automatically on
  `npm install`, with a generic default a consumer can freely override.

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

- Updated dependencies [80ed828]
  - @symbiote-native/angular@0.6.2

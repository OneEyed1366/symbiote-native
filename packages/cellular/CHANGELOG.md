# @symbiote-native/cellular

## 0.1.0

### Minor Changes

- 80ed828: Add `@symbiote-native/cellular`, a framework-agnostic wrapper around `expo-cellular` (built on
  `expo-modules-core`, never the `expo` meta-package). Ships `getCellularGenerationAsync`, the
  Android-only carrier/SIM surface (`allowsVoipAsync`, `getIsoCountryCodeAsync`, `getCarrierNameAsync`,
  `getMobileCountryCodeAsync`, `getMobileNetworkCodeAsync` — each resolves `null` on iOS, which exposes
  none of this), and `getPermissionsAsync`/`requestPermissionsAsync` (Android-only; every other platform
  needs no permission for cellular info and always resolves granted). A new `usePermissions()` hook/
  composable/service — shared shape with `@symbiote-native/brightness` — auto-fetches the current
  permission status on mount and exposes `get`/`request` as imperative callbacks; every other export is
  a stateless free function, same as `@symbiote-native/local-auth`.

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

# @symbiote-native/expo-modules-link

## 0.4.1

### Patch Changes

- 255c37f: Declare npm `keywords` and refresh the README of every companion package. Registry metadata only —
  no runtime change.

## 0.4.0

### Minor Changes

- 3acd869: Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
  component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
  companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
  census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
  landing alongside it) build on.

## 0.3.0

### Minor Changes

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

- 80ed828: Set attributes on the app's `<application>` element from a wrapper package's manifest. A package
  declares them under `android.manifestApplicationAttributes` in its `native-link.json`:

  ```json
  {
    "android": {
      "manifestApplicationAttributes": {
        "android:fullBackupContent": "@xml/secure_store_backup_rules",
        "android:dataExtractionRules": "@xml/secure_store_data_extraction_rules"
      }
    }
  }
  ```

  `@symbiote-native/secure-store` is the first package that needs this: without those two
  attributes, Android Auto Backup uploads the encrypted SecureStore entries but not the Keystore
  keys that decrypt them, so a restore onto a new device leaves the app holding values it can no
  longer read.

  Like the iOS `Info.plist` keys and unlike the two Android regions, this is additive-only - an
  attribute is unique per element by construction, so its presence is a sufficient idempotency
  check, and no XML comment can live inside a tag to delimit a region anyway. An attribute the app
  already sets is kept and reported, never overwritten: backup rules decide what leaves the device,
  so the app's own value wins.

- 80ed828: Add `@symbiote-native/expo-modules-link`, a shared postinstall runtime for every
  `expo-modules-core` wrapper package (`@symbiote-native/sensors`, `@symbiote-native/local-auth`,
  `@symbiote-native/haptics`, and the rest). A wrapper package depends on it and calls it from its
  own `postinstall` script (`symbiote-expo-link`), which finds the consuming app's root via
  `INIT_CWD` and additively patches `android/app/build.gradle` (the missing
  `implementation project(':expo-<pkg>')` line) and `MainApplication.kt` (the missing import +
  `ModulesProvider` map entry) declared in a co-located `native-link.json` manifest. This replaces
  what used to be a fully hand-maintained registration step — a missed entry compiled cleanly and
  only failed at runtime with `Cannot find native module`. Also patches a package's `ios.
infoPlistKeys` (declared in the same `native-link.json`) into the app's `Info.plist`, inserting
  a generic default usage-description string for a key that isn't already present — a consumer
  can freely override the default by adding the key with their own wording, before or after
  install, since the patcher never touches a key that already exists. iOS's own autolinking
  already auto-discovers every installed `expo-modules-core` package once the one-time per-app
  Podfile bootstrap is wired; that one-time bootstrap itself remains manual.

### Patch Changes

- 80ed828: Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
  `default` export condition resolves back into it, which also swept in every `*.test.ts` beside
  those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
  excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.

## 0.2.0

### Minor Changes

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

- 80ed828: Set attributes on the app's `<application>` element from a wrapper package's manifest. A package
  declares them under `android.manifestApplicationAttributes` in its `native-link.json`:

  ```json
  {
    "android": {
      "manifestApplicationAttributes": {
        "android:fullBackupContent": "@xml/secure_store_backup_rules",
        "android:dataExtractionRules": "@xml/secure_store_data_extraction_rules"
      }
    }
  }
  ```

  `@symbiote-native/secure-store` is the first package that needs this: without those two
  attributes, Android Auto Backup uploads the encrypted SecureStore entries but not the Keystore
  keys that decrypt them, so a restore onto a new device leaves the app holding values it can no
  longer read.

  Like the iOS `Info.plist` keys and unlike the two Android regions, this is additive-only - an
  attribute is unique per element by construction, so its presence is a sufficient idempotency
  check, and no XML comment can live inside a tag to delimit a region anyway. An attribute the app
  already sets is kept and reported, never overwritten: backup rules decide what leaves the device,
  so the app's own value wins.

- 80ed828: Add `@symbiote-native/expo-modules-link`, a shared postinstall runtime for every
  `expo-modules-core` wrapper package (`@symbiote-native/sensors`, `@symbiote-native/local-auth`,
  `@symbiote-native/haptics`, and the rest). A wrapper package depends on it and calls it from its
  own `postinstall` script (`symbiote-expo-link`), which finds the consuming app's root via
  `INIT_CWD` and additively patches `android/app/build.gradle` (the missing
  `implementation project(':expo-<pkg>')` line) and `MainApplication.kt` (the missing import +
  `ModulesProvider` map entry) declared in a co-located `native-link.json` manifest. This replaces
  what used to be a fully hand-maintained registration step — a missed entry compiled cleanly and
  only failed at runtime with `Cannot find native module`. Also patches a package's `ios.
infoPlistKeys` (declared in the same `native-link.json`) into the app's `Info.plist`, inserting
  a generic default usage-description string for a key that isn't already present — a consumer
  can freely override the default by adding the key with their own wording, before or after
  install, since the patcher never touches a key that already exists. iOS's own autolinking
  already auto-discovers every installed `expo-modules-core` package once the one-time per-app
  Podfile bootstrap is wired; that one-time bootstrap itself remains manual.

### Patch Changes

- 80ed828: Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
  `default` export condition resolves back into it, which also swept in every `*.test.ts` beside
  those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
  excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.

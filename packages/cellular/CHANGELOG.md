# @symbiote-native/cellular

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

- 80ed828: Add `@symbiote-native/cellular`, a framework-agnostic wrapper around `expo-cellular` (built on
  `expo-modules-core`, never the `expo` meta-package). Ships `getCellularGenerationAsync`, the
  Android-only carrier/SIM surface (`allowsVoipAsync`, `getIsoCountryCodeAsync`, `getCarrierNameAsync`,
  `getMobileCountryCodeAsync`, `getMobileNetworkCodeAsync` — each resolves `null` on iOS, which exposes
  none of this), and `getPermissionsAsync`/`requestPermissionsAsync` (Android-only; every other platform
  needs no permission for cellular info and always resolves granted). A new `usePermissions()` hook/
  composable/service — shared shape with `@symbiote-native/brightness` — auto-fetches the current
  permission status on mount and exposes `get`/`request` as imperative callbacks; every other export is
  a stateless free function, same as `@symbiote-native/local-auth`.
- 388c353: Surface a failed permission fetch instead of losing it. `usePermissions` auto-fetches the current
  status on mount, and that call had nobody to reject to: a native rejection escaped as an unhandled
  promise rejection and left `status` at `null` - indistinguishable from "still fetching". A consumer
  could not tell a device that denied the read from one that had not answered yet.

  Every adapter now exposes an `error` of type `Error | null` beside `status`, so the two states read
  apart:

  | status   | error   | meaning                    |
  | -------- | ------- | -------------------------- |
  | `null`   | `null`  | not fetched yet            |
  | `null`   | `Error` | the automatic fetch failed |
  | response | `null`  | fetched                    |

  A later successful `get()` / `request()` clears `error`, so a stale failure cannot sit next to a
  fresh status. Hand-called `get()` and `request()` still REJECT to their direct caller - only the
  automatic mount-time call was made safe; swallowing an error the app asked for by hand would be a
  worse bug than the one this fixes.

  React's returned tuple grows from three elements to four, `[status, request, get, error]`; existing
  two- and three-element destructuring is unaffected. Vue and Svelte gain an object key, Angular a
  `readonly error: Signal<Error | null>` beside the existing `connect()`, whose return type is
  unchanged.

  Angular's auto-fetch is now latched to at most one run per service instance. It used to re-fire on
  every `connect()` call while `status` was still `null`, which a failed fetch makes permanent - and
  unbounded the moment `connect()` is reached from a change-detected expression. `get()` is the
  retry, and `error()` is how a consumer knows one is warranted.

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

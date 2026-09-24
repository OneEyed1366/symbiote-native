---
name: symbiote-expo-package-catalog
description: "Symbiote Expo-package migration catalog — read BEFORE starting work on porting ANY package from .vendors/expo/packages into @symbiote-native/*, and before answering 'what Expo packages are left to migrate' or 'what should we port next'. Holds the full audited inventory of .vendors/expo/packages (116 dirs), the scope filter that separates real migration candidates from CLI/EAS/router/internal-interface noise, the explicit backlog of anomalous packages (maps/ui/widgets), and a single complexity+demand-ranked priority queue covering all ~59 remaining candidates. Also documents two 'already covered by RN's own native module, not by Expo' exclusions (expo-linking, expo-status-bar) found by cross-checking core/engine/src and adapters/react/src/modules before assuming an Expo package is net-new work. Trigger on 'migrate Expo package', 'what's the local-auth/sensors precedent for X', 'port expo-<name>', 'Expo package roadmap', or any question about which .vendors/expo package to wrap next."
---

# Symbiote Expo-package migration catalog

Decided 2026-07-28 via `grill-me`, after `local-auth` and `sensors` proved the
`expo-modules-core`-only wrapping recipe (see `symbiote-expo-native-module`) and `slider` proved
the native-view wrapping recipe (see `symbiote-third-party-native-view`). Tier 1 has since been
closed (2026-08-03) — see "Already shipped" for the real state; from Tier 2 on this skill is a
**roadmap**. Each future package still goes through `symbiote-new-package-skeleton` (tier triage) →
`symbiote-expo-native-module` or `symbiote-third-party-native-view` (the actual recipe).

## Scope filter — what counts as a migration candidate

`.vendors/expo/packages/` has 116 directories. Only **runtime device/OS API packages built on
`expo-modules-core`** count as candidates. Excluded, permanently, not a "later" backlog item:

| Category | Examples | Why excluded |
|---|---|---|
| CLI/scaffolding | `create-expo*`, `expo-module-scripts`, `expo-module-template`, `patch-project`, `pod-install`, `install-expo-modules`, `uri-scheme`, `precompile` | Dev tooling, not a runtime package to wrap |
| Lint/test infra | `eslint-config-expo`, `eslint-config-universe`, `eslint-plugin-expo`, `jest-expo`, `jest-expo-puppeteer`, `expo-test-runner`, `expo-modules-test-core` | Same — build-time only |
| Internal interface/support libs | `expo-manifests`, `expo-json-utils`, `expo-structured-headers`, `expo-eas-client`, `expo-updates-interface`, `expo-dev-menu-interface`, `expo-observe`, `expo-image-loader` | Consumed by other Expo packages, not a public API surface themselves |
| Server-side | `expo-server` | Node package, not a native RN module |
| The `expo` meta-package | `expo` | Architecturally excluded — see `<react_native_is_an_explicit_top_level_peer>` / `expo-native-module-packaging` rule: we depend on `expo-modules-core` only, never `expo` |
| CLI/EAS/React-Router-coupled | `expo-router`, `expo-dev-client`, `expo-dev-launcher`, `expo-dev-menu`, `expo-updates`, `expo-brownfield` | `expo-router` is React Navigation + file-based routing built on React Context/hooks throughout — not portable as a thin wrapper, would mean rewriting routing logic from zero (we already have `@symbiote-native/navigation`, which could double as its replacement — open question, not scoped here). The `dev-*`/`updates`/`brownfield` set requires Expo CLI/EAS build infrastructure this repo doesn't have and won't grow (Metro-only, no `expo/metro-config`) |
| **Already covered by RN's own native module, not Expo's** | `expo-linking`, `expo-status-bar` | Verified by grep: `core/engine/src/linking/`, `core/engine/src/status-bar/`, `adapters/react/src/modules/status-bar/{index.ios,index.android}.ts` already wrap RN's stock `Linking`/`StatusBar` natives. Porting the Expo package would be pure duplication — always re-check `core/engine/src/` and `adapters/*/src/modules/` before assuming an Expo package is net-new |
| **Already covered by a non-Expo package we ship** | `expo-splash-screen` | `@symbiote-native/splash-screen` already wraps `react-native-bootsplash` — user call (2026-07-28): skip `expo-splash-screen`, no need for a second splash-screen package covering the same capability |

## Backlog — anomalous shape, deliberately not in the priority queue

| Package | Why it doesn't fit the normal recipe |
|---|---|
| `expo-maps` | Depends on Google Maps SDK / Apple Maps + API keys — external service dependency, not just native code |
| `expo-ui` | Bridges SwiftUI/Jetpack Compose directly — a **different rendering paradigm** than this project's Yoga+Fabric path (`<layout_is_yoga>`); wrapping it doesn't fit the Descriptor/engine model at all |
| `expo-widgets` | Ships native **app-extension** targets (iOS Widget Extension, Android App Widget) — not a JS-reachable runtime module, needs its own native-target scaffolding story |

Revisit only as an explicit, separately-scoped decision — never silently folded into the main
queue.

## Already shipped (reference precedents, not candidates)

| Package | Wraps | Recipe used |
|---|---|---|
| `@symbiote-native/local-auth` | `expo-local-authentication` | `symbiote-expo-native-module` (pure module, no view) |
| `@symbiote-native/sensors` | `expo-sensors` | `symbiote-expo-native-module` |
| `@symbiote-native/slider` | `@react-native-community/slider` (not Expo) | `symbiote-third-party-native-view` |
| `@symbiote-native/splash-screen` | `react-native-bootsplash` (not Expo — `expo-splash-screen` is excluded, see scope filter) | `symbiote-third-party-native-view` |
| `@symbiote-native/haptics` | `expo-haptics` | `symbiote-expo-native-module` |
| `@symbiote-native/clipboard` | `expo-clipboard` | `symbiote-expo-native-module` |
| `@symbiote-native/battery` | `expo-battery` | `symbiote-expo-native-module` |
| `@symbiote-native/brightness` | `expo-brightness` | `symbiote-expo-native-module` |
| `@symbiote-native/cellular` | `expo-cellular` | `symbiote-expo-native-module` |
| `@symbiote-native/network` | `expo-network` | `symbiote-expo-native-module` |
| `@symbiote-native/device` | `expo-device` | `symbiote-expo-native-module` |
| `@symbiote-native/application` | `expo-application` | `symbiote-expo-native-module` |
| `@symbiote-native/crypto` | `expo-crypto` (excluding its `aes/` subfolder — out of scope for this pass) | `symbiote-expo-native-module` |
| `@symbiote-native/standard-web-crypto` | `expo-standard-web-crypto` (no native folders — delegates to `@symbiote-native/crypto`'s own `getRandomValues` instead of `expo-crypto` directly) | `symbiote-expo-native-module` (hand-ported, no `native-link.json` — no native module to register) |
| `@symbiote-native/system-ui` | `expo-system-ui` | `symbiote-expo-native-module` |
| `@symbiote-native/store-review` | `expo-store-review` (trimmed — `storeUrl()`/app.json manifest reading dropped, same reasoning as the `expo-constants` skip below; caller passes `{ iosAppStoreUrl, androidPlayStoreUrl }` explicitly instead) | `symbiote-expo-native-module` |
| `@symbiote-native/keep-awake` | `expo-keep-awake` | `symbiote-expo-native-module` |
| `@symbiote-native/screen-orientation` | `expo-screen-orientation` | `symbiote-expo-native-module` |
| `@symbiote-native/localization` | `expo-localization` | `symbiote-expo-native-module` |
| `@symbiote-native/tracking-transparency` | `expo-tracking-transparency` | `symbiote-expo-native-module` |
| `@symbiote-native/secure-store` | `expo-secure-store` | `symbiote-expo-native-module` (first tier-2 package; also the first to need `native-link.json`'s `android.manifestApplicationAttributes` — see below) |
| `@symbiote-native/sharing` | `expo-sharing` (OUTGOING share only — `shareAsync`/`isAvailableAsync`. The incoming half (`useIncomingShare`, `getSharedPayloads`, …) is deliberately NOT ported: it needs an iOS Share Extension target, which upstream's config plugin builds as a second Xcode target with entitlements + an App Group — the same app-extension category as `expo-widgets` in the backlog above) | `symbiote-expo-native-module` |
| `@symbiote-native/web-browser` | `expo-web-browser` (minus the opt-in `experimentalLauncherActivity` config plugin, and minus the web-only `maybeCompleteAuthSession`) | `symbiote-expo-native-module` |
| `@symbiote-native/sms` | `expo-sms` | `symbiote-expo-native-module` |
| `@symbiote-native/mail-composer` | `expo-mail-composer` | `symbiote-expo-native-module` |
| `@symbiote-native/task-manager` | `expo-task-manager` (no `registerTaskAsync` — upstream has none either; registration is always driven by a consumer module) | `symbiote-expo-native-module` |
| `@symbiote-native/background-fetch` | `expo-background-fetch` (upstream-deprecated in favor of `expo-background-task`; ported anyway for parity, since Expo still ships both at sdk-57 — see the file-system legacy+modern precedent above) | `symbiote-expo-native-module` |
| `@symbiote-native/background-task` | `expo-background-task` (`BGTaskScheduler`/`WorkManager`-backed successor to `expo-background-fetch`; both build on `@symbiote-native/task-manager`'s `defineTask`, neither ships one itself) | `symbiote-expo-native-module` |
| `@symbiote-native/location` | `expo-location` (geofencing wired, deliberately not demoed in the canary screens — see the module's own README) | `symbiote-expo-native-module` |
| `@symbiote-native/media-library` | `expo-media-library` — both surfaces, matching upstream's own layout: the shared-object `Query`/`Asset`/`Album` API (default entry) and the legacy function-based API (`/legacy` subpath, added 2026-09-07) | `symbiote-expo-native-module` |
| `@symbiote-native/file-system` | `expo-file-system` — both surfaces, matching upstream's own layout: the shared-object `File`/`Directory`/`Paths` API (default entry) and the legacy function-based API (`/legacy` subpath, added 2026-09-07) | `symbiote-expo-native-module` |
| `@symbiote-native/audio` | `expo-audio` — the shared-object `AudioPlayer`/`AudioRecorder`/`AudioPlaylist`/`AudioStream` classes plus the module-level audio-session/permission/preload functions. React hooks (`useAudioPlayer`, `useAudioRecorder`, …) not ported (framework-specific); neither is the `number`/`Asset`-instance form of `AudioSource` or the `downloadFirst` option (both need `expo-asset`, out of scope — see the package's own README) | `symbiote-expo-native-module` |
| `@symbiote-native/sqlite` | `expo-sqlite` — `Database`/`Statement`/`Session` (transactions, changesets), a Bun-style SQL tagged-template helper, and a SQLite-backed key-value store (own `/kv-store` subpath). Plain-constructor native classes (`new ExpoSQLite.NativeDatabase(...)`), not `SharedObject`s — simpler than `@symbiote-native/audio`'s port. Full parity: a `<SQLiteProvider>`/`useSQLiteContext` equivalent on every adapter (`./react` `./vue` `./svelte` `./solid`, plus Angular's own `SqliteService`/`provideSqliteDatabase` DI shape on `./angular`). `assetSource`/`importAssetDatabaseAsync` (needs `expo-asset`), the `expo-sqlite/plugin` config plugin (libSQL/`sqlite-vec` bundling), React's `useSuspense` on the other four adapters, and DevTools-browser wiring are out of scope — see the package's own README | `symbiote-expo-native-module` |
| `@symbiote-native/notifications` | `expo-notifications` — permissions, device/Expo push tokens, scheduling, presentation, badges, Android channels/channel groups, categories, and the `@symbiote-native/task-manager`-backed background-task hook (13 native modules, more than any package this project has wrapped before). No auto push-token server-resync daemon (upstream's `DevicePushTokenAutoRegistration.fx.ts` background retry loop), no `expo-constants`/`expo-application` defaults for `projectId`/`applicationId` (pass explicitly — see the package's own README), no `useLastNotificationResponse` hook (whole surface is adapter-agnostic by design). First package needing real per-app native config beyond the linker's fixed-value contract — Firebase/`google-services.json`, the notification-icon/color meta-data, and the `aps-environment` entitlement are all documented as manual one-time app steps, not generated | `symbiote-expo-native-module` |
| `@symbiote-native/asset` | `expo-asset` — full parity including the Expo Go / classic-updates / `expo-updates` code paths (naturally inert in this bare-app repo, real ported code not stubs — see the package's own README). Built primarily as `@symbiote-native/font`'s dependency for the `number`/`Asset`-instance `FontSource` forms. **Known gap (2026-09-25): no canary demo screen in any of the 6 `examples/expo-*` apps** — every other shipped package in this table has one; the ~6-framework navigation wiring (routes/nav-lines/menu/App registration per app) is a separate follow-up, out of scope for a source-parity pass | `symbiote-expo-native-module` |
| `@symbiote-native/font` | `expo-font` — full parity including `unloadAsync`/`unloadAllAsync` (ported and exported for API parity though they always throw `UnavailabilityError` on native — `ExpoFontLoader` has no unload method on iOS/Android, web-only upstream) and `renderToImageAsync` (iOS + Android, not Android-only). Same **known gap** as `@symbiote-native/asset` above: no canary demo screen yet in any example app | `symbiote-expo-native-module` |

**Tier 1 is now fully closed (2026-08-03)** — every Tier 1 row below is shipped except
`expo-constants` (#9), which stays deliberately skipped (see its own row note). Tier 2 (permission/
async, 31 packages) is under way: `expo-secure-store` (#18), `expo-sharing` (#19),
`expo-web-browser` (#23) and `expo-sms` (#24) all shipped 2026-08-05, `expo-task-manager` (#40)
shipped 2026-09-03, `expo-location` (#37) shipped 2026-09-03, `expo-media-library` (#38) shipped
2026-09-03, `expo-file-system` (#20) shipped 2026-09-03, `expo-background-fetch` (#41) and
`expo-background-task` (#42) both shipped 2026-09-07 (built on `expo-task-manager`'s
`@symbiote-native/task-manager`, per that package's own README "other background-work packages
register tasks through" note), `expo-audio` (#33) shipped 2026-09-07, `expo-notifications` (#39)
shipped 2026-09-07 (13 native modules, first package needing real per-app native config beyond the
linker's fixed-value contract — see its own README), `expo-asset` (#22) and `expo-font` (#21) both
shipped 2026-09-25 (canary demo screens pending — see their own rows above), `expo-mail-composer`
(#25) shipped 2026-09-25 (native-link.json needed `ios.infoPlistArrayKeys` for
`LSApplicationQueriesSchemes` — the 22-scheme list `getClients()` needs to query mail apps via
`canOpenURL`), 16 left.

```
§secure_store_manifest_attrs := {
  pkg: "expo-secure-store", scope: "first tier-2 pkg needing more than the 2 standard Android registration points",
  gap: "upstream plugin also sets android:fullBackupContent / android:dataExtractionRules on <application>",
  root_cause: "w/o them Auto Backup uploads encrypted entries without their Keystore keys ⟶ restore on new device = unreadable values",
  fix: "@symbiote-native/expo-modules-link: android.manifestApplicationAttributes section (additive-only, app value wins)",
  lesson: "read upstream plugin/src/with<Name>.ts before porting any tier-2 package — cheapest way to find per-app native config a thin wrapper hides"
}
```

## Priority queue — one continuous sequence, ranked by complexity + demand

Single ordered backlog, not two separate module/view work-tracks — module-only and view-based
packages interleave by real complexity, since `slider` already proved the view recipe works at
this repo's current maturity. `Kind` column: **M** = module-only (no native view, `local-auth`/
`sensors` recipe), **V** = view-based (`slider` recipe, heavier — vendoring + ViewConfig +
per-adapter descriptor bridge). Platform column uses Expo's own `apple`/`android`/`web` terms
from each package's `expo-module.config.json`.

### Tier 1 — trivial (single native call, no permission dance, no background lifecycle)

| # | Package | Kind | Platforms |
|---|---|---|---|
| ~~1~~ | ~~`expo-haptics`~~ | M | shipped — see "Already shipped" |
| ~~2~~ | ~~`expo-clipboard`~~ | M | shipped — see "Already shipped" |
| ~~3~~ | ~~`expo-battery`~~ | M | shipped — see "Already shipped" |
| ~~4~~ | ~~`expo-brightness`~~ | M | shipped — see "Already shipped" |
| ~~5~~ | ~~`expo-cellular`~~ | M | shipped — see "Already shipped" |
| ~~6~~ | ~~`expo-network`~~ | M | shipped — see "Already shipped" |
| ~~7~~ | ~~`expo-device`~~ | M | shipped — see "Already shipped" |
| ~~8~~ | ~~`expo-application`~~ | M | shipped — see "Already shipped" |
| 9 | `expo-constants` | M | apple, android, web — **skipped this pass** (2026-07-29): its main value (`expoConfig`, `manifest`) hard-imports `expo/config` types and reads an Expo-CLI-generated manifest (`app.config`/EAS/updates) that doesn't exist in this bare, Metro-only, non-Expo-CLI project. Revisit only if a trimmed port (native-only fields like `sessionId`/`statusBarHeight`/`systemFonts`, skipping the manifest/config apparatus entirely) is explicitly wanted — never port the manifest surface as-is. |
| ~~10~~ | ~~`expo-crypto`~~ | M | shipped — see "Already shipped" (`aes/` subfolder excluded) |
| ~~11~~ | ~~`expo-standard-web-crypto`~~ | M | shipped — see "Already shipped" |
| ~~12~~ | ~~`expo-localization`~~ | M | shipped — see "Already shipped" |
| ~~13~~ | ~~`expo-keep-awake`~~ | M | shipped — see "Already shipped" |
| ~~14~~ | ~~`expo-screen-orientation`~~ | M | shipped — see "Already shipped" |
| ~~15~~ | ~~`expo-tracking-transparency`~~ | M | shipped — see "Already shipped" |
| ~~16~~ | ~~`expo-store-review`~~ | M | shipped — see "Already shipped" |
| ~~17~~ | ~~`expo-system-ui`~~ | M | shipped — see "Already shipped" |

### Tier 2 — moderate (permission-gated, multi-step async, or background lifecycle)

| # | Package | Kind | Platforms |
|---|---|---|---|
| ~~18~~ | ~~`expo-secure-store`~~ | M | shipped — see "Already shipped" |
| ~~19~~ | ~~`expo-sharing`~~ | M | shipped — see "Already shipped" |
| ~~20~~ | ~~`expo-file-system`~~ | M | shipped — see "Already shipped" |
| ~~21~~ | ~~`expo-font`~~ | M | shipped — see "Already shipped" |
| ~~22~~ | ~~`expo-asset`~~ | M | shipped — see "Already shipped" |
| ~~23~~ | ~~`expo-web-browser`~~ | M | shipped — see "Already shipped" |
| ~~24~~ | ~~`expo-sms`~~ | M | shipped — see "Already shipped" |
| ~~25~~ | ~~`expo-mail-composer`~~ | M | shipped — see "Already shipped" |
| 26 | `expo-print` | M | apple, android |
| 27 | `expo-document-picker` | M | apple, android |
| 28 | `expo-image-picker` | M | apple, android |
| 29 | `expo-image-manipulator` | M | apple, android |
| 30 | `expo-video-thumbnails` | M | apple, android |
| 31 | `expo-blob` | M | apple, android, web |
| 32 | `expo-speech` | M | apple, android |
| ~~33~~ | ~~`expo-audio`~~ | M | shipped — see "Already shipped" |
| 34 | `expo-screen-capture` | M | apple, android, web |
| 35 | `expo-contacts` | M | apple, android |
| 36 | `expo-calendar` | M | apple, android |
| ~~37~~ | ~~`expo-location`~~ | M | shipped — see "Already shipped" |
| ~~38~~ | ~~`expo-media-library`~~ | M | shipped — see "Already shipped" |
| ~~39~~ | ~~`expo-notifications`~~ | M | shipped — see "Already shipped" |
| ~~40~~ | ~~`expo-task-manager`~~ | M | shipped — see "Already shipped" |
| ~~41~~ | ~~`expo-background-fetch`~~ | M | shipped — see "Already shipped" |
| ~~42~~ | ~~`expo-background-task`~~ | M | shipped — see "Already shipped" |
| 43 | `expo-auth-session` | M | universal (pure-JS OAuth flow over `expo-web-browser`/`Linking`, no native folders) |
| 44 | `expo-age-range` | M | apple, android |
| 45 | `expo-app-integrity` | M | apple, android (Play Integrity / DeviceCheck) |
| 46 | `expo-app-metrics` | M | apple, android |
| 47 | `expo-intent-launcher` | M | android only |
| 48 | `expo-navigation-bar` | M | android only |

### Tier 3 — view-based, simple surface

| # | Package | Kind | Platforms |
|---|---|---|---|
| 49 | `expo-checkbox` | V | verify at implementation time — no native `ios`/`android` folders in current vendor snapshot, may already compose from existing platform checkbox views |
| 50 | `expo-blur` | V | apple, android |
| 51 | `expo-linear-gradient` | V | apple, android |
| 52 | `expo-symbols` | V | apple only (SF Symbols) |
| 53 | `expo-glass-effect` | V | apple only (iOS 26 Liquid Glass) |
| 54 | `expo-apple-authentication` | V | apple only (Sign in with Apple button) |

### Tier 4 — view-based, complex (media pipelines, GPU context)

| # | Package | Kind | Platforms |
|---|---|---|---|
| 55 | `expo-image` | V | apple, android |
| 56 | `expo-video` | V | apple, android |
| 57 | `expo-camera` | V | apple, android, web |
| 58 | `expo-live-photo` | V | apple only |
| 59 | `expo-gl` | V | apple, android (raw GL/WebGL context — heaviest item in the queue) |

## Applying this catalog

1. Pick the next package off the queue (or a user-requested one out of order — the queue is a
   default, not a lock).
2. Run `symbiote-new-package-skeleton` to settle the tier (bare-skeleton / core-only / full
   parity) before writing code.
3. Follow `symbiote-expo-native-module` for **M** entries, `symbiote-third-party-native-view`
   for **V** entries.
4. Pin any new native npm dependency via a pnpm catalog entry, not a literal version — see `symbiote-dependency-catalog`.
5. Update this table's tier/row (strike through or move to a "shipped" note) once a package
   lands — keep the queue reflecting reality, not the 2026-07-28 snapshot forever.

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
| `@symbiote-native/clipboard` | `expo-clipboard` (`ClipboardPasteButton` on every adapter: Expo native view via `requireNativeViewManager`, view name and registration through the engine's `expoViewManagerName`/`tryRegisterNativeView`, Angular on `NativeViewBase`) | `symbiote-expo-native-module` |
| `@symbiote-native/constants` | `expo-constants` trimmed to its native fields (`sessionId`, `statusBarHeight`, `systemFonts`, `linkingUri`, `executionEnvironment`, `platform`, `getWebViewUserAgentAsync`, ...); the manifest family (`manifest`, `manifest2`, `expoConfig`, `expoGoConfig`, `easConfig`) is dropped by `createConstants`, and the upstream manifest tests are not ported. Android also registers `ConstantsService` (same service `task-manager` lists, the link script dedupes it) | `symbiote-expo-native-module` |
| `@symbiote-native/battery` | `expo-battery` | `symbiote-expo-native-module` |
| `@symbiote-native/brightness` | `expo-brightness` | `symbiote-expo-native-module` |
| `@symbiote-native/cellular` | `expo-cellular` | `symbiote-expo-native-module` |
| `@symbiote-native/network` | `expo-network` | `symbiote-expo-native-module` |
| `@symbiote-native/device` | `expo-device` | `symbiote-expo-native-module` |
| `@symbiote-native/application` | `expo-application` | `symbiote-expo-native-module` |
| `@symbiote-native/crypto` | `expo-crypto` (including the `aes/` subfolder: AES-GCM key and sealed-data classes over the `ExpoCryptoAES` native module) | `symbiote-expo-native-module` |
| `@symbiote-native/standard-web-crypto` | `expo-standard-web-crypto` (no native folders — delegates to `@symbiote-native/crypto`'s own `getRandomValues` instead of `expo-crypto` directly) | `symbiote-expo-native-module` (hand-ported, no `native-link.json` — no native module to register) |
| `@symbiote-native/system-ui` | `expo-system-ui` | `symbiote-expo-native-module` |
| `@symbiote-native/store-review` | `expo-store-review` (trimmed — `storeUrl()`/app.json manifest reading dropped, same reasoning as the `expo-constants` skip below; caller passes `{ iosAppStoreUrl, androidPlayStoreUrl }` explicitly instead) | `symbiote-expo-native-module` |
| `@symbiote-native/keep-awake` | `expo-keep-awake` | `symbiote-expo-native-module` |
| `@symbiote-native/screen-orientation` | `expo-screen-orientation` | `symbiote-expo-native-module` |
| `@symbiote-native/localization` | `expo-localization` | `symbiote-expo-native-module` |
| `@symbiote-native/tracking-transparency` | `expo-tracking-transparency` (`useTrackingPermissions` on every adapter via the shared `createPermissionHook`, Angular `TrackingPermissionsService`; the former `usePermissions`/`createPermissions`/`PermissionsService` names are gone, no `error` slot on the hooks) | `symbiote-expo-native-module` |
| `@symbiote-native/secure-store` | `expo-secure-store` | `symbiote-expo-native-module` (first tier-2 package; also the first to need `native-link.json`'s `android.manifestApplicationAttributes` — see below) |
| `@symbiote-native/sharing` | `expo-sharing` (both halves: `shareAsync`/`isAvailableAsync` plus the incoming `getSharedPayloads`/`getResolvedSharedPayloadsAsync`/`clearSharedPayloads` and `useIncomingShare` on every adapter over one core store. The host app still needs a share target (iOS Share Extension, Android intent filters), native scaffolding this package does not generate) | `symbiote-expo-native-module` |
| `@symbiote-native/web-browser` | `expo-web-browser` (minus the opt-in `experimentalLauncherActivity` config plugin; `maybeCompleteAuthSession` is ported and reports `failed` on native) | `symbiote-expo-native-module` |
| `@symbiote-native/sms` | `expo-sms` | `symbiote-expo-native-module` |
| `@symbiote-native/mail-composer` | `expo-mail-composer` | `symbiote-expo-native-module` |
| `@symbiote-native/print` | `expo-print` (no config plugin, no permissions — ships nothing beyond the two native modules) | `symbiote-expo-native-module` |
| `@symbiote-native/document-picker` | `expo-document-picker` (web-only `base64`/`file`/`output` fields dropped; upstream's config plugin, which sets opt-in iCloud entitlements, is not carried over — no diff against the stock introspection config since it's conditional on `ios.usesIcloudStorage`) | `symbiote-expo-native-module` |
| `@symbiote-native/image-picker` | `expo-image-picker` (`useCameraPermissions`/`useMediaLibraryPermissions` - originally dropped as React-only, since reversed: ported to every adapter via the shared `createPermissionHook` factory in `@symbiote-native/{react,vue,solid}` (method-dispatch plumbing lives once in `@symbiote-native/engine`'s `permission-hook-runtime.ts`, moved there from per-package copies once it existed byte-identical in three packages), Svelte binds the shared factory from `@symbiote-native/svelte/runes/create-permission-hook` (the smoke harness desugars runes reached by package name), Angular `CameraPermissionsService`/`MediaLibraryPermissionsService` matching brightness/cellular/tracking-transparency's own `PermissionsService` shape. Web-only fields and the config-plugin's own unit test not carried over, same reasoning as document-picker) | `symbiote-expo-native-module` |
| `@symbiote-native/task-manager` | `expo-task-manager` (no `registerTaskAsync` — upstream has none either; registration is always driven by a consumer module) | `symbiote-expo-native-module` |
| `@symbiote-native/background-fetch` | `expo-background-fetch` (upstream-deprecated in favor of `expo-background-task`; ported anyway for parity, since Expo still ships both at sdk-57 — see the file-system legacy+modern precedent above) | `symbiote-expo-native-module` |
| `@symbiote-native/background-task` | `expo-background-task` (`BGTaskScheduler`/`WorkManager`-backed successor to `expo-background-fetch`; both build on `@symbiote-native/task-manager`'s `defineTask`, neither ships one itself) | `symbiote-expo-native-module` |
| `@symbiote-native/location` | `expo-location` (geofencing wired, not demoed in the canary screens; permission hooks on all 5 adapters, `installWebGeolocationPolyfill` ported) | `symbiote-expo-native-module` |
| `@symbiote-native/media-library` | `expo-media-library` — both surfaces, matching upstream's own layout: the shared-object `Query`/`Asset`/`Album` API (default entry) and the legacy function-based API (`/legacy` subpath, added 2026-09-07) | `symbiote-expo-native-module` |
| `@symbiote-native/file-system` | `expo-file-system` — both surfaces, matching upstream's own layout: the shared-object `File`/`Directory`/`Paths` API (default entry) and the legacy function-based API (`/legacy` subpath, added 2026-09-07) | `symbiote-expo-native-module` |
| `@symbiote-native/audio` | `expo-audio` - the shared-object `AudioPlayer`/`AudioRecorder`/`AudioPlaylist`/`AudioStream` classes plus the module-level audio-session/permission/preload functions. Every upstream hook (`useAudioPlayer`/`useAudioPlayerStatus`/`useAudioSampleListener`/`useAudioPlaylist`/`useAudioPlaylistStatus`/`useAudioRecorder`/`useAudioRecorderState`/`useAudioStream`) ported to all five adapters (`./react` `./vue` `./solid` `./svelte` `./angular`'s `injectX`), via the shared `createResourceController`/`createResourceHook`/`createEventValueHook` factories (same pattern as `@symbiote-native/image-manipulator`'s `useImageManipulator`) plus `createAudioStreamHooks`/`runAudioStreamBufferEffect` for the stream hook's Vue/Solid/Angular composition (React and Svelte keep their own wiring - ref-based render model and the `$effect` compiler-macro boundary respectively). `AudioStream`/`useAudioStream` are real `expo-audio@57.0.4` surface, confirmed on iOS/Android native and JS source directly (registers a `Class(AudioStream.self)` on iOS, `AudioStream.kt` on Android) - not a fabrication as an earlier stale vendor read suggested. `AudioSource`'s `Asset`-instance form and `downloadFirst` are also ported (needs `@symbiote-native/asset`) - see the package's own README | `symbiote-expo-native-module` |
| `@symbiote-native/sqlite` | `expo-sqlite` — `Database`/`Statement`/`Session` (transactions, changesets), a Bun-style SQL tagged-template helper, and a SQLite-backed key-value store (own `/kv-store` subpath). Plain-constructor native classes (`new ExpoSQLite.NativeDatabase(...)`), not `SharedObject`s — simpler than `@symbiote-native/audio`'s port. Full parity: a `<SQLiteProvider>`/`useSQLiteContext` equivalent on every adapter (`./react` `./vue` `./svelte` `./solid`, plus Angular's own `SqliteService`/`provideSqliteDatabase` DI shape on `./angular`). `assetSource`/`importAssetDatabaseAsync` (needs `expo-asset`), the `expo-sqlite/plugin` config plugin (libSQL/`sqlite-vec` bundling), React's `useSuspense` on the other four adapters, and DevTools-browser wiring are out of scope — see the package's own README | `symbiote-expo-native-module` |
| `@symbiote-native/notifications` | `expo-notifications` — permissions, device/Expo push tokens, scheduling, presentation, badges, Android channels/channel groups, categories, and the `@symbiote-native/task-manager`-backed background-task hook (13 native modules, more than any package this project has wrapped before). The push-token resync (upstream's `DevicePushTokenAutoRegistration.fx.ts`, with `backoff`/`updateDevicePushTokenAsync` and their tests) is ported as an explicit, idempotent `installPushTokenAutoRegistration()`; `applicationId`/`development` default from `@symbiote-native/application`, `projectId` still needs passing (no `expo-constants` port exists), the deprecated `*Async` last-response aliases are ported, `useLastNotificationResponse` ported to all 5 adapters (originally dropped as React-only, since reversed - shares `core/last-notification-response.ts`'s `determineNextResponse` dedup rule). First package needing real per-app native config beyond the linker's fixed-value contract — Firebase/`google-services.json`, the notification-icon/color meta-data, and the `aps-environment` entitlement are all documented as manual one-time app steps, not generated | `symbiote-expo-native-module` |
| `@symbiote-native/asset` | `expo-asset` — full parity including the Expo Go / classic-updates / `expo-updates` code paths (naturally inert in this bare-app repo, real ported code not stubs — see the package's own README). Built primarily as `@symbiote-native/font`'s dependency for the `number`/`Asset`-instance `FontSource` forms. **Known gap (2026-09-25): no canary demo screen in any of the 6 `examples/expo-*` apps** — every other shipped package in this table has one; the ~6-framework navigation wiring (routes/nav-lines/menu/App registration per app) is a separate follow-up, out of scope for a source-parity pass | `symbiote-expo-native-module` |
| `@symbiote-native/font` | `expo-font` — full parity including `unloadAsync`/`unloadAllAsync` (ported and exported for API parity though they always throw `UnavailabilityError` on native — `ExpoFontLoader` has no unload method on iOS/Android, web-only upstream) and `renderToImageAsync` (iOS + Android, not Android-only). Same **known gap** as `@symbiote-native/asset` above: no canary demo screen yet in any example app | `symbiote-expo-native-module` |
| `@symbiote-native/image-manipulator` | `expo-image-manipulator` - the current chainable `manipulate(source)`/`ImageManipulatorContext` API plus the deprecated one-shot `manipulateAsync`. `useImageManipulator` - originally dropped as React-only, since reversed: ported to every adapter via a shared `core/manipulator-context-controller.ts` recreate/release rule (twin of `useReleasingSharedObject`), each adapter its own reactive lifecycle - React plain value, Vue/Solid/Svelte reactive source, Angular `injectImageManipulator`. `extent` action not ported (web-only, neither native module registers it) | `symbiote-expo-native-module` |
| `@symbiote-native/video-thumbnails` | `expo-video-thumbnails` — single `getThumbnailAsync` function, no config plugin, no permissions | `symbiote-expo-native-module` |
| `@symbiote-native/blob` | `expo-blob` — a native, JSI-backed W3C `Blob` (constructor, `slice`/`bytes`/`text`/`arrayBuffer`/`stream`/`toString`). First package needing `"DOM"` added to its own `tsconfig.json` lib array (for `ReadableStream`/`BlobPropertyBag`), scoped to this package only. `.stream()` needs an app-supplied `ReadableStream` polyfill — Hermes ships none | `symbiote-expo-native-module` |
| `@symbiote-native/speech` | `expo-speech` - text-to-speech (`speak`, `getAvailableVoicesAsync`, `isSpeakingAsync`, `stop`, `pause`/`resume` iOS-only). Web-only fields dropped (`WebVoice`, DOM-`SpeechSynthesisEvent`-shaped callbacks, `onMark`/`onPause`/`onResume` - package ships no `"web"` platform anyway). Android's `<queries>` TTS_SERVICE entry ships in its own bundled manifest and auto-merges - no `native-link.json` field exists for it | `symbiote-expo-native-module` |
| `@symbiote-native/screen-capture` | `expo-screen-capture` - prevent/allow screen capture (key-counted, matching upstream), an iOS-only app-switcher privacy blur, and a screenshot listener. `usePreventScreenCapture`/`useScreenshotListener`/`usePermissions` - originally dropped as React-only, since reversed: ported to every adapter, React/Vue/Solid/Svelte their own hook/composable/primitive/rune, Angular `PreventScreenCaptureService`/`ScreenshotListenerService`/`PermissionsService` matching keep-awake/brightness's own service shapes. No config plugin; Android's storage-read permissions for screenshot detection ship in its own bundled manifest and auto-merge | `symbiote-expo-native-module` |
| `@symbiote-native/auth-session` | `expo-auth-session` - ships no native code at all; hand-ported onto `@symbiote-native/web-browser` (auth tab), `@symbiote-native/crypto` (PKCE), `@symbiote-native/application` (default redirect scheme). No `expo-modules-core` dependency, no `native-link.json` (same shape as `standard-web-crypto`). Dropped: the `expo-constants`/`auth.expo.io` proxy flow and `makeRedirectUri`'s manifest-scheme auto-detection (no app manifest exists here - pass `scheme`/`native` explicitly). Decided 2026-09-29: `makeRedirectUri()` without either keeps throwing, no `applicationId` fallback (a scheme the app never registered would fail silently), and reading declared schemes would need new native code. Every upstream hook is ported to all five adapters (`useAutoDiscovery`, `useLoadedAuthRequest`, `useAuthRequestResult`, `useAuthRequest`, Google `useAuthRequest`/`useIdTokenAuthRequest` as `useGoogleAuthRequest`/`useGoogleIdTokenAuthRequest`, `useFacebookAuthRequest`): controllers and Google's code exchange in `core/`, one `createAuthRequestHooks` for the getter-shaped adapters (a type-level `IHkt` box per adapter), React wired by hand | `symbiote-expo-native-module` (no-native variant) |
| `@symbiote-native/calendar` | `expo-calendar` - both surfaces, matching upstream's own layout exactly: the modern `ExpoCalendar`/`ExpoCalendarEvent`/`ExpoCalendarReminder`/`ExpoCalendarAttendee` shared-object API (default entry, upstream's own `src/Calendar.ts`) and the legacy function-based API (`/legacy` subpath, upstream's `src/legacy/Calendar.ts`). Correction 2026-09-25: an earlier pass claimed upstream ships no JS reference for the modern surface at sdk-57 - that was wrong, found by re-reading `src/Calendar.ts` directly (456 lines, real `class ExpoCalendar extends InternalExpoCalendar.ExpoCalendar` with `Object.setPrototypeOf` upgrades, module-level functions for calendar-level operations like `getCalendars`/`createCalendar`/`presentPicker`, and `processColor` on calendar update) - never trust an earlier session's "upstream ships no JS for X" claim without re-checking the actual file tree first. `useCalendarPermissions`/`useRemindersPermissions` - originally dropped as React-only (§11 class), since reversed: ported to every adapter via the shared `createPermissionHook` factory now living in `@symbiote-native/{react,vue,solid}` (moved there from per-package copies once it existed byte-identical in three packages), Svelte binds the shared factory from `@symbiote-native/svelte/runes/create-permission-hook` (the smoke harness desugars runes reached by package name), Angular `CalendarPermissionsService`/`RemindersPermissionsService` matching the `connect()`/`get()`/`request()`/`error` shape every permission service in this project uses | `symbiote-expo-native-module` |
| `@symbiote-native/age-range` | `expo-age-range` - Apple's Declared Age Range API (iOS 26+) and Google Play's Age Signals. `requestAgeRangeAsync`/`isEligibleForAgeFeaturesAsync` are implemented on both native modules and called unconditionally; `showSignificantUpdateAcknowledgmentAsync`/`getRequiredRegulatoryFeaturesAsync` (iOS-only) and `requestAgeSignalsAccessAsync`/`setFakeAgeSignals` (Android-only) are typed optional on the native-module interface and gated by `Platform.OS` in core, matching upstream's own per-platform branches exactly. No config plugin, no manifest permissions on either platform | `symbiote-expo-native-module` |
| `@symbiote-native/app-integrity` | `@expo/app-integrity` - scoped npm package (first in this catalog), Gradle project name still derives to `expo-app-integrity` via autolinking's `convertPackageToProjectName`. Apple's App Attest (`generateKeyAsync`/`attestKeyAsync`/`generateAssertionAsync`, iOS-only), Google Play Integrity (`prepareIntegrityTokenProviderAsync`/`requestIntegrityCheckAsync`, Android-only), and Android hardware-attested key generation (`isHardwareAttestationSupportedAsync`/`generateHardwareAttestedKeyAsync`/`getAttestationCertificateChainAsync`). No config plugin, no manifest permissions | `symbiote-expo-native-module` |
| `@symbiote-native/app-metrics` | `expo-app-metrics` - the first package in this catalog with real per-framework surface, not just a thin async wrapper. Core ships the full surface (metrics, sessions, crash reports, `Session`/`NetworkRequestObserver` re-exported off the native module same as `@symbiote-native/audio`). `AppMetricsRoot` ships on all five adapters. `AppMetricsErrorBoundary` ships on React, Vue, Solid, and Svelte, each wrapping that framework's own subtree catch primitive (React class boundary, Vue `onErrorCaptured`, Solid's built-in `ErrorBoundary`, Svelte 5 `<svelte:boundary>`) over a shared `reportCaughtError` helper. Angular DOES have one too (`@boundary`/`@error`, stable since `@angular/core` 22.2.0) but this repo pins Angular at `~22.0.8` (`pnpm-workspace.yaml`) over a Babel-8-linker-vs-Metro-Babel-7 incompatibility - re-tried the bump for this package 2026-09-28, reproduced the exact failure directly against the real linker bundle, reverted; version-gated, not missing. `useNetworkRequestObserver`/`injectNetworkRequestObserver` (hook over a SharedObject) ship on all five adapters, sharing a `createNetworkRequestObserverLifecycle` core (`core/network-request-observer-lifecycle.ts`). See the package's own README "Scope decision". No config plugin, no manifest permissions | `symbiote-expo-native-module` |
| `@symbiote-native/intent-launcher` | `expo-intent-launcher` - Android only, upstream ships no iOS implementation at all (its own non-Android entry is `export default {} as any`). Ported the same shape: `native-module/index.ts` is an empty stub, `native-module/index.android.ts` calls `requireNativeModule`, every function guards a missing method with `UnavailabilityError`. `startActivityAsync`/`openApplication`/`getApplicationIconAsync`, plus the `ActivityAction` enum (Android Settings actions) and `ResultCode`. `extra?: Record<string, unknown>` replaces upstream's `Record<string, any>`. No config plugin, no manifest permissions | `symbiote-expo-native-module` |
| `@symbiote-native/navigation-bar` | `expo-navigation-bar` - Android only, same base-stub/`.android.ts` split as `expo-intent-launcher`. `setStyle`/`setHidden`/`addVisibilityListener`/`setVisibilityAsync`/`getVisibilityAsync`, every function throwing `UnavailabilityError` off Android (replacing upstream's own `console.warn`-and-no-op fallback, this repo's usual normalization). Upstream's declarative `<NavigationBar>` component and `useVisibility` hook ported to **every** adapter (React/Vue/Solid/Svelte/Angular), not dropped - shared `entries-stack.ts` merge core, each adapter its own lifecycle glue (`components_split_logic_view_lifecycle`). Upstream's config plugin (`styles.xml` edits) produces no diff with default props and no `app.json` exists here to source props from anyway - checked via the drift-audit script, not carried over, see the package's own README. Upstream's own 3-case test suite ported, 53 tests total across all adapters | `symbiote-expo-native-module` |
| `@symbiote-native/contacts` | `expo-contacts` - both surfaces, matching upstream's own layout: the modern `Contact`/`Group`/`Container` shared-object API (default entry, iOS registers the class as `ContactNext` aliased onto `.Contact`) and the legacy function-based API (`/legacy` subpath). `Group`/`Container` fall back to a stub that throws `Not implemented` on Android (no such concept there). `ContactAccessButton` - the iOS 18+ native VIEW, ported to every adapter: `requireNativeViewManager` registers the view config lazily at first render (Fabric name `ViewManagerAdapter_ExpoContactAccessButton[_<appId>]`), the engine derives events and prop processors from it, each adapter renders the one shared descriptor. Device verification is the owner's | `symbiote-expo-native-module` |

**Tier 1 is now fully closed (2026-08-03)** — every Tier 1 row below is shipped except
`expo-constants` (#9), which shipped trimmed to native fields (see its own row note). Tier 2 (permission/
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
`canOpenURL`), `expo-print` (#26) shipped 2026-09-25 (ships no config plugin at all — the whole
`native-link.json` is the one Android module entry), `expo-document-picker` (#27) shipped
2026-09-25 (its config plugin's iCloud entitlements are opt-in/conditional, so introspection
against the stock config shows no diff — not carried over, documented as a manual app step),
`expo-image-picker` (#28) shipped 2026-09-25 (first package to catch a React-hook leak into
`core/` from `expo-modules-core`'s own `createPermissionHook`, see `symbiote-expo-native-module`
skill §11 - `useCameraPermissions`/`useMediaLibraryPermissions` since ported to every adapter,
see "Already shipped" row above), `expo-image-manipulator` (#29) shipped 2026-09-25 (ships no
config plugin - `extent` action stays dropped, web-only; `useImageManipulator` was dropped as
React-only at ship time, since ported to every adapter, see "Already shipped" row above),
`expo-video-thumbnails` (#30) shipped 2026-09-25 (ships no config plugin,
no permissions — single-function package), `expo-blob` (#31) shipped 2026-09-25 (first package
needing `"DOM"` in its own tsconfig `lib` for `ReadableStream`/`BlobPropertyBag`; `.stream()`
needs an app-supplied polyfill, Hermes ships none), `expo-speech` (#32) shipped 2026-09-25 (no
config plugin; Android's TTS_SERVICE `<queries>` entry auto-merges from its own bundled
manifest), `expo-screen-capture` (#34) shipped 2026-09-25 (no config plugin; Android's
screenshot-detection permissions auto-merge from its own bundled manifest), `expo-auth-session`
(#43) shipped 2026-09-25 (no native code at all - hand-ported onto three already-shipped
packages instead of a fourth `expo-*` dependency), `expo-calendar` (#36) shipped 2026-09-25
(both surfaces ported, matching upstream exactly - modern default, legacy at `/legacy`),
`expo-contacts` (#35) shipped 2026-09-25 (both surfaces ported - next default,
legacy at `/legacy`), `expo-age-range` (#44) shipped 2026-09-28 (ships no config plugin,
no manifest permissions on either platform), `@expo/app-integrity` (#45) shipped 2026-09-28
(first scoped npm package in this catalog, no config plugin, no manifest permissions),
`expo-app-metrics` (#46) shipped 2026-09-28 (first package with real per-framework surface -
core plus an error-boundary/root pair on React/Vue/Solid/Svelte, `useNetworkRequestObserver`
on all five adapters, see the package's own README), `expo-intent-launcher` (#47) shipped 2026-09-28
(Android only, no config plugin, no manifest permissions), `expo-navigation-bar` (#48) shipped
2026-09-28 (Android only, config plugin checked and not carried over - no diff with default
props). **Tier 2 is now fully closed.**

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
| 9 | `expo-constants` | M | apple, android, web - **shipped trimmed** (2026-09-29, explicitly wanted): native-only fields, the manifest/config apparatus is skipped entirely because its main value (`expoConfig`, `manifest`) reads an Expo-CLI-generated manifest that doesn't exist in this bare, Metro-only project. Never port the manifest surface as-is. It does NOT unlock `auth-session`'s `auth.expo.io` proxy or `makeRedirectUri` scheme detection, both need `expoConfig`. |
| ~~10~~ | ~~`expo-crypto`~~ | M | shipped — see "Already shipped" (`aes/` included) |
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
| ~~26~~ | ~~`expo-print`~~ | M | shipped — see "Already shipped" |
| ~~27~~ | ~~`expo-document-picker`~~ | M | shipped — see "Already shipped" |
| ~~28~~ | ~~`expo-image-picker`~~ | M | shipped — see "Already shipped" |
| ~~29~~ | ~~`expo-image-manipulator`~~ | M | shipped — see "Already shipped" |
| ~~30~~ | ~~`expo-video-thumbnails`~~ | M | shipped — see "Already shipped" |
| ~~31~~ | ~~`expo-blob`~~ | M | shipped — see "Already shipped" |
| ~~32~~ | ~~`expo-speech`~~ | M | shipped - see "Already shipped" |
| ~~33~~ | ~~`expo-audio`~~ | M | shipped — see "Already shipped" |
| ~~34~~ | ~~`expo-screen-capture`~~ | M | shipped - see "Already shipped" |
| ~~35~~ | ~~`expo-contacts`~~ | M | shipped - see "Already shipped" |
| ~~36~~ | ~~`expo-calendar`~~ | M | shipped - see "Already shipped" |
| ~~37~~ | ~~`expo-location`~~ | M | shipped — see "Already shipped" |
| ~~38~~ | ~~`expo-media-library`~~ | M | shipped — see "Already shipped" |
| ~~39~~ | ~~`expo-notifications`~~ | M | shipped — see "Already shipped" |
| ~~40~~ | ~~`expo-task-manager`~~ | M | shipped — see "Already shipped" |
| ~~41~~ | ~~`expo-background-fetch`~~ | M | shipped — see "Already shipped" |
| ~~42~~ | ~~`expo-background-task`~~ | M | shipped — see "Already shipped" |
| ~~43~~ | ~~`expo-auth-session`~~ | M | shipped - see "Already shipped" |
| ~~44~~ | ~~`expo-age-range`~~ | M | shipped - see "Already shipped" |
| ~~45~~ | ~~`@expo/app-integrity`~~ | M | shipped - see "Already shipped" |
| ~~46~~ | ~~`expo-app-metrics`~~ | M | shipped - see "Already shipped" |
| ~~47~~ | ~~`expo-intent-launcher`~~ | M | shipped - see "Already shipped" |
| ~~48~~ | ~~`expo-navigation-bar`~~ | M | shipped - see "Already shipped" |

### Tier 3 — view-based, simple surface

Scouted from vendor (sdk-55 snapshot). `clipboard` already ships a native view through
`requireNativeViewManager` on all 5 adapters, so the view recipe is proven; only `children`
is new. Decided: `checkbox` has no native code (Pressable+Image), so it goes to
`core/components` (state/view/lifecycle), NOT a `@symbiote-native/checkbox` package. iOS-only
`symbols`/`glass-effect`/`apple-authentication` mirror upstream on Android (stub/null/
`UnavailabilityError`). `apple-authentication` is a hybrid: 1 view + 5 async functions + config plugin.

| # | Package | Kind | Platforms |
|---|---|---|---|
Progress, checkbox (in the working tree, nothing committed): core behavior `behaviors/checkbox.ts`
with the C++ rule `foldCheckboxProps`/`foldCheckboxMarkProps` in `SymbioteFabricProps.cpp`, vitest
and `checkbox-payload.itest.ts` written, per-adapter prop types and Angular `CheckboxElement`
(`elements.ts` was split into `element-base`/`elements-press`/`elements-layout`/`elements-controls`
to pass the 400-line gate). `onValueChange` takes an event with `value`, the Switch convention,
because a Svelte on* attribute receives one object. Tag tests exist in all five adapters and an
Android itest covers the teal. Itests pass (iOS 594, Android 29); the owner allowed building them.
Still open: checkbox docs page.

Progress, linear-gradient (`packages/linear-gradient`, uncommitted): core `renderLinearGradient`
(iOS native root, Android View wrapper + absolute-fill leaf), all five adapters tested (37 tests),
ngc and tsc clean, CLI layer, README, docs page, sidebar, changeset. Svelte uses `svelte:element`
+ `hostProps`; Angular keeps one component per platform (`index.ios.ts` static native tag with
`NO_ERRORS_SCHEMA`, `index.android.ts` View + outlet + `ng-content`). Drift audit skips it (no
config plugin). Unrelated red tests: `examples/.codegraph`, stale `packages/crypto/build`.

Progress, blur (`packages/blur`, uncommitted): core `renderBlurView` (View + absolute-fill native
leaf on both platforms) and `renderBlurTargetView` (native on Android, plain View on iOS), all five
adapters tested, tsc and ngc clean, CLI layer, README, docs page, changeset. A multi-view module
needs `expoViewManagerName(module, view)`. `blurTarget` is each adapter's own ref, resolved to a
node and awaited with `whenCommitted` (`watchBlurTarget`), never read as a tag at mount: a Vue or
Svelte commit lands after `mounted`. Shared bridges added for wrappers with children:
`descriptorToVue(d, extra)`, `descriptorToSolid(d, children)`, Svelte `descriptor-host` subpath
component, Angular `DescriptorHost`, `hostNodeOf` (Angular), `hostInstance` in the Svelte
native-view-bridge. A package declares its Expo views once through `defineExpoNativeViews` (engine),
and a Solid wrapper over one render function is `defineDescriptorComponent`. Angular cannot spell
a dynamic tag, so a static native tag
(`BlurTargetView` on Android, `LinearGradient` on iOS) warns via `warnIfViewNameIsDynamic` when
`__expo_app_identifier__` makes the real name differ.

Progress, glass-effect (`packages/glass-effect`, uncommitted): iOS-only native root with children,
plain `View` without the glass props elsewhere, plus `isLiquidGlassAvailable` and
`isGlassEffectAPIAvailable` (cached native constants, false off iOS). All five adapters tested
(60 tests), tsc and ngc clean, CLI layer, README, docs page, changeset. `native-link.json` is
`android.modules: []` because upstream has no Android folder.

Progress, symbols (`packages/symbols`, uncommitted): iOS native `SymbolModule` view, Android and web
glyph from the Material Symbols font (`symbols.json` and the seven weight files copied from
upstream, `./androidWeights/*` subpath), loaded through `@symbiote-native/font`. All five adapters
tested (51 tests), tsc and ngc clean, CLI layer, README, docs page, changeset. `watchSymbolFont` is
the shared load lifecycle. The descriptor shape changes when the font loads (empty View, then a
glyph), which Solid's bridge forbids, so its component rebuilds the node per shape key. The Svelte
`descriptor-host` now renders the whole descriptor tree. No upstream tests exist, the suites are new.

Progress, apple-authentication (`packages/apple-authentication`, uncommitted, the last Tier 3
package): credential flow (`signInAsync`, `refreshAsync`, `signOutAsync`, `getCredentialStateAsync`,
`formatFullName`, `addRevokeListener`) in the shared core over `requireOptionalNativeModule` with a
stub, plus the button (`onPress` goes to the native `onButtonPress`, `null` and a dev warning off
iOS). All five adapters tested (56 tests), tsc and ngc clean, CLI layer, README, docs page,
changeset. The Solid adapter gained `defineOptionalDescriptorComponent` (clipboard and contacts
still carry their own copy of that shape). Tooling this needed: `expo-modules-link` writes
`ios.infoPlistBooleanKeys` and `ios.entitlements` (creates the `.entitlements` file and wires `CODE_SIGN_ENTITLEMENTS` when it is missing),
and the audit takes `ios.upstreamPackage` for iOS-only packages (glass-effect and symbols declare
it too). The lint rule now knows `requireNativeViewManager`, the new `ios` keys, and an iOS-only
manifest is `{"ios": {...}}` with no empty `android` block. The link package was split into
`common`, `ios-plist`, `android-paths`, `android-regions` and `android-manifest` modules.

Order (decided): checkbox, linear-gradient, blur, glass-effect and symbols, apple-authentication.

Tier 4 progress, live-photo (`packages/live-photo`, uncommitted, first of tier 4): `LivePhotoView`
with `startPlayback`/`stopPlayback` on all five adapters (37 tests), CLI layer, README, docs page,
changeset. A native Expo view's functions live on `ViewPrototypes` of its module and native finds
the view by `this.nativeTag`; the engine's `defineExpoViewMethods(requireNativeModule, module, view?)`
does that call, and the core `createLivePhotoViewHandle(getNode)` wraps it. Each adapter only hands
over its host node: React and Vue a function `ref` in the descriptor props, Solid the same through
`spread`, Svelte `bind:this` + `hostInstance`, Angular `DescriptorOutlet.rootNode` + `hostNodeOf`.
The handle is a `ref` in React and Solid, `expose` in Vue, exported functions in Svelte, methods in
Angular.

Tier 4 progress, camera (`packages/camera`, uncommitted): `CameraView` (all view functions through
`createCameraView(getNode)`, which owns the barcode throttle per view), `useCameraPermissions` and
`useMicrophonePermissions` (Angular services), the statics of upstream's class as plain functions
(`isCameraAvailableAsync`, `launchScanner`, ...), `PictureRef`, `scanFromURLAsync`. All five
adapters tested (111 tests), tsc and ngc clean, audit clean, CLI layer, README, docs, changeset.
`createHostNodeHolder` (components) is the shared way React, Vue and Solid reach the host node,
`NativeViewBase.hostNode()` the Angular one. Web files and the `barcodeScannerEnabled` plugin switch
are not ported.

Tier 4 progress, video (`packages/video`, uncommitted): the player is the native `VideoPlayer`
shared object, `useVideoPlayer` / `injectVideoPlayer` over `createVideoPlayerController` (the
engine's new `createJsonKeyedResourceController`, audio uses it too), `VideoView` per platform
(`VideoView` on iOS, `SurfaceVideoView` / `TextureVideoView` on Android, the view functions follow
the surface the last render chose), `VideoAirPlayButton` (plain view off iOS, without the AirPlay
props), thumbnails, cache functions. Shared adapter helpers: `useNativeViewController` (React),
`defineNativeViewComponent` (Vue, Solid), `useNativeViewController` rune (Svelte subpath),
`NativeViewBase.hostNode()` (Angular). Angular inputs come from one `inputs` list plus an
interface merge, `as const satisfies` is not statically evaluable by ngc. `useEvent` and
`useEventListener` are `expo` package exports: ported into every adapter over the engine's
`bindEventListener` (Svelte subpath `runes/use-event`, Angular `injectEvent`), not into video.
The CLI layer's bundles live in `expo-package-manifest-bundles.ts`.
All five adapters tested, tsc and ngc clean.

Tier 4 progress, image (`packages/image`, uncommitted): `Image` through `createImageView(getNode)`
(style split in `native-style.ts`, colors through `processColor` by hand, platform shadow rules,
SF Symbol props, events with payload guards), `ImageBackground` (`renderImageBackground`, a View
with an absolute-fill image), `useImage` / `injectImage` over `createImageRefLoader` (cancel and
`release()` per load), the statics of upstream's class as plain functions (`prefetchImages`,
`loadImageAsync`, ...). Angular selectors are `ExpoImage` / `ExpoImageBackground` because `Image`
and `ImageBackground` are tags of the adapter. React's `descriptorToReactWithChildren` is shared by
`LinearGradient`, `BlurView` and `ImageBackground`. Web files, RSC snapshot tests and the
`expo-observe` hook are not ported. All five adapters tested, tsc and ngc clean, audit clean.

Tier 4 progress, gl (`packages/gl`, uncommitted, last of tier 4): `GLView` (a view wrapping the
native surface, `onContextCreate` gets `global.__EXGLContexts[id]`, which the native module
installs), the statics of upstream's class as functions (`createContextAsync`, `takeSnapshotAsync`,
...), `configureLogging` (prints with `console.warn`, `console.log` is banned by a hook). A
controller may now define `dispose`, which every adapter runs on unmount (React effect cleanup, Vue
`onUnmounted`, Solid `onCleanup`, Svelte `$effect` teardown, Angular `NativeViewBase.disposeView`);
`GLView` uses it to forget its context. No config plugin, no native-link permissions. The package
tsconfig adds the DOM lib for the WebGL types. The hidden `nativeRef_EXPERIMENTAL` prop and web are
not ported. All five adapters tested (55 tests), tsc and ngc clean.
Numbers below are the old ranking, kept for reference.

| # | Package | Kind | Platforms |
|---|---|---|---|
| 49 | `expo-checkbox` | C | no native code (Pressable+Image, 247 JS lines, has `.web`); goes to `core/components`, no package |
| 51 | `expo-linear-gradient` | V | apple, android; 1 view `ExpoLinearGradient`, takes `children`; Android passes `borderRadius` by hand |
| 50 | `expo-blur` | V | apple, android; 2 views `ExpoBlurView` + `ExpoBlurTargetView` (target is Android-only) |
| 53 | `expo-glass-effect` | V | apple only (iOS 26 Liquid Glass); `GlassView` + `GlassContainer` + 2 availability checks |
| 52 | `expo-symbols` | V | apple only (SF Symbols); Android has image sources per weight, no native view |
| 54 | `expo-apple-authentication` | V+M | apple only; 1 view + 5 async functions + config plugin |

Kind `C` = component, goes through `<components_split_logic_view_lifecycle>`, not a wrapper package.

### Tier 4 — view-based, complex (media pipelines, GPU context)

| # | Package | Kind | Platforms |
|---|---|---|---|
| 55 | `expo-image` | V | apple, android |
| 56 | `expo-video` | V | apple, android |
| 57 | `expo-camera` | V | apple, android, web |
| 58 | `expo-live-photo` | V | apple only |
| 59 | `expo-gl` | V | apple, android (raw GL/WebGL context — heaviest item in the queue) |

## Applying this catalog

1. Pick the next package off the queue (or a user-requested one out of order - the queue is a
   default, not a lock).
2. Run `symbiote-new-package-skeleton` to settle the tier (bare-skeleton / core-only / full
   parity) before writing code.
2.5. **Decide legacy vs next per package, from that package's own upstream source - never carry
   over the previous package's scope decision, and never conclude "no JS exists" from a folder
   listing alone.** `git ls-tree -r origin/sdk-57 --name-only` shows the file TREE, not the file
   CONTENT - a thin top-level shim (`export * from './Calendar'`) looks identical in a listing to
   a full implementation. Always read the actual top-level entry file (e.g. `src/Calendar.ts`,
   not just `src/index.ts`) before concluding a surface has no real JS. Default assumption: if
   both a `legacy/` folder and a real top-level implementation file exist, BOTH are real - port
   both, next as the default entry and legacy as a `/legacy` subpath (media-library/file-system/
   contacts/calendar precedent above). Corrected 2026-09-25: an earlier pass wrongly concluded
   `expo-calendar`'s modern surface had no upstream JS (it does - `src/Calendar.ts`, 456 lines,
   a real class implementation) and shipped calendar next-only; the mistake was checking only
   `src/next/index.ts` (a 1-line re-export) instead of the real top-level file. Both packages
   now correctly ship the dual-surface shape - there is no confirmed single-surface precedent in
   this catalog yet; treat "only one real surface" as the rare case, not the default guess.
2.7. **Before hand-porting a package's JS, check for a real `'expo'` value import first** -
   `symbiote-expo-native-module` skill §12. Zero value imports from `'expo'` in the real entry
   file -> depend on the published `expo-<pkg>` directly and re-export it, no hand-port. Any
   value import (`PermissionStatus`, `createPermissionHook`, etc) -> hand-port stays required.
3. Follow `symbiote-expo-native-module` for **M** entries, `symbiote-third-party-native-view`
   for **V** entries.
4. Pin any new native npm dependency via a pnpm catalog entry, not a literal version - see `symbiote-dependency-catalog`.
5. Update this table's tier/row (strike through or move to a "shipped" note) once a package
   lands - keep the queue reflecting reality, not the 2026-07-28 snapshot forever.
6. **Demo screens in `examples/expo-*` style with CSS classes, never `StyleSheet.create`**
   (owner's rule). A wrapper that reads a style value in JS (a radius, a color, `resizeMode`) must
   read it through `styleOfProps(props)` from the engine, not `props.style`, or a class-styled
   value is lost (found with `LinearGradient` on Android). Type-check screens against workspace
   sources with a throwaway `paths` tsconfig, the installed `latest` copies are stale. Event hooks
   cannot infer the event map from a class emitter: name it, `useEvent<IVideoPlayerEvents, 'x'>(...)`.
7. **Demo media and GL loops, found on device (2026-10).** Probe every remote sample URL before
   using it: the Google `gtv-videos-bucket` Big Buck Bunny answers 403, archive.org's
   `BigBuckBunny_124` serves ranges. Animate one GL scene at a time: scenes share the GL thread
   and the iOS simulator renders GLES in software, so two running contexts make each other jerk.
   Use `highp` in animated fragment shaders (iOS `mediump` is fp16) and feed them time counted from
   the first frame. Cap shader scenes at 30 fps, `msaaSamples={0}` for a full-screen shader.
8. Porting demo screens to the other examples: `tests/expo-examples-parity.test.ts` is the red/green list (one case per route x example). Register all routes once per example (routes, navigation-lines, menu, App.css, ExpoViews.css, deps), then add screens. In Vue SFC pass callbacks as `@change` / `@press`, never `:onChange=` / `:onPress=`: Vue binds `@x` to a declared `onX` prop, and a new component declares `defineEmits`.
9. **Angular `[style]="signal()"` on an OnPush view froze the bar (2026-10, `LinearGradient` progress).** Angular writes a `[style]` binding into a component's `style` input through the styling path, which skips `markDirtyIfOnPush` that a plain `[prop]` runs. The label bound with `[value]` moved, the bar bound with `[style]` stayed on its first width. `NativeViewBase` now takes `style` through a plain `@Input` plus an inherited `ngOnChanges` that calls `markForCheck` (an accessor clashed with `declare style` in `ExpoImage`, and a subclass with its own `ngOnChanges` must call `super` first); guard: `linear-gradient.test.ts` "style from a signal". A new OnPush component with its own `style` input needs the same, `KeyboardAvoidingView` and the lists were probed and are fine (host directive). Unverified: a dynamic `[class]` on a `NativeViewBase` view, its class style is read from the anchor at descriptor time.
10. **Never wrap a `checkbox` in a `pressable` in a demo row (2026-10).** upstream `ExpoCheckbox` is itself a `Pressable`; the row `<pressable onPress={onChange(!value)}><checkbox onValueChange/>` toggled twice per tap (nested presses both fire in our engine, stock RN fires only the inner). React/Vue/Angular hid it behind a stale `value`, Svelte and Solid (synchronous props) cancelled the toggle. The row is a plain `<view>` + `<checkbox>` + `<text>` as in expo-checkbox docs. The nested-press divergence itself is an open rn-parity item, no test pins it.
11. **Solid `<Show keyed>` re-keys only a callback that declares a parameter (2026-10).** `solid.js` treats a function child as a render function only when `child.length > 0`; `{() => <GLView/>}` is returned as is, so a changed key never recreates the view and the native surface never fires `onContextCreate` again (the GL effect chips did nothing). Write `{(name: IShaderName) => <GLView onContextCreate={gl => start(gl, name)} />}`. `FilterScenario` keeps the zero-arg form: its key changes once, null to the asset.
12. **A KSP-based native module needs `kspVersion` in the app root (2026-10).** `expo-image`, `expo-app-metrics` (also `expo-observe`, `expo-updates`, not ported) read `rootProject["kspVersion"]`, which Expo's `expo-root-project` plugin defines and our root `build.gradle` does not apply: Android fails with `Could not get unknown property 'kspVersion'`. Set `android.requiresKsp: true` in the package's `native-link.json`; `expo-modules-link` then writes a `KSP` region under `kotlinVersion` in `android/build.gradle`, picking the pair from Expo's `KSPLookup.kt` (`latestKspVersion` from Kotlin 2.3.0), and removes it when no package needs it. It only runs at the app's `postinstall`, so after a package change republish and reinstall the example. Not verified on a device yet.
13. **A vertical `scroll-view` inside a page scroll needs `nestedScrollEnabled` on Android (2026-10).** Without it the inner list ignores the drag, as in stock RN. Demo screens with a fixed-height inner list (`blur-feed`, `image-list`) set it; the engine passes an authored value through untouched.
14. **A host node built inside `buildStructure` must declare `resolvesImageSources` when it is an image (2026-10).** The checkbox checkmark was committed with `source` as `{ uri }` and Android crashed (`ReadableNativeMap cannot be cast to ReadableArray`) while iOS accepted it. The flag is per tag, `image-background-image` repeats it for the same reason.

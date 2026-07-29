---
name: symbiote-expo-package-catalog
description: "Symbiote Expo-package migration catalog — read BEFORE starting work on porting ANY package from .vendors/expo/packages into @symbiote-native/*, and before answering 'what Expo packages are left to migrate' or 'what should we port next'. Holds the full audited inventory of .vendors/expo/packages (116 dirs), the scope filter that separates real migration candidates from CLI/EAS/router/internal-interface noise, the explicit backlog of anomalous packages (sqlite/maps/ui/widgets), and a single complexity+demand-ranked priority queue covering all ~59 remaining candidates. Also documents two 'already covered by RN's own native module, not by Expo' exclusions (expo-linking, expo-status-bar) found by cross-checking core/engine/src and adapters/react/src/modules before assuming an Expo package is net-new work. Trigger on 'migrate Expo package', 'what's the local-auth/sensors precedent for X', 'port expo-<name>', 'Expo package roadmap', or any question about which .vendors/expo package to wrap next."
---

# Symbiote Expo-package migration catalog

Decided 2026-07-28 via `grill-me`, after `local-auth` and `sensors` proved the
`expo-modules-core`-only wrapping recipe (see `symbiote-expo-native-module`) and `slider` proved
the native-view wrapping recipe (see `symbiote-third-party-native-view`). This skill is the
**roadmap only** — no packages beyond `local-auth`/`sensors` are implemented yet. Each future
package still goes through `symbiote-new-package-skeleton` (tier triage) →
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
| `expo-sqlite` | Embeds a whole SQLite engine — own scope, own risk profile, not a thin device-API wrapper |
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
| 11 | `expo-standard-web-crypto` | M | universal (pure-JS polyfill, no native folders) |
| 12 | `expo-localization` | M | apple, android |
| 13 | `expo-keep-awake` | M | apple, android |
| 14 | `expo-screen-orientation` | M | apple, android |
| 15 | `expo-tracking-transparency` | M | apple, android (iOS shows the ATT prompt; Android is a no-op shim) |
| 16 | `expo-store-review` | M | apple, android |
| 17 | `expo-system-ui` | M | apple, android |

### Tier 2 — moderate (permission-gated, multi-step async, or background lifecycle)

| # | Package | Kind | Platforms |
|---|---|---|---|
| 18 | `expo-secure-store` | M | apple, android |
| 19 | `expo-sharing` | M | apple, android |
| 20 | `expo-file-system` | M | apple, android |
| 21 | `expo-font` | M | apple, android, web |
| 22 | `expo-asset` | M | apple, android, web |
| 23 | `expo-web-browser` | M | apple, android |
| 24 | `expo-sms` | M | apple, android |
| 25 | `expo-mail-composer` | M | apple, android |
| 26 | `expo-print` | M | apple, android |
| 27 | `expo-document-picker` | M | apple, android |
| 28 | `expo-image-picker` | M | apple, android |
| 29 | `expo-image-manipulator` | M | apple, android |
| 30 | `expo-video-thumbnails` | M | apple, android |
| 31 | `expo-blob` | M | apple, android, web |
| 32 | `expo-speech` | M | apple, android |
| 33 | `expo-audio` | M | apple, android |
| 34 | `expo-screen-capture` | M | apple, android, web |
| 35 | `expo-contacts` | M | apple, android |
| 36 | `expo-calendar` | M | apple, android |
| 37 | `expo-location` | M | apple, android |
| 38 | `expo-media-library` | M | apple, android |
| 39 | `expo-notifications` | M | apple, android |
| 40 | `expo-task-manager` | M | apple, android |
| 41 | `expo-background-fetch` | M | apple, android |
| 42 | `expo-background-task` | M | apple, android |
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
4. Update this table's tier/row (strike through or move to a "shipped" note) once a package
   lands — keep the queue reflecting reality, not the 2026-07-28 snapshot forever.

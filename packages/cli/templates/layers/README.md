# `templates/layers`

Framework-agnostic optional overlays, applied on top of `native/` + `js/<framework>` by
`--expo-modules` / `--navigation` / `--testing` / `--splash-screen` / `--slider` / one `--<id>`
flag per `EXPO_PACKAGE_LAYERS` entry (`src/expo-package-layers.ts`).

`expo-modules` is dependency-only, same regardless of `--framework` (see `packages/cli/README.md`'s
"Design decisions" section). It carries ONLY the core autolinking bits — `expo` and
`@symbiote-native/expo-modules-link` — never a specific Expo-backed package. Each wrapper has its
OWN `templates/layers/<id>/package.json.fragment.json` (`application`, `battery`, `brightness`,
`cellular`, `clipboard`, `crypto`, `device`, `haptics`, `keep-awake`, `local-auth`,
`localization`, `network`, `screen-orientation`, `secure-store`, `sensors`, `sharing`, `sms`,
`standard-web-crypto`, `store-review`, `system-ui`, `tracking-transparency`, `web-browser`) —
same dependency-only shape as `slider`, registered once in `EXPO_PACKAGE_LAYERS` so cli.ts's
`--<id>` flag, prompts.ts's multiselect option, and `detect-added-layers.ts`'s marker all derive
from that ONE table instead of 21 hand-written near-duplicates. `@symbiote-native/expo-modules-
link` is never a SEPARATE explicit tick once one of these 21 is picked — `resolveFeatures` /
`resolveAddLayers` in `src/prompts.ts` fold `hasExpoModules` to true (or append the `expo-modules`
layer) automatically. The raw npm `expo-linking` package is deliberately NOT added: none of the
real installed `expo-*` `package.json`s depend on it, so nothing in this codebase's dependency
graph needs it.

`navigation` is NOT dependency-only: besides `package.json.fragment.json`
(`@symbiote-native/navigation`, declaring every adapter as an optional peer itself), it carries an
`app/<framework>` subtree — a 2-screen `Stack` demo (Menu → Details) that OVERWRITES the base
`js/<framework>` App file, so `--navigation` demonstrates itself instead of silently doing
nothing visible. `src/generate.ts` renders `app/<framework>` as a separate call from the
package.json merge (see its own comment) — recursively copying the whole `navigation/` directory
would land every framework's `app/` folder on the generated root instead of just the selected
one.

`splash-screen` is the first layer that DOES carry native changes: a `native/`
subtree mirroring `templates/native`'s own layout (`native/android/...`, `native/ios/...`),
overlaid the same way `renderTemplate` already overlays `navigation`'s `app/<framework>` — no
`@expo/config-plugins` needed after all, because only 4 files actually require two variants.
`react-native-bootsplash` (vendored source checked via `/vendor`) has no setup codemod of its own
— its CLI only generates image assets, never touches app source — so both variants are hand-authored
here. The split is narrower than it looks: `MainActivity.kt`'s `RNBootSplash.init(...)` call and
`AppDelegate.swift`'s `RNBootSplash.initWithStoryboard(...)` call are Kotlin/Swift references to
the plugin's public API (hard compile error without the dependency), and `styles.xml`'s
`BootTheme` extends the plugin's own `Theme.BootSplash` (an aapt resource-linking error without
its AAR) — so those 3 files plus the one-line `AndroidManifest.xml` activity theme attribute are
the ONLY things gated. `colors.xml`, the `drawable-*/bootsplash_logo.png` assets,
`BootSplash.storyboard`, `Colors.xcassets`, `Images.xcassets`, `Info.plist`'s
`UILaunchStoryboardName`, and the `.xcodeproj/project.pbxproj` wiring all stay in the BASE
template unconditionally — none of them reference anything from the plugin (the storyboard only
draws from our own asset catalog), so leaving them in place when the option is off just means an
unused-but-harmless launch-screen asset, not a build break.

`testing` is also NOT dependency-only: besides the per-framework
`package.json.fragment.json` (`detox` + `jest` + `ts-jest` + the TypeScript floor, since e2e is a
separate TS project regardless of `--javascript`), it ships `detox.config.js` at the app root and
an `e2e/` directory (`jest.config.js`, `tsconfig.json`, `setup.ts`, `smoke.test.ts`). The fragment
is picked from `fragment/<base|angular>/package.json.fragment.json` — angular's `e2e:build:*`
scripts need an `ngc` pass before Detox builds the native binary, every other framework shares
`fragment/base`. Both live in their OWN subdirectory rather than as
`base.package.json.fragment.json` / `angular.package.json.fragment.json` side by side, because
`renderTemplate`'s package.json merge branch derives the destination filename from the SOURCE
file's own basename, not from the `dest` path passed to it — two source files with different
basenames merging into the same `package.json.fragment.json` silently land as two different
files instead (caught via smoke test: the merged scripts were missing entirely). The one smoke
test (`e2e/smoke.test.ts`) asserts the welcome text renders through Fabric — deliberately generic
so it passes whether or not `--navigation` is also selected (the nav layer's Menu screen renders
the same line).

| Layer | Adds |
|---|---|
| `expo-modules` | `expo` + `@symbiote-native/expo-modules-link` — the core autolinking wiring, no specific Expo-backed package. |
| `application` / `battery` / `brightness` / `cellular` / `clipboard` / `crypto` / `device` / `haptics` / `keep-awake` / `local-auth` / `localization` / `network` / `screen-orientation` / `secure-store` / `sensors` / `sharing` / `sms` / `standard-web-crypto` / `store-review` / `system-ui` / `tracking-transparency` / `web-browser` | Its own `@symbiote-native/<id>` dependency only — same dependency-only shape as `slider`, registered in `EXPO_PACKAGE_LAYERS`. Implies `expo-modules` (see above). |
| `navigation` | `@symbiote-native/navigation` + a per-framework `app/<dir>/App.<ext>` (Stack + Menu/Details screens) overwriting the base App. |
| `testing` | `detox` + `jest`/`ts-jest` + a generic `e2e/smoke.test.ts` + `detox.config.js`, always TypeScript regardless of `--javascript`. |
| `splash-screen` | `@symbiote-native/splash-screen` + the 4 native files (`MainActivity.kt`, `AndroidManifest.xml`, `styles.xml`, `AppDelegate.swift`) that wire `react-native-bootsplash`, plus a JS-side text-splice (`utils/apply-splash-screen-hide.ts`) wiring the framework's own `hide()` call into the App entry — the native side alone would freeze every scaffold on the splash screen forever, since nothing ever tells it to hide. |

Every `@symbiote-native/*` version in every fragment (base and layer) is pinned to `"latest"`,
not a literal semver range — the monorepo's packages publish independently and a hand-copied
literal drifts out of sync with peer requirements almost immediately, producing `npm install
ERESOLVE` failures across unrelated fragments that pinned different literals for the same
package. Third-party dependencies (`react`,
`react-native`, `vue`, `svelte`, `solid-js`, `@angular/*`, `expo`, …) stay pinned as before —
only the `@symbiote-native/*` scope moved to `latest`.

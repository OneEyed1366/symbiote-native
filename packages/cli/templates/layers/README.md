# `templates/layers`

Framework-agnostic optional overlays, applied on top of `native/` + `js/<framework>` by
`--expo-modules` / `--navigation` / `--testing` / `--splash-screen` / `--slider` / `--reanimated`
/ one `--<id>` flag per `EXPO_PACKAGE_LAYERS` entry (`src/expo-package-layers.ts`).

`expo-modules` is dependency-only, same regardless of `--framework` (see `packages/cli/README.md`'s
"Design decisions" section). It carries ONLY the core autolinking bits: `expo` and
`@symbiote-native/expo-modules-link`, never a specific Expo-backed package.

Each Expo-backed wrapper has its OWN `templates/layers/<id>/package.json.fragment.json`
(`application`, `battery`, `brightness`, `cellular`, `clipboard`, `crypto`, `device`, `haptics`,
`keep-awake`, `local-auth`, `localization`, `network`, `screen-orientation`, `secure-store`,
`sensors`, `sharing`, `sms`, `standard-web-crypto`, `store-review`, `system-ui`,
`tracking-transparency`, `web-browser`). It has the same dependency-only shape as `slider`,
registered once in `EXPO_PACKAGE_LAYERS`. So cli.ts's `--<id>` flag, prompts.ts's multiselect
option and `detect-added-layers.ts`'s marker all derive from that ONE table, not from 21
hand-written near-duplicates.

`@symbiote-native/expo-modules-link` is never a SEPARATE explicit tick once one of these is
picked. `resolveFeatures` / `resolveAddLayers` fold `hasExpoModules` to true (or append the
`expo-modules` layer) automatically. The raw npm `expo-linking` package is deliberately NOT added,
as none of the real installed `expo-*` `package.json`s depend on it.

`navigation` is NOT dependency-only: besides `package.json.fragment.json`
(`@symbiote-native/navigation`, declaring every adapter as an optional peer itself), it carries an
`app/<framework>` subtree. That is a 2-screen `Stack` demo (Menu -> Details) that OVERWRITES the
base `js/<framework>` App file, so `--navigation` demonstrates itself instead of silently doing
nothing visible. `src/scaffold-layers.ts` renders `app/<framework>` as a separate call from the
package.json merge. Copying the whole `navigation/` directory would land every framework's `app/`
folder on the generated root instead of just the selected one.

`splash-screen` is the first layer that DOES carry native changes: a `native/` subtree mirroring
`templates/native`'s own layout (`native/android/...`, `native/ios/...`). It is overlaid the same
way `renderTemplate` already overlays `navigation`'s `app/<framework>`. No `@expo/config-plugins`
is needed after all, because only 4 files actually require two variants.

`react-native-bootsplash` has no setup codemod of its own: its CLI only generates image assets and
never touches app source. So both variants are hand-authored here.

The split is narrower than it looks. `MainActivity.kt`'s `RNBootSplash.init(...)` call and
`AppDelegate.swift`'s `RNBootSplash.initWithStoryboard(...)` call are Kotlin/Swift references to
the plugin's public API (a hard compile error without the dependency). `styles.xml`'s `BootTheme`
extends the plugin's own `Theme.BootSplash` (an aapt resource-linking error without its AAR). So
those 3 files plus the one-line `AndroidManifest.xml` activity theme attribute are the ONLY things
gated.

Everything else stays in the BASE template unconditionally: `colors.xml`, the
`drawable-*/bootsplash_logo.png` assets, `BootSplash.storyboard`, `Colors.xcassets`,
`Images.xcassets`, `Info.plist`'s `UILaunchStoryboardName` and the `.xcodeproj/project.pbxproj`
wiring. None of them reference anything from the plugin, as the storyboard only draws from our own
asset catalog. With the option off they are an unused-but-harmless launch-screen asset, not a build
break.

`testing` is also NOT dependency-only: besides the per-framework `package.json.fragment.json`, it
ships `detox.config.js` at the app root and an `e2e/` directory (`jest.config.js`, `tsconfig.json`,
`setup.ts`, `smoke.test.ts`). The fragment holds `detox` + `jest` + `ts-jest` + the TypeScript
floor, since e2e is a separate TS project regardless of `--javascript`. It is picked from
`fragment/<base|angular>/package.json.fragment.json`: angular's `e2e:build:*` scripts need an `ngc`
pass before Detox builds the native binary, and every other framework shares `fragment/base`.

Both fragments live in their OWN subdirectory, not as `base.package.json.fragment.json` /
`angular.package.json.fragment.json` side by side. The reason: `renderTemplate`'s package.json
merge branch derives the destination filename from the SOURCE file's own basename, not from the
`dest` path passed to it. Two source files with different basenames merging into the same
`package.json.fragment.json` silently land as two different files instead (caught via smoke test:
the merged scripts were missing entirely).

The one smoke test (`e2e/smoke.test.ts`) asserts the welcome text renders through Fabric. It is
deliberately generic, so it passes whether or not `--navigation` is also selected (the nav layer's
Menu screen renders the same line).

`reanimated` is dependency-only plus one text splice. The fragment declares
`@symbiote-native/reanimated` with the two native peers the app has to list itself
(`react-native-reanimated` and `react-native-worklets`), pinned. `utils/apply-reanimated-babel-plugin.ts`
then appends `react-native-worklets/plugin` as the last entry of `plugins` in `babel.config.js`,
which is where the plugin has to sit. It reads the list with a small scanner, so a bracket inside a
string or a comment of the list is not mistaken for its end.

| Layer | Adds |
|---|---|
| `expo-modules` | `expo` + `@symbiote-native/expo-modules-link`: the core autolinking wiring, no specific Expo-backed package. |
| `apple-authentication` / `application` / `battery` / `blur` / `brightness` / `cellular` / `clipboard` / `crypto` / `device` / `gl` / `glass-effect` / `haptics` / `image` / `keep-awake` / `linear-gradient` / `live-photo` / `local-auth` / `localization` / `network` / `screen-orientation` / `secure-store` / `sensors` / `sharing` / `sms` / `standard-web-crypto` / `store-review` / `symbols` / `system-ui` / `tracking-transparency` / `web-browser` | Its own `@symbiote-native/<id>` dependency only: same dependency-only shape as `slider`, registered in `EXPO_PACKAGE_LAYERS`. Implies `expo-modules` (see above). |
| `navigation` | `@symbiote-native/navigation` + a per-framework `app/<dir>/App.<ext>` (Stack + Menu/Details screens) overwriting the base App. |
| `testing` | `detox` + `jest`/`ts-jest` + a generic `e2e/smoke.test.ts` + `detox.config.js`, always TypeScript regardless of `--javascript`. |
| `reanimated` | `@symbiote-native/reanimated` + the native peers `react-native-reanimated` and `react-native-worklets` (pinned), plus a text splice (`utils/apply-reanimated-babel-plugin.ts`) that appends `react-native-worklets/plugin` as the last entry of `plugins` in `babel.config.js`. Run `pod install` after. |
| `splash-screen` | `@symbiote-native/splash-screen` + the 4 native files (`MainActivity.kt`, `AndroidManifest.xml`, `styles.xml`, `AppDelegate.swift`) that wire `react-native-bootsplash`, plus a JS-side text splice (`utils/apply-splash-screen-hide.ts`) wiring the framework's own `hide()` call into the App entry. The native side alone would freeze every scaffold on the splash screen forever, since nothing ever tells it to hide. |

Every `@symbiote-native/*` version in every fragment (base and layer) is pinned to `"latest"`, not
a literal semver range. The monorepo's packages publish independently, and a hand-copied literal
drifts out of sync with peer requirements almost immediately. That produces `npm install ERESOLVE`
failures across unrelated fragments that pinned different literals for the same package.

Third-party dependencies (`react`, `react-native`, `vue`, `svelte`, `solid-js`, `@angular/*`,
`expo`, ...) stay pinned as before. Only the `@symbiote-native/*` scope moved to `latest`.

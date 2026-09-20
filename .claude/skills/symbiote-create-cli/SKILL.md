---
name: symbiote-create-cli
description: "Design history and rationale for @symbiote-native/cli (packages/cli) — the new/add app scaffolder. Read BEFORE changing what a layer touches, adding a new layer, or auditing the templates tree for drift. Covers: why 'add' extends an existing symbiote app rather than bootstrapping symbiote into any RN project, why native touches are idempotent text-splices rather than whole-file overlays, the layering model (base + selectable layers, each touching native/js/package.json.fragment together), and the real bugs a systematic examples/* diff found while building this (missing peer deps, missing Info.plist/AndroidManifest permissions, a frozen Podfile.lock crash, unwired splash-screen JS hide() call, per-Expo-package layer explosion). Trigger before touching packages/cli/src/{generate,add-layers}.ts, packages/cli/templates/**, or packages/cli/README.md."
---

# @symbiote-native/cli — design history

## Why `add` extends, not bootstraps

An earlier plan had `add` install `@symbiote-native/<framework>` + `react-native` into an
arbitrary existing RN project. Dropped: a plain RN app has no reason to expect SymbioteNative's
renderer swap, and `new`'s native templates are hand-authored — there's no safe generic way to
retrofit them onto an already-customized native project. `add`'s real job: an app `new` already
scaffolded (or an equivalent hand-built one) picks up more of `new`'s own optional layers later,
the same way `vue add <plugin>` extends a `vue create` project rather than converting a random
app to Vue.

Consequences of that narrower scope:

- **Eligibility guard, not framework detection.** `add` requires a `@symbiote-native/<adapter>`
  dependency (`detectSymbioteFrameworkFromDependencies`, `src/detect-framework.ts`) — narrower
  than `new`'s plain `react`/`vue`/etc. match, which any RN app would pass. Missing →
  `NotSymbioteAppError`, no interactive fallback (every other resolver in `prompts.ts` has one):
  there's no existing symbiote app to extend in any terminal, so asking gains nothing.
- **Never touches user/App source.** `--navigation` in `new` overwrites the App entry with a
  Stack demo; in `add` it only merges the dependency and prints the import snippet in the
  outro — wiring `<Stack>` into a real, already-written App is the developer's call.
- **Native touches are idempotent text-splices, never whole-file overlays.** `new`'s whole-file
  overlay would silently discard whatever a real app's `Info.plist`/`AndroidManifest.xml`
  already has. Each splice checks "is this key already there" before writing, so a repeat
  `add --expo-modules`/`--splash-screen` is a no-op, not a duplicate:
  `apply-expo-modules-manifest.ts` / `apply-expo-modules-plist.ts` (permissions +
  usage-description strings), `apply-splash-screen-manifest.ts` (swaps only the `MainActivity`
  theme, never `<application>`'s), `apply-splash-screen-styles.ts` (inserts the `BootTheme`
  block), `apply-splash-screen-main-activity.ts`/`apply-splash-screen-app-delegate.ts` (insert
  the plugin's init call into an existing `onCreate`/`customize()` override when present, or add
  a whole new one when not — Kotlin/Swift forbid declaring the same override twice, so the shape
  has to be detected). `find-ios-app-dir.ts` locates the real (never `Canary`-named) app dir and
  Kotlin package path, shared by both.
- **`--testing` asks before overwriting** (`detox.config.js`/`e2e/*` are new files, but a re-run
  could clobber customizations) — `resolveAddOverwrite` defaults to skip with no terminal to ask
  in, `--force` bypasses either way.
- **No-flags UX offers only layers `detect-added-layers.ts` doesn't already find a dependency
  marker for** — re-offering an installed layer would either no-op confusingly or, for
  `--testing`, trigger the overwrite confirm for no reason.

## The layering model

A "layer" is a named patch that can touch `native/{ios,android}`, `js/<framework>`, and
`package.json.fragment.json` together — not just the JS side. `renderTemplate` (ported from
create-vue) copies `base` first, then each selected layer on top; `package.json`/`.gitignore`
merge instead of overwrite. v1: `base` + `expo-modules` + `navigation` + `testing` +
`splash-screen` + `slider`, all JS/package.json-only except `splash-screen` (native).

**Every Expo-backed package is its own layer**, not bundled under `--expo-modules`. Bundling all
21 `@symbiote-native/<expo-wrapper>` packages unconditionally meant picking any one always
installed every other one, with no way to scaffold e.g. a battery-only app. Fixed by giving each
package its own dependency-only layer, registered once in `src/expo-package-layers.ts`
(`EXPO_PACKAGE_LAYERS`) rather than 21 hand-written near-duplicates — that one table drives
`cli.ts`'s `--<id>` flag, `prompts.ts`'s multiselect option, and `detect-added-layers.ts`'s
marker generically. `--expo-modules` itself shrank to just the core autolinking bits (`expo` +
`expo-modules-link`) and rides along automatically once any real Expo-backed package is picked —
asking to opt into autolinking a second time would be pointless.

**`--splash-screen`'s native side stays mostly unconditional.** The base `native/` template
already wires `react-native-bootsplash` on both platforms; only 4 files actually reference the
plugin's API (`MainActivity.kt`, `AppDelegate.swift`, `styles.xml`'s `BootTheme`,
`AndroidManifest.xml`'s activity theme) — those are what the layer overlays. Everything else
referencing bootsplash-looking assets (`colors.xml`, drawables, `BootSplash.storyboard`, the
`.xcassets`, `Info.plist`'s `UILaunchStoryboardName`) stays in base unconditionally, since none
of it depends on the plugin being installed. No `@expo/config-plugins`/`.pbxproj` AST surgery
needed at all — verified every native file the layer produces is byte-identical to
`examples/react`'s real one.

**Investigated, not fixed: `RNScreensFragmentFactory`.** `react-native-bootsplash`'s own docs say
Android needs `supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()` before
`RNBootSplash.init(...)` once `react-native-screens >= 4.16.0` is present (ours is pinned to
4.26.0, and `--navigation` always pulls it in) or process-death Fragment reconstruction can
crash. Not wired into the scaffolder because none of the 11 real examples combining
`--navigation` + bootsplash have it either — the scaffolder mirrors real examples, it doesn't
correct them. If this is a real gap, fix it in `examples/*` first.

## Real bugs a systematic `examples/*` diff found

Method: diff a fresh scaffold's file tree / merged `package.json` against the corresponding real
`examples/<framework>` app, root files first, then a deeper recursive pass. This surfaced several
genuine gaps beyond feature work:

- `native/` had no `package.json.fragment.json` at all — every scaffold was missing
  `@react-native-community/cli`, `@symbiote-native/css-parser`, `sass`/`less`/`stylus`,
  `eslint`/`prettier`, `engines`. Fixed with a JS+TS-universal fragment plus a
  `.typescript.`-infixed TS-only one, matching every other TS/JS split in the project.
- `@symbiote-native/android` (the RN host-shim every real example pins unconditionally) was
  missing from all six base `package.json.fragment.json`s.
  `@symbiote-native/engine` (a `peerDependency` of every adapter — npm never auto-installs a
  peer) was missing specifically from react's fragment.
- `--expo-modules` wired the dependency + postinstall linker but never touched
  `ios/Canary/Info.plist` (3 bundled modules need an iOS usage-description string:
  `NSFaceIDUsageDescription`, `NSMotionUsageDescription`, `NSUserTrackingUsageDescription`) nor
  `AndroidManifest.xml` (4 missing `<uses-permission>` + 2 `<application>` backup-control
  attributes `expo-secure-store`'s own config-plugin writes — confirmed by vendoring
  `expo-secure-store` and reading its `withSecureStore.ts`).
- `eslint.config.js` was missing from every template — scaffolds shipped `"lint": "eslint ."`
  with no config, so flat-config's default fell back to only recognized JS extensions and
  reported every file ignored. Fixed with the trivial `@react-native/eslint-config/flat`
  default plus `eslint-plugin-vue`/`eslint-plugin-svelte` overrides where needed. A leftover
  `.eslintrc.js` (extending an undeclared `@react-native` package) in three JS templates was
  dead cruft from before the flat-config migration — deleted.
- `js/angular` was missing `.prettierrc.js` and its own `"lint"` script;
  `js/svelte` was missing `svelte.config.js` (its `fragments: 'tree'` is load-bearing, not a
  preference — read by svelte-check, the editor LSP, and Metro) and the
  `prettier-plugin-svelte` devDependency its own `.prettierrc.js` already referenced.
- `templates/native/ios/Podfile.lock` was checked in — a lockfile is installer OUTPUT, never
  scaffolder input. `applyAppIdentity` renames `Canary` → the real app name inside `Podfile`
  itself, which breaks the lock's `PODFILE CHECKSUM` match and forces a resolve against a
  FROZEN, inconsistent split (Core prebuilt, Dependencies from-source) from whatever machine
  produced it — RN's prebuilt binary hard-links `ReactNativeDependencies.framework`
  unconditionally, so reusing half the frozen split crashed every scaffold at launch with
  `dyld: Library not loaded`. Fixed by removing the checked-in lock entirely — a genuinely
  fresh `pod install` resolves both sides consistently.
- `--splash-screen`'s native wiring alone left the app frozen on the launch screen forever —
  none of the 6 real examples' `hide()` call (invoked once at mount, from each framework's own
  lifecycle hook) was ever added to the scaffolded App. Fixed as a text-splice post-process
  (`apply-splash-screen-hide.ts`) that runs LAST, after any layer/styling overlay that replaces
  the whole App file, anchored on constructs stable across every variant (`export default
  function App()`, `setup() {`, `</script>`) rather than on the styling import line, which
  differs per option.

## `--styling` (css | css-modules | scss | less | stylus | stylesheet)

The App stub's `style={{...}}` never demonstrated the project's real styling story (CSS classes
work in RN) and tripped `react-native/no-inline-styles`. `css` (plain class + external
stylesheet) is the default across all six frameworks; vue-sfc/svelte's `css` default uses an
inline `<style scoped>`/`<style>` block instead (the idiomatic form for those two).

`scss`/`less`/`stylus` are NOT separate template content — for react/vue-tsx/solid/angular,
`applyStyling` just renames `App.css` → `App.<ext>` and rewrites the import string; for
vue-sfc/svelte, both compilers already dispatch a `<style lang="...">` block through the same
preprocessor pipeline a standalone file gets, so the transform is inserting `lang="<option>"`
into the existing tag. (An earlier version swapped in a whole second `external-css` override for
these two, assuming inline preprocessor syntax wasn't supported — checking the compiler sources
first deleted that path along with 4 template folders.) `css-modules` and `stylesheet` are
genuinely different code and get their own `styling/js/<framework>/<option>/` override, applied
after the navigation layer so it wins over the pre-nav base files.

Two bugs found auditing this feature, not by any test: the override folders originally lived
*inside* `templates/js/<framework>/` and the navigation layer's own tree, so `renderTemplate`'s
recursive copy leaked an unused `styling/` folder into every scaffold regardless of which option
was picked — moved to a sibling `templates/styling/{js,navigation}/` tree the base copies never
touch. And `App.module.css` was 12 byte-identical copies of the same 5-line rule (one per
framework × {base, navigation}) — deleted; `applyStyling` now writes the one shared constant
directly next to wherever the App component landed.

## Ported directly from create-vue

`render-template.ts` (recursive copy + `package.json` merge + `.gitignore` append),
`deep-merge.ts`, `sort-dependencies.ts` — proven code, and layer stacking (base + navigation +
expo-modules) needs the same array-dedupe/object-merge semantics. Also ported: post-scaffold
install is printed, never spawned (no child_process call); the git-init suggestion only appears
when the target had no `.git` before scaffolding, and `isEmptyDir` treats a directory holding
only `.git` as empty so scaffolding into an already-`git init`'d folder doesn't trigger the
"empty it?" prompt or risk `rm -rf`-ing history. Confirmed (not adopted): `ng new` auto-runs
`git init`/`npm install` by default — deliberately not followed, stays consistent with this
project's "nothing happens without the user typing it" stance for git/install.

## References

- `packages/cli/README.md` — current usage and package shape.
- `packages/cli/templates/layers/README.md` — full layer list, what each one touches.
- `symbiote-release-publishing` skill — this package's `rolldown`-bundled `bin` is a deliberate
  divergence from every other package's `tsc --build` publish pipeline, not yet reconciled.
- `symbiote-new-package-skeleton` skill — the tiered scope-triage convention this package's
  design conversation borrowed from.

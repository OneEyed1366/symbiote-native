# @symbiote-native/cli

**Status: `new` scaffolds a real app; `add` extends an existing one with all of `new`'s optional
layers** (5 hand-named + one per `EXPO_PACKAGE_LAYERS` entry, 26 total as of 2026-09-18). `new`
copies `templates/native` + `templates/js/<framework>` + any selected optional
layers onto a fresh directory and merges `package.json` — closing the gap the root README's
["Try It In Your Own App"](../../README.md#try-it-in-your-own-app) section currently documents as
a manual process and the `DX` row of the [Milestones table](../../README.md#milestones).

`add` is a DIFFERENT command from what an earlier draft of this package planned (see "Design
decisions" below, 2026-09-17): it does not bootstrap symbiote into a plain RN project. It only
extends an app that already has a `@symbiote-native/<adapter>` dependency with more of `new`'s
optional layers (`--navigation`, `--expo-modules`, `--testing`, `--splash-screen`, `--slider`, or
one `--<id>` flag per Expo-backed package — `--battery`, `--sensors`, … — see `src/expo-package-
layers.ts`), never touching App/user source — native files get idempotent text-splices, not
overlays (see below).

## Usage

```bash
npx @symbiote-native/cli new my-app --framework react
npx @symbiote-native/cli new my-app --framework vue --vue-flavor sfc --navigation --expo-modules --pm pnpm
npx @symbiote-native/cli new my-app --framework solid
npx @symbiote-native/cli new my-app --framework svelte

# inside an existing @symbiote-native/* app:
npx @symbiote-native/cli add --navigation --testing --splash-screen
npx @symbiote-native/cli add   # interactive: offers only layers not already present
```

`npx @symbiote-native/cli <args>` works with no install step: npx fetches the package and, since
it ships exactly one `bin` entry, runs that bin with `<args>` — the same resolution
`npx @angular/cli new` relies on. No `-p`/`--package` flag needed. There is no separate short
command to remember: `@symbiote-native/cli` is the one name for the package and every
invocation, whether or not the package happens to be installed locally.

Any flag left out is asked for interactively via `@clack/prompts`. `--pm` defaults to
whichever package manager launched the process (npm/pnpm/yarn, however it was invoked),
detected from `npm_config_user_agent` — see `src/detect-package-manager.ts`. `--framework` is
one of `react | vue | angular | solid | svelte`; `--vue-flavor tsx|sfc` only applies to Vue
(defaults to `sfc`).

`--javascript` opts out of TypeScript (default on): `render-template.ts` drops every
`tsconfig*.json`/`*.d.ts` file and the framework's `package.json.fragment.typescript.json`
sibling fragment (`typescript`, `@react-native/typescript-config`, `@types/react`, `vue-tsc`).
Angular is the one exception — its AOT pipeline (`ngtsc`) compiles templates as a TypeScript-
compiler extension, so `--javascript` is ignored for it (`resolveTypescript` forces `true`):

| framework       | JS  | TS  |
| ---------------- | --- | --- |
| react            | ✅  | ✅  |
| vue (sfc \| tsx) | ✅  | ✅  |
| solid            | ✅  | ✅  |
| svelte           | ✅  | ✅  |
| angular          | ❌  | ✅  |

`add` detects the framework from a `@symbiote-native/<adapter>` dependency in the current
directory's `package.json` (a DIFFERENT check from `new`'s plain `@angular/core`/`vue`/`svelte`/
`solid-js`/`react` match — see `src/detect-framework.ts`'s `detectSymbioteFrameworkFromDependencies`).
No dependency found → refuses immediately with no interactive fallback, since there is no existing
symbiote app to extend in any terminal. No layer flag given, interactively → offers a multiselect
of only the layers not already present (`src/detect-added-layers.ts`). `--force` skips the confirm
before overwriting an already-generated `--testing` layer's files; without it, a non-interactive
run leaves them untouched rather than clobbering or hanging.

`--navigation` and `--expo-modules` are additive layers, not competing base profiles: every
SymbioteNative app is bare React Native (never managed Expo/EAS). `--expo-modules` layers in
`@symbiote-native/expo-modules-link` autolinking alone (`expo` + `expo-modules-link` — no specific
Expo-backed package, since 2026-09-18); `--navigation` adds
`@symbiote-native/navigation` alone. Every individual Expo-backed package `examples/expo-react`
carries (`application`, `battery`, `sensors`, …) is its own flag now — `--battery`, `--sensors`,
etc. — and picking any one of them implies `--expo-modules`'s wiring without asking for it twice.
See `templates/layers/README.md`.

## Package shape

Mirrors [`create-vue`](https://www.npmjs.com/package/create-vue)'s own toolchain choice: zero
runtime dependencies, bundled to a single dependency-free `bundle.js` at publish time (see
`build.config.ts`). Published **scoped** as `@symbiote-native/cli` (not `create-symbiote`).
`npm create symbiote`'s unscoped-`create-*` shorthand doesn't apply to a scoped package, so the
invocation is always `npx @symbiote-native/cli new ...` (npx resolves the package's one `bin`
entry automatically, same as `npx @angular/cli new` — see `build.config.ts`'s comment on why the
`bin` key itself isn't `@symbiote-native/cli` verbatim). Deliberately **not** documented as a
separate short command: one name (the package's) covers both identity and invocation, nothing
else to remember. Argv parsing is hand-rolled (`src/cli.ts`) rather than a `commander`/`yargs`
dependency, for the same fast-`npx`-cold-start reason create-vue avoids one. It still supports the
conventions those libraries give you for free — `--framework=react` alongside `--framework react`
(git/npm's own `--flag=value` form), "did you mean" suggestions for a typo'd command/flag, and
`--flag=value` on a boolean flag (`--force=false`) rejected loudly rather than silently ignored.

```
src/
  index.ts                    # entry point — argv → subcommand routing, error reporting
  cli.ts                      # hand-rolled argv parser (no dependency)
  prompts.ts                  # @clack/prompts wrappers for every option this CLI resolves
  detect-package-manager.ts   # npm_config_user_agent → npm | pnpm | yarn
  detect-framework.ts         # cwd package.json deps → react | vue | angular | solid | svelte
  template-dir.ts             # (framework, vueFlavor) → templates/js/<dir> name
  get-command.ts              # (pm, 'install'|'dev') → printable shell command
  generate.ts                 # scaffoldApp() — the actual copy/merge orchestration
  add-layers.ts                # addLayersToApp() — extends an EXISTING app with optional layers
  detect-added-layers.ts       # cwd package.json deps -> which optional layers are already present
  errors.ts                   # CliUsageError, NotSymbioteAppError
  utils/
    render-template.ts        # ported from create-vue: recursive copy, package.json merge, .gitignore append
    deep-merge.ts              # ported from create-vue
    sort-dependencies.ts       # ported from create-vue
    json.ts                    # IJsonValue/IJsonObject + isJsonObject guard
  commands/
    new.ts                    # resolves options, calls scaffoldApp(), prints install/dev commands
    add.ts                    # eligibility guard + resolveAddLayers, calls addLayersToApp()
templates/                    # see templates/README.md
build.config.ts               # rolldown config for the bundle.js publish artifact
```

## What's real vs. stubbed

Real: argv parsing, all interactive prompts, package-manager/framework autodetection, the full
`templates/` content (`native/`, `js/{react,vue-tsx,vue-sfc,angular,solid,svelte}`,
`layers/{navigation,expo-modules,testing,splash-screen,slider,<one per EXPO_PACKAGE_LAYERS entry>}`),
`new`'s copy/merge mechanism end-to-end, and `add`'s full extend-an-existing-app path — all 26
layers (`--navigation`/`--expo-modules`/`--testing`/`--splash-screen`/`--slider` + one `--<id>`
flag per Expo-backed package, `src/add-layers.ts`), including `--splash-screen`'s 4 idempotent
native-file text-splices (`MainActivity.kt`/`AppDelegate.swift`/`styles.xml`/`AndroidManifest.xml`)
— verified against real scaffolded-app fixtures.

Not wired in yet either: the root `pnpm run build`/`prepublish-build` pipeline doesn't invoke
this package's `rolldown` build (every other publishable package goes through `tsc --build` +
`fix-esm-extensions`, which this package deliberately does not — see `build.config.ts`).

- **`--styling css|css-modules|scss|less|stylus|stylesheet` (2026-09-17).** The App stub's own
  `style={{...}}` was flagged as a real gap: it never demonstrated the project's actual styling
  story (CSS classes work in RN — see the root README's "Styling" section) and tripped
  `react-native/no-inline-styles` on every fresh react/vue-tsx/solid scaffold. Fixed by making
  `css` (plain class + external stylesheet) the default across all six frameworks, with five more
  selectable code shapes:
  - vue-sfc/svelte's `css` default uses an inline `<style scoped>`/`<style>` block — the idiomatic
    web convention for those two — while react/vue-tsx/solid/angular (no template block to put one
    in) use an external `App.css` + `className`/`class="container"`.
  - `scss`/`less`/`stylus` produce byte-identical output to `css` for the trivial flat rule this
    stub carries, so they are NOT separate template content — `applyStyling`
    (`src/utils/apply-styling.ts`) just renames `App.css` → `App.<ext>` and rewrites the one import
    string. **vue-sfc/svelte take a different path (2026-09-17, no file swap at all):** both
    compilers already dispatch a `<style lang="scss|less|stylus">` block through the same
    preprocessor pipeline a standalone file gets
    (`adapters/vue/metro-vue-transformer.cjs`'s `SFC_STYLE_LANG_TO_PREPROCESSOR`,
    `adapters/svelte/src/preprocessor/scoped-styles.ts`'s `STYLE_LANG_TO_PREPROCESSOR`), confirmed
    live by `core/css-parser/src/svelte-less-style-block.test.ts` — so a preprocessor choice for
    these two is just inserting `lang="<option>"` into the existing inline `<style>` tag in place.
    An earlier version of this feature instead swapped in a whole second `external-css` override
    (external file + class) before renaming, because it assumed inline preprocessor syntax wasn't
    supported — checking first (an `Explore` sub-agent read both compiler sources) deleted 4
    template folders and the swap-then-rename two-step, and is MORE idiomatic besides (an SFC/
    Svelte author reaches for `lang="scss"` on the block they already have, not a second file).
  - `css-modules` and `stylesheet` (StyleSheet.create) are genuinely different code and get their
    own `styling/js/<framework>/<option>/` (+ the navigation layer's own
    `styling/navigation/<framework>/<option>/`) override, applied AFTER the navigation
    layer so it overwrites the final nav-shaped files, not the pre-nav base ones.
  - Angular's `StyleSheet.create({...})` call needs no `as const` on its argument (unlike the bare
    `readonly rootStyle = {...}` shape this project used before) — a value passed through a typed
    function PARAMETER gets that parameter's type as its contextual type, so `alignItems: 'center'`
    checks against the union directly instead of widening to `string`. Verified with a real `ngc`
    build, not assumed.
  - A `renderTemplate` layer picks its destination filename from the SOURCE file's own basename,
    not from the `dest` path passed to it (see the `templates/layers/README.md` note on the
    testing layer for the same gotcha) — every per-framework override folder here is named exactly
    `<option>/`, never a differently-named file merged into a differently-named dest.
  - **These overrides originally lived at `templates/js/<framework>/styling/` and
    `templates/layers/navigation/app/<framework>/styling/` — a real bug (2026-09-17), found
    while auditing the feature for unnecessary code, not by any test.** `renderTemplate` recursively
    copies a source directory verbatim; nesting the override folders *inside* the tree the base
    `js/<framework>` and navigation-layer renders already copy meant every single scaffolded app —
    for every styling choice, `css` included — shipped a leaked `styling/` folder at its root
    containing all six frameworks' unused override variants. None of the matrix/install/lint/`ngc`
    verification below caught it, because none of those checks assert on the generated file *tree*,
    only on whether known files build and lint clean — an orphaned, never-imported file passes all
    of them silently. Moved to a sibling `templates/styling/{js,navigation}/<framework>/<option>/`
    tree that the base copies never touch; re-verified across the full 72-combination matrix with
    an explicit "no `styling/` dir at the scaffolded root" assertion.
  - **`App.module.css` was 12 byte-identical copies of the same 5-line rule** — one per
    framework × {base, navigation}. Deleted the template files; `applyStyling` now writes the one
    shared constant directly next to wherever the App component landed, found by walking the
    scaffolded tree for an `App.{tsx,jsx,ts,vue,svelte}` file. CSS content carries no per-framework
    idiom the way component code does, so unlike the JS/TS-pair duplication noted elsewhere in this
    file, this one was pure copy-paste with nothing to keep independent. (The `external-css`
    override this bullet used to also cite for vue-sfc/svelte no longer exists at all — see the
    `lang` attribute note above.)
  - Verified: the full 6-framework × 6-styling × {base, navigation} = 72-combination matrix
    scaffolds without error and leaves no leaked `styling/` directory in any combination; a
    representative sample (react × css/css-modules/stylesheet/scss, vue-sfc × scss/css-modules
    with navigation, svelte × stylus with navigation, solid × css-modules with navigation, angular
    × stylesheet/css-modules with navigation) passes a REAL `npm install` + `npm run lint`, and the
    two angular and one vue-sfc-scss-with-navigation combinations additionally pass a real
    type-check (`ngc`/`vue-tsc`).

## Design decisions (2026-09-15)

- **templates/ vs examples/\*: independent fork, not a sync target.** `examples/*` is the dev
  canary; `templates/` starts as a copy but diverges and gets patched directly as needed. No
  CI drift check — deliberate, not an oversight. (One apparent drift turned out to be correct
  as-is: `templates/js/react/babel.config.js` lacks the `allowDeclareFields` override that
  `examples/react/babel.config.js` has, but that override exists solely for
  `ContextProviderDemo.tsx`'s `declare context` field — a demo file the template deliberately
  doesn't ship. No demo, no need for the override. Worth the reminder that a config diff against
  `examples/*` isn't automatically a bug — check what the diff is actually *for* first.)
- **Layering, not one verbatim copy per framework.** A "layer" is a named patch that can touch
  `native/{ios,android}`, `js/<framework>`, and `package.json.fragment.json` together — not
  just the JS side. `renderTemplate` (ported from create-vue) copies `base` first, then each
  selected layer on top; `package.json`/`.gitignore` merge instead of overwrite.
- **v1 layers: `base` + `expo-modules` + `navigation` + `testing` + `splash-screen` + `slider`.**
  All JS/package.json-only except `splash-screen` (native changes, see below).
- **`--slider` (2026-09-17, real gap): the one package outside the `expo-modules` bundle with zero
  scaffolder wiring, despite being a real dependency of every example** (`examples/react`,
  `vue-sfc`, `vue-tsx`, `angular`, `svelte`, `solid`). Unlike `--splash-screen` it needs no
  `native/` overlay at all: `@symbiote-native/slider` autolinks itself via its own
  `react-native.config.cjs` + `symbiote-slider.podspec` (see `packages/slider/README.md`), so the
  "necessary native side" the scaffolder owns is just the dependency declaration —
  `layers/slider/package.json.fragment.json`. `npm install` + the developer's own `pod install`
  do the rest.
- **`@symbiote-native/android` (2026-09-17, real bug, unconditional).** Every framework's real
  example pins this Android host-shim (re-provides RN host signals — keyboard events, … — that
  SymbioteNative's Fabric surface bypasses; `packages/android/package.json`'s own description) as
  a plain dependency, no feature flag involved. None of the six `js/<framework>/
  package.json.fragment.json` base fragments declared it — every scaffolded app was missing a
  base runtime dependency its Android build needs. Fixed directly in all six base fragments, not
  behind an option: unlike `--slider`/`--splash-screen` this isn't optional in any example.
- **`--expo-modules` was also missing its Info.plist half (2026-09-17, real bug).** The layer
  wired the package.json fragment + postinstall linker (see above) but never touched
  `ios/Canary/Info.plist` — three of its bundled modules need an iOS usage-description string or
  the OS rejects the call outright (`NSFaceIDUsageDescription` for local-auth,
  `NSMotionUsageDescription` for sensors, `NSUserTrackingUsageDescription` for
  tracking-transparency), App Store review included. Fixed by overlaying
  `layers/expo-modules/ios/Canary/Info.plist` — copied from `examples/expo-react`'s real one, the
  only checked-in expo-* example with a native iOS project.
- **`--expo-modules`'s Android half had the same gap (2026-09-17, real bug).** 4 missing
  `<uses-permission>` (local-auth's biometric prompt, brightness's `setSystemBrightnessAsync`,
  cellular's carrier lookups all fail on Android without them) plus 2 `<application>` backup-
  control attributes expo-secure-store's own Android config-plugin writes unconditionally
  (verified via `/vendor`-ing `expo-secure-store` and reading `plugin/src/withSecureStore.ts` —
  also confirmed the `@xml/secure_store_*` resources it points at ship inside expo-secure-store's
  OWN Android library module and resolve through Gradle's cross-module resource merge, so the
  reference example's manifest reference isn't broken despite no local `res/xml/` copy). Fixed as
  a text-splice POST-process (`utils/apply-expo-modules-manifest.ts`), not a third
  `AndroidManifest.xml` overlay: `--expo-modules` renders before `--splash-screen`, and
  `renderTemplate` overwrites rather than merges — a competing overlay would silently lose
  whichever layer wrote last (BootTheme vs. the permissions). The splice runs after both layers,
  so it works regardless of which manifest variant ended up on disk.
- **`@symbiote-native/engine` was missing from react's fragment specifically (2026-09-17, real
  bug).** It's a `peerDependency` of every adapter identically (npm never auto-installs a peer —
  the app must declare it directly, same convention as `react-native` itself per CLAUDE.md's
  `<react_native_is_an_explicit_top_level_peer>`); `vue-sfc`/`vue-tsx`/`angular`/`solid`/`svelte`
  already had it, only `js/react/package.json.fragment.json` didn't. Found by diffing a full
  scaffold's dependency set against `examples/react`'s real `package.json` — the same audit that
  found `--slider` and `@symbiote-native/android`.
- **`--splash-screen` (2026-09-17) is the first layer with native changes, and a real bug it
  fixed: every scaffolded app's `native/` template already wired `react-native-bootsplash`
  unconditionally (`MainActivity.kt`/`AppDelegate.swift` call its init API, `styles.xml` extends
  its `Theme.BootSplash`) but never added `@symbiote-native/splash-screen` as a dependency — so
  every fresh scaffold failed to compile natively on both platforms. Fixed by making it optional
  instead of mandatory: the base template ships WITHOUT the plugin wired (compiles clean with
  nothing installed), and `--splash-screen` overlays the 4 files that actually need the
  dependency to compile. Everything else that references bootsplash-looking assets
  (`colors.xml`, the drawables, `BootSplash.storyboard`, the `.xcassets`, `Info.plist`'s
  `UILaunchStoryboardName`, the `.xcodeproj`) stays in the base template unconditionally, because
  none of it actually depends on the plugin being installed — see `templates/layers/README.md`
  for the exact file-by-file split and why.
- **`--splash-screen` never wired the JS side, and the native side alone means the app never
  starts (2026-09-17, real bug, found by cross-checking every real example's App entry).** All 6
  real examples call `hide()` once, at mount, from the framework's own lifecycle hook
  (`examples/react`'s `useEffect`, `.../vue-sfc`'s `onMounted`, `.../angular`'s `ngOnInit`,
  `.../solid`'s `onMount`, `.../svelte`'s bare top-level call — svelte needs no wrapper, its
  script body already runs once at component init) — react-native-bootsplash's native splash
  screen never hides itself. Without this, a scaffolded `--splash-screen` app compiles and installs
  fine but the user never sees anything past the launch screen: the app is frozen there forever.
  Fixed as a text-splice post-process (`utils/apply-splash-screen-hide.ts`), same shape as the
  `AndroidManifest.xml` splice above and for the same reason: `--navigation`'s own `app/<framework>`
  overlay and `--styling`'s `css-modules`/`stylesheet` overlay BOTH already overwrite the whole App
  file, so this has to run last, against whatever's actually on disk, not as a `js/` layer overlay.
  Verified against all 6 frameworks × with/without `--navigation` × `css-modules`/`stylesheet`
  styling — the splice never depends on the CSS import line (it differs per styling option), only
  on anchors proven stable across every variant (`export default function App() {`, `setup() {`,
  `</script>`), and a merge-or-insert helper for each framework's own lifecycle import so it never
  emits a duplicate `import { useState } from 'react'`-shaped line.
- **Investigated (not fixed) — `RNScreensFragmentFactory` wiring, found via `/vendor`-ing
  `react-native-bootsplash@7.3.2` itself.** Its own README documents THREE Android `MainActivity`
  variants gated on the installed `react-native-screens` version; ours matches the "without
  react-native-screens" one, but `react-native-screens` is pinned to `4.26.0` (`pnpm-workspace.
  yaml`) and IS present the moment `--navigation` is selected (`@symbiote-native/navigation` is
  built on its `RNSScreen`/`RNSScreenStack` primitives) — past the documented `>= v4.16.0`
  threshold, where upstream says `MainActivity.onCreate` must also set
  `supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()` before calling
  `RNBootSplash.init(...)`, or Android can crash reconstructing a screens `Fragment` after
  process death. Web-search (2026-09-17) confirmed the version threshold is current, not stale
  advice. **Not wired into the scaffolder**, because it isn't wired into any of the 11 real
  examples that combine `--navigation` + bootsplash either (`grep -rl RNScreensFragmentFactory
  examples --include='*.kt'` — zero hits) — adding it here would make a fresh scaffold diverge
  from every real reference app, the opposite of this whole audit's method. If this is a real gap,
  it belongs in the examples first; the scaffolder mirrors them, it doesn't correct them.
- **`native/` was missing its own `package.json.fragment.json` entirely (2026-09-17, real bug).**
  Every scaffolded app inherited zero baseline RN devDependencies — no
  `@react-native-community/cli` (so `npm run ios`/`android` couldn't even resolve the CLI),
  no `@symbiote-native/css-parser`, no `sass`/`less`/`stylus`, no `eslint`/`prettier`, no
  `engines`. Fixed with `native/package.json.fragment.json` (JS+TS universal) +
  `native/package.json.fragment.typescript.json` (the `typescript`/`@types/*`/
  `@react-native/typescript-config` floor, via the same `.typescript.` infix every other
  TS/JS split in this project uses). Verified against `examples/*`'s real `package.json`s —
  a scaffolded app's merged devDependencies now match byte-for-byte (module names/versions).
- **`--testing` adds Detox e2e, not unit tests.** `vitest`/`@symbiote-native/test-utils` unit-test
  setup is only genuinely real in `examples/vue-tsx` (one real test, `vue-fragment.test.ts`) —
  `examples/react` has the `vitest` devDependency and `"test"` script but no actual unit test file
  yet, and `examples/vue-sfc`, `examples/svelte`, `examples/angular` have neither. Inconsistent
  and, in react's case, incomplete upstream, so none of it is cloned into the scaffolder yet
  (would need per-framework unit-test authoring, not just config copying). Both examples were also
  missing a local `vitest.config.ts`: with no `exclude`, a standalone `npm test` picks up
  `e2e/*.test.ts` under vitest's own default include glob and crashes on Detox's `device`/
  `element`/`by` (only wired up by Detox's own on-device runner) — fixed directly in both
  examples, independent of the scaffolder question.
  `detox` + a generic smoke test IS consistent across every non-Solid example and is dependency +
  config only, so it shipped first. Tracked as a follow-up, not silently dropped.
- **SUPERSEDED — the entry above (`--splash-screen` "is deferred, not in v1") described a plan
  that was abandoned before it shipped, and shipping made the whole concern moot.** The original
  worry was that `.pbxproj`/`Info.plist`/`AndroidManifest.xml`/`colors.xml`/`styles.xml` would all
  need a real with/without-BootSplash variant generated via `@expo/config-plugins` + `xcode`
  AST surgery. It turned out none of that needs two variants: `.pbxproj`, `Info.plist`,
  `BootSplash.storyboard`, `colors.xml` and the drawables reference only OUR OWN asset catalog,
  never the plugin, so they stay in the base template unconditionally and are harmless when the
  option is off. Only 4 files actually reference the plugin's API/resources
  (`MainActivity.kt`, `AppDelegate.swift`, `styles.xml`'s `BootTheme`, `AndroidManifest.xml`'s
  activity theme attribute) — those are exactly what `--splash-screen` overlays. No `.pbxproj`
  mutation, no `@expo/config-plugins` dependency, ever needed. Verified end-to-end (2026-09-17):
  every native file the layer produces is byte-identical to `examples/react`'s real one, and
  cross-framework coverage confirms the overlay is genuinely framework-agnostic.
- **`eslint.config.js` was missing from every template entirely (2026-09-17) — this IS the
  "File ignored because of a matching ignore pattern" bug flagged earlier and left unresolved.**
  Every scaffold shipped `"lint": "eslint ."` + `eslint` as a devDependency but no config file at
  all, so ESLint fell back to its flat-config default (only recognized JS-like extensions) and
  reported every source file ignored. Fixed with `native/eslint.config.js` (the trivial
  `@react-native/eslint-config/flat` default react/vue-tsx/angular/solid all use verbatim) plus
  framework-specific overrides in `js/vue-sfc` and `js/svelte` (they need `eslint-plugin-vue` /
  `eslint-plugin-svelte` + `@typescript-eslint/parser` wired in for `.vue`/`.svelte` files) — same
  native-default-plus-per-framework-override shape as the earlier `.typescript.` infix split, just
  at the layer level. Verified with a REAL `npm install` + `npm run lint`, both frameworks, zero
  errors, zero "ignored" warnings.
- **Investigated unit-test (vitest) scaffolding and found nothing real to clone.**
  `examples/react`/`examples/vue-tsx` carry `vitest` + `@symbiote-native/test-utils` as
  dependencies and a `"test": "vitest run"` script, but zero `*.test.ts` files outside `e2e/` and
  no `vitest.config.*` — the unit-test setup is vestigial in the reference examples themselves,
  and `@symbiote-native/test-utils` isn't even a package that exists in this monorepo
  (`packages/test-utils` doesn't exist). Nothing to scaffold from; not cloning dead config.
- **Confirmed (not adopted) — Angular CLI's `ng new` auto-runs `git init` AND `npm install` by
  default** (`--skip-git`/`--skip-install` opt out), the opposite of create-vue's suggest-only
  convention this project already follows. Deliberately NOT adopted — stays consistent with the
  project's own "nothing happens without the user typing it" stance for git/install, which was
  chosen before this comparison and this only confirms it was the right call.
- **Three more real gaps found by a systematic `comm` diff of every example's root files against
  the merged template output (2026-09-17), same method that found the eslint bug above.**
  `js/angular` was missing `.prettierrc.js` entirely (the same trivial default react/vue-tsx/
  vue-sfc/solid already ship) AND its own `"lint": "eslint ."` script — `npm run lint` errored
  "Missing script" on every angular scaffold. `js/svelte` was missing `svelte.config.js` (its own
  header calls `fragments: 'tree'` "mandatory, not a preference" — read by svelte-check, the
  editor's language server, and Metro) and the `prettier-plugin-svelte` devDependency its own
  `.prettierrc.js` already referenced (`plugins: ['prettier-plugin-svelte']` with the package never
  installed). All three fixed and verified with real `npm install` + `npm run lint`/`prettier
  --check`. Files intentionally NOT cloned in this same sweep: `App.css`/`fabric-call-counter.ts`/
  `navigation-lines.ts`/`navigation-linking.ts`/`routes.ts`/`tunnel-demo.ts`/`*.test.ts` (canary
  benchmark/demo-specific, not starter concerns) and `.cdp-console-probe.mjs` (a manual Chrome
  DevTools Protocol debugging script, not app config).
- **Deep recursive audit (2026-09-17, not just root files) against `examples/{vue-tsx,angular}`
  found one more real cleanup and confirmed no further real gaps.** `js/{react,vue-sfc,vue-tsx}`
  each carried a stale legacy `.eslintrc.js` (`extends: '@react-native'` — a package that isn't
  even a declared dependency anymore) left over from before the project's flat-config migration;
  deleted as dead/misleading now that `eslint.config.js` is real. Confirmed working: ESLint 8.57
  picks flat config over a stray `.eslintrc.js` automatically, so this was never a functional bug,
  just confusing cruft. Everything else the recursive diff surfaced (`assets/bootsplash/*`,
  `components/*`, `screens/*` beyond Menu/Details, `*.test.ts`) is canary-demo content, already
  out of scope by the same reasoning as the root-file audit above.
- **The App stub's inline `style={{ ... }}` (flagged above as trip-hazard for
  `react-native/no-inline-styles`) is fixed, not just noted — see `--styling` below**, which
  replaced every inline style object with the framework's real styling convention.
- **Git-init suggestion, borrowed from create-vue (2026-09-17).** create-vue never runs `git init`
  itself — it only prints `git init && git add -A && git commit -m "initial commit"` in the outro,
  and only when the target directory had no `.git` before scaffolding
  (`dotGitDirectoryState.hasDotGitDirectory`, set by its `canSkipEmptying`). Ported the same two
  pieces: `isEmptyDir` now treats a directory holding only `.git` as empty (so scaffolding into an
  already-`git init`'d empty folder no longer triggers the "empty it?" prompt and can't `rm -rf`
  the user's git history), and `runNew`'s outro prints the same suggested command when
  `<root>/.git` doesn't exist after scaffolding — never runs it automatically, matching this
  project's own "nothing happens without the user typing it" convention for git operations.
- **Solid and Svelte added as `js/` templates**, alongside the original four
  (react/vue-tsx/vue-sfc/angular) — both are full milestone-complete adapters and had no
  reason to be missing.
- **`package.json` merge ports create-vue's `deepMerge` + `sortDependencies` verbatim** (see
  `src/utils/`) rather than a from-scratch merge — proven code, and layering (base + navigation
  + expo-modules stacking) needs the same array-dedupe/object-merge semantics.
- **Post-scaffold install is printed, not spawned** — matches create-vue's `outro` behavior.
  No child_process install call; the CLI prints `cd`/install/dev commands and stops.
- **Priority: `new` before `add`.** `new` has no existing `package.json` to merge into;
  `add`'s retrofit-into-existing-project path comes after the copy/merge mechanism is proven.
- **`add`'s purpose changed from "bootstrap symbiote into any RN app" to "extend an existing
  @symbiote-native/* app" (2026-09-17).** The earlier plan (see the now-superseded `TODO(symbiote)`
  this replaced in `src/commands/add.ts`'s git history) was to install `@symbiote-native/<framework>`
  + `react-native` into an arbitrary existing RN project. Dropped: a plain RN app has no reason to
  expect SymbioteNative's renderer swap, and `new`'s own native templates are hand-authored — there
  is no safe, generic way to retrofit them onto a real project's already-customized native files
  without a real risk of breaking it. The new, narrower job: an app `new` already scaffolded (or an
  equivalent hand-built one) picks up more of `new`'s OWN optional layers later, the same way
  `vue add <plugin>` extends a `vue create` project rather than converting a random app to Vue.
  - **Eligibility guard, not framework detection.** `add` requires a `@symbiote-native/<adapter>`
    dependency (`detectSymbioteFrameworkFromDependencies`, `src/detect-framework.ts`) — a
    different, narrower check than `new`'s plain `react`/`vue`/etc. match, which any RN app would
    pass. Missing → `NotSymbioteAppError`, no interactive fallback (unlike every other resolver in
    `prompts.ts`): there is no existing symbiote app to extend in ANY terminal, so nothing is
    gained by asking.
  - **Never touches user/App source.** `--navigation` in `new` overwrites the App entry with a
    Stack demo; in `add` it only merges the `@symbiote-native/navigation` dependency and prints the
    import snippet in the outro — wiring the `<Stack>` into a real, already-written App is the
    developer's own call, `add` doesn't know what else lives in that file.
  - **Native touches are idempotent text-splices, never whole-file overlays.** `--expo-modules` is
    the one v1 layer with native files: `apply-expo-modules-manifest.ts` was made idempotent (a
    second pass used to duplicate the permissions block — it matched its own previously-inserted
    anchor line) and reused as-is; a new `apply-expo-modules-plist.ts` does the iOS half, since
    `new`'s whole-file `Info.plist` overlay would silently discard whatever a real app's Info.plist
    already had. Both check "is this key already there" before writing, so a repeat `add
    --expo-modules` (or one running against an app that got the same permissions another way)
    is a no-op, not a duplicate.
  - **`--splash-screen` landed as a follow-up pass the same day, once `--expo-modules` proved the
    idempotent-splice shape.** Same treatment, 4 native files instead of 2:
    `apply-splash-screen-manifest.ts` swaps only `<activity android:name=".MainActivity">`'s theme
    to `BootTheme` (never the `<application>` theme), `apply-splash-screen-styles.ts` inserts the
    `BootTheme` style block, and `apply-splash-screen-main-activity.ts`/
    `apply-splash-screen-app-delegate.ts` insert the plugin's init call into an EXISTING
    `onCreate`/`customize()` override when the real app already has one, or add a whole new one
    when it doesn't — Kotlin/Swift don't allow declaring the same override twice, so which shape
    the real file is in has to be detected, not assumed. `findIosAppDir`/the Kotlin package walk
    locate the real (never `Canary`-named) app dir and MainActivity package path, factored into
    `find-ios-app-dir.ts` once `apply-expo-modules-plist.ts` needed the same iOS lookup. Same as
    `--navigation`, the JS-side `hide()` call is never spliced into App source — `add`'s outro
    prints the exact per-framework snippet instead
    (`SPLASH_SCREEN_HIDE_SNIPPET`, `src/commands/add.ts`).
  - **`--testing` asks before overwriting.** `detox.config.js`/`e2e/*` are new files, not user
    App source, but a re-run of `add --testing` could clobber customizations made since the first
    run — `resolveAddOverwrite` (`prompts.ts`) confirms interactively, defaults to SKIP (not
    overwrite) when there's no terminal to ask in, and `--force` bypasses the ask either way.
  - **No-flags UX mirrors `new`'s `resolveFeatures` multiselect**, but offers only layers
    `detect-added-layers.ts` doesn't already find a dependency marker for — re-offering an
    installed layer would either no-op confusingly or, for `--testing`, trigger the overwrite
    confirm for no reason.
- **Removed the checked-in `templates/native/ios/Podfile.lock` (2026-09-18, real device bug).** A
  lockfile is dependency-installer OUTPUT, never scaffolder input — shipping one anyway caused a
  real `dyld: Library not loaded: @rpath/ReactNativeDependencies.framework` crash at app launch,
  no red-box, no build error. Mechanism: `applyAppIdentity` text-renames `Canary` -> the real app
  name INSIDE `Podfile` itself (extension-less files are in its rewrite set); RN's own
  `react_native_pods.rb` gates BOTH `React-Core-prebuilt` and the separate `ReactNativeDependencies`
  pod behind independent Maven-artifact-availability checks, and `pod install` trusts an existing
  `Podfile.lock` only while its `PODFILE CHECKSUM` (a SHA1 of `Podfile`'s own text) still matches —
  the rename breaks that match, forcing a fresh resolve. The shipped lock had frozen an
  INCONSISTENT split from whatever environment originally produced it (Core resolved prebuilt,
  Dependencies resolved from-source) — React's prebuilt binary hard-links
  `@rpath/ReactNativeDependencies.framework` unconditionally, so the moment a real fresh install
  reused half of that frozen split, the framework it needed was never fetched. Fix verified
  on-device: with the lock removed, a genuinely fresh `pod install` resolves BOTH sides
  consistently (this device: both from-source, logged as `[ReactNativeCore] Building from source:
  true` / `[ReactNativeDependencies] Building from source: true`) — no `React-Core-prebuilt` in
  the mix at all, so no split to be inconsistent. No Podfile env-var workaround needed; the lock
  was the whole bug.
- **Every Expo-backed package split into its own selectable layer (2026-09-18, real gap).**
  `--expo-modules` used to bundle all 21 `@symbiote-native/<expo-wrapper>` packages
  unconditionally (`application`, `battery`, `brightness`, …) — picking it, or picking any ONE of
  our packages from `packages/*`, always installed every other one too, with no way to scaffold
  e.g. a battery-only app. Fixed by giving each package its OWN dependency-only layer (same shape
  as `--slider`), registered ONCE in `src/expo-package-layers.ts` (`EXPO_PACKAGE_LAYERS`) rather
  than 21 hand-written near-duplicates — that one table drives cli.ts's `--<id>` flag, prompts.ts's
  multiselect option, and `detect-added-layers.ts`'s marker generically. `expo-modules` itself
  shrank to just the core autolinking bits (`expo` + `expo-modules-link`): it doesn't make sense to
  ask a developer to opt into autolinking a second time once they've picked a real Expo-backed
  package, so it rides along automatically — `resolveFeatures` (`new`) folds `hasExpoModules` to
  `true`, and `resolveAddLayers` (`add`) appends the `expo-modules` layer, in both cases without a
  second explicit tick. (A same-day follow-up also added the raw npm `expo-linking` package
  unconditionally, on the unverified assumption that Expo's wrapper modules need it for autolinking
  — reverted once checking the real installed `expo-battery`/`expo-web-browser`/`expo-sharing`/
  `expo-store-review`/`expo-local-authentication`/`expo`/`expo-modules-autolinking` `package.json`s
  showed none of them depend on it.)

## References

- Root [`README.md`](../../README.md) — the `DX` milestone row and the "Try It In Your Own App"
  section this package replaces.
- `symbiote-release-publishing` skill — how every other package's publish pipeline works;
  this package's `rolldown`-bundled `bin` is a deliberate divergence from it, not yet
  reconciled with the shared CI gate.
- `symbiote-new-package-skeleton` skill — the tiered scope-triage convention this package's
  own design conversation borrowed from, adapted for a CLI tool rather than a runtime library.

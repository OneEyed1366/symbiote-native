# `templates/js/vue-sfc`

The Vue-**SFC** (`.vue` Single File Component) flavor of the per-framework JS overlay. Sourced
verbatim from `examples/vue-sfc/` (root-level files only — its `ios/`/`android/` are already
covered by the shared `templates/native/{ios,android}` shell).

Vue has a second, divergent flavor — `templates/js/vue-tsx/` — sourced from `examples/vue-tsx/`
by a separate pass. The two are not interchangeable: SFC compiles `.vue` files through a
dedicated Metro transformer (see below); TSX has no such file and no such transformer to wire.

## What was copied, and why each file belongs in the seam

Every file below would be identical (or safely near-identical) in any new SymbioteNative
Vue-SFC app, regardless of what screens the app author writes — that's the bar for "part of the
scaffold seam" vs. "the example's own demo content."

| File | Why it's part of the seam |
|---|---|
| `index.js` | The entry point: `createApp(App).mount(appName)` via `@symbiote-native/vue/bootstrap`. Only `App` and `appName` are app-specific, and both are already externalized as imports — the file itself doesn't change per app. |
| `metro.config.js` | Wires the `.vue` SFC transformer (see the dedicated section below) and registers `vue`/`css`/`scss`/`sass`/`less`/`styl` as Metro source extensions. The one genuinely SFC-specific piece of tooling in this list. |
| `babel.config.js` | `@react-native/babel-preset` + an `inline-debug-flag` plugin that bakes `process.env.DEBUG` into the bundle at build time (the project-wide `dlog`/`isDebug` gate). Framework-agnostic, identical across all three adapters' examples. |
| `tsconfig.json` | Extends `@react-native/typescript-config`, registers the `@symbiote-native/css-parser/typescript-plugin` language-service plugin, and includes `**/*.vue` in the type-checked file set. |
| `tsconfig.typecheck.json` | The `vue-tsc --noEmit` entry point used by the `typecheck` script — widens `types` back to `["node"]` (the app tsconfig strips it) and excludes `e2e/` (type-checked separately via `ts-jest`/jest globals). |
| `app.json` | `{ name, displayName }` — RN's own app manifest. **Not parameterized in this pass** (see below). |
| `css.d.ts` | Ambient `declare module '*.css'` / a generic `*.module.css` fallback type, for a `.module.css` import that has no generated per-file `.d.ts` yet (see `css-dts` below). Mirrors `examples/react/css.d.ts` and `examples/angular/css.d.ts` verbatim in spirit. |
| `vue-runtime-core.d.ts` | Re-exports `'vue'` from `'@vue/runtime-core'` — the app's actual runtime dependency is `@vue/runtime-core` (lighter, no `runtime-dom`), but SFC `<script>` blocks idiomatically `import { ref } from 'vue'`; this ambient module bridges the two without a real `vue` runtime dependency. |
| `.eslintrc.js` | `{ root: true, extends: '@react-native' }` — the stock RN lint config, no SFC/Vue-specific rule. |
| `.prettierrc.js` | Formatting only (`arrowParens`, `singleQuote`, `trailingComma`) — project-wide convention, not app content. |
| `.watchmanconfig` | Empty `{}` — Metro/Watchman boilerplate every RN app ships. |
| `.gitignore` | Stock RN app gitignore (Xcode/Gradle build artifacts, `node_modules`, CocoaPods, Metro health-check files, etc.). |

## The `.vue` Metro transformer — the one SFC-specific piece

`metro.config.js` points `transformer.babelTransformerPath` at
`@symbiote-native/vue/metro-vue-transformer` — a subpath the `@symbiote-native/vue` package ships
itself (`adapters/vue/metro-vue-transformer.cjs`), so **no local transformer file needs to be
authored or copied** into this template; requiring it by package subpath is the entire wiring.
This one function does three things on the way into the bundle:

1. Compiles every `.vue` SFC (`@vue/compiler-sfc`'s `compileScript`/`compileTemplate`) into a
   plain JS module the Vue adapter's renderer can mount.
2. Reads each SFC's `<style>`/`<style scoped>`/`<style module>` block (via
   `descriptor.styles`, not a hand-rolled regex extractor) and compiles it at build time into a
   `registerStyles({...})` call prepended to the module — the same runtime style registry every
   adapter shares (`core/engine/src/style-registry`).
3. Also handles standalone `.css`/`.scss`/`.sass`/`.less`/`.styl` files reached via the
   `resolver.sourceExts` list (Vue's transformer is the one file in this app that has to
   disambiguate SFC-inline styles from standalone stylesheet imports, since Metro allows only
   one `babelTransformerPath`).

Full mechanism — `scoped` class suffixing, `:global()`, CSS Modules, the preprocessor layer —
is documented in the `symbiote-sfc-style-compiler` skill; not re-derived here.

**Why `@symbiote-native/css-parser` is a devDependency of the app but the Metro transformer
doesn't need it directly**: `@symbiote-native/css-parser` is a regular `dependency` of the
`@symbiote-native/vue` package itself (confirmed in `adapters/vue/package.json`) — the transformer
above resolves it from there, not from this app's own `node_modules`. The app needs its own copy
only for **TypeScript tooling that runs outside Metro entirely**: the
`@symbiote-native/css-parser/typescript-plugin` entry in `tsconfig.json`'s `compilerOptions.plugins`
(live in-editor `.module.css` autocomplete) and the `css-dts` CLI wired as this app's
`pretypecheck` script (on-disk `.d.ts` generation, the `tsc`/CI-time source of truth for
`.module.css` typo-catching) — both are plugins/binaries a project depends on directly by
convention, never routed through a UI-framework package. Verified by reading the real import
statements in `metro.config.js` and the adapter's own `package.json`, not guessed.

## What was deliberately excluded

- **App-authored content** (explicitly out of scope per the task): `App.vue`, `App.css`,
  `components/`, `screens/`, `navigation-lines.ts`, `navigation-linking.ts`, `routes.ts`,
  `e2e/`, `assets/`, `package-lock.json`.
- **`Gemfile`** — CocoaPods/Ruby dependency pinning for the iOS native build. This is native
  tooling, not a JS-level concern, and belongs (if anywhere) alongside `Podfile`/`Podfile.lock`
  in `templates/native/ios/` — a directory this pass was explicitly told not to touch.
  `templates/native/ios/` currently has no `Gemfile` either; that's a native-template gap outside
  this pass's scope, not something to route around by stashing it here.
  <br>*(judgment call — the task listed this as one of the borderline files to decide.)*
- **`detox.config.js`** — its `testRunner.args.config` points at `e2e/jest.config.js`, and
  `e2e/` is explicitly excluded app content, so copying it verbatim would ship a config that
  points at a folder that doesn't exist in the scaffold. It also hardcodes the demo app's Xcode
  scheme/workspace name (`Canary`) throughout its build paths — the same parameterization gap
  called out for `app.json` below, but deeper (baked into multiple shell command strings, not one
  JSON field), so it can't be "left literal for now" the same low-risk way `app.json` can. Real
  e2e scaffolding for generated apps is follow-up work, once `e2e/`'s own template shape is
  decided.
  <br>*(judgment call — the task listed this as one of the borderline files to decide.)*

## `package.json.fragment.json`

A dependency **fragment**, not a full `package.json` (this folder is not itself an npm package —
`new`'s generation logic will splice this into the generated app's real `package.json` once
implemented). Versions pulled verbatim from `examples/vue-sfc/package.json`, the real working
app:

- **`dependencies`**: `@symbiote-native/vue`, `@symbiote-native/engine`, `@vue/runtime-core`,
  `react`, `react-native`. `@symbiote-native/engine` is included beyond the task's literal
  starter list because it's a real `peerDependency` of `@symbiote-native/vue`
  (`adapters/vue/package.json`) — omitting it would ship a scaffold with an unmet peer dep.
  `@vue/runtime-core` and `react`/`react-native` are the runtime-singleton pins (same class as
  the root `CLAUDE.md`'s `react_native_is_an_explicit_top_level_peer` invariant — one copy,
  declared at the app root, Metro's version anchor).
- **`devDependencies`**: `vue` (types/tooling only — `vue-tsc` and the `vue-runtime-core.d.ts`
  bridge; the actual runtime import is `@vue/runtime-core`), `vue-tsc` (the `typecheck` script),
  `@symbiote-native/css-parser` (the TS plugin + `css-dts`, see above).

Deliberately **not** included, despite appearing in `examples/vue-sfc/package.json`:
`@symbiote-native/android`, `@symbiote-native/components`, `@symbiote-native/navigation`,
`@symbiote-native/slider`, `@symbiote-native/splash-screen` — these are optional feature
packages the example app's demo screens happen to showcase (navigation, a slider, a splash
screen, Android host-shim modules), not part of the minimal bootstrap seam every app needs. An
app that wants them installs them itself (or via a future `@symbiote-native/cli add`), same as any
other opt-in `@symbiote-native/*` package.

## Known gaps, carried forward honestly

- **No app-name/bundle-id parameterization yet.** `app.json`'s `name`/`displayName` fields are
  still the literal `"Canary"` example value, copied verbatim as instructed. Templating
  (`ejs`-based, per `templates/README.md`) is real follow-up work for `new.ts`'s actual
  generation logic — `new`/`add` both still throw `NotImplementedCommandError` as of this pass.
- **No TSX-vs-SFC selection yet.** `@symbiote-native/cli new --framework vue` currently has no flag
  or prompt to choose between this template and `templates/js/vue-tsx/` — both exist as real,
  divergent precedents, but the selection UX (a `--variant`/`--sfc` flag? an interactive prompt
  when `--framework vue` is given with no further qualifier?) hasn't been designed. This is
  flagged in the `symbiote-create-cli` skill as a known open gap, not silently defaulted to
  either flavor.

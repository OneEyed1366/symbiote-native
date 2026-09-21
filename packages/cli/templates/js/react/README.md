# `templates/js/react`

The React JS-level overlay for `@symbiote-native/cli new --framework react`. Combined at generation
time with `templates/native/{ios,android}` (the framework-agnostic native shell, shared by
every framework) to produce a full bare React Native app. Source of truth for every file here:
`examples/react` — the reference React canary — root-level files only (its `ios/`/`android/`
are covered by `templates/native`, not this folder).

## What was copied, and why each belongs in the seam

Every file below is bootstrap/tooling: identical (or safe-to-reuse-verbatim) in any new
SymbioteNative React app, regardless of what screens/components the app author writes.

| File | Why it's part of the seam |
|---|---|
| `index.js` | The RN entry point. Calls `registerApp(App, { appName })` from `@symbiote-native/react/bootstrap`, which wires the native-host seams (colors, images, device events, third-party ViewConfigs) before mounting — every generated app needs this exact wiring, only `App` and `appName` vary. |
| `metro.config.js` | Wires `@symbiote-native/react/metro-css-parser` as Metro's `babelTransformerPath` (so `.css`/`.scss`/`.sass`/`.less`/`.styl` imports compile) and extends `resolver.sourceExts` accordingly. Framework-agnostic mechanism, React-specific only in which adapter package's transformer it points at. |
| `babel.config.js` | `@react-native/babel-preset` plus a small custom plugin that inlines `process.env.DEBUG` at bundle time, so `DEBUG=1` diagnostic logging (`dlog`/`isDebug` from `@symbiote-native/engine`) can be toggled without a runtime dependency. Generic to every SymbioteNative app. |
| `tsconfig.json` | Extends `@react-native/typescript-config` and registers `@symbiote-native/css-parser/typescript-plugin` for live per-file CSS-module typing in the editor. No app-specific paths. |
| `app.json` | RN's app registry name (`name`/`displayName`). Copied verbatim — see the parameterization note below. |
| `css.d.ts` | Ambient module declarations for `*.css` (side-effect import) and the generic `*.module.css` fallback typing. Needed by any app that imports CSS, regardless of what the CSS contains. |
| `.eslintrc.js` | `extends: '@react-native'` — the standard RN lint baseline, no app-specific rules. |
| `.prettierrc.js` | Formatting preferences (`arrowParens`, `singleQuote`, `trailingComma`) — a project-wide style choice, not app content. |
| `.watchmanconfig` | Empty `{}` — Watchman's marker file, identical in every RN project. |
| `.gitignore` | Standard RN ignore rules (Xcode/Gradle build artifacts, CocoaPods, node_modules, Detox artifacts, etc.) — applies at the generated app's root, which is where both this overlay and `templates/native` land, so it still earns its place here even though some entries (`ios/build/`, `.gradle`) cover the native tree. |
| `package.json.fragment.json` | Not from `examples/react` directly — see below. |

## What was deliberately excluded, and why

- **App content**: `App.tsx`, `App.css`, `components/`, `screens/`, `navigation-lines.ts`,
  `navigation-linking.ts`, `routes.ts`, `assets/` — the example's own demo screens/components,
  not part of the scaffold seam. A generated app needs its own `App` from scratch (or a future
  minimal starter, out of scope for this pass).
- **`e2e/`** — the example's own Detox test journeys (`canary-journeys.test.ts`,
  `probe.test.ts`), written against the example's specific screens/navigation. Not applicable
  to a freshly generated app with no screens yet.
- **`package-lock.json`** — a lockfile is generated fresh by whichever package manager
  `@symbiote-native/cli new --pm <pm>` runs, never copied.
- **`README.md`** (the example's own) — documents the *example app*'s specific run/test
  instructions (mentions "Canary" by name, the shared-native-shell caveat between the three
  React/Vue examples). Not generic bootstrap content; a generated app gets its own README from
  a future `generate.ts`, not this one verbatim.

## Judgment calls on borderline files

- **`Gemfile` / `Gemfile.lock`** — excluded. These pin CocoaPods/Ruby gem versions for iOS
  builds, which makes them native-tooling config, not JS-level config — closer in kind to
  `templates/native/ios/Podfile`/`Podfile.lock` (which already live in the native shell) than
  to anything in this folder. `templates/native/ios` doesn't currently have a `Gemfile` either,
  which looks like a real gap for the native shell to close in its own pass — flagging it here
  rather than silently copying it into `templates/js/react` (wrong tree) or into
  `templates/native` (out of scope for this task, which was scoped to `templates/js/react`
  only).
- **`detox.config.js`** — excluded. It's e2e test infrastructure, symmetric with excluding
  `e2e/` itself (the config is useless without the test files it points at via
  `testRunner.args.config: 'e2e/jest.config.js'`). It also hardcodes the literal app name/scheme
  ("Canary", `ios/Canary.xcworkspace`) the same way `app.json` does — another argument for
  treating e2e wiring as a later, parameterization-aware addition rather than a verbatim copy
  now.
- **`app.json`** — copied, but **not parameterized**. Its `name`/`displayName` are still the
  literal `"Canary"` values from `examples/react`. Inventing a placeholder/templating scheme
  (e.g. `ejs` variables) is explicitly out of scope for this pass — that's real follow-up work
  for `@symbiote-native/cli new`'s actual generation logic, which as of this pass is still stubbed
  with `NotImplementedCommandError` in `src/commands/new.ts`/`src/commands/add.ts`. When that
  lands, `app.json`'s `name` (and the matching native-side bundle id / scheme) needs to be
  rewritten per-app, not left as this example's value.

## `package.json.fragment.json`

A dependency **fragment**, not a full `package.json` — this folder isn't itself an npm
package. Lists only the dependencies a generated React app's `package.json` needs to run the
files above, pulled from `examples/react/package.json`'s exact (real, working) version ranges:

```json
{
  "dependencies": {
    "@symbiote-native/react": "^0.2.8",
    "react": "19.2.3",
    "react-native": "0.86.0"
  },
  "devDependencies": {
    "@react-native/babel-preset": "0.86.0",
    "@react-native/metro-config": "0.86.0"
  }
}
```

Derivation: `@symbiote-native/react`, `react`, `react-native` per the task brief (the
SymbioteNative React runtime plus its two peer-dependency anchors — see
`<react_native_is_an_explicit_top_level_peer>` in the root `CLAUDE.md`); `@react-native/babel-
preset` because `babel.config.js` names it in its `presets` array; `@react-native/metro-config`
because `metro.config.js` `require()`s it directly.

**Not included, on purpose** (scoped out by the task brief, which limited the "actually
import/require" check to `index.js`/`metro.config.js`/`babel.config.js`): `tsconfig.json` also
needs `@react-native/typescript-config` (its `extends`) and `@symbiote-native/css-parser` (its
`plugins` entry), and `.eslintrc.js` needs `@react-native/eslint-config` (its `extends:
'@react-native'` shorthand) plus `eslint` itself. A real generated `package.json` will need
those too — flagging them here rather than silently expanding this fragment beyond what was
asked, since the actual merge logic (and whether it lives in this fragment or a separate
devDependencies-only fragment) is a `generate.ts` design decision, not this pass's call to
make.

## No app-name/bundle-id parameterization yet

Worth repeating on its own: nothing in this folder is templated. `app.json`'s `name` field is
the literal `"Canary"` example value, unchanged. Turning this into a real generator — choosing
a templating mechanism (the package README's own notes point at `ejs`, matching `create-vue`'s
toolchain, but that's not decided or installed yet), parameterizing `app.json`, and wiring the
native-side app name/bundle id to match — is real follow-up work for `@symbiote-native/cli new`'s
generation logic, which is still stubbed with `NotImplementedCommandError` as of this pass.

## Precedent

`examples/react` (bare) / `examples/expo-react` (what `--expo-modules` adds on top — not yet
reflected in this folder, since `--expo-modules` overlay content wasn't part of this pass).

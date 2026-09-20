# templates/js/vue-tsx

Per-framework JS-level overlay for a Vue-**TSX**-flavored generated app (`.tsx` + JSX,
`@vue/babel-plugin-jsx` — as opposed to `templates/js/vue-sfc`'s `.vue` single-file-component
flavor). Combined at generation time with the shared `templates/native/{ios,android}` shell.
Source: `examples/vue-tsx/` (root-level files only — its `ios/`/`android/` are already covered
by the shared native template).

## Copied files

Every file below is bootstrap/tooling/config: identical (or safe-to-reuse-verbatim) in any new
SymbioteNative Vue-TSX app, regardless of what screens the app author writes on top.

| File | Why it belongs in the seam |
|---|---|
| `index.js` | Entry point — `createApp(App).mount(appName)` via `@symbiote-native/vue/bootstrap`. Wires the native-host seam + RN's `AppRegistry`; every generated app needs this exact boilerplate (only `App` and `app.json`'s `name` vary, and both are supplied separately). |
| `metro.config.js` | Metro config. **Vue-TSX-specific**, not a copy of React's: sets `babelTransformerPath` to `@symbiote-native/vue/metro-css-parser` (not React's `@symbiote-native/react/metro-css-parser`), and adds a `resolver.extraNodeModules` alias mapping the bare `vue` specifier to this app's installed `@vue/runtime-core` — needed because `@vue/babel-plugin-jsx`'s generated helper imports say `from 'vue'`, but the app never installs the `vue` runtime package itself (see the dependency fragment below). |
| `babel.config.js` | **The file with the real TSX-vs-SFC-specific wiring** — see the dedicated section below. |
| `tsconfig.json` | Extends `@react-native/typescript-config`, adds the `@symbiote-native/css-parser/typescript-plugin` TS-server plugin (per-file `.module.css` literal-key typing in the editor). Same shape React/Angular use, just with the plugin swapped in. |
| `tsconfig.typecheck.json` | **Vue-TSX-specific.** A separate `vue-tsc` typecheck config with `jsx: "preserve"` and a `jsxFactory` pointed at a namespace (`VueJsx.createElement`) neither Vue nor React ever populate, purely to make TS's JSX-type-resolution algorithm fall through to the global `JSX` namespace declared in `vue-jsx.d.ts` (see that file's own comment for the exact TS-internal reason `declare global { namespace JSX {...} }` alone doesn't work). A `.vue`-SFC app has no equivalent file — the SFC compiler doesn't do JSX attribute excess-property checking the way TSX does. |
| `app.json` | RN app metadata (`name`, `displayName`). **Not parameterized** — see the explicit note below. |
| `css.d.ts` | Ambient module declarations for `*.css` (side-effect import) and the generic `*.module.css` fallback (before a real per-file generated `.d.ts` exists). Identical shape to `examples/react/css.d.ts` / `examples/angular/css.d.ts`. |
| `vue-jsx.d.ts` | **Vue-TSX-specific.** Declares the `VueJsx.JSX` namespace `tsconfig.typecheck.json`'s `jsxFactory` points at — `Element`, `ElementClass`, `ElementAttributesProperty`, and (load-bearing) an `IntrinsicAttributes` index signature, because several adapter components (`SafeAreaView`, `StatusBar`, `ActivityIndicator`, `Animated.*`) declare no `props` schema and forward everything through Vue's untyped `$attrs` fallthrough — without the index signature, TSX's excess-property check on those components would false-positive on every extra prop, whereas `.vue` SFCs never hit this at all (their template compiler doesn't excess-property-check against JSX's `IntrinsicAttributes`). |
| `vue-runtime-core.d.ts` | `declare module 'vue' { export * from '@vue/runtime-core' }` — makes the bare `'vue'` import specifier type-check even though the app only installs `@vue/runtime-core`, mirroring `metro.config.js`'s resolver alias at the type level. |
| `.eslintrc.js` | `extends: '@react-native'` — same base RN lint config every framework's overlay needs. |
| `.prettierrc.js` | Standard formatting (`arrowParens: 'avoid'`, `singleQuote: true`, `trailingComma: 'all'`) — framework-independent. |
| `.watchmanconfig` | Empty `{}` — Metro/Watchman boilerplate every RN app needs, framework-independent. |
| `.gitignore` | Standard RN `.gitignore` (Xcode/Gradle/CocoaPods/node_modules/Metro health-check files) — framework-independent. |

## The Vue-TSX-specific Babel/Metro wiring (read this before touching either file)

Compared against `examples/react/babel.config.js`, Vue TSX needs real JSX-pragma rewiring, not
just RN's stock preset:

- **Plugin order is load-bearing.** `babel.config.js`'s `plugins` array lists
  `'@vue/babel-plugin-jsx'` FIRST. Babel runs `plugins` before `presets`, so the Vue plugin
  rewrites every `JSXElement` into a `@vue/runtime-core` `createVNode()` call *before* the RN
  preset's own React-JSX transform (pulled in via `presets: ['module:@react-native/babel-preset']`)
  ever sees the file — by the time the React transform runs, there is no JSX left for it to
  touch, so it silently no-ops. Reordering these would leave Vue JSX compiled as React
  `createElement()` calls, which the Vue runtime cannot mount.
- **`stripReactJsxDevAttrs` is a real correctness fix, not cleanup.** The RN preset's dev
  React-JSX transform injects `__self={this}` / `__source={...}` dev annotations on every
  `JSXElement`; under React those are inert, but `@vue/babel-plugin-jsx` copies them verbatim
  into the Vue vnode's `props`. At module scope `this` is the Hermes global `HostObject`, so any
  Vue dev warning that tries to format that prop reads `Symbol.toStringTag` off the
  `HostObject`, throws, and unwinds the whole mount into a blank screen. This plugin strips both
  attributes on `JSXOpeningElement` exit (after the self/source plugins add them on enter, before
  the Vue plugin reads attributes on the parent `JSXElement`'s exit).
- **`inlineDebugFlag`** is the same `DEBUG` env-var inlining every framework's `babel.config.js`
  carries (see `<keep_logs_gate_behind_DEBUG>` in the root `CLAUDE.md`) — not TSX-specific, just
  present here too.
- **`metro.config.js`'s `vue` → `@vue/runtime-core` alias is the resolver-level twin of the
  Babel plugin order above**: the Vue plugin's generated helper imports say `from 'vue'`, but
  this app never installs the `vue` runtime package as a dependency (only `@vue/runtime-core` —
  see the dependency fragment). Without the alias, Metro would fail to resolve those bare `vue`
  imports at bundle time.

## Deliberately excluded

- `App.tsx`, `App.css`, `components/`, `screens/`, `navigation-lines.ts`,
  `navigation-linking.ts`, `routes.ts`, `assets/`, `e2e/`, `package-lock.json` — the example
  app's own demo content, per the task scope. Not part of the scaffold seam.
- `package.json` (the full file) — not copied; only the dependency fragment below is.
- **`Gemfile`** — byte-identical to `examples/react/Gemfile` (verified via `diff`). It's Ruby/
  CocoaPods toolchain config for the iOS build, framework-independent — conceptually it belongs
  with the *shared* native shell (`templates/native/ios/`, which already has `Podfile`/
  `Podfile.lock` but no `Gemfile`), not duplicated verbatim into every per-framework JS overlay.
  Since this pass is scoped to `templates/js/vue-tsx/` only and must not touch `templates/
  native/`, it's left out here — flagging it as a real gap for whoever wires the native+overlay
  merge in `generate.ts` to close (add `Gemfile` to the shared native template once, not to
  four JS overlays).
- **`detox.config.js`** — its `testRunner` points at `e2e/jest.config.js`, and its `binaryPath`/
  `build` fields hardcode the app scheme (`Canary.xcworkspace`, `Canary.app`). Since `e2e/` is
  excluded as app-authored test content, copying this file alone would ship a dead config with
  no tests to run and no generic way to point it at a not-yet-generated app's real scheme name.
  E2E scaffolding is a separate concern from this pass.
- **`vue-fragment.test.ts`** — a regression test for SymbioteNative's own Vue-adapter engine
  internals (Fragment start/end anchor handling under the fake-Fabric test harness), ported from
  a headless smoke test elsewhere in the monorepo. It verifies the *framework*, not something a
  newly generated app needs; it isn't app code.
- **`tunnel-demo.ts`** — a `createTunnel()` demo singleton consumed only by the excluded
  `screens/CanaryScreen.tsx`'s "Show toast" demo button. App-authored demo content, same
  category as `App.tsx`.

## `package.json.fragment.json`

A dependency **fragment**, not a full `package.json` (this folder isn't an npm package itself).
Lists only the SymbioteNative-relevant `dependencies`/`devDependencies` a generated app's real
`package.json` needs, derived from what `index.js`, `metro.config.js`, `babel.config.js`,
`tsconfig.json`, and `tsconfig.typecheck.json` actually import/require/extend — not guessed.
Versions are pulled verbatim from `examples/vue-tsx/package.json`. Notably: the runtime
dependency is `@vue/runtime-core` (not the `vue` meta-package — see the Babel/Metro section
above for why), and `react-reconciler` is intentionally absent since it's the React adapter's
own driving mechanism, unused by Vue.

## Not yet parameterized

`app.json`'s `name`/`displayName` fields (`"Canary"`) are copied **literally**, as-is, from the
example app — no placeholder or templating scheme has been introduced. That's real follow-up
work for `@symbiote-native/cli new`'s actual generation logic, which still throws
`NotImplementedCommandError` as of this pass (see `packages/cli/README.md`'s
"What's real vs. stubbed" section).

## TSX vs SFC selection is not wired up yet

`@symbiote-native/cli new --framework vue` currently has no flag or prompt to choose between this
TSX overlay and `templates/js/vue-sfc`'s SFC flavor — both exist on disk, but nothing in
`src/commands/new.ts` or `src/prompts.ts` asks the user which one they want yet. Designing that
flag/prompt (and its default) is separate follow-up work, out of scope for this pass.

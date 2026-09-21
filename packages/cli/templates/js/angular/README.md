# `templates/js/angular`

Per-framework JS-level overlay for a generated Angular app, populated from `examples/angular`
(the real, working Angular canary) — see `../../README.md` for the overall templates layout and
the `angular-adapter-build` skill for why Angular's build pipeline looks like this.

## What was copied, and why

| File | Why it belongs in the seam |
|---|---|
| `index.js` | The bootstrap entry every Angular app needs verbatim: `bootstrapApplication(AppComponent, { appName })` imported from `@symbiote-native/angular/bootstrap`. It imports `./build/angular/src/App` and `./app.json`'s `name` — both paths hold regardless of what `AppComponent` itself renders, so this file needs zero changes per-app. |
| `metro.config.js` | Wires the two things every Angular app needs from Metro: `@symbiote-native/angular/metro-css-parser` as the CSS transformer, and `withSymbioteAngularMetroConfig` (the ngc-outDir resolveRequest + sourceExts). Framework-agnostic beyond that — identical regardless of app content. |
| `babel.config.js` | The two Angular-specific Babel plugins every app needs in this exact order: `@symbiote-native/angular/babel-register-composed` (must run before the linker) then `@symbiote-native/angular/babel-linker` (Stage B of AOT — turns ngc's partial-Ivy output into full Ivy before Hermes sees it), plus the standard `DEBUG` env-flag inliner shared with the other framework templates. |
| `tsconfig.json` | The editor/tsserver-facing config (DOM lib for `@angular/core`'s ambient types, the `@symbiote-native/css-parser` TS plugin) — mirrors the real AOT build config so IDE diagnostics match `ngc`'s. |
| `tsconfig.angular.json` | The actual `ngc` build config: `angularCompilerOptions.basePath: "src"` (the EMFILE fix — see `angular-adapter-build` skill §3a, `ngc --watch`'s chokidar recurses `basePath` and would otherwise hit `ios/`/`android/` as watch-root siblings), `outDir: "build/angular"`, and `"files": ["src/App.ts", "src/css.d.ts"]`. This is why the JS source tree below is nested under `src/` rather than flat like the React/Vue templates. |
| `app.json` | `{ name, displayName }` read by `index.js`. Copied verbatim from the example — see the parameterization note below. |
| `.watchmanconfig` | Empty `{}`, but Watchman needs the file present to establish a watch root. Identical for every app. |
| `.gitignore` | Standard bare-RN-app ignore list (Xcode/Gradle build output, CocoaPods, Metro health-check files, coverage, Yarn PnP). Same for every framework — the React template already carries an equivalent copy for the same reason (`native/` itself ships no `.gitignore`). |
| `src/css.d.ts` | Ambient module declarations for `import './X.css'` and `.module.css` — pure TypeScript scaffolding with no app-specific content (`declare module '*.css'` / the generic `.module.css` fallback typed via `Record<string, string>`). Lives under `src/` (not flat, unlike the React template's `css.d.ts`) because `tsconfig.angular.json`'s `files` array names `src/css.d.ts` explicitly — the nesting is structural, not a style choice. |

## What was deliberately excluded, and the `src/` split judgment call

Not copied, and why:

- **`src/App.ts` + `src/App.css`** — the app's root component: the `Stack`/`ScreenDirective`
  navigator wiring, every screen import, header options per route, splash-screen `hide()` call.
  This is app-authored content a real app replaces entirely with its own root component (the
  `generate.ts` implementation will need to emit a minimal placeholder `App.ts`, not this one).
- **`src/components/*` and `src/screens/*`** — the canary's demo surface (ActivityIndicator/
  Switch/ScrollView/Animated/ResponderDemo/etc. sections, the menu + tour screens). Entirely
  demo content, zero bootstrap value.
- **`src/navigation-lines.ts`, `src/navigation-linking.ts`, `src/routes.ts`,
  `src/components/event-utils.ts`** — demo-specific navigation config (route name constants,
  deep-linking config, a color palette for the tour) and a shared event-formatting helper used
  only by the demo screens.
- **`e2e/`, `assets/`, `package-lock.json`** — per the task brief: Detox e2e specs are
  app-specific test content, `assets/` holds demo images, and a lockfile is never templated
  (the generated app gets a fresh install).

**The `src/` judgment call**: `examples/angular`'s root has no `App.ts`-equivalent — unlike
React/Vue's flat `App.tsx` at the app root, Angular's whole source tree (moved 2026-07-14,
documented in `angular-adapter-build` skill §3a) lives under `src/` specifically to keep
`ngc --watch`'s recursive chokidar watch (rooted at `angularCompilerOptions.basePath`) away from
`ios/`/`android/`'s tens of thousands of files as watch-root siblings. That makes the split
mechanical rather than a judgment call for most of `src/`: everything in it is either (a) the
demo screens/components tree (excluded, app-authored) or (b) `css.d.ts`, a file with zero
app-specific content that happens to sit in `src/` only because the build config's `basePath`
fix requires the whole compiled tree to live there. `css.d.ts` is the one file that's
"bootstrap despite being under `src/`," which is why it's called out explicitly in the table
above rather than assumed excluded along with the rest of the directory.

## `package.json.fragment.json`

A dependency **fragment** (not a full `package.json` — this directory isn't an npm package
itself) listing only the SymbioteNative + Angular packages a generated app's `package.json`
needs, plus the npm scripts `ngc`/Metro wiring requires. Versions pulled verbatim from
`examples/angular/package.json`'s real, working set:

- **`dependencies`**: `@symbiote-native/angular` (the adapter) and `@symbiote-native/engine`
  (its `peerDependencies` require `@symbiote-native/engine >=0.1.7` explicitly, same as
  `react-native >=0.86` — see `<react_native_is_an_explicit_top_level_peer>` in the root
  `CLAUDE.md`: a peer dependency of the adapter must be an explicit top-level dependency of the
  consuming app, not left to transitive resolution), `@angular/core`/`@angular/common`/
  `@angular/compiler` (the example pins all three as direct `dependencies`, not just `core`),
  `react-native`, and `react` (a `react-native` peer requirement regardless of JS framework).
- **`devDependencies`**: `@angular/compiler-cli` (ships the `ngc` binary the `ng:build` script
  calls — declared explicitly rather than relied on as a transitive dependency of
  `@symbiote-native/angular`, matching what the real example does) and `@babel/core` pinned to
  `^7` (the Angular linker's `assertVersion(7)` hard requirement — see `angular-adapter-build`
  skill §1; Babel 8, ESM-only, is explicitly incompatible).
- **`scripts`**: `ng:build` (`ngc -p tsconfig.angular.json` — the one-shot AOT compile),
  `dev`/`start` (`symbiote-angular-dev [--reset-cache]` — see the wiring-gap note below), and
  `android`/`ios` (`ng:build` then `react-native run-<platform>`, since the compiled
  `build/angular/` output must exist before Metro can serve it).

Left out on purpose: `@symbiote-native/navigation`, `@symbiote-native/slider`,
`@symbiote-native/splash-screen`, `@symbiote-native/android`, and `@symbiote-native/react` —
all real dependencies of `examples/angular`'s package.json, but only because the canary *demos*
navigation, the slider wrapper, and the splash-screen module. None of those are needed to boot
a bare Angular app against the engine; a generated app adds them itself if/when it needs that
functionality. Generic bare-RN-app tooling (`@react-native-community/cli`, `@react-native/*`,
`eslint`, `jest`, `detox`, `prettier`, `typescript`, `@types/*`) is also left out — it isn't
SymbioteNative/Angular-specific and belongs to whatever base scaffold `templates/native` or a
shared cross-framework fragment eventually supplies, not this per-framework fragment.

## App-name / bundle-id parameterization — not yet done

`app.json`'s `name`/`displayName` are still `"Canary"`/`"Canary"`, the literal value from
`examples/angular`. Per the task brief this is explicitly out of scope for this pass — no
placeholder/templating scheme was invented here. Parameterizing it (and wiring the app name the
`new` command's user already provides via its `<app-name>` argument) is real follow-up work for
`generate.ts`, which today still throws `NotImplementedCommandError` for both `new` and `add`.

## The `ngc --watch`-alongside-Metro wiring gap

What a generated app needs to reproduce, already captured in the copied files:

- `dev`/`start` calling `symbiote-angular-dev` (from `@symbiote-native/angular`'s `bin`, see
  `package.json.fragment.json`'s `scripts`) — this is the shared launcher
  (`adapters/angular/bin/symbiote-angular-dev.cjs`) that runs an initial `ngc` build, then spawns
  `ngc -p tsconfig.angular.json --watch` as a background process and `react-native start` as the
  sole foreground process (so Metro's interactive `r`/`j`/`d` keypresses keep working — see
  `angular-adapter-build` skill §3). Nothing app-specific to wire here: the launcher already
  reads `tsconfig.angular.json` from the app's own directory.
- `ng:build`/`android`/`ios` running a one-shot `ngc` compile before Metro/the native build ever
  sees the app, since `index.js` imports the *compiled* `./build/angular/src/App`, never the
  `.ts` source directly.

**What's genuinely unsolved by this pass**: how `@symbiote-native/cli new`/`add`'s actual generation
logic wires `package.json.fragment.json`'s `scripts` block into a fresh project's
`package.json` — i.e. whether `generate.ts` merges this fragment's `scripts` keys directly, how
a naming collision with a user's existing `add`-target `package.json` scripts would be resolved,
and whether `symbiote-angular-dev`'s `--pm`-agnostic assumptions (it shells out to `ngc`/
`react-native` directly, not through a package-manager `run` wrapper) hold for every `--pm`
value `@symbiote-native/cli` supports (`npm`/`pnpm`/`yarn`). None of that is implemented anywhere yet
— `commands/new.ts` and `commands/add.ts` still throw `NotImplementedCommandError` before
reaching a template-copy step at all.

**Status: `new` is wired for the base + `--navigation`/`--expo-modules` layers.** `src/generate.ts`
copies `native/` + `js/<framework>` + any selected `templates/layers/*` onto the target
directory via `src/utils/render-template.ts` (ported from create-vue: `package.json` merges,
`.gitignore` appends, everything else overwrites). `src/utils/apply-app-identity.ts` then substitutes the real app name/bundle id for the
templates' `"Canary"`/`com.canary` placeholders on the copied tree. `src/commands/add.ts` is
still stubbed — see `../README.md`'s "Design decisions" section for the full v1 scope and what's
deferred (`--splash-screen`, `add`).

```
templates/
  native/{ios,android,Gemfile}/  # ONE framework-agnostic Xcode/Gradle project shell + CocoaPods
                                   # config, shared by every framework — SymbioteNative never
                                   # touches native/, so the generated app's ios/ and android/
                                   # folders are identical regardless of --framework (see
                                   # <native_core_is_untouched> in the root CLAUDE.md).
  js/{react,vue-tsx,vue-sfc,angular,solid,svelte}/  # Per-framework JS-level overlay: index.js
                                   # (registerRunnable, not registerComponent), metro.config.js,
                                   # tsconfig, and a package.json.fragment.json dependency
                                   # fragment (@symbiote-native/<fw> + react-native/react + the
                                   # framework's own runtime). Vue has two real flavors, TSX and
                                   # SFC — `npx @symbiote-native/cli new --framework vue` prompts for
                                   # `--vue-flavor tsx|sfc` (default sfc) to pick between them.
  layers/{expo-modules,navigation,testing}/  # Optional overlays applied after native/ + js/<fw>.
                                   # expo-modules is package.json.fragment.json only; navigation
                                   # also carries app/<framework>/App.<ext> — a 2-screen Stack
                                   # demo overwriting the base App — see templates/layers/README.md.
  styling/{js,navigation}/<framework>/<option>/  # --styling css-modules|stylesheet overrides,
                                   # applied by src/utils/apply-styling.ts AFTER js/<fw> and the
                                   # navigation layer. Deliberately NOT nested inside js/<fw> or
                                   # layers/navigation/app/<fw> — render-template.ts copies a
                                   # source directory recursively with no exclusion, so nesting an
                                   # override folder inside a tree that's already copied wholesale
                                   # ships it into every generated app regardless of --styling.
```

Every `js/<framework>` also ships a base `App.<ext>` (a "Welcome to SymbioteNative!" + tap
counter, no navigation) — the one thing that actually makes a scaffolded app RUN instead of
crashing on `import App from './App'` resolving to nothing.

**Every App file is TWO independently-maintained variants, never one derived from the other.**
react/vue-tsx/solid: `App.tsx` + `App.jsx`, picked by filename (`render-template.ts`'s
`TYPESCRIPT_ONLY_FILENAMES`/`JAVASCRIPT_ONLY_FILENAMES`). vue-sfc/svelte can't do that — their
language is an internal `<script lang="ts">` attribute, so both variants would collide on the same
extension (`App.vue`/`App.svelte`) — instead the TypeScript half is a `App.typescript.vue` /
`App.typescript.svelte` sibling that renders to the plain name only when TypeScript is on (same
`.typescript.` infix mechanism as `package.json.fragment.typescript.json`). Angular has no JS
half at all (AOT requires TypeScript). The two variants read
identically today because neither has a REAL type annotation yet worth diverging on — a
copy-with-renamed-extension looked equivalent for the same reason and was rejected: the moment
one side gains an actual type, that copy would silently ship broken syntax into the other mode.

Every `README.md` inside `templates/**` (this file included) documents the template folder for
maintainers — `renderTemplate` skips copying any file named `README.md` into a generated app.

## Why `native/` is our own vendored shell, not `@react-native-community/cli init`

Delegating native scaffolding to the upstream RN CLI would make `@symbiote-native/cli new` break
on every RN-CLI release that changes its generated project shape — outside this repo's
control. Vendoring our own fork trades that drift risk for an explicit maintenance cost (this
package owns keeping `native/` current against new RN/Xcode/Gradle versions), which is the
deliberate choice here.

## What's real vs. still missing

Real: `new` copies `native/` + `js/<framework>` + selected `layers/*` onto a fresh directory,
merges `package.json` (`deepMerge` + `sortDependencies`, ported from create-vue), appends
`.gitignore`, skips every template-folder `README.md`, and substitutes the real app name +
bundle id for every `"Canary"`/`com.canary` placeholder (folder renames, Xcode project/scheme/
workspace names, Android package directory + `namespace`/`applicationId`, `app.json`, Info.plist,
Podfile target — see `src/utils/apply-app-identity.ts`; case-sensitive, so it never touches an
unrelated lowercase "canary" in prose/comments). Every framework ships a working base App and,
with `--navigation`, a 2-screen Stack demo — verified end-to-end against real installs, including
a real `ngc` AOT build for Angular both with and without `--navigation`. Every
`@symbiote-native/*` version pin is `"latest"` (see `templates/layers/README.md`). Verified against 5
combinations (react+expo+navigation, vue-sfc+navigation, solid, svelte+expo, angular) — see
`../README.md`'s "Design decisions" section.

Missing, on purpose:

- **No `--splash-screen` toggle.** BootSplash is unconditionally baked into `native/` — making
  it optional needs `@expo/config-plugins`-based generation, not hand-edited `.pbxproj`. See
  `../README.md`'s "Design decisions" section for the precedent (`react-native-bootsplash`'s own
  `generate.ts`) and why it's a separate task.
- **`add` is still stubbed.** `new`'s copy/merge mechanism was the prerequisite; `add`'s
  retrofit-into-existing-project path (merging into a non-empty `package.json`) comes next —
  including re-running `apply-app-identity` against an existing project's current name/bundle id
  rather than the `"Canary"` placeholder.
- **No general EJS/data-file templating.** `renderTemplate` does a plain copy-or-merge; the one
  parameterized value (app identity) is handled by a dedicated post-pass instead, since it's the
  only thing in `templates/` that varies per scaffold.

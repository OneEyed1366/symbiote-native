**Status: real content, verbatim.** `ios/`, `android/`, and `Gemfile` are a direct copy of
`examples/react`'s equivalents (2026-08-12) — the shared, framework-agnostic native shell every
`--framework` value uses, per `<native_core_is_untouched>` (root `CLAUDE.md`). Source of truth
going forward: re-sync from `examples/react` when they change, not from any other example
(they're expected to differ only cosmetically — bootsplash asset IDs, `Podfile.lock`
resolution — see the `symbiote-create-cli` skill).

`Gemfile` is verified byte-identical across all four examples (`react`/`vue-tsx`/`vue-sfc`/
`angular`) — genuinely framework-agnostic CocoaPods/Ruby tooling config, added here (not
duplicated into each `templates/js/<fw>` overlay) after all three JS-overlay agents that
populated `templates/js/*` independently flagged its absence as a gap. `Gemfile.lock` is
deliberately NOT copied, same reasoning as excluding `package-lock.json` from the JS
overlays — a lockfile is generated fresh, never templated.

## Renaming (2026-09-15)

Every file still says **"Canary"** in the template — `src/utils/apply-app-identity.ts` runs as a
post-pass over the already-scaffolded tree (never over `templates/` itself) and substitutes the
real app identity:

- iOS: renames `Canary.xcodeproj/`, `Canary.xcworkspace/`, the `Canary/` source folder, and the
  nested `Canary.xcscheme`; replaces every literal `"Canary"` occurrence inside
  `project.pbxproj`/`Info.plist`/the `.xcscheme`/`.xcworkspacedata`/`Podfile` (all uses there are
  `PRODUCT_NAME`/target-name/scheme-name/display-name STRINGS, not structural build-phase
  entries — see the note below on why this is safe as a plain substitution).
- Android: moves `android/app/src/{main,androidTest}/java/com/canary` to the real bundle-id path
  (segment count can differ from `com.canary`'s two), and replaces `com.canary` in
  `build.gradle`'s `namespace`/`applicationId` and every `.kt` file's `package` declaration.
- `app.json`'s `name`/`displayName` (the RN AppRegistry key Android's `getMainComponentName()`
  and iOS's `AppDelegate withModuleName:` both reference) become the same sanitized PascalCase
  identifier used for the Xcode/Android renames — see `src/utils/native-identity.ts`.

**Considered and rejected: wrapping [`react-native-rename`](https://www.npmjs.com/package/react-native-rename).**
It has no programmatic API (CLI-only, built around `commander`) and hard-requires the target to
already be a git repo (`validateGitRepo`/`checkGitRepoStatus`) — a fresh `@symbiote-native/cli new`
output isn't one yet, and silently `git init`-ing it as a side effect wasn't part of the ask. The
substitution itself is lower-risk than the splash-screen case this README used to lump it with:
every `"Canary"`/`com.canary` occurrence here is a STRING value on an already-present build
target/file (`PRODUCT_NAME`, a scheme name, a package declaration) — never a NEW pbxproj entry
(no added build files, no new group/reference nodes), which is what made hand-rolling risky for
splash-screen (see `../README.md`'s "Design decisions" section) but not for this.

## What's deliberately NOT templated separately

`--expo-modules` does not need its own `native/` variant: Expo-modules autolinking (see
`examples/expo-react`) is wired through `postinstall` (`@symbiote-native/expo-modules-link`)
and CocoaPods/Gradle autolinking at install time, not through static differences in the
checked-in native project files themselves. One `native/` shell covers both profiles.

---
name: symbiote-release-publishing
description: "Symbiote npm publishing & versioning — read before touching .changeset/**, a publishable package's `publishConfig`/`files`/`exports`, .github/workflows/release.yml, or running `pnpm changeset`/`pnpm run release`. Versioning is Changesets (`pnpm changeset` → PR → 'Version Packages' PR → merge → CI publishes). Core trick: `main`/`exports` keep pointing at `src/index.ts` for in-repo dev (Metro/tsc resolve live TS, unchanged) — `publishConfig` overrides those to `build/` ONLY inside the tarball, never touching local resolution. No new bundler: `tsc --build` already emits `build/`, so `typecheck` IS the build. `@symbiote-native/angular`/`@symbiote-native/slider`'s `./angular` entry predate this, use a DIFFERENT mechanism (conditional `exports`, AOT build) — don't convert or copy that onto plain packages. Covers the mechanism table, the `files`-mandatory gotcha (`.gitignore` excludes `build/`), the `fix-esm-extensions` sweep (its hand-maintained argument list is GONE — dirs are derived from each publishable package's own `publishConfig`, so what a new package needs is `publishConfig` under `./build/` and no `private` flag; what IS still per-package is the emitted extension, `.js`/`.jsx`, a miss there shipping an unimportable `build/` for every real npm consumer while looking fine in-repo), changeset ignore list, release scripts, the `checks.yml` reusable-workflow CI gate (`ci.yml` + `release.yml` both call it, sequencing publish after lint/typecheck/test), and the canary preview flow — pkg.pr.new (never touches the real npm registry: no dist-tag, no version bump, nothing to clean up), triggered automatically via `workflow_run` after CI passes on a PR or manually via `workflow_dispatch`, publishing every publishable package every time (no per-package selection needed — pkg.pr.new never mutates shared registry state). A REAL npm `canary` dist-tag snapshot mechanism was tried instead (2026-07-24) and reverted the same day: real npm's `unpublish`/`deprecate` both require an interactive OTP no headless CI job can supply, even with a bypass-2FA granular token (that bypass only ever covers `publish`) — so cleanup could never actually run, and snapshots would have accumulated on the registry forever. See 'Canary releases' below for the full record. Also covers why a 'pnpm cache is not found' + 'Failed to save ... another job may be creating this cache' pair across checks.yml's parallel lint/typecheck/test jobs is an expected first-run/same-key race, not a broken cache (diagnose via job logs, not the Actions UI summary). Trigger: 'publish npm', 'release', 'changeset', 'version bump', 'publishConfig', 'canary release', 'CI publish', 'pkg.pr.new', 'canary dist-tag', 'trust:publishers', 'pnpm cache not found', 'actions cache'."
---

# Symbiote npm publishing & versioning

Versioning is [Changesets](https://github.com/changesets/changesets); publishing
ships **compiled JS + `.d.ts`**, never raw `.ts`, without disturbing the
zero-build in-repo dev loop (Metro resolving `src/*.ts` directly today).

> **Why this exists.** The repo is about to publish `@symbiote-native/*` to npm once
> Angular + docs land. Every package currently ships `main`/`exports` pointing
> straight at `src/index.ts` — correct for Metro inside the monorepo, wrong for
> an external consumer whose Metro config doesn't know to transform a
> node_modules TS package. The fix had to add zero risk to the thing that
> already works (in-repo dev), which is why it's a `publishConfig` overlay, not
> a rewrite of `main`/`exports`.

For a brand-new package, decide the publish tier (bare-skeleton / core-only /
full parity) FIRST — see `symbiote-new-package-skeleton` — before wiring any
of the mechanism below onto it.

## The mechanism — one sentence

**`main`/`module`/`types`/`exports` stay pointed at `src/index.ts` (unchanged,
still what Metro/tsc resolve in-repo); `publishConfig` repeats those same keys
pointed at `build/`, and pnpm swaps them in ONLY inside the packed tarball** —
local resolution never sees `publishConfig` at all.

```jsonc
// core/engine/package.json — the plain-package pattern (4 of 7 packages)
{
  "main": "src/index.ts", // ← Metro/tsc resolve this in-repo, unchanged
  "module": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "files": ["build"], // ← REQUIRED, see Gotchas
  "publishConfig": {
    "access": "public",
    "main": "./build/index.js", // ← only these are what `npm install`ers get
    "module": "./build/index.js",
    "types": "./build/index.d.ts",
    "exports": {
      ".": { "types": "./build/index.d.ts", "default": "./build/index.js" },
    },
  },
}
```

Verify the override actually applies by packing for real, not by reading the
source `package.json`:

```bash
cd core/engine && pnpm pack --pack-destination /tmp
tar -xzf /tmp/symbiote-engine-0.0.0.tgz -C /tmp/x && cat /tmp/x/package/package.json
# main/module/types/exports now show build/, publishConfig is gone (already applied)
```

## The non-obvious fact: there is no new build tool

`tsc --build` already emits `build/index.js` + `build/index.d.ts` today,
because every package's `tsconfig.json` extends `tsconfig.base.json`, which
already sets `declaration: true, composite: true, noEmit: false, outDir:
"build"`. The root `"typecheck": "tsc --build"` script was, unnoticed, already
a build script — it just also happened to satisfy the project-references
type-check. **Do not add tsup/unbuild/rollup** for this — it would duplicate
what `tsc --build` gives for free and the paths in `publishConfig` are chosen
to match its actual output 1:1 (verified by running it, not assumed).

## Which package uses which mechanism

| Package                       | Mechanism                                                                                                                                                                                               | Why                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `@symbiote-native/engine`     | `publishConfig` override (above)                                                                                                                                                                        | plain TS, no AOT need                                                                                                                     |
| `@symbiote-native/components` | same                                                                                                                                                                                                    | plain TS                                                                                                                                  |
| `@symbiote-native/react`      | same                                                                                                                                                                                                    | plain TS                                                                                                                                  |
| `@symbiote-native/vue`        | same, **multi-entry** (`.` + `./runtime-helpers`, mirrored 1:1 in `publishConfig.exports`)                                                                                                              | plain TS, two entry points                                                                                                                |
| `@symbiote-native/angular`    | **pre-existing conditional `exports`** (`types`/`react-native`/`default`), built by `"prepare": "pnpm run ng:build"` (`ngc -p tsconfig.angular.json` → `build/angular/`)                                | needs real Angular AOT compilation, which `tsc --build` cannot do — only `publishConfig.access` was added, the exports block is untouched |
| `@symbiote-native/slider`     | its `./angular` sub-export uses the same conditional pattern as above (`build-ngc/angular/`); `.`/`./vue`/`./react` use the plain `publishConfig` override pointed at `build/{core,vue,react}/index.js` | mixed: one AOT entry + three plain entries in one package                                                                                 |
| `@symbiote-native/android`    | no build at all — ships tracked native `android/` source as-is                                                                                                                                          | pure native module, no JS/TS to compile                                                                                                   |

**Do not cross the two mechanisms.** Conditional `exports` on a plain package
would make Metro resolve `build/` even in-repo (conditions are evaluated
identically locally and externally) and silently break the zero-build dev
loop the other 4+3 packages rely on. `publishConfig` is inert until
`pnpm pack`/`pnpm publish`, which is exactly why it's the right tool for
everything that doesn't need AOT.

## Gotcha: `.gitignore` will silently eat your dist unless `files` says otherwise

`build/`, `build-ngc/`, and `dist/` are all gitignored (`.gitignore`). `npm`/
`pnpm pack` falls back to `.gitignore` for what to exclude from a tarball when
no `files` field is present — meaning without an explicit `"files"` array,
the just-built `build/` output would be **silently stripped from the
package you publish**, shipping an empty/broken tarball. Every publishable
package.json in this repo has an explicit `"files"` array for this reason:
`["build"]` for the plain packages, `["src", "build"]` / `["src", "build",
"build-ngc"]` for the Angular-conditional ones (their `default` export
condition still points at `src/*.ts`, so `src/` must ship too), `["android"]`
for the native-only package.

## Gotcha (fixed 2026-07): the hidden-folder `.gitignore` rule ate `.github/` itself

```
§gitignore_ate_github := {
  bug: ".gitignore's `.*/` (meant for .claude/.docs/.notes/.vendors) also matches `.github/`",
  scope: ".github/workflows/release.yml existed on disk, described by this skill,
          never committed/pushed/run — blanket dir-ignore, not a per-file miss",
  symptom: "git status / git add -A show nothing — an ignored dir just doesn't appear,
            ignored vs not-yet-tracked look identical at a glance",
  diagnose: "git check-ignore -v <path> (or `git status --porcelain -- <dir>` showing ??)",
  fix: [".gitignore: `.*/` then `!.github/`"],
  open: "verify any FUTURE blanket dir-ignore rule the same way before trusting it"
}
```

## Gotcha (found 2026-07 via the canary-release CI work): `fix-esm-extensions` and a publishable package's `build/` (argument list since removed — read to the end)

```
§fix_esm_extensions_arglist_GONE_2026_08_17 := {
  status: "the hand-maintained argument list is GONE — do not go looking for it.
           Re-verified 2026-08-17 against scripts/fix-esm-extensions.mjs (`const dirs =
           process.argv.slice(2).length > 0 ? process.argv.slice(2) : esmExtensionBuildDirs()`)
           and the root script, which passes no args",
  mechanism_now: "the forget-one-package failure mode below was closed STRUCTURALLY, not by
                  discipline: with no CLI args the script derives every directory from each
                  publishable package's OWN publishConfig (scripts/lib/build-dirs.mjs's
                  esmExtensionBuildDirs(), filtered on !pkg.private via publishable-packages.mjs).
                  A new publishable package is covered automatically; CLI args survive only as a
                  manual override for running the script over one directory",
  what_a_new_package_still_needs: "publishConfig pointing under ./build/ — that string match is
                                   what makes it visible to the sweep — and `private` NOT set,
                                   which is also the repo's gate for 'not publishable yet'
                                   (adapters/solid uses it while below feature parity)",
  genuinely_per_package: "the emitted EXTENSION. The sweep understands .js and .jsx (EMITTED_EXTS,
                          added 2026-08-17 for adapters/solid, which builds with jsx:'preserve' so
                          tsc type-checks JSX and emits it untouched for the consuming app's Babel
                          to compile). BOTH directions matter — a file has to be SCANNED and
                          RESOLVED TO — so a package emitting some third extension needs it added
                          in all three places (listEmittedFiles, hasPlatformSibling,
                          resolveSpecifier) plus EXT_RE",
  symptom_of_a_missing_extension: "identical to the original gotcha: UNRESOLVED at the publish
                                   gate, or a silently unscanned file — invisible in-repo because
                                   local resolution never touches build/",
}
```

```
§fix_esm_extensions_missing_pkg := {
  mechanism_AT_THE_TIME: "scripts/fix-esm-extensions.mjs rewrites extension-less relative
              imports tsc --build emits (Node ESM loader rejects them outside a bundler) —
              back then ONLY for build/ dirs passed as CLI args in the root
              `fix-esm-extensions` script; not inferred from files/publishConfig, a flat
              easy-to-forget list. SUPERSEDED — see the block above",
  bug: "core/test-utils/build missing from that arg list since first publish",
  scope: "every published version 0.1.1-0.1.3 shipped build/index.js doing
          `export * from './fake-fabric'` (no .js)",
  symptom: "real npm consumer: Cannot find module '.../build/fake-fabric';
            invisible in-repo — Metro/Vitest resolve src/*.ts directly, never touch build/",
  how_found: "adding a `test` CI job (pnpm run test against examples/*'s real
              catalog:-installed @symbiote-native/test-utils) → 833/834 passing, 1 failing suite",
  fix: "add core/test-utils/build to the arg list; republished via
        the `test-utils-esm-extension` changeset",
  rule_SUPERSEDED: "was 'adding a new publishable package with its own build/ → add it to
         this script's argument list in the SAME change'; there is no argument list now —
         give the package a publishConfig under ./build/ and leave `private` unset"
}
```

## Gotcha (found 2026-07-23 via a `sensors` canary that shipped with no `build/` at all): a mixed-mechanism package's `clean` script must target `build-ngc`, never `build`

```
§clean_wipes_build_before_ngc := {
  affected: ["slider", "navigation", "splash-screen", "sensors"],
  mechanism: "mixed-mechanism package: plain publishConfig for ./ + ./react + ./vue →
              build/{core,react,vue}/..., PLUS conditional ./angular export →
              separate build-ngc/angular/...;
              prepublish-build runs `typecheck && fix-esm-extensions && ng:build` in order;
              ng:build = `pnpm run clean && ngc -p tsconfig.angular.json`",
  bug: "clean script copy-pasted `rm -rf build` from @symbiote-native/angular (correct THERE,
        see below) — deletes the build/ tree typecheck just produced;
        ngc only ever repopulates build-ngc/, nothing regenerates build/ after",
  symptom: "tarball ships build-ngc/ but no build/, while
            exports['.']/['./react']/['./vue'] still point at ./build/...
            → Cannot find module '@symbiote-native/<pkg>/react' (Metro AND tsc/vue-tsc,
            confirmed via real Metro bundle, not just a type-checker false positive)",
  why_silent_in_repo: "workspace:* resolution never touches a package's own build/ —
                       invisible until a real packed install (canary or npm)",
  ruled_out_angular_itself: "@symbiote-native/angular's ngc outDir is build/angular
                             (SUBFOLDER of build, not sibling build-ngc); its exports
                             only ever reference build/angular/* — so its own
                             `clean: rm -rf build` is CORRECT and must NOT get this fix.
                             Check tsconfig.angular.json's outDir per package before assuming",
  fix: "packages/{sensors,navigation,slider,splash-screen}/package.json:
        `clean: rm -rf build-ngc`",
  verified: "delete both dirs → `npx tsc --build packages/sensors` repopulates
             build/{core,react,vue,angular} → `pnpm run ng:build` inside package
             confirms build/ still has all 4 subfolders, build-ngc/ also regenerates",
  rule: "any FUTURE mixed-mechanism package copying the ng:build/clean pair
         must point clean at build-ngc, not build, from the start"
}
```

### `pre-push` must `unset GIT_DIR` or every push from a worktree fails (2026-08-16)

```
§prepush_gitdir_worktree := {
  bug: ".husky/pre-push gates on `pnpm exec changeset status --since=master`;
        fails from a LINKED git worktree with a lie",
  symptom: "error Some packages have been changed but no changesets were found.
            husky - pre-push script failed (code 1)
            — despite 34 .changeset/*.md files present, and the SAME command
            run by hand in the same dir exits 0",
  root_cause: "git exports GIT_DIR to every hook; in a linked worktree it's
               ABSOLUTE (<main>/.git/worktrees/<name>), not the relative .git a
               normal checkout gets. GIT_DIR set + no GIT_WORK_TREE ⟶ git skips
               discovery, treats CWD as work-tree root. @changesets/read's
               filterChangesetsSinceRef runs its diff with cwd=<root>/.changeset,
               so git rooted the tree at .changeset/ and returned README.md
               instead of .changeset/*.md ⟶ regex /.changeset\\/[^/]+\\.md$/
               matches nothing ⟶ changesets.length===0 ⟶ the error above
               (changesets-cli.cjs.js, changedPackages.length>0 &&
               changesets.length===0 branch). Main checkout's exported .git is
               relative, fails to resolve from .changeset/, falls back to
               discovery — only worktrees hit this",
  fix: "top of .husky/pre-push: `unset GIT_DIR GIT_WORK_TREE`",
  repro: "git push --dry-run runs pre-push for real; running the hook body by
          hand does NOT reproduce it — the env var only exists under git",
  scope: "same trap applies to any hook shelling out to a tool that runs git
          from a subdirectory"
}
```

## Changesets config (`.changeset/config.json`)

```jsonc
{
  "access": "public",
  "baseBranch": "master",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@symbiote-native/docs-site", // apps/*, private
    "Canary",
    "vue-sfc-canary",
    "vue-tsx-canary",
    "angular-canary", // examples/*
  ],
}
```

`@symbiote-native/test-utils` used to be in this `ignore` list (it started as
an internal-only test double) but was published for real in a later session —
it is now a normal publishable package like the other 7 and must NOT be
re-added to `ignore`.

`@changesets/cli` itself is catalogued (`pnpm-workspace.yaml` → `catalog:`
under "workspace tooling"), like every other dev tool in this repo — see
`symbiote-dependency-catalog`.

## Root scripts

```jsonc
"typecheck": "tsc --build",
"prepublish-build": "pnpm run typecheck && pnpm run fix-esm-extensions && pnpm --filter @symbiote-native/angular --filter @symbiote-native/slider run ng:build",
"build": "pnpm run prepublish-build && pnpm run docs:build",
"changeset": "changeset",                 // pnpm changeset — author a changeset for a PR
"version-packages": "changeset version",  // bump versions + changelogs from pending changesets
"release": "pnpm run build && changeset publish",
"trust:publishers": "node scripts/trust-publishers.mjs"
```

`release` explicitly re-runs the full build (typecheck → ESM-extension fix →
Angular/slider AOT → docs) before publishing rather than trusting `prepare`
ran recently — publishing must be idempotent from a cold checkout.
`prepublish-build` is split out from `build` specifically so the canary flow
below can reuse the package-relevant steps without also building the
unrelated docs site.

`pnpm run trust:publishers` (`scripts/trust-publishers.mjs`) configures npm's
GitHub-OIDC trusted publishing for every publishable package in one loop —
run once per package after its first manual authenticated publish, needs an
interactive OTP/browser confirm so it can't run from CI. It hardcodes
`--file .github/workflows/release.yml`: npm's OIDC trust is scoped to that
exact workflow FILE (not job), covering the `release`/`cut-release` jobs
(the only jobs in this workflow that touch the real npm registry —
`publish-canary` below goes through pkg.pr.new instead and needs no npm auth
at all) — a NEW workflow file would need its own `trust:publishers`-style
re-registration first, or every publish from it 404s (npm returns 404, not
403, for an identity with no trust config).

## Gotcha (found 2026-08-06 during the 18-package first-publish run): `pnpm publish` never completes npm's browser 2FA flow — pack with pnpm, upload with npm

```
§pnpm_publish_2fa_hang := {
  context: "npm now requires 2FA for direct publish even with a token in ~/.npmrc
            ('tokens that bypass 2FA are being restricted...' banner);
            flow prints an auth URL, browser approves, CLI long-polls
            registry.npmjs.org/-/v1/done?authId=…",
  bug: "pnpm publish never picks up the poll result — prints the URL, browser
        approval succeeds, CLI waits forever",
  isolate: "`npm trust list <pkg>` drives the identical flow/registry/proxy;
            if IT completes while publish hangs, the tool is what differs",
  why_npm_publish_cant_replace_it: [
    "pnpm resolves catalog:/workspace:* specifiers into real versions —
     31/34 publishable packages use them; npm ships e.g.
     \"expo-modules-core\": \"catalog:\" verbatim, uninstallable",
    "pnpm applies the publishConfig overlay (main/module/types/exports→build/);
     npm's own publishConfig support doesn't cover field overrides,
     npm-packed tarball keeps main: src/index.ts"
  ],
  fix: "split the job — pnpm owns the manifest, npm owns the upload:
        `pnpm pack --pack-destination <tmpdir>` (it prints the tarball path LAST, so take the
        last non-empty stdout line) then `npm publish <tarball> --access public`;
        this is what scripts/trust-publishers.mjs does",
  verify: "packed tarball's main must read ./build/..., no catalog:/workspace:
           string anywhere in packed package.json",
  non_failures: [
    "E409 from `npm trust github` = trust config already set, expected on
     every re-run over an already-published repo — script treats as skip",
    "fresh publish 404s on read for minutes: npm view / anonymous curl
     registry.npmjs.org/<pkg> return 404 while write side (npm trust) already
     knows it, server-issued UUID. 2026-08-06 run: 17 packages missing
     immediately, 9 min later only alphabetically-last 9 still did (landing
     in publish order). Don't re-publish/debug on a post-publish 404,
     recheck after a few minutes"
  ],
  side_effect: "a ~34-call npm view verification loop rotates ~/.npmrc's
                _logs (default logs-max 10), destroys the publish logs"
}
```

## CI (`.github/workflows/release.yml` + `checks.yml`)

`checks.yml` is a `workflow_call`-only reusable workflow holding the three
gate jobs (`lint`, `typecheck`, `test`). Both `ci.yml` (fast PR feedback on
every `pull_request`/`push`) and `release.yml` (the hard gate before
publishing) call it via `uses: ./.github/workflows/checks.yml` — GitHub
Actions has no cross-workflow `needs:`, so the only way to make one
workflow's publish job wait on another workflow's checks is to re-run the
same job definitions inside the publishing workflow itself; the reusable
workflow keeps them defined once instead of duplicated.

`release.yml` has two `needs: checks` jobs gated by `if:`, mutually exclusive
by trigger:

- **`release`** (`if: github.event_name == 'push'`) — push to `master` →
  `changesets/action@v1` either opens/updates a `chore: version packages` PR
  (when unreleased changesets exist) or, once that PR is merged, runs
  `pnpm run release` and publishes. Needs a repo secret `NPM_TOKEN` (mapped to
  `NODE_AUTH_TOKEN`, which `actions/setup-node`'s `registry-url` reads) OR the
  OIDC trusted-publisher config above; without either the version-PR step
  still works, only the actual `npm publish` call fails.
- **`publish-canary`** (`if: workflow_run` reacting to `CI`'s completion, or
  `workflow_dispatch` with `publish-canary: true`; further gated by
  `environment: canary-publish`) — see "Canary releases" below.

### pnpm store cache — a same-run save race is expected, not broken

`checks.yml`'s `lint`/`typecheck`/`test` jobs (plus `release.yml`'s own
`release`/`cut-release`/`publish-canary` jobs) each run `pnpm/action-setup` +
`actions/setup-node@v4` with `cache: pnpm`. That cache key is built from
**OS + package manager + `hash(pnpm-lock.yaml)` only** — it does NOT include
the job name. Since `checks.yml`'s three jobs run in PARALLEL against the
identical lockfile, they always compute the identical cache key.

Two log lines are BOTH benign, not evidence of a broken cache:

- `pnpm cache is not found` on a job's restore step — expected the very
  first time a given lockfile hash runs after enabling/changing caching;
  nothing has been saved under that key yet.
- `Failed to save: Unable to reserve cache with key ..., another job may be
creating this cache` on a job's save step — expected whenever 2+ parallel
  jobs share one key: only one wins the race and actually saves (its log
  shows `Cache saved with the key: ...`), the rest lose harmlessly and still
  report job `success`.

Diagnosis method (don't guess from the Actions UI summary — read the actual
job logs): `gh run view <runId> --json jobs -q '.jobs[].databaseId'` per job,
then `gh api repos/<owner>/<repo>/actions/jobs/<jobId>/logs | grep -i "cache
is not found\|Cache saved\|Failed to save"`. Confirm at least ONE parallel
job shows `Cache saved with the key: ...` at the end — if so, caching is
working and the NEXT run with an unchanged lockfile should show `Cache
restored from key: ...` in all jobs instead of `not found`. Only worth
digging further if the SAME lockfile hash still misses on a _second_ run.

## Canary releases (pkg.pr.new preview publish, never touches the real npm registry)

**pkg.pr.new** ([stackblitz-labs/pkg.pr.new](https://github.com/stackblitz-labs/pkg.pr.new)):
packs and publishes a real tarball of every publishable package to pkg.pr.new's
own npm-compatible per-commit URLs — never touching npmjs.com. No dist-tag, no
version bump on the real registry, nothing to clean up. Requires the pkg.pr.new
GitHub App installed on this repo (github.com/apps/pkg-pr-new).

### A real-npm `canary` dist-tag was tried and reverted the same day (2026-07-24)

```
§real_npm_canary_reverted := {
  motivation: "examples/*/package.json committing
              \"@symbiote-native/<pkg>\": \"canary\" as a literal git-tracked
              dist-tag specifier resolves live and survives branch switches —
              pkg.pr.new's ephemeral per-commit URLs can't give that",
  tried: "Changesets snapshot mode: `changeset version --snapshot canary &&
          changeset publish --tag canary` → versions like
          0.0.0-canary-<timestamp> under a real `canary` dist-tag on npmjs.com",
  got_working: "full publish pipeline, incl. a fix for Changesets' default 0.0.0
               snapshot base colliding with CocoaPods' semver-prerelease
               exclusion — snapshot.useCalculatedVersion preserves the real
               version instead",
  blocker: "real npm's unpublish AND deprecate both require an interactive OTP
            no headless CI job can supply — confirmed empirically against this
            repo's own packages: even a granular token with 'Bypass 2FA'
            explicit still hit `EOTP: This operation requires a one-time
            password` on both commands. npm's 2FA-bypass token only ever
            covers `npm publish`; unpublish/deprecate stay OTP-gated by
            design (anti-abuse — a leaked CI token shouldn't yank packages)",
  rejected_alternative: "a locally-generated TOTP from the account's raw 2FA
                         secret (otplib/otpauth) would technically work, but
                         means storing the actual 2FA seed as a CI secret —
                         full account-level bypass, not a scoped revocable
                         token; rejected as worse than the problem",
  consequence: "without unpublish/deprecate, every snapshot version stays
               forever visible/immutable/un-deletable on real npmjs.com with
               no retention — the opposite of what 'canary' is for",
  decision: "reverted to pkg.pr.new same day",
  open: "do not re-attempt a real-npm canary snapshot mechanism without first
         solving the unpublish/deprecate OTP problem"
}
```

### Mechanism (current, pkg.pr.new)

1. **Trigger — automatic per-PR (via `workflow_run`) or manual.**
   `release.yml`'s `publish-canary` job triggers on `workflow_run` (reacting
   to the `CI` workflow's own completion — NOT a local `pull_request`
   trigger; see the "duplicate Checks" gotcha above for why) with
   `github.event.workflow_run.conclusion == 'success'`, or manually via
   `workflow_dispatch` with the `publish-canary: true` boolean input. Both
   paths are gated by `needs: checks` (tolerant of `checks` being `skipped`
   on the `workflow_run` path, where it deliberately never runs — `ci.yml`
   already covered that PR push) and by `environment: canary-publish` — a
   GitHub Environment with required reviewers, surfacing a native "Review
   deployments" approval button directly in the PR's Checks tab
   ([GitHub docs](https://docs.github.com/actions/managing-workflow-runs/reviewing-deployments)).
   Required reviewers on the Free/Pro/Team plan tier only work for PUBLIC
   repos; `OneEyed1366/symbiote-native` is public, so this applies as-is.
   Self-review is NOT prevented — this is currently a solo-maintained
   project. **`workflow_run` only fires from the copy of that trigger on the
   repo's DEFAULT branch (`master`)** — a PR from a non-default branch won't
   exercise the automatic path until the change is merged; `workflow_dispatch`
   has no such limitation and works immediately from any branch.

2. **No package selection — publishes every publishable package, every
   time.** `scripts/select-canary-dirs.mjs` resolves ALL
   `publishablePackageEntries()` to directories, no filtering. Unlike a real
   npm publish, pkg.pr.new never mutates shared registry state (no dist-tag
   to move, no `updateInternalDependencies` cascade to reason about), so
   there's no staleness/cascade risk a selection would need to guard
   against — publishing everything is simply the cheapest, always-accurate
   option.

3. **Publish step.**
   ```bash
   pnpm exec pkg-pr-new publish --pnpm <dir> <dir> ...
   ```
   `--pnpm` makes pkg-pr-new use `pnpm pack` instead of its `npm pack`
   default — `npm pack` would ignore each package's `publishConfig` override
   and ship the in-repo `src/*.ts` entry instead of `build/`.

### Installing a canary build

Install pkg.pr.new's per-commit URL directly (`npm install
https://pkg.pr.new/OneEyed1366/symbiote-native/@symbiote-native/<pkg>@<sha>` —
the exact URL is printed in the job's log / posted as a PR comment by the
pkg.pr.new GitHub App). This is ephemeral by nature — tied to a specific
commit, not something `examples/*/package.json` commits to git. For a
git-tracked, branch-surviving dependency on in-progress code, build a tarball
with `pnpm pack` from the package's own directory and point
`examples/*/package.json` at it with a `file:` specifier instead (CLAUDE.md's
`<examples_vs_dot_examples>`); swap back to a real published semver range once
released.

## The actual release workflow (day to day)

1. On a feature branch: `pnpm changeset` — pick affected package(s), bump
   type (patch/minor/major), write a summary. Commit the generated
   `.changeset/*.md` with the PR.
2. Merge to `master`. CI opens/updates "Version Packages" PR (bumps versions +
   CHANGELOGs, including dependents via `updateInternalDependencies: patch`).
3. Merge THAT PR. CI now runs `pnpm run release` and publishes every bumped
   package to npm.

First-ever publish of a new scoped package needs `access: public` — already
set both in `.changeset/config.json` and per-package `publishConfig.access`,
so no `--access` flag juggling is needed by hand.

4. Move `examples/*` onto the freshly published versions — see the section
   below. This is part of the release, not a follow-up: an example left behind
   keeps running pre-release code while looking updated.
5. If the release touches a wrapper package with a docs-site page, refresh its
   version snippet — see `symbiote-docs-site-package-template`.

## Post-release: moving `examples/*` forward is TWO edits, and the second one is invisible (2026-08-16)

```
§post_release_examples_two_edits := {
  problem: "a release leaves every example manifest stale in TWO ways;
            doing only the obvious one silently ships examples pinned to
            the previous release",
  edit_1_obvious: "file: tarballs — e.g.
                   file:../../core/engine/symbiote-native-engine-0.1.7.tgz
                   (<examples_vs_dot_examples>) — swap each to ^<published version>",
  edit_2_hidden: "ordinary ^ specifiers npm install will NOT move: a caret on
                 a 0.x version pins the MINOR, so ^0.1.0 never resolves to a
                 freshly published 0.2.0, ^0.2.8 never picks up 0.3.0.
                 Only packages past 1.0 (navigation ^2.0.3,
                 splash-screen ^3.0.3) float on their own",
  measured: "2026-08-16 release: 55 tarball specifiers vs 127 stale carets
            across 10 examples; skipping edit 2 would leave the four expo-*
            examples entirely on pre-release code — installs cleanly,
            reports 'added N packages', looks done",
  fix: "rewrite EVERY @symbiote-native/* specifier to the version that
        package carries in the monorepo after `changeset version` (= what
        was just published). Read from {core,adapters,packages}/*/package.json,
        NEVER from tarball filenames — those are the OLD numbers",
  reinstall: "KEEP the lockfile here — <examples_vs_dot_examples>'s
             delete-package-lock.json rule is for re-packing the SAME
             version (stale integrity hash short-circuit); here the
             specifier itself changes (file: -> ^x.y.z) so npm must
             re-resolve anyway. `rm -rf node_modules/@symbiote-native &&
             npm install` per example is enough",
  verify: "walk examples/*/node_modules/@symbiote-native/*/package.json,
          compare version against the monorepo's — a manifest edit is not
          proof the bytes moved",
  expected_noise: "swapping splash-screen from tarball to registry adds
                  ~24 @img/sharp-* rows (sharp via react-native-bootsplash;
                  tarball collapsed the per-platform binary matrix, registry
                  records it in full, all but @img/colour gated by
                  os/cpu/optional) — not drift; confirm by diffing the lock
                  for NON-symbiote version changes, should be exactly zero"
}
```

## Known pre-existing blocker (not caused by this setup)

`pnpm run <any script>` triggers pnpm's dependency-status check, which can
re-run every workspace package's `prepare` hook — including
`@symbiote-native/angular`'s `ng:build`. While the Angular adapter has outstanding
type errors (WIP, see `angular-adapter` skill; for the `ng:build`/`prepare`
mechanics themselves, see `angular-adapter-build`), this makes `pnpm run release`
fail in CI. That's the correct, intended gate — Angular is one of the 7
published packages, so the pipeline should refuse to release while it doesn't
compile. Don't route around it; fix the Angular errors instead. For
verifying non-Angular changes without tripping this, use `npx tsc --build`
directly (bypasses the `pnpm run` wrapper's install-check).

## Verify

```bash
npx tsc --build                       # confirms build/ output for every plain + slider entry
./node_modules/.bin/syncpack lint      # catalog discipline still holds after touching package.json
cd core/engine && pnpm pack --pack-destination /tmp && tar -tzf /tmp/symbiote-engine-*.tgz
# → only build/** + package.json + LICENSE, no src/ leakage
```

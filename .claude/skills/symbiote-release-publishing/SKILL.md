---
name: symbiote-release-publishing
description: "Symbiote npm publishing & versioning — read before touching .changeset/**, a publishable package's `publishConfig`/`files`/`exports`, .github/workflows/release.yml, or running `pnpm changeset`/`pnpm run release`. Versioning is Changesets (`pnpm changeset` → PR → 'Version Packages' PR → merge → CI publishes). Core trick: `main`/`exports` keep pointing at `src/index.ts` for in-repo dev (Metro/tsc resolve live TS, unchanged) — `publishConfig` overrides those to `build/` ONLY inside the tarball, never touching local resolution. No new bundler: `tsc --build` already emits `build/`, so `typecheck` IS the build. `@symbiote-native/angular`/`@symbiote-native/slider`'s `./angular` entry predate this, use a DIFFERENT mechanism (conditional `exports`, AOT build) — don't convert or copy that onto plain packages. Covers the mechanism table, the `files`-mandatory gotcha (`.gitignore` excludes `build/`), changeset ignore list, release scripts, CI workflow. Trigger: 'publish npm', 'release', 'changeset', 'version bump', 'publishConfig'."
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

## The mechanism — one sentence

**`main`/`module`/`types`/`exports` stay pointed at `src/index.ts` (unchanged,
still what Metro/tsc resolve in-repo); `publishConfig` repeats those same keys
pointed at `build/`, and pnpm swaps them in ONLY inside the packed tarball** —
local resolution never sees `publishConfig` at all.

```jsonc
// core/engine/package.json — the plain-package pattern (4 of 7 packages)
{
  "main": "src/index.ts",              // ← Metro/tsc resolve this in-repo, unchanged
  "module": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "files": ["build"],                   // ← REQUIRED, see Gotchas
  "publishConfig": {
    "access": "public",
    "main": "./build/index.js",         // ← only these are what `npm install`ers get
    "module": "./build/index.js",
    "types": "./build/index.d.ts",
    "exports": {
      ".": { "types": "./build/index.d.ts", "default": "./build/index.js" }
    }
  }
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

| Package | Mechanism | Why |
|---|---|---|
| `@symbiote-native/engine` | `publishConfig` override (above) | plain TS, no AOT need |
| `@symbiote-native/components` | same | plain TS |
| `@symbiote-native/react` | same | plain TS |
| `@symbiote-native/vue` | same, **multi-entry** (`.` + `./runtime-helpers`, mirrored 1:1 in `publishConfig.exports`) | plain TS, two entry points |
| `@symbiote-native/angular` | **pre-existing conditional `exports`** (`types`/`react-native`/`default`), built by `"prepare": "pnpm run ng:build"` (`ngc -p tsconfig.angular.json` → `build/angular/`) | needs real Angular AOT compilation, which `tsc --build` cannot do — only `publishConfig.access` was added, the exports block is untouched |
| `@symbiote-native/slider` | its `./angular` sub-export uses the same conditional pattern as above (`build-ngc/angular/`); `.`/`./vue`/`./react` use the plain `publishConfig` override pointed at `build/{core,vue,react}/index.js` | mixed: one AOT entry + three plain entries in one package |
| `@symbiote-native/android` | no build at all — ships tracked native `android/` source as-is | pure native module, no JS/TS to compile |

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

`.gitignore` had `.*/` to keep local-only dotfolders (`.claude`, `.docs`,
`.notes`, `.vendors`, …) out of git. That pattern also matches `.github/` —
so `.github/workflows/release.yml` existed on disk, was described by this very
skill, and `git status`/`git add -A` never showed it as untracked (blanket
dir-ignore, not a per-file miss) — it was **never committed, never pushed,
never run**, for as long as that rule existed. `git check-ignore -v <path>`
is what surfaces this; plain `git status` looks clean because an ignored
directory just doesn't appear at all, ignored or not-yet-tracked look
identical from a glance. Fixed with an explicit re-include after the blanket
rule:
```
.*/
!.github/
```
**Lesson for any FUTURE blanket-ignore rule in this repo**: verify with
`git check-ignore -v <path>` (or `git status --porcelain -- <dir>` showing
`??`) that it isn't also swallowing something that must ship — a directory
pattern that "obviously" only means local scratch dirs can silently net a
real one too.

## Changesets config (`.changeset/config.json`)

```jsonc
{
  "access": "public",
  "baseBranch": "master",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@symbiote-native/test-utils",   // internal test double, never published
    "@symbiote-native/docs-site",    // apps/*, private
    "Canary", "vue-sfc-canary", "vue-tsx-canary", "angular-canary"  // examples/*
  ]
}
```

`@changesets/cli` itself is catalogued (`pnpm-workspace.yaml` → `catalog:`
under "workspace tooling"), like every other dev tool in this repo — see
`symbiote-dependency-catalog`.

## Root scripts

```jsonc
"changeset": "changeset",                 // pnpm changeset — author a changeset for a PR
"version-packages": "changeset version",  // bump versions + changelogs from pending changesets
"release": "pnpm run typecheck && pnpm --filter @symbiote-native/angular --filter @symbiote-native/slider run ng:build && changeset publish"
```

`release` explicitly re-runs BOTH build mechanisms before publishing (the base
`tsc --build` via `typecheck`, and the two packages' AOT `ng:build`) rather than
trusting `prepare` ran recently — publishing must be idempotent from a cold
checkout.

## CI (`.github/workflows/release.yml`)

Push to `master` → `changesets/action@v1` either opens/updates a
`chore: version packages` PR (when unreleased changesets exist) or, once that
PR is merged, runs `pnpm run release` and publishes. Needs a repo secret
`NPM_TOKEN` (mapped to `NODE_AUTH_TOKEN`, which `actions/setup-node`'s
`registry-url` reads); without it the version-PR step still works, only the
actual `npm publish` call fails.

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

## Known pre-existing blocker (not caused by this setup)

`pnpm run <any script>` triggers pnpm's dependency-status check, which can
re-run every workspace package's `prepare` hook — including
`@symbiote-native/angular`'s `ng:build`. While the Angular adapter has outstanding
type errors (WIP, see `angular-adapter` skill), this makes `pnpm run release`
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

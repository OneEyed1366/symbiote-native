---
name: symbiote-local-dev-registry
description: "Use when getting a local `core/*`, `adapters/*` or `packages/*` build into an `examples/*` app — the everyday loop before a simulator build or a device measurement. Covers the LOCAL VERDACCIO registry that replaced the `pnpm pack` + `file:` tarball dance as of 2026-09-01: `pnpm run registry:setup|sync|publish|on|off|refresh|status`, the container and its tracked config under `scripts/verdaccio/`, and the gitignored `examples/<app>/.npmrc` that points a scope at it. Read BEFORE editing `scripts/local-registry.mjs`, `scripts/verdaccio/**`, `scripts/overlay-local-packages.mjs`, `scripts/trust-publishers.mjs`, `.npmrc.example`, or any `examples/*/package.json` dependency on `@symbiote-native/*`; and before diagnosing an example that runs code older than the repo. Holds why a tracked pointer at localhost is forbidden (npm has NO registry fallback — an unreachable configured registry is an install FAILURE, not a fall-through to npmjs), what the registry does NOT fix (npm's lockfile still short-circuits: same version + new bytes + plain `npm install` = `up to date` and stale code), why a real npm `canary` dist-tag was tried and reverted, and why every npm call in `trust-publishers.mjs` pins `--registry` explicitly. Trigger on: 'example runs old code', 'get my engine change into the example', 'file: tarball', '.tarballs', 'verdaccio', 'local registry', 'registry:sync', 'npm install serves stale', 'up to date but my change is missing'."
---

# The local dev registry

Getting this working tree's build of a `@symbiote-native/*` package into an `examples/*` app.

```bash
pnpm run registry:setup     # once per machine
pnpm run registry:sync      # publish everything, point every example at it, pull it in
cd examples/<app>/ios && pod install
```

`registry:status` says whether the registry is up and which examples point at it.
`registry:off` returns everything to npmjs. Every command with no arguments means EVERYTHING —
every publishable package, every example.

## Why this replaced the tarball dance

The old loop re-pointed an example's manifest at a `.tarballs/*.tgz` and reinstalled. It worked,
and it wrote machine-local install state into a **tracked** file. Measured 2026-09-01: six
`examples/*/package.json` and five `package-lock.json` were dirty with it at once, and the only
thing between that and a commit was somebody remembering. A repo-wide commit pass had three of them
staged before a peer stopped it.

Under the registry the manifest is never touched. It keeps the ordinary public version literal
(`"0.3.0"`), and a gitignored `examples/<app>/.npmrc` decides where that version resolves from.
Verdaccio serves the local build under the same version — the "override public packages" case it
exists for.

## The fallback question, which decided the shape

**npm has no registry fallback chain.** A configured registry that is unreachable is a hard install
failure, not a quiet fall-through to npmjs. So a tracked `registry=http://localhost:4873` would
break `npm install` for every clone not running Verdaccio — and break it with a network error that
reads as a broken machine rather than a bad commit.

Hence: the pointer is gitignored, a fresh clone has none, and the manifest's public version resolves
from npmjs exactly as before. That is the fallback and it is the DEFAULT state. Opting in is
`registry:on`, opting out is `registry:off`.

### "Neither touches a tracked file" was FALSE — there is a second channel, and it is the lockfile

That sentence stood here and named only the config. `.npmrc` decides where npm LOOKS;
`package-lock.json` records where it FOUND it, as one `"resolved": "http://localhost:4873/..."` per
package — and npm PREFERS that URL on a later install. So a committed lockfile breaks a clone in
exactly the way a committed `.npmrc` would, and it gets there through an ordinary `npm install`
rather than through anyone editing a config.

Measured 2026-09-02, one `registry:refresh` across the examples:

```
examples/react solid svelte vue-sfc vue-tsx      8-9 lines of localhost:4873
examples/expo-*                                  30-31 lines
examples/angular                                 clean — it has ALWAYS gitignored its own lock
examples/bare-rn                                 clean — zero @symbiote-native dependencies
```

Nothing was committed and nothing would have said so.

**This does NOT mean Verdaccio is the wrong tool, and the distinction is worth keeping.** The
tarball route contaminated the manifest AND the lock; the registry contaminates only the lock. The
manifest is the half that matters most — a human reads it, a reviewer sees the diff, and a `file:`
specifier there is a hard failure. The registry closed that half and the claim was simply written
one word too wide.

The real mismatch was elsewhere: **twelve examples TRACKED a file whose documented repair, all over
this repo, is `rm -f package-lock.json`.** A file whose standard fix is deletion is not one anyone
reads as a source of truth. `examples/angular` had already decided this for itself and the decision
never propagated.

Resolved 2026-09-02 by ignoring the lock in the eleven examples that resolve our packages.
`bare-rn` keeps its lock deliberately: it is the stock-React-Native measurement baseline, so a pin
has real value there, and it declares no `@symbiote-native` dependency to contaminate. Checked
first, because it is what makes untracking safe: **no `npm ci` runs anywhere in this repo** — not in
a workflow, not in a script — so nothing depended on those lockfiles.

Guarded by `tests/no-tracked-local-registry.test.ts`, which now carries three independent rows: no
tracked `.npmrc` with a loopback registry; no lockfile STAGED for commit resolving through one
(read from the git index, never from disk — a working tree full of localhost is the normal state
while the local loop is in use); and the rule itself, that an example declaring an
`@symbiote-native` dependency does not track its lockfile at all. The third exists because after
the untracking the second inspects only `bare-rn`, which can never fail it — a guard reading a
permanently clean subject. Both lockfile rows are derived from `examples/` on disk, so the next
example is covered the day its folder exists.

## What it does NOT fix — measured, not assumed

npm's lockfile still short-circuits. Publish new bytes under the SAME version, run a plain
`npm install`, and npm prints `up to date` and leaves the old copy in place:

```
publish 0.3.0 (marker absent)  -> install        -> marker absent   baseline
publish 0.3.0 (marker present) -> npm install    -> up to date, marker ABSENT   <- the trap
                                  npm i pkg@0.3.0 -> marker present   468ms
                                  rm lock + install -> marker present
```

This is the identical failure the tarball route has. The difference is the REPAIR: one explicit
`npm install <name>@<version>` where the tarball route needed the package folder AND
`package-lock.json` deleted first — and still missed on three of five examples once.
`registry:refresh` is that explicit install, derived from what each example's manifest declares.

**`pod install` is still owed afterwards.** Replacing a package folder deletes
`@symbiote-native/splash-screen/.rn-bootsplash/`, which the podspec vendors at pod-install time.
Skip it and the next `xcodebuild` dies on a missing `RNBootSplash.mm`, buried in clang argument
dumps that read as a broken toolchain.

## The three tools, and they are not interchangeable

```
registry:*                 an example installs a real package from a real registry. The default
                           loop. Manifest untouched, works for any package, needs a reinstall.
overlay-local-packages     replaces the CONTENTS of installed folders, no install at all. What CI
                           uses; fastest locally. Installs NO dependencies, so it is safe only when
                           the packed dependency set is a subset of what the example already has —
                           now CHECKED per example at run time, not trusted to a list.
.tarballs + file:          the retired path. Still the answer for a package the registry cannot
                           serve, and the reason the old rule's diagnostics stay readable.
```

## Why not a real npm dist-tag

Tried on this project and reverted the same day — 2026-07-24, full record in
`symbiote-release-publishing`. npm's `unpublish` and `deprecate` are OTP-gated even for a token
carrying an explicit 2FA bypass (that bypass only ever covers `publish`), so a snapshot can never be
removed and every dev iteration would be a permanent public immutable version.

Locally that blocker dissolves — you have the OTP — and the accumulation gets WORSE, because perf
work republishes many times a day. A registry you own has neither problem. `unpublish: $all` in
`scripts/verdaccio/config.yaml` is what lets the same version be replaced; real npm never will,
which is why the publish loop here is `unpublish --force` then `publish`.

## `trust-publishers.mjs` pins its registry, and that is load-bearing

`scripts/trust-publishers.mjs` runs LOCALLY and configures OIDC trusted publishing on npmjs — and
for a package that does not exist yet it performs the REAL first publish. It used to call
`npm view / whoami / login / publish / trust` with no explicit registry, resolving from config.

npm MERGES user config, so one `@symbiote-native:registry=http://localhost:4873/` line in
`~/.npmrc` — a natural thing to add by hand after reading `scripts/verdaccio/README.md` — would
redirect all of it silently. `npm view` would answer from the local registry and report an
unpublished package as published, skipping the real first publish; or the publish would go to
localhost and print success. The package would read as trusted-and-published while npmjs had never
heard of it.

All six call sites now carry `--registry=https://registry.npmjs.org`. One flag removes the class,
which beats reasoning about whose config is set.

CI was never exposed: `release.yml` carries `id-token: write` and an explicit
`registry-url: https://registry.npmjs.org` on `setup-node`, and the OIDC exchange does not read a
registry URL from config at all.

## Setup details worth not re-deriving

- **`scripts/verdaccio/`, not `.verdaccio/`.** The repo's `.gitignore` has a blanket `.*/` rule and
  git cannot re-include a file whose parent directory is excluded — no negation rescues a config
  from a dot-directory. Moving it was the fix; fighting the ignore rule was not.
- **Storage is a named docker volume**, not a bind mount into the repo: Verdaccio runs as uid 10001
  and a host-owned directory it cannot write to fails at first publish, long after setup reported
  success.
- **The token exists to satisfy the npm CLI, not the registry.** The config grants anonymous
  publish; npm still refuses to attempt one with no token configured for the host. `registry:setup`
  creates it, caching in the gitignored `scripts/verdaccio/token`. First run REGISTERS; a later run
  against a registry that already knows the user must LOG IN instead (same PUT, basic auth) — which
  is the normal state after the token file is deleted while the container's storage survives.
- **`@symbiote-native/*` is deliberately NOT proxied.** A miss must be a miss; a silent
  fall-through to the published version is the exact staleness this ends. Everything else proxies
  npmjs and caches, so `react-native` and `expo-*` resolve normally.
- **On colima the VM never returns host RAM** once it has grown. A long-lived container holds it
  until `colima stop && colima start`.
- Loopback only, no auth. Do not expose it to another machine.

## The manifest does not change — verified, and it is the whole win

The migration off `file:` needs **zero** tracked-file edits. `examples/*/package.json` at HEAD
already carries caret ranges (`"@symbiote-native/engine": "^0.3.0"`), and a caret resolves from the
local registry exactly as it resolves from npmjs — measured 2026-09-01, all six examples, lockfile
`resolved` reading `http://localhost:4873/...` and every marker present.

A `file:` specifier was never the committed state; it was always a working-tree modification
somebody had to remember not to commit. So the fix is not "swap the specifier", it is "stop needing
one".

Worth stating because the obvious migration is to rewrite the manifests, and it was written and
then reverted here: turning `^0.3.0` into `0.3.0` looks tidier and silently changes resolution
semantics — a clone would stop picking up a published patch. If a manifest diff appears while doing
this, that is a signal to stop, not a step.

## A long step that prints on COMPLETION is indistinguishable from a hang

`registry:publish` with no arguments packs **36** packages. Each one runs `pnpm pack` (which for
Angular and the other `ng:build` packages runs a real compiler), then `npm unpublish`, then `npm
publish` — all three with `stdio: 'ignore'`. The per-package line was printed AFTER the publish
succeeded, so the run showed `publishing every package ...` and then nothing for minutes.

Reported 2026-09-01 as "either it hung or we never added progress". It had not hung. But the two
states were not distinguishable from the terminal, and the rational response to that is Ctrl+C —
which is what makes this a defect and not a cosmetic complaint.

Print the label BEFORE the work and complete the line after it:

```
  [ 1/36] @symbiote-native/engine@0.3.0 ... published
  [ 2/36] @symbiote-native/components@0.3.0 ... FAILED
```

The step that is CURRENTLY running is the only one worth naming, because it is the one that can
wedge. `refresh` got the same treatment (`[n/13] examples/<name>` before each install).

The general form, and it applies to every long script in `scripts/`: **a progress line emitted on
success reports the past; a hang is about the present.** If a run can be silent for longer than a
person will wait, name the in-flight item.

## Two smaller things worth not re-deriving

- **`scripts/local-registry.mjs` executes on IMPORT.** There is no `import.meta.main`-style guard,
  so pulling it into another script to reuse `publishablePackageEntries()` runs a command as a side
  effect (observed: importing it printed a full `status`). Import the helper it uses, not the
  script.
- **`examples/bare-rn` gets an `.npmrc` from `registry:on` with no argument.** Harmless — it
  declares nothing in the `@symbiote-native` scope, so there is nothing to redirect — but it is the
  one example that by design must not know these packages exist
  (`<examples_vs_dot_examples>`), and every other audit in the repo excludes it explicitly. If a
  future change makes the pointer do anything, exclude it here too.

## A rebuild is part of "update the registry", and `tsc --build` is not that rebuild

`pnpm pack` ships whatever is in `build/`. A clean `tsc --build` is NOT sufficient: `prepublish-build`
also runs `fix-esm-extensions`, `copy-svelte-sources` and `emit-svelte-declarations`, and packing
between those steps produces a tarball that installs and then fails at runtime on import
specifiers. Angular is the exception that hides this — it carries `prepack: ng:build`, so it
rebuilds itself and looks fine while its neighbours do not.

So the honest loop before a device measurement is `pnpm run prepublish-build` and THEN
`registry:sync`. Skipping the build is the same measurement-that-lies failure the lockfile
short-circuit above produces, arrived at from the other end.

## Diagnosing "the example is running old code"

Order matters — the cheap checks first, and the version number is never one of them.

1. `pnpm run registry:status` — is the registry up, does this example point at it?
2. Grep the INSTALLED build for a string only the new version contains. A manifest version tells you
   nothing: the same version string has carried different content repeatedly in this repo
   (`css-parser` 0.4.0 with and without `:active` is the worked example).
3. If the string is missing, the lockfile short-circuited: `pnpm run registry:refresh <example>`.
4. `pod install`, then build.

The failure mode this order exists for: a run that reports success while the example measures last
week's code. It does not fail, it lies — and a perf number taken on it is worse than no number.

---
name: symbiote-local-dev-registry
description: "Use when getting a local `core/*`, `adapters/*` or `packages/*` build into an `examples/*` app — the everyday loop before a simulator build or a device measurement. Covers the LOCAL VERDACCIO registry that replaced the `pnpm pack` + `file:` tarball dance as of 2026-09-01: `pnpm run registry:setup|sync|publish|on|off|refresh|status`, the container and its tracked config under `scripts/verdaccio/`, and the gitignored `examples/<app>/.npmrc` that points a scope at it. Read BEFORE editing `scripts/local-registry.mjs`, `scripts/verdaccio/**`, `scripts/trust-publishers.mjs`, `.npmrc.example`, or any `examples/*/package.json` dependency on `@symbiote-native/*`; and before diagnosing an example that runs code older than the repo. Holds why a tracked pointer at localhost is forbidden (npm has NO registry fallback — an unreachable configured registry is an install FAILURE, not a fall-through to npmjs), what the registry does NOT fix (npm's lockfile still short-circuits: same version + new bytes + plain `npm install` = `up to date` and stale code), why a real npm `canary` dist-tag was tried and reverted, and why every npm call in `trust-publishers.mjs` pins `--registry` explicitly. ALSO holds the four iOS build failures that follow any reinstall and read as anything but an install problem: the deleted `.rn-bootsplash/` pod sandbox, the LINKER error naming `facebook::react::Sealable`/`getDebugProps` (a stale prebuilt `React.xcframework` flavor, with a two-command probe and the red-herring `ld: warning` lines), `examples/expo-*/node_modules` at 2.2GB from ~25 nested `expo` copies, and `EINTEGRITY` on a retry after a failed install. Trigger on: 'example runs old code', 'get my engine change into the example', 'file: tarball', '.tarballs', 'verdaccio', 'local registry', 'registry:sync', 'npm install serves stale', 'up to date but my change is missing', 'pod install', 'Build input file cannot be found', 'RNBootSplash.mm', 'Undefined symbols for architecture arm64', 'React.xcframework', 'RCT_USE_PREBUILT_RNCORE', 'node_modules is huge', 'EINTEGRITY'."
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

### And there is a THIRD channel, created BY the untracking: `ios/Podfile.lock`

Observed 2026-09-07, one `registry:sync` plus the `pod install` it obliges:

```
examples/react/ios/Podfile.lock    react-native-safe-area-context 5.8.0 -> 5.9.1, 17 lines
```

Nothing about `@symbiote-native` and no `localhost` anywhere, so both lockfile rows of the guard
above are blind to it — and it is tracked in **all thirteen** examples, `bare-rn` included, while
`package-lock.json` is now tracked in `bare-rn` alone.

The two facts are one fact. Untracking the JS lock removed the pin on THIRD-PARTY versions too, so
a caret range is free to float on any reinstall; `Podfile.lock` sits downstream of that resolution
and is the only tracked file that records the drift. The local loop therefore still dirties tracked
state — just one layer further down than the channel that was closed, and through a file whose diff
reads as an ordinary dependency bump rather than as local dev residue.

Not necessarily a defect: a floating third-party version is what an untracked lock MEANS, and the
untracking was deliberate and correct for its own reason. What is wrong is that it is invisible —
`git status` after a refresh shows a pod version change with nothing saying a refresh caused it.

So: **after any `registry:refresh` + `pod install`, read `git diff examples/*/ios/Podfile.lock`
before staging anything**, and decide the bump on its merits rather than sweeping it into an
unrelated commit. And when a native lock moves with no JS lock beside it to explain why, this is
the mechanism — do not go looking for a podspec change.

The general form, and it is this skill's own lesson repeated a third time: **closing one channel of
local-dev contamination relocates it rather than removing it.** `file:` in the manifest ->
`localhost` in `package-lock.json` -> a floated version in `Podfile.lock`. Each fix was right and
each left a quieter successor, so the question to ask of the next one is not "is the manifest clean"
but "what tracked file does an install still reach".

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

## The tools, and they are not interchangeable

```
registry:*                    an example installs a real package from a real registry. The default
                              loop, and the only local one. Manifest untouched, works for any
                              package, needs a reinstall.
.tarballs + file:             the retired path. Still the answer for a package the registry cannot
                              serve, and the reason this file's diagnostics stay readable.
check-packed-consumer-bundles CI only. Packs every direct internal dependency, installs it into a
                              disposable copy of the example, type-checks and bundles both
                              platforms. Never touches a real example directory.
```

**`overlay-local-packages.mjs` and `check-bundle-framework-isolation.mjs` were deleted
2026-09-02.** The overlay swapped folder contents without running an install, so it could not carry
a newly added dependency and left most adapters on registry builds — the self-confirming-probe trap
in `.claude/rules/example-shared-package-staleness.md`. Anything still naming it is stale; use
`registry:refresh`.

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

## The container outlives a config MOVE, and dies on its next restart — exit 127

Measured 2026-09-07. A publish hung, and `registry:status` said `DOWN`. The container had exited
**127** nine minutes earlier, and its logs end mid-work with no error at all — the last lines are
ordinary bcrypt timings, which reads like resource starvation and is not.

`docker inspect` carries the whole answer, and it is the only place it appears:

```
failed to create shim task: … error mounting
"…/symbiote/.verdaccio/config.yaml" to rootfs at "/verdaccio/conf/config.yaml":
cannot create subdirectories in "…": not a directory:
Are you trying to mount a directory onto a file (or vice-versa)?
```

The config moved from `.verdaccio/` to `scripts/verdaccio/` long ago (git cannot track a file under
a dot-directory — that reason is recorded below). **A RUNNING container keeps its old bind mount, so
nothing failed until something restarted it** — here a colima or daemon restart, months later. On
that restart docker found no file at the stale path, created a DIRECTORY there, and the mount became
permanently impossible: the container can never start again.

Fix, and it is safe because storage is a named volume (`verdaccio-storage`) that the container does
not own:

```bash
docker rm verdaccio && pnpm run registry:setup
```

Nothing published is lost. The stray `.verdaccio/config.yaml/` DIRECTORY docker created is junk and
can be deleted.

**Two things generalise, and the second is the one that cost the time.**

A long-lived container is a snapshot of the paths that existed when it was CREATED. Any repo
reorganisation that moves a mounted file leaves a container that works until its next restart and
then never again — so after moving anything a container binds, recreate it rather than trusting the
running one.

And **`docker logs` is the wrong instrument for a container that failed to START.** The logs are the
last successful run's, so they end normally and invite a resource-pressure story; the start failure
lives in `docker inspect --format '{{.State.Error}}'`. The climbing `took 1893ms to verify` lines
were read as starvation and were simply the previous session's tail. Read `.State.ExitCode` and
`.State.Error` FIRST — 127 means the process was never launched, which already rules out anything
that happens while running.

## Diagnosing a publish that hangs: check the registry is UP before anything else

`registry:publish` runs `pnpm pack` / `npm unpublish` / `npm publish` with `stdio: 'ignore'`, so a
dead registry produces silence rather than an error. The same session had earlier guessed a pnpm
store lock for exactly this symptom, on no evidence, and that guess was wrong.

`pnpm run registry:status` is the first command, always. It costs nothing and it distinguishes the
two states the silence cannot.

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

**SUPERSEDED 2026-09-11 — `commandPublish` now runs `pnpm run prepublish-build` itself, always,
before packing anything.** A manual pre-step was a step someone eventually skipped — the same
"a list you have to remember is a list that goes stale" reasoning `commandPublish` already applies
to naming packages, now applied to remembering the build. `registry:publish` and `registry:sync`
(which calls `commandPublish` internally) are a single command again: `pnpm run registry:sync`
alone rebuilds everything, publishes it, points every example at the registry, and refreshes them.
The full build costs ~27s (`stale-build-output.md`) and runs unconditionally — there is no flag to
skip it, on purpose, because a skippable build is a build someone skips under a deadline. If the
build itself fails (a type error), `commandPublish` aborts before packing anything, which is the
correct failure: a broken build must never reach the registry.

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

## The iOS build failures that follow a reinstall

All four survive the switch from tarballs to the registry, because `registry:refresh` replaces the
package FOLDER exactly as `npm install` did. None of them reads as an install problem.

### `pod install` is not optional after a reinstall

`@symbiote-native/splash-screen`'s podspec vendors react-native-bootsplash's native sources into a
`.rn-bootsplash/` folder next to itself, at **podspec evaluation** time — during `pod install`, not
on package install. Replacing the package folder deletes that folder, and the next `xcodebuild`
fails with `Build input file cannot be found: .../.rn-bootsplash/ios/RNBootSplash.mm`, buried under
hundreds of lines of clang argument dumps that make it look like a broken toolchain. It is a stale
pod sandbox; `pod install` regenerates it. (That podspec's own comment says why the copy exists.)

### A LINKER error naming React's own C++ internals — a stale prebuilt DOWNLOAD

```
ld: warning: Could not find or use auto-linked framework 'React_RCTAppDelegate': not found
Undefined symbols for architecture arm64:
  "facebook::react::Sealable::Sealable()", "facebook::react::ShadowNode::getDebugName() const",
  "…::BaseViewProps::getDebugProps() const", …
  referenced from: RNSSafeAreaViewShadowNode.o, RNSScreenStackHeaderConfigShadowNode.o
```

**The `ld: warning` lines are a RED HERRING** — those modules live inside the single merged
`React.framework` and the same warnings appear in a build that links fine. **Read the
`referenced from:` object names**; they name the third-party Fabric library that is actually
unsatisfied (here `RNS*` = react-native-screens, pulled in by `@symbiote-native/navigation`).

RN 0.86 links a PREBUILT `React.xcframework`, downloaded per configuration
(`reactnative-core-0.86.0-debug.tar.gz` ~94MB / `-release.tar.gz` ~30MB). The `getDebug*` /
`DebugStringConvertible` / `Sealable` surface exists only in the DEBUG flavor, so a Debug app linked
against the release-flavor framework fails exactly this way. CocoaPods reuses a stale extracted
`Pods/React-Core-prebuilt/` rather than re-extracting, because the pod's source URL did not change.

Diagnose in one command — size and symbols are unambiguous:

```bash
B=ios/Pods/React-Core-prebuilt/React.xcframework/ios-arm64_x86_64-simulator/React.framework/React
stat -f %z "$B"; nm -gU "$B" | grep -c getDebugProps     # release: ~24MB / 0   debug: ~137MB / 80
```

Fix: `rm -rf ios/Pods/React-Core-prebuilt ios/Pods/ReactNativeCore-artifacts` then `pod install`,
and re-run the probe to confirm the debug flavor landed BEFORE spending another build. Do **not**
reach for `RCT_USE_PREBUILT_RNCORE=0` first — that costs a 30-minute from-source build to work
around a stale download.

**But first check there is anything to fix at all: the probe reading "debug" is the normal resting
state.** The podspec's `source` is hardcoded to the `-debug` tarball, so a fresh `pod install` always
leaves the debug flavor extracted, whatever you intend to build. RN then swaps it per build —
`React-Core-prebuilt` carries a `before_compile` phase, `[RNCore] Replace React Native Core for the
right configuration`, reading `DEBUG=1` out of `GCC_PREPROCESSOR_DEFINITIONS` and running
`react-native/scripts/replace-rncore-version.js`. Both tarballs sit side by side in
`Pods/ReactNativeCore-artifacts/`, so the swap is local — no network. Verified on `examples/react`:
probe before a Release build 131MB/80 symbols, after 24MB/0. **"Pods holds debug while I build
Release" is NOT the bug**, and clearing pods over it wastes a build. The failure above is
specifically a stale or missing download, and its signature is the LINKER error, not a probe result.

### `examples/expo-*/node_modules` at 2.2-2.3GB each

89MB × ~25 duplicated `expo` copies, one per `@symbiote-native/*` Expo wrapper. None of the six
`expo-*` examples declares `expo` itself — every wrapper reaches it transitively via
`expo-sensors`/`expo-battery`/etc. With no root-level request anchoring a version, npm's arborist
nests a separate `expo` copy inside every wrapper's own `node_modules`, even though all ~25 resolve
to the SAME version. (`expo-modules-core`, depended on identically, hoists fine — the difference is
specifically that nothing requests `expo` from the root, not a generic dedup failure.)

Fix, which is also the CORRECT shape — a real `create-expo-app` project always declares `expo`
directly: add `"expo": "<pinned SDK version>"` to the example's `package.json`, then
`rm -f package-lock.json && rm -rf node_modules && npm install`. Verified across all six:
2.2-2.3GB -> 600-660MB each, zero nested copies, no peer conflicts. If the pinned `expo` and the
catalog's `expo-modules-core`/`expo-sensors` versions ever drift apart, that is a real SDK
compatibility bug (modules ship in lockstep with one SDK release) — fix the skew, not the symptom.

### `EINTEGRITY` on a retry after a FAILED install — delete the lockfile, not `node_modules`

A run that fails partway can still write a partial `package-lock.json` recording the OLD hash. The
next `npm install` then errors `EINTEGRITY … wanted <old> but got <new>` even after
`rm -rf node_modules` and even after `npm cache clean --force` — because the stale hash lives in the
project's own lockfile, not in npm's cache. `rm -f package-lock.json` before retrying. Same failure
shape as the lockfile short-circuit above (stale integrity vs changed bytes), just triggered by a
failed install instead of a re-publish.

---
paths:
  - 'examples/**'
  - 'core/components/**'
  - 'core/engine/**'
  - 'scripts/overlay-local-packages.mjs'
  - 'scripts/check-bundle-framework-isolation.mjs'
---

# A `core/*` change is invisible to `examples/*` — and the failure is a blank white screen

`examples/*` is a standalone `npm install` tree: `@symbiote-native/engine` and
`@symbiote-native/components` resolve to **published registry versions**, pinned as literals.
Re-packing the adapter does NOT bring your `core/` change along — the adapter tarball only
_declares_ `"@symbiote-native/components": "0.4.0"`, and npm happily serves the 0.4.0 that is on
npm, not the 0.4.0 in your worktree.

So the moment an adapter calls a **newly added** shared API, the app breaks — with a stack that
points nowhere near the cause. Measured 2026-08-17, after `createDescriptorShapeGuard` moved into
`core/components`:

```
TypeError: undefined is not a function
    at descriptor-to-solid.js:34          ← module TOP LEVEL, during require
    at loadModuleImplementation
TypeError: Cannot read property 'View' of undefined
    at App (App.tsx:32)
```

The call is at module scope (`const shape = createDescriptorShapeGuard('…')`), so the _module_
throws while loading, its exports stay empty, and the whole `@symbiote-native/<fw>` barrel becomes
`undefined`. On screen: a blank white app, no red box worth reading. The obvious-looking diagnosis
("the root View lost its `flex: 1`") is wrong and costs a debugging round.

**Nothing in-repo catches this.** `pnpm typecheck`, `pnpm test`, eslint and even a full Metro
bundle all resolve `core/*` from the workspace, where the new API exists.

## The fix

Pack the shared package too, and add it as a DIRECT dependency of the example (it is normally only
transitive, so there is nothing to overwrite):

```sh
cd core/components && pnpm pack --pack-destination ../../examples/<app>
# package.json: "@symbiote-native/components": "file:./symbiote-native-components-<version>.tgz"
cd examples/<app>
rm -rf node_modules/@symbiote-native/{components,<fw>} && rm -f package-lock.json && npm install
cd ios && pod install
```

Keep the tarball's version equal to the one the adapter tarball pins, or npm installs a second,
nested copy and the adapter keeps resolving the stale one. Verify one hoisted copy:
`find node_modules -path "*@symbiote-native/components/package.json" | wc -l` → `1`.

## The 2-second gate that turns this from a device bug into a check

Statically compare what the adapter's built output IMPORTS from the shared packages against what
the INSTALLED copies actually export — run from the example directory:

```js
// collect every named import from '@symbiote-native/{components,engine,css-parser}'
// across node_modules/@symbiote-native/<fw>/build/**/*.{js,jsx}
// then assert each name appears in node_modules/<pkg>/build/index.js
```

A miss names the exact symbol and package. Run it after every re-pack; it costs nothing and it is
the only signal that appears before the simulator.

## The same gap, in CI: `overlay-local-packages.mjs` was `packages/*`-only

`scripts/overlay-local-packages.mjs` exists to give `check-bundle-framework-isolation.mjs`
this-commit's build instead of the registry version (same problem, CI-side). It only overlaid
`packages/*` (slider, navigation, …) — `core/engine`, `core/components`, and every
`adapters/*` stayed on whatever's published, so example source that outruns the last publish of
those packages fails CI with an error that looks unrelated to staleness.

Measured 2026-08-21: `examples/angular`'s `BenchmarkScreen`/`JsFrameRateMeter` called
`readCommitProfile`/`registerPostCommit` — real exports of `core/engine`, absent from the
published `0.2.0` — and got `TS2305: has no exported member`. Its `SectionList` binding to
`getItemLayout` failed `NG8002` the same way, because `@symbiote-native/angular@0.7.0` (published)
predates that Input. Both read as ordinary source bugs, not a stale-package symptom.

Fix: `overlay-local-packages.mjs` now also overlays `core/engine`, `core/components`, and
`adapters/angular` (an `OVERLAY_ONLY` allowlist alongside the `packages/*` prefix match) — picked
narrowly, not blanket-widened to every `core/`+`adapters/`. Also overlaying `core/css-parser` and
`adapters/{react,vue,svelte}` was tried and reverted: `core/css-parser` gained a real new
dependency (`lightningcss`) that the overlay's swap-the-folder-contents trick can't install (it
never touches `package-lock.json`, only `pnpm pack` + extract over an already-`npm install`ed
folder — new transitive deps need the full `file:` + reinstall dance from the section above,
not this overlay), and the Vue/Svelte adapters called a `compileScopedCss` export the registry
`css-parser` doesn't have either. Widen this allowlist only when a specific example genuinely
needs it, and check whether the overlaid package pulled in a NEW dependency first.

## A half-migrated example is WORSE than a fully-registry one

Line 90 above named the risk (`compileScopedCss` export the registry `css-parser` lacks) for the
CI overlay script; the same mismatch hit `examples/*` for real on 2026-08-21, in two stacked
layers, both invisible to `tsc`/tests/eslint.

**Layer 1.** Someone had switched `engine`/`components`/`css-parser` from registry semver
(`^0.2.0`) to `file:../../.tarballs/symbiote-native-engine-0.2.0.tgz` in only 2 of 5 examples
(`solid`, `vue-tsx`). The other 3 (`react`, `svelte`, `angular`) kept the registry range —
resolving a DIFFERENT build behind the SAME declared version number. Startup crash, module-load
`TypeError: undefined is not a function`, in every example except the 2 that had fully moved.

**Layer 2, after fixing layer 1.** Each example's OWN framework adapter
(`@symbiote-native/{react,svelte,angular}`) was STILL on registry semver. The registry adapter's
compiled preprocessor (`@symbiote-native/svelte/build/preprocessor/scoped-styles.js`) called the
OLD css-parser export `classTokensIn` — renamed to `compileScopedCss` locally, no version bump —
which no longer exists in the now-local `css-parser`. Metro-time:
`does not provide an export named 'classTokensIn'`. The adapter tarballs already sitting in
`.tarballs/` were clean; only the registry-installed copies carried the stale call.

**Do not assume "internally consistent on registry" is safe to skip.** `vue-sfc` looked fine by
that reasoning (all deps same-family registry versions) and was left unchecked first — it needed
the identical fix once actually verified. Check every example the same way; category-based
exemption is not a substitute.

**Diagnostic** (grep/tsc miss both layers): extract a `.tarballs/*.tgz` and byte-diff its
`build/*.js` against each example's installed `node_modules/@symbiote-native/<pkg>/build/*.js`.
Same declared version + different bytes = the tell (layer 1). Then grep the installed adapter's
build tree for the Metro error's exact missing-export name to find which package still resolves
the stale API (layer 2).

**Fix — move together, not one dep at a time.** If ANY of an example's `@symbiote-native/*` deps
sits on a local `.tarballs/*.tgz`, every dep with local-dev churn must move with it — shared
(`engine`/`components`/`css-parser`) AND that example's own adapter, in the same pass:

```sh
# per example, once its shared deps go local:
rm -rf node_modules/@symbiote-native && rm -f package-lock.json && npm install
cd ios && pod install
```

A half-migrated example silently mixes an old published API surface with a new local one — worse
than leaving it fully on the registry.

## `check-bundle-framework-isolation.mjs` also needs Angular's `build/` before bundling

Every other example bundles straight from source; Angular's `index.js` imports
`./build/angular/src/App` — gitignored `ngc` AOT output, produced only by `npm run ng:build`.
Bundling before that step fails on the FIRST import with a plain "module not found", which reads
like a broken example, not a missing build step. Fixed by running `npm run ng:build` in
`buildBundleSources()` before the `react-native bundle` call, framework-gated on `angular`.

## Verifying an overlay: three checks, and one of them is not the obvious one

`scripts/overlay-local-packages.mjs` (see the section above) prints a confident `Done` whether or
not anything landed, so the verification is the real step. Grepping the installed build for a
symbol you just added is the obvious check and it is **not sufficient**: if the change went through
more than one iteration in the same session, an EARLIER build also contains that symbol and the
grep passes on a stale overlay. Measured 2026-08-22 — `flushNativeProps` existed in both the first
(slow, general-walk-fallback) implementation and the final union one.

Three checks, cheap, and the third is the one that actually settles it:

1. **A marker unique to the FINAL version**, not to the feature — a string from the last edit
   (e.g. a new `dlog` format), not the exported name.
2. **Exactly one copy**: `find <example>/node_modules -path "*@symbiote-native/<pkg>/package.json"`
   → 1. The overlay only replaces folders that already exist, so a nested second copy is skipped
   silently and may be the one the app resolves.
3. **A normalized whole-build comparison against a fresh local build** — every emitted file, not
   one. `fix-esm-extensions` runs at publish time, so a raw `diff` against a bare `tsc --build`
   output reports EVERY file as drifted purely because the installed copy says `from './node.js'`
   and `from './style/index.js'` where the built one says `from './node'`. Strip that rewrite
   before comparing or the check produces a 100% false-positive rate:

```py
t = re.sub(r"(from '\.[^']*?)(/index)?\.js'", r"\1'", pathlib.Path(f).read_text())
```

### Check ZERO: the overlay does not cover ADAPTERS, and its output looks complete anyway

`OVERLAY_ONLY` is `core/engine` + `core/components` + `adapters/angular`; everything else it touches
is `packages/*`. So `adapters/{react,vue,svelte,solid}` are silently NOT overlaid — deliberately (an
adapter overlay swaps in code the example's own manifest does not pin, so it needs the full `file:`
tarball dance), but nothing says so at run time. The log lists the six packages it DID overlay and
ends with `Done`, and a reader checking the packages it names finds every one correct.

Measured 2026-08-24: an overlay run against `examples/svelte` reported success while the adapter
stayed on the registry build, i.e. the one package the session had spent the day changing. The tell
was not in the log — it was that the installed adapter had no `./state-style` subpath. **So verify
the ADAPTER separately and first**: it is the package most likely to be the subject of the change
and the only one the overlay will not carry.

**And a probe that checks only what the overlay updates is guaranteed to come back clean — it is
self-confirming, not evidence.** Measured 2026-08-30: a session ruling out staleness as the cause of
a device defect grepped `engine/build/` and `components/build/` for the two fixes, found both, and
declared the example current. Those are exactly two of the three things `OVERLAY_ONLY` carries. The
adapter was six days old, its lowering transform 8.6K against the current 10.8K, and
`src/state-style.ts` — the whole `activeStyle` path the defect was about — was not in the build at
all. The right conclusion was available and the probe could not reach it.

The cheapest whole-package check is a diff, not a grep, and one line of it is a free date
fingerprint:

```bash
diff examples/<app>/node_modules/@symbiote-native/<fw>/build/index.js adapters/<fw>/build/index.js
```

Any difference means the installed adapter is not from this commit. `prepublish-build` runs
`fix-esm-extensions`, so a CURRENT build always says `import './register.js'` while an older packed
one says `import './register'` — Metro resolves both, so nothing fails, and the specifier is a
reliable tell that costs nothing to read.

**The asymmetry that should send you here first: exactly ONE adapter still shows a defect the
others stopped showing.** That reads as a framework-specific bug and is usually a slice-specific
one — the adapters were rebuilt at different times, and the overlay does not carry any of them.
Confirmed end to end on 2026-08-30: two adapters were fixed by a `core/` change and the third was
not; the third's defect closed with an adapter rebuild and no `core/` edit at all. Read that
adapter's installed bytes BEFORE forming a hypothesis about its framework — the hypothesis is
expensive to hold and the diff above costs one command.

**And an overlay leaves NO trace in git**, deliberately — it replaces the contents of installed
folders and never touches a tracked file. So "is this example's arm still the one I packed?" cannot
be answered from `git status`; only by reading the installed bytes. That cuts both ways: your own
pack is invisible to a teammate, and a teammate's run is invisible to you. Demonstrated 2026-08-24 —
a session verifying its own logging fix ran the overlay twice against `examples/solid` for real,
disturbing an arm nobody could see was disturbed. The tool now has `--dry-run` for exactly that
(a tool whose only job is to perturb an arm needs a way to check itself without perturbing one), but
the general point outlives the flag: **before measuring, re-read the installed bytes; before
perturbing someone else's example, say so.**

`--keep-tarballs <dir>` is the other half of that: the overlay packs into a temp dir and deletes it,
so the exact bytes it installed are gone the moment it finishes and a later question about what was
measured has no artifact to ask. The flag copies each tarball out before the cleanup. It needs a
destination and errors without one — a bare `--keep-tarballs` would otherwise swallow the following
example directory as its value and silently overlay the whole CI set instead.

**An overlay needs `pod install` after it, exactly like an `npm install` does.** Root CLAUDE.md
states the rule for the reinstall path — replacing a package folder deletes
`@symbiote-native/splash-screen/.rn-bootsplash/`, which the podspec vendors at `pod install` time —
and the overlay replaces those same folders, so it has the same consequence and no warning of its
own. Measured 2026-08-24: an overlay-only round (no `npm install` at all) wiped the vendored sources
again. Skip the pods step and the next `xcodebuild` dies on `Build input file cannot be found:
.../.rn-bootsplash/ios/RNBootSplash.mm`, buried in clang argument dumps that read as a broken
toolchain.

**And when a teammate is editing the same tree, a slice can miss by a minute and still look right.**
Verify by COMPARISON, not by sequence: the installed artifact must equal a build of the CURRENT
source, and mtimes say which side moved.

```bash
stat -f "%Sm  %N" -t "%H:%M:%S" core/<pkg>/src/<file>.ts <example>/node_modules/.../build/<file>.js
diff -q core/<pkg>/build/<file>.js <example>/node_modules/@symbiote-native/<pkg>/build/<file>.js
```

Measured the same day: a fix landed in source at 12:37:15, the build ran at 12:36:14, the pack at
12:35:20 — sixty-one seconds, and every file-presence check passed while the example carried the
old behaviour. Ask the teammate to say when they are done with `core/*` before spending the
rebuild; otherwise it is a loop where both sides keep missing.

The same holds for `core/css-parser`, also outside the list — folder-swap it by hand after
re-checking the subset rule the script's own comment states (packed dependency set ⊆ installed), and
re-check it rather than inherit the verdict: it expires whenever either side gains a dependency.

**And running a bare `tsc --build --force` to produce that comparison leaves `build/` unpublishable**
— extensionless specifiers, which is exactly the bug `fix-esm-extensions` exists to prevent. Run
`pnpm run fix-esm-extensions` afterwards to put the tree back, and confirm with a byte-identity
check against the installed copy.

## `css-parser` is the one the overlay CANNOT fix, and its version number lies too

The allowlist above excludes `core/css-parser`, and the REASON it was excluded has since expired —
which is the more useful half of this entry. It was kept out because the package had just gained
`lightningcss`, and a folder swap never touches `package-lock.json`, so a dependency the example
lacks is simply absent. Measured 2026-08-23, the packed and installed dependency sets are now
identical and `lightningcss` is already hoisted everywhere, so a swap installs nothing new. The
general test, which is what to carry: **a folder swap is safe exactly when the packed package's
dependency set is a subset of what the example already has installed** — per-package, and it
expires the moment either side gains a dependency. Check it rather than inheriting the verdict.

It stays out of the CI allowlist regardless (nothing CI checks reads the parser's own output), so
every example still keeps whatever the registry published — and that is fine right up until a measurement depends on a parser feature that is only
in source.

Measured 2026-08-23, `examples/svelte`: installed `@symbiote-native/css-parser` **0.4.0** with zero
occurrences of the `:active` state token; `core/css-parser` **0.4.0** with three. Same version
string, different capability. So the engine rule — _a version cannot tell you what an example
carries, only a grep of its installed `build/` can_ — applies here verbatim, and here it is worse:
the engine at least gains and loses whole FILES, while this one differs only inside `selectors.js`.

The failure it produces is a measurement that lies rather than fails. A `:active` rule the
installed parser does not understand is **dropped silently at build time**, the device shows a
Pressable that never changes appearance, and the honest reading of that screen is "tier-2 does not
work" when what does not work is the parser. Nothing is red anywhere.

So: **anything that measures `:active` on device must pack `css-parser` through the full `file:`
tarball dance alongside the adapter**, not rely on the overlay. Verify the way you would verify the
engine:

```bash
grep -c "STATE_TOKEN\|':active'" examples/<app>/node_modules/@symbiote-native/css-parser/build/lightning/selectors.js
```

Zero means the rule will vanish, whatever the manifest says.

Run across the whole tree it is not one stale example, it is the resting state — measured the same
day, every one of the twelve reporting version **0.4.0**:

```
:active hits in the installed build/lightning/selectors.js
  0   angular · react · svelte · vue-sfc · vue-tsx · all six expo-*
  4   solid            <- the only one, and only because it was packed an hour earlier
  4   core/css-parser  <- source
```

So the default assumption for any example nobody has just packed is that the feature is ABSENT, and
the grid above is the check — not a per-example suspicion.

## A tool that disturbs a measurement arm needs a way to be tested without disturbing one

`scripts/overlay-local-packages.mjs` mutates an example's installed packages and does nothing else,
so for a long time the only way to check a change to it was to run it for real on somebody's
example. Measured 2026-08-24: validating a one-line logging change moved `examples/solid`'s
installed engine and components twice, while that example was a measurement arm. Nobody was
mid-run, so nothing was lost — but the arm was no longer the one its owner had packed, and that is
the failure this repo has spent days learning to fear: an arm that silently moved, rather than one
that failed.

`--dry-run` now prints both lists — what would be overlaid, what would be left on its published
build — and writes nothing. Use it for any change to the script itself, and before a run on an
example someone else is measuring.

Two details that make it honest rather than decorative:

- **The dry path and the real path print through ONE function.** A dry run whose wording can drift
  from the real one starts lying exactly where it is trusted.
- **The skipped list prints at the END, beside `Done`.** It was correct at the top too, and
  scrolled away behind ~200 lines of pack output. A detail that exists where nobody looks is worth
  no more than a detail that does not exist — the same shape as a summary that contradicts its own
  detail lines (`.claude/rules/test-harness-false-greens.md` §6), one layer out.

And the ask that goes with it: **before running any packaging or overlay step, check whether a peer
is measuring that example.** Three sessions share this tree; the cost of asking is one message and
the cost of not asking is somebody's afternoon.

---
paths:
  - 'examples/**'
  - 'core/components/**'
  - 'core/engine/**'
  - 'adapters/**'
  - 'packages/**'
  - 'scripts/check-packed-consumer-bundles.mjs'
---

# A `core/*` change is invisible to `examples/*` — and the failure is a blank white screen

> **SUPERSEDED AS THE DEFAULT LOOP (2026-09-01). Getting a local build into an example now goes
> through a local Verdaccio: `pnpm run registry:sync`, then `pod install`. Read the
> `symbiote-local-dev-registry` skill BEFORE reaching for anything below.** The `file:` tarball
> dance this file documents wrote machine-local install state into TRACKED manifests — six of them
> were dirty at once and three were staged before a peer stopped the commit — and the registry
> removes that class entirely: the manifest keeps its ordinary public version literal and a
> gitignored `examples/<app>/.npmrc` decides where it resolves from.
>
> **Everything below still applies, and that is the point of keeping it.** The staleness traps are
> properties of npm, not of tarballs: a same-version republish still short-circuits, an
> already-extracted package folder still satisfies the specifier, and deleting the lockfile alone
> is still not enough — verified against the registry path on the day it landed, by hitting the
> trap this file's own text warns about. What changed is the REPAIR (one explicit
> `npm install <name>@<version>`, or `registry:refresh`), not the failure.

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

## CI uses fresh tarball consumers — never an in-place overlay

`scripts/check-packed-consumer-bundles.mjs` closes this class of false green without maintaining
an allowlist of folders to overwrite. It performs the same sequence a real npm consumer does:

1. Read the five standalone examples (React, Vue SFC, Svelte, Angular, Solid).
2. Pack every direct `@symbiote-native/*` dependency they declare from the current checkout.
3. Copy each example's tracked files to a disposable directory.
4. Rewrite all direct internal dependencies there to `file:<fresh tarball>` and run a clean
   `npm install` with no lockfile.
5. Verify the installed manifest of every direct internal package is byte-equivalent JSON to the
   packed manifest, and that exactly one `@symbiote-native/engine` copy exists.
6. Run the example's real type check (or Angular AOT build).
7. Build production Metro bundles for **both iOS and Android**.
8. Inspect each sourcemap for foreign-framework package files and assert the current framework's
   freshly packed adapter actually reached the graph.

This deliberately replaces the old `pnpm pack` + extract-over-`node_modules` overlay. An overlay
could update package bytes but could not install a package's newly added dependencies, and it left
most adapters on registry versions. A disposable npm install exercises the whole packed contract:
exports, dependencies, peer ranges, singleton deduplication, framework transforms, and
platform-specific resolution.

The root command is:

```sh
pnpm run prepublish-build
pnpm run check:bundle-isolation
```

For a focused local run, narrow either axis without weakening CI's default matrix:

```sh
SYMBIOTE_CONSUMER_FRAMEWORKS=solid \
SYMBIOTE_CONSUMER_PLATFORMS=android \
  pnpm run check:bundle-isolation
```

The script copies only tracked example files and deletes its temporary directory on completion, so
it never mutates an example's committed `package.json`, lockfile, or `node_modules`.

## A half-local consumer is worse than a fully registry consumer

Do not manually replace only `engine`, only `components`, or only an adapter in an example. A
same-version mixture of local and registry artifacts can load a new caller against an old callee
and fail at module evaluation with a blank screen. Move the example's direct internal dependency
set together, remove `node_modules/@symbiote-native`, and reinstall. The CI matrix does this
structurally by rewriting every direct internal dependency in the disposable manifest.

## Angular must AOT-build before Metro

Angular's `index.js` imports `./build/angular/src/App`, which is gitignored `ngc` output. The matrix
therefore runs `npm run ng:build` before either platform bundle. A plain Metro call against a fresh
checkout otherwise fails at the first import and says nothing about package compatibility.

## Verifying that a local artifact REACHED an example: three checks, and one is not the obvious one

Whatever put the artifact there — `registry:refresh`, a `file:` tarball, a hand-swapped folder —
the tool reports success on its own terms and the verification is the real step. Grepping the
installed build for a symbol you just added is the obvious check and it is **not sufficient**: if
the change went through more than one iteration in the same session, an EARLIER build also contains
that symbol and the grep passes on a stale copy. Measured 2026-08-22 — `flushNativeProps` existed
in both the first (slow, general-walk-fallback) implementation and the final union one.

Three checks, cheap, and the third is the one that actually settles it:

1. **A marker unique to the FINAL version**, not to the feature — a string from the last edit
   (e.g. a new `dlog` format), not the exported name.
2. **Exactly one copy**: `find <example>/node_modules -path "*@symbiote-native/<pkg>/package.json"`
   → 1. A nested second copy is the one the app may resolve, and nothing announces it.
3. **A normalized whole-build comparison against a fresh local build** — every emitted file, not
   one. `fix-esm-extensions` runs at publish time, so a raw `diff` against a bare `tsc --build`
   output reports EVERY file as drifted purely because the installed copy says `from './node.js'`
   and `from './style/index.js'` where the built one says `from './node'`. Strip that rewrite
   before comparing or the check produces a 100% false-positive rate:

```py
t = re.sub(r"(from '\.[^']*?)(/index)?\.js'", r"\1'", pathlib.Path(f).read_text())
```

### Check ZERO: verify the ADAPTER separately, and first

A tool that moves a SUBSET of packages reports success for the subset, and a reader checking the
packages it names finds every one correct. Measured 2026-08-24 against `examples/svelte`: the run
reported success while the adapter stayed on the registry build — the one package the session had
spent the day changing. The tell was not in the log; it was that the installed adapter had no
`./state-style` subpath.

**A probe that checks only what the tool updates is guaranteed to come back clean — it is
self-confirming, not evidence.** Measured 2026-08-30: a session ruling out staleness as the cause of
a device defect grepped `engine/build/` and `components/build/` for its two fixes, found both, and
declared the example current. Those were exactly the packages that run carried. The adapter was six
days old, its lowering transform 8.6K against the current 10.8K, and `src/state-style.ts` — the
whole `activeStyle` path the defect was about — was not in the build at all. The right conclusion
was available and the probe could not reach it.

The adapter is the package most likely to be the SUBJECT of the change, so it is the one to read
first and the one a subset-moving tool is likeliest to leave behind.

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
one — the adapters are rebuilt at different times. Confirmed end to end on 2026-08-30: two adapters
were fixed by a `core/` change and the third was not; the third's defect closed with an adapter
rebuild and no `core/` edit at all. Read that adapter's installed bytes BEFORE forming a hypothesis
about its framework — the hypothesis is expensive to hold and the diff above costs one command.

**Which artifact an example carries leaves NO trace in git**, by design — the manifest keeps its
public version literal and only `node_modules` changes. So "is this example's arm still the one I
published?" cannot be answered from `git status`, only by reading the installed bytes. That cuts
both ways: your own refresh is invisible to a teammate, and a teammate's is invisible to you.
Demonstrated 2026-08-24 — a session verifying its own logging fix swapped `examples/solid`'s
packages twice for real, disturbing a measurement arm nobody could see was disturbed. **Before
measuring, re-read the installed bytes; before perturbing someone else's example, say so.**

**Replacing a package folder needs `pod install` after it, exactly like an `npm install` does.**
Root CLAUDE.md states the rule for the reinstall path — it deletes
`@symbiote-native/splash-screen/.rn-bootsplash/`, which the podspec vendors at `pod install` time.
Any route that swaps the same folders has the same consequence and no warning of its own. Measured
2026-08-24. Skip the pods step and the next `xcodebuild` dies on `Build input file cannot be found:
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

## `css-parser`'s version number lies too, and the reason it was ever skipped has expired

Every subset-moving tool this repo has had excluded `core/css-parser`, and the REASON has since
expired — which is the more useful half of this entry. It was kept out because the package had just gained
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
tarball dance alongside the adapter**, or publish it to the local registry. Verify the way you
would verify the engine:

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

A tool whose only effect is to mutate an example's installed packages has nothing to assert on, so
for a long time the only way to check a change to one was to run it for real on somebody's example. Measured 2026-08-24: validating a one-line logging change moved `examples/solid`'s
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

And the ask that goes with it: **before running any packaging or install step, check whether a peer
is measuring that example.** Three sessions share this tree; the cost of asking is one message and
the cost of not asking is somebody's afternoon.

### Editing the manifest is NOT enough — npm keeps the registry copy, silently

Every recipe above says "point the manifest at the tarball, then `npm install`". Measured
2026-08-31 while fixing the `:active` outage, that is not sufficient for a package the example
reaches TRANSITIVELY. Adding `"@symbiote-native/css-parser": "file:../../.tarballs/…tgz"` to
`dependencies`, deleting both `node_modules/@symbiote-native` and `package-lock.json`, and running
a plain `npm install` produced:

```
package.json    "file:../../.tarballs/symbiote-native-css-parser-0.4.0.tgz"
package-lock    "resolved": "https://registry.npmjs.org/@symbiote-native/css-parser/-/…"
installed       0 occurrences of the feature under test
```

The manifest says one thing and the lock records another, with no warning. The cause is that the
adapter tarballs pin the same package by an exact version, so npm has a satisfying registry
resolution in hand and never reaches for the local path.

**The form that works is the explicit install, per example:**

```bash
cd examples/<app> && npm install "file:../../.tarballs/symbiote-native-css-parser-0.4.0.tgz"
```

After it the lock's `resolved` is the `file:` path and the feature is present. So the verification
that matters is not "did the manifest change" but the same one this file already demands
everywhere else — **grep the installed `build/**` for a string only the new version contains**, per
example, after every install. Six examples reported a correct manifest and a stale build here, and
the install output said `ok` for all six.

## The `file:` manifest is local install state — it must never be committed

Every trick above rewrites `examples/*/package.json` to point at a `.tarballs/*.tgz`, and npm
records that path plus an `integrity` hash in `package-lock.json`. Both are machine-local: the
tarball is gitignored, so a clone that gets the manifest gets a specifier resolving to nothing.

The hazard is that a manifest looks like exactly the kind of file a commit is supposed to carry.
Measured 2026-08-30: a repo-wide commit pass had `examples/{vue-sfc,vue-tsx,svelte}` — three
manifests plus three locks — heading into the index, and the committer's own note was that a
`git add examples` would have caught it only once already staged. It was stopped because a peer
who had done the packing said so first.

```bash
command grep -l '"file:.*\.tgz"' examples/*/package.json   # must print nothing before a commit
```

Match on `.tgz`, not on a `../../.tarballs/` prefix: the path is relative to the example, so
`examples/svelte` spells it `file:.tarballs/…` and a prefix-shaped probe reports it clean. Run the
probe rather than reviewing a diff — a lock's stale `integrity` line reads as noise and the
specifier is one line among forty. Whoever did the packing knows which examples are dirty, so on a
shared tree the cheap version is to ask them before staging `examples/`.

## A package the examples resolve from NPM lags the repo silently, at the SAME version number

Every trick above assumes the shared package reaches an example through `.tarballs`. As of
2026-08-31 that set is seven — `angular components engine react solid svelte vue` — and
`@symbiote-native/css-parser` is **not** in it. Examples pull it transitively from npm, so a
feature committed to `core/css-parser` reaches no example at all until it is published.

Measured on `examples/svelte/App.css`, one input through two parsers that both report `0.4.0`:

```
repo build   3 rules   ["action-button", ":active"] -> opacity      KEPT
npm 0.4.0    2 rules   dropped, with "React Native has no pseudo-class state"
```

`:active` support is committed (`STATE_TOKEN` in `lightning/selectors.ts`) and shipped in the repo
build; published 0.4.0 predates it. So `.action-button:active` compiles to nothing in **all six**
examples, and the symptom on device is a button whose press runs its callback and changes nothing —
read as an adapter or engine defect, diagnosed three ways before anyone checked the parser.

Two things follow, and the second is the transferable one:

- **The version is not the check** — the same fact this file already records for the engine's
  `build/**`, one layer out. Diff BEHAVIOUR, not manifests: run the repo build and the installed
  build over the same input and compare outputs.
- **Enumerate what `.tarballs` covers against what `core/` and `packages/` contain**, the way
  `adapterNames()` replaced three hand-written adapter lists. A package absent from the packed set
  is invisible: nothing fails, the example just runs last month's code.

```bash
ls .tarballs/*.tgz | sed 's#.*/symbiote-native-##;s#-[0-9].*##' | sort > /tmp/packed
ls -d core/*/ packages/*/ | xargs -n1 basename | sort | comm -13 /tmp/packed -
```

Read the output as the list of shared packages an example can only get from npm.

### It presents as an ADAPTER bug, and the decisive probe is one command

Measured 2026-08-31 on `examples/solid`. Symptom as reported from device: **"buttons give no visual
feedback on any press, while the callback fires."** That reads as the press machine — and two
sessions spent the morning there, excluding `isAlreadyPublished`, `foldAriaProps` and the
`setNodePressed -> pushClassStyle -> commit` chain, all of which were correct.

Headless reproduction attempts came back GREEN on both lowered press routes (a `:active` class rule
and a specialised `activeStyle`), which is the tell: the engine resolves a pressed style fine when
something registered one. Nothing had.

The grep above says the token is absent; **compiling the app's own stylesheet with the INSTALLED
parser says why, and names the rule**:

```bash
cd examples/<app> && node --input-type=module -e "
const m = await import('@symbiote-native/css-parser');
const css = (await import('node:fs')).readFileSync('App.css','utf8');
const out = m.compileCssToRules(css, { filename: 'App.css' });
const rules = Array.isArray(out) ? out : out.rules;
console.log(rules.length, rules.filter(r => (r.tokens||[]).some(t => String(t).includes('active'))).length);
"
```

```
[@symbiote-native/css-parser] App.css: dropped a rule on `active` — React Native has no
pseudo-class state (no hover/focus/nth-child), so it can never match in React Native.
82 0            <- installed 0.4.0
83 1            <- core/css-parser 0.4.0, the rule being ['action-button', ':active']
```

The parser ANNOUNCES the drop, at build time, into a Metro log nobody reads — so the information
was never missing, only unread. `hasActiveRules` then stays false, `resolveActiveClassName` hands
back the very same unpressed object, and every press is a visual no-op with the machine running
correctly underneath.

Two things to carry. **Rank a "the demo does not react" report by whether the demo can express the
difference at all** (`.claude/rules/canary-visual-defects.md`) — here the missing half was the
compiler, one layer below every hypothesis anyone was testing. And **a headless green on the exact
reported shape is evidence about the CODE, never about the device**: it is what tells you to go
looking at what the device is running instead of at what the repo says.

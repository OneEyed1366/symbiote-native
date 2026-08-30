# Auditing cross-adapter parity: run the TypeScript checker, never grep

`<adapters_reach_full_feature_parity>` is P0, and the failure it guards against is silent — a
capability four adapters export and the fifth does not, with nothing red anywhere. `tsc` is happy,
every test passes, and the gap surfaces only when someone tries the import.

**Grep cannot answer the question.** Measured 2026-08-20: counting files that mention
`createPortal` gave `react 4 · vue 1 · svelte 1 · angular 2 · solid 1` and read as "everyone has
it, Solid nearly does". Every one of those Vue/Svelte/Solid hits was a COMMENT — including, in
Solid's case, a comment saying the feature is deliberately absent. The real exported surface:

```
           createPortal   other portal form                        createTunnel
react         yes           -                                        yes
vue           NO            NO                                       yes
svelte        NO            TunnelIn / TunnelOut                     yes
angular       NO            PortalDirective, PortalOutletDirective   yes
solid         NO            NO                                       NO
```

`createPortal` is React-only; the "4 of 5" gap was `createTunnel`. A grep-shaped answer sent an
agent looking for three reference implementations that do not exist.

## What `tests/adapter-barrel-parity.test.ts` already covers — and the hole beside it

That test exists, it is good, and it is NOT a substitute for this audit. It scans each adapter
barrel for names re-exported from the SHARED barrels (`core/engine/src/index.ts`,
`core/components/src/index.ts`) and compares `KNOWN_GAPS` for EQUALITY, so a passthrough added to
one adapter and forgotten in the others fails, and closing a gap without deleting its entry fails
too. That is the right design for passthroughs, and it already caught 22 of them.

**Its blind spot is everything an adapter OWNS.** `createPortal`, `createTunnel`,
`createAnimatedComponent` are implemented separately in each adapter, come from no shared barrel,
and are therefore invisible to it — which is exactly how Solid ended up with neither portal nor
tunnel while four adapters had one, with every test green. So: the barrel-parity test guards the
shared half, and this audit guards the adapter-owned half. Run both.

## The audit that does answer it

Resolve each barrel through the compiler and diff the export sets. Roughly 30 lines, ~1 min for the
whole set, and it follows re-exports, which is the whole point. **Take the adapter list off disk,
never write it out** — `scripts/lib/adapter-names.mjs` exists because three hardcoded copies of it
each silently omitted `solid`, the member added last, and an audit cannot report a name that is
absent from the list it is auditing. That failure applies to an audit RECIPE exactly as it applies to
a test, and this file handed out a hardcoded five for months:

```js
import ts from 'typescript';
import { adapterNames } from './scripts/lib/adapter-names.mjs';
const opts = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  noEmit: true,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
};
for (const a of adapterNames()) {
  const entry = `adapters/${a}/src/index.ts`;
  const program = ts.createProgram([entry], opts);
  const checker = program.getTypeChecker();
  const sym = checker.getSymbolAtLocation(program.getSourceFile(entry));
  names[a] = new Set(checker.getExportsOfModule(sym).map(s => s.getName()));
}
```

Run it from the repo root so `typescript` resolves; delete the script afterwards.

## Reading the output without drowning

The raw diff is ~131 names and almost all of it is legitimate. Filter to **names missing from
exactly one or two adapters** — a name absent from three or four is nearly always a per-framework
family, not a gap. Then discount, by name:

- **Per-adapter prop types are BY DESIGN** (`<prop_types_split_agnostic_vs_per_adapter>`): Angular
  declares its own `IAngularPressableProps` and so lacks `IPressableProps`; Vue owns `*Emits` /
  `*Slots`; Solid re-exports Solid's `For` / `Index`.
- **Deliberate naming divergences are BY DESIGN** (`<adapter_src_follows_framework_idioms>`):
  Solid spells the lifecycle pair `createColorScheme` / `createWindowDimensions`, Angular ships
  them as services, so `useColorScheme` / `useWindowDimensions` reading "missing on angular, solid"
  is noise. Each such decision is documented in that adapter's barrel — check before filing a bug.

What survives the filter is the real list. In this run it was two items: `createTunnel` missing on
Solid, and `createAnimatedComponent` implemented-but-not-re-exported on Angular.

## The failure mode this catches, stated once

**A symbol can be implemented, tested, and still unreachable.** This happened THREE times in one
day, in three adapters, and every instance had passing tests:

- Angular's `createAnimatedComponent` — in `src/modules/animated/`, with its own negative tests,
  never re-exported from `src/index.ts`.
- Vue's `Teleport` — a working, guarded wrapper in `src/runtime-helpers/`, two tests, off the
  barrel. The barrel's own comment described it as a design decision ("Teleport stays
  same-surface-only by design"), which read as a note about something that existed. It did exist.
  It was simply unreachable, and the audit reported Vue as having no portal at all.
- Solid's portal and tunnel — the genuine absence, and the only one of the three that a source-tree
  reading would also have caught.

So the rule is not "check whether it is implemented" but **"check whether an app can import it"**,
and a comment near an export is evidence of intent, never of reachability. Only an audit of the
BARREL finds these; an audit of the source tree reports two of the three as present. See also
`.claude/rules/barrel-passthrough.md`.

Run this audit whenever an adapter finishes a layer, and before claiming parity in any report.

## The third parity surface: `packages/*/package.json` `exports` subpaths

Neither audit above sees it. The barrel test reads adapter barrels; the tsc audit resolves
`adapters/*/src/index.ts`. A companion package (`@symbiote-native/crypto`, `…/navigation`, …)
exposes itself through per-framework SUBPATHS declared only in its `package.json`:

```json
{ "./vue": "./src/core/index.ts", "./react": "./src/core/index.ts", "./angular": { … } }
```

A missing subpath is invisible to every test in the repo and fails at the consuming app's
`import` with `ERR_PACKAGE_PATH_NOT_EXPORTED` — the same "implemented but unreachable" shape as
the barrel case, one layer out. Measured 2026-08-21: 12 of 25 companion packages declared
`./vue ./react ./svelte ./angular` and no `./solid`, though all four were byte-identical aliases
of `./src/core/index.ts` and the Solid entry needed zero implementation.

Guarded since 2026-08-21 by `tests/package-subpath-parity.test.ts`, which RESOLVES each
`<pkg>/<framework>` specifier through TypeScript rather than reading the `exports` keys — a key
pointing at a deleted file passes a key check and fails a real build. Packages declaring no
framework subpath at all (`android`, `expo-modules-link`) are out of the contract and skipped.

For a one-off look without running the suite:

```bash
ADAPTERS=$(ls -d adapters/*/ | xargs -n1 basename | paste -sd'|' -)
for p in packages/*/package.json; do
  node -p "require('./$p').name + ' | ' + Object.keys(require('./$p').exports||{})
    .filter(k=>new RegExp('$ADAPTERS').test(k)).join(' ')"
done
```

Read it as a grid, not a list: a package declaring four of the five adapters is the finding. Note
the per-framework value is often the SAME core path for every framework — so "does adapter X have
a real implementation here" and "can adapter X import this package" are different questions, and
this surface answers only the second.

## The fourth surface: `files` coverage of a loose root `.cjs`

A Babel preset or Metro transformer shipped as a loose file at the package root can `require()` a
sibling that `files` does not list. `exports` does not gate an internal relative require, tsc never
reads a `.cjs`, and in the monorepo the whole tree is on disk — so it resolves everywhere except in
a tarball, where it throws MODULE_NOT_FOUND from inside Babel before the first module transforms.

Measured 2026-08-23: `adapters/solid/babel-preset.cjs` gained
`require('./babel-lower-host-primitives.cjs')` and `files` was not updated. Nothing went red, the
pack emitted no warning, and the miss surfaced as a **device benchmark that read as "the
optimization does nothing"** — a measurement that lies rather than fails, which is strictly worse
than a crash. Guarded since by `tests/package-files-cover-cjs-requires.test.ts` (follows relative
requires transitively from every loose root script listed in `files`).

## The fifth surface: the LOWERING TRANSFORMS, and no audit sees it

Four transforms now implement the same rule set — `adapters/solid/babel-lower-host-primitives.cjs`,
`adapters/vue/babel-lower-host-primitives.cjs`, `adapters/vue/metro-vue-transformer.cjs`,
`adapters/svelte/src/preprocessor/lower-host-primitives.ts`. They read one shared spec
(`core/components/host-primitives.cjs`) and one shared specialiser
(`core/components/specialize-state-style.cjs`), but each owns its own AST plumbing, so **the shared
half being shared proves nothing about the answer they give.**

None of the four audits above reaches this. Barrels, subpaths, `files` coverage and exported symbols
are all untouched by a transform that lowers a call site its sibling refuses. Every suite stays
green, `tsc` is happy, and the divergence surfaces as one adapter being mysteriously slower — or,
worse, as a button that lowers where it should not and does not respond.

**Vue is the sharp case because it carries TWO paths.** The SFC transform and the JSX/TSX transform
must agree with each other before either agrees with another adapter, and they cannot share plumbing:
`@vue/compiler-sfc` hands the transform an expression as SOURCE TEXT, so the SFC path has to parse
with Babel and print back, while the JSX path already has the AST. Two different mechanisms
implementing one rule is exactly the shape that drifts. Parity across them is P0
(`<adapters_reach_full_feature_parity>`), not a cost/benefit call — an opt-out was offered once and
retracted the same hour.

The audit that answers it is a shared FIXTURE TABLE rather than a code comparison: one list of
snippets — an inert object style, a specialisable ternary, a hoisted identifier style, a nested
function body, a zero-arity child, a parameterised child, a spread — run through every transform,
asserting the same lowered/refused verdict from each. It is the only form that survives the
plumbing being different by design, and it fails loudly the moment one transform learns a shape the
others have not.

Run it whenever a transform gains or loses a refusal, and treat a new refusal category in
`REFUSAL_CATEGORIES` as a signal that every transform needs a row. Then check the category is real
before every transform inherits it: `unrepeatableRead` — since renamed `emitStyleExpressionOnce` — (`style={getStyle()}`, `style={bag[i]}`,
`style={flag ? a : b}`) turned out to be a property of ONE transform's emit shape — an inline
`typeof f === 'function' ? f({pressed}) : f` prints the expression three times, a runtime
`resolveStateStyle(expr)` prints it once and calls the RESULT twice. Svelte lowers all three
correctly; a `refuse` row would have made it drop them for a hazard it does not have. **A refusal
that a different emit dissolves is not a shared verdict — it is one transform's bug asking to be
ratified.**

## Check Solid last and separately — it falls out of "across all adapters" changes

Not a property of the adapter, a property of how it was added: Solid arrived after the other four,
so every list written before it exists still omits it, and every list written since is one someone
had to remember. Three instances inside two weeks, all found by a peer rather than by a test:

```
scripts/overlay-local-packages.mjs   OVERLAY_ONLY covers the CI four; solid is not in it
packages/*/package.json exports      12 of 25 declared ./react ./vue ./svelte ./angular, no ./solid
adapters/*/…node-census.probe.*      three tracked and fixed, solid's untracked and unfixed
```

None of the three was a decision. Each was a default that looked like one, and in all three the
symptom was silence rather than failure — an un-overlaid example measured on a stale build, an
import that throws only in a consuming app, a probe that missed a repo-wide fix.

The general form, because the next adapter inherits it: **the most recently added member of a set is
the one every older list omits**, and no audit in this file detects a member that is simply absent
from the list being audited.

**The answer is structural, not disciplinary, and it replaces the "remember to check Solid" rule
this section first proposed.** Three audits hardcoded the adapter list — in three different orders,
with no shared source — and their completeness rested on six people not forgetting. `adapterNames()`
in `scripts/lib/adapter-names.mjs` reads `adapters/` off disk, and all three now call it. A
directory listing cannot be written stale: the sixth adapter joins every audit the moment its folder
exists. Verified by creating an empty `adapters/zzz-probe/` — barrel parity immediately reported it
as missing every shared export, and removing the folder returned the suite to green.

So the check is never "is Solid in the list". It is "is there a list at all" — and where one is
unavoidable, whether its length matches what is on disk. Any remaining hand-written enumeration of
frameworks in this repo is a latent instance of the same bug.

## Phrase a parity oracle as a CAPABILITY, never as a shape

`<adapter_src_follows_framework_idioms>` says an adapter is written in its own framework's idiom.
The consequence for auditing is easy to miss: **a check written in one framework's shape reports
every other framework as broken.**

Measured 2026-08-23 while probing whether a lowered element still hands an app its imperative
handle. The oracle was `typeof ref?.measure === 'function'`, which quietly asks "is this adapter
built like React". React and Vue give a public INSTANCE from a ref, so it works there. Svelte's
`bind:this` gives the ELEMENT, and the handle is reached through the adapter's own documented
accessor (`hostInstance`), so Svelte answers `undefined` while being entirely correct:

```
bind:this yields            ShimElement      the ref is live
typeof ref.measure          undefined        <- the shape oracle's answer
hostInstance(ref)           SymbioteNode
typeof host.measure         function         <- the capability oracle's answer
```

Every adapter has a `host-instance` module for exactly this reason — react, vue, svelte, solid and
angular all ship one. So the oracle that transfers is **"can app code reach `measure` from what the
framework handed it"**, resolved through that adapter's accessor. Written that way, a real defect
still fails and an idiom difference does not.

The same trap in general form: any audit step of the form "does X look like Y" is a shape check.
Rewrite it as "can a consumer do Z", and the five answers become comparable.

## A build-tool-facing symbol belongs on a SUBPATH, never on a shared barrel

Every adapter barrel re-exports `@symbiote-native/components` wholesale. So a name added to that
barrel becomes public API on all five adapters at once, with no edit to any of them — which is how
`resolveStateStyle`, named only by the code a lowering transform EMITS, nearly shipped as a
supported export. `KNOWN_GAPS` cannot express "this should not be shared at all"; it only records
which adapters lack a shared name.

The shape that does express it is a subpath: `core/components/state-style`, mirrored by
`adapters/*/state-style` so the emitted import stays inside the package the app already depends on.
`host-primitives` and `specialize-state-style` are there for the same reason. Barrel-parity ignores
subpaths by design; `tests/package-subpath-parity.test.ts` guards them instead.

Two traps found the same hour: declare the `publishConfig.exports` entry as `{ types, default }`
like its neighbours, or the subpath ships UNTYPED and a consumer's `tsc` cannot see it — the
subpath-parity test resolves the specifier, not the types, so nothing catches it. And check every
adapter rather than assuming: of five, three were wrong, one was already right, and one has no
`publishConfig` at all.

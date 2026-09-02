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

## REACHABLE is not HELD — a shared harness with zero consumers passes every audit here

Every audit above asks a reachability question: can an app import it, does the subpath resolve, does
the barrel re-export it. `core/test-utils/src/lowering-equivalence.ts` answers YES to all of them —
263 lines, `export * from './lowering-equivalence'` on the package barrel, a `.d.ts` beside it — and
on 2026-09-01, seven hours after it was written, it had **zero consumers anywhere in the repo** apart
from its own build output.

That is not the "implemented but unreachable" shape this file records three times. It is the
inverse, and it is quieter: the symbol is reachable, so the barrel audit, the subpath test and the
tsc export diff all report it healthy. Nothing anywhere asks whether a test HELPER is called.

The cost was concrete rather than theoretical. Its header names the two device-only bugs it exists
to prevent — a lowered `symbiote-text` losing `ellipsizeMode: 'tail'`, and Angular never applying
`id -> nativeID` — and states that the shared fixture table asks for a VERDICT and never a PAYLOAD.
An alias divergence found the same day fell into precisely that gap. **The instrument for the
finding was written before the finding, and nobody was holding it.**

So a shared harness needs a consumer count, not an export check, and the count is one command:

```bash
command grep -rln "<exportedName>" adapters core --exclude-dir=node_modules --exclude-dir=build
```

Read a result naming only the helper's own file and its build output as the finding. Two working
notes: a `.codegraph/*.db` hit is the index, not a consumer — exclude it or you will read one; and
run this when a harness LANDS, because the window where it has no callers looks identical to the
window where it was abandoned.

Corollary for anyone landing one: a harness whose adoption is a five-adapter decision has nobody
obliged to wire it, so the landing commit owes either the first consumer or a named owner per arm.

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

### A subpath that RESOLVES is not a subpath a bundler can EAT

`tests/package-subpath-parity.test.ts` resolves each specifier through TypeScript, which is the
right oracle for "is this reachable" and blind to "is this consumable". Measured 2026-09-01:
`adapters/angular`'s `./state-style` was a bare string, `"./src/state-style.ts"`. It resolves. The
suite is green. It shipped that way, and the first sign was an `xcodebuild` exit 65 whose one real
line sat under several hundred echoed clang arguments:

```
[SyntaxError] .../node_modules/@symbiote-native/angular/src/state-style.ts:
  Support for the experimental syntax 'decorators' isn't currently enabled (34:1)
```

Metro was compiling the package's SOURCE. It had always pointed there; the file was decorator-free
until an Angular `@Pipe` was added to it, so a latent misconfiguration became fatal on an unrelated
edit. **A subpath pointing at `src/*.ts` is a live hazard even while it works** — it works only for
as long as the source happens to contain nothing the app's babel config refuses.

**And the shape to copy is the package's OWN neighbours, not the other adapters'.** The survey
reads as a clean four-versus-one:

```
react svelte solid vue    publishConfig.exports  { types, default } -> ./build/...
angular                   ABSENT
```

which invites exactly the wrong repair, because Angular has no `publishConfig` at all and does not
use the publish-time swap. Its `.` and `./bootstrap` are CONDITIONAL exports —
`{ types, "react-native": "./build/angular/x.js", default: "./src/x.ts" }` — and its build tree is
nested (`build/angular/`), so a `publishConfig` copied from the other four would have pointed at
`./build/state-style.js`, which does not exist. The fix was to match `./bootstrap`, one line above
it in the same file.

So the audit question is not "does this adapter match the others" but **"does this subpath match
its own siblings"** — `<adapter_src_follows_framework_idioms>` applied to packaging. Two adapters
can be correct with different `exports` shapes, and a four-of-five grid is not evidence about
which shape the fifth needs.

The mechanical check that would have caught it, and it is one line — no subpath may resolve to
source under a bundler condition:

```bash
node -p "Object.entries(require('./adapters/<a>/package.json').exports)
  .filter(([,v]) => JSON.stringify(v).includes('src/') && !JSON.stringify(v).includes('build'))
  .map(([k]) => k).join(' ')"
```

Read a non-empty answer as the finding. A subpath whose ONLY target is `src/` has no built target
at all; one that has both is fine, because the condition picks.

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

### The table was built and Solid was not in it — and it found two divergences in its first run

Written 2026-08-30. The shared table shipped with runners for Svelte and for both Vue paths, and
`adapters/solid/babel-lower-host-primitives.cjs` — named in the fixtures' own header as one of the
four transforms the table exists to compare — had no runner. Third instance of the pattern this file
records two sections down, and the sharpest, because here the omitted member was named in the
comment at the top of the very file that omitted it.

`adapters/solid/lowering-parity.test.ts` closed it, and went red on two of eleven rows immediately:

```
nested-function-state-style   expected lower    solid: refuse
instance-bound-directive      expected refuse   solid: LOWER
```

The first is a coverage gap with the mechanism stated in the transform's own comment — "A functional
style refuses ONLY when it cannot be specialised" — which is substitution wired as the MECHANISM
where the table says it is an OPTIMISATION. Vue and Svelte lower those call sites; Solid keeps them
as components.

**The second was the more interesting one: the row's VERDICT was right and its stated REASON was
false**, and neither of the two hypotheses raised while reporting it was correct. The row read "a
lowered element has no component instance for the binding to target", which assumes the binding
targeted one. It did not — **no adapter exposes a public `ref` on `Pressable`.** React's `ref:
viewRef` (`adapters/react/src/components/pressable/index.ts:204`) is internal, handed to the inner
View so the machine can measure its retention region; Vue and Svelte declare none; Solid's own props
type says so in a comment. So `ref={handle}` on an un-lowered `<Pressable>` does nothing at all, and
lowering does not BREAK the binding — it ADDS one, handing back a live engine node.

That is a worse hazard than the one the row claimed, and it is what the row now stands on: the
capability would exist only when the transform happened to lower, so an unrelated attribute on the
same tag would decide whether an app's `ref` works. **A lowering transform is an OPTIMISATION, and an
optimisation that changes the observable surface — in either direction — is a bug.** Refusing keeps
lowered and un-lowered call sites indistinguishable to an app.

Two method notes worth more than the fix. The diagnosis that landed came from checking the row's
PREMISE against all five adapters, which neither hypothesis did — both argued about which side should
change while taking "the binding targets an instance" for granted. And an ADDED capability reads as
harmless, which is why it survived review: the asymmetry this file records elsewhere ("refusing is
always safe") is about a transform's verdict, not about its effect on the surface.

The general lesson for the table itself: **a red row is a question about which of the two sides is
wrong, never a verdict on the transform.** A runner added late will produce reds; resolving them by
making the newcomer match is how a shared table ratifies whatever the majority happened to do first.

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

### The lowering spec declares its shape TWICE, and only one declaration compiles

`core/components/host-primitives.cjs` must stay `.cjs` (Babel/Metro consumers run before TS exists),
so its types live in a hand-written `host-primitives.d.cts` beside it. The `.cjs` also carries a
JSDoc `@typedef` for readers. Two declarations of one contract, and they do not check each other:
the JSDoc is documentation, the `.d.cts` is what `tsc` reads.

Which adapter notices is the asymmetric part. Four transforms are `.cjs` and see neither
declaration — a new field just works. Svelte's preprocessor is TypeScript and reads the `.d.cts`,
so a field added to the JSDoc alone compiles everywhere except there:

```
adapters/svelte/src/preprocessor/lower-host-primitives.ts(201,28):
  error TS2551: Property 'intrinsicWhen' does not exist on type 'IHostPrimitive'
```

Measured 2026-08-31, on the turn the field was introduced. So when the spec gains a field, update
`.d.cts` in the same edit, and run `tsc --build` (not a test run — every suite stayed green) before
handing the field to anyone. The reverse case is worse and quieter: a field in `.d.cts` that the
`.cjs` never sets type-checks everywhere and is `undefined` at runtime in all five.

### Check that the guard you are extending is REACHED for the case you add

A new refusal naturally goes into the transform's existing `refusesLowering`. In every Vue-shaped
transform that function is called under `if (entry.observesState)` — the flag only Pressable
carries — because until now every refusal was about reading press state. A refusal for a
state-less primitive placed inside it is dead code that reads as implemented.

Measured 2026-08-31 while adding `dynamicIntrinsicChoice` for `TextInput`, which owns no state: had
the check gone in there, both Vue paths would have emitted the single-line intrinsic for every
input, `multiline` included — the WRONG Fabric view, uncorrectable by any later prop write, with the
whole suite green. It is resolved before that gate instead.

So when adding a category, do not ask only "is the rule right" but "does this code run for the
primitive I am adding it for". The cheap check is to break the new rule deliberately and confirm a
test goes red; a rule that cannot be made to fail was never wired in.

### A refusal the spec describes as universal may be implemented nowhere

`REFUSAL_CATEGORIES` reads as a contract every transform honours, and its prose says so ("four
transforms carried their own copy"). It is a vocabulary, not an enforcement point: a category
exists the moment it is written down, and each transform separately decides to consult it. Nothing
fails when one never does.

Measured 2026-08-31: `bagFold` ("an attribute whose fold needs to see its siblings — role, aria-*")
was believed to be why no adapter lowered an element carrying `role`/`aria-*`. Neither Vue
transform references it. Both lower such an element happily, and had been doing so — so every
lowered `aria-label` reached Fabric as a key no ViewConfig declares, with the accessibility label
silently lost, on device only.

The check is two lines and it beats reading the spec:

```bash
command grep -o 'REFUSAL_CATEGORIES\.[a-zA-Z]*' adapters/*/*.cjs adapters/*/src/preprocessor/*.ts | sort -u
```

Read it as a grid of transform × category. A category absent from a column is either a deliberate
non-applicability or an unimplemented refusal, and the two are indistinguishable from the spec
alone — ask the transform's author, and record the answer next to the category. Do this BEFORE
planning work that assumes a refusal is in force: "remove the refusal from four transforms" was
scoped against an assumption that held in two.

**The full grid, and it is worse than the two-of-four the paragraph above reports — read the empty
column, not just the missing cells.** Run against all four:

```
solid/babel-lower-host-primitives.cjs        bagFold + 4 others
vue/babel-lower-host-primitives.cjs          4 others, no bagFold
vue/metro-vue-transformer.cjs                5 others, no bagFold
svelte/preprocessor/lower-host-primitives    NOTHING — zero REFUSAL_CATEGORIES references,
                                             and the string `role` does not appear in the file
```

Solid was the ONLY transform honouring it. And Svelte does not reference the constant at all, so
the grep reports it as an empty column rather than as a gap — an adapter that spells its refusals
its own way is invisible to a probe keyed on the shared name. Count the columns against
`adapterNames()` before reading any cell: a transform missing from the output entirely is the case
this check is least able to tell you about.

**The structural repair is a ROW, not a rule.** A category is a dictionary entry; only a case in
`core/components/lowering-fixtures.cjs` makes a divergence red, because every transform's runner
must answer it. `aria-bag-fold` was added there the same day with verdict `lower` (the fold now
lives in the engine, so the reason to refuse is gone for everyone) — and it immediately produced
three different failures across three adapters: Solid red on the VERDICT, Vue and Svelte red on
"has not declared a snippet". Both shapes are the mechanism working. **Whenever a refusal category
is added or retired, the same commit owes a row here, or the next reader inherits the same
unenforced prose.**

### `bagFold` IS RETIRED — and this section is why a reader kept quoting it as live

Retired 2026-08-31, the same day the grid above was measured: `Object.keys(REFUSAL_CATEGORIES)` is
now `unreadableAttributeSet · unreadableKey · unreadableValue · instanceBoundDirective ·
stateInTemplate · emitStyleExpressionOnce · renderPropChild · dynamicIntrinsicChoice`. The name
survives only in comments explaining why the aria fold moved into the engine.

The grid was true when taken and the method it teaches is unchanged. What rots is the TENSE: "Solid
was the ONLY transform honouring it" is written as a standing fact about an adapter, so it was read
back out of this file on 2026-09-01 and handed to the Solid session in a work brief, which then had
to spend a round correcting it. The measurement and the retirement landed on the same day and this
file never learned the second half.

**So a rule that records a measurement owes it a subject.** A finding about a CATEGORY dies with the
category; a finding about a METHOD does not. When writing one, name which it is — and when reading a
present-tense claim about a named constant, the two-line grep above is faster than trusting the
prose. That is the same instrument this section already recommends, pointed at itself.

## A convention that held on a sample of look-alikes reads as a rule until the first outlier

### The sixth member, and the guard that predicted its own failure in writing

Measured 2026-09-01, when `SafeAreaView` entered `HOST_PRIMITIVES` as the seventh key. Every entry
before it carried `aliases: ID_ALIAS` — `{ id: 'nativeID' }` — six for six. It is not a house style:
the alias exists to REPRODUCE a fold the wrapper performs, and not one of the five SafeAreaView
wrappers folds `id` or even declares it. Copying it would have made the lowered element fold a prop
its component spelling passes through untouched, which is a lowering ADDING a capability.

`aliases: {}` immediately reddened `adapters/solid/src/renderer-alias-fold.test.ts`, and read its
header before its failure:

> only correct while every lowerable primitive declares the SAME single alias pair. The day a second
> pair appears, **or a primitive stops sharing**, this fails and the renderer has to carry a real map

The failure arrived by the second route, named in the file, and the guard fired correctly. Solid's
`foldAliasKey` is two string constants on the per-prop write path — a deliberate decision about
32 001 writes on a benchmark create — so on Solid a lowered `<SafeAreaView id="pane">` folds to
`nativeID` while its own component spreads `id` through raw.

**Two things generalise, and the second is the uncomfortable one.**

A shared spec is where a per-primitive fact is stated, so the first entry that declines the majority
value is exactly where every adapter's shortcut is priced. That is a REASON to state it rather than
inherit it — the divergence surfaced in one test run instead of on a device.

And the file guarding this predicted the outlier in its own header and then guarded a **hand-written
list** anyway (`INTRINSICS_REFUSING_REF`, which needed the new member added by hand and had no way to
report its own absence). Knowing the failure mode is not the repair; deriving the list is
(`adapterNames()`, one level down). A guard good enough to catch the case it predicted still makes
the next primitive cost a message — so when a header names a future breakage, ask whether the code
below it is derived or enumerated.

The cheap check before landing an entry that declines a majority value: grep the value's NAME across
every transform and renderer. A literal outside a spec read is a shortcut keyed on the coincidence.

Measured 2026-08-31, the hour `TextInput` entered `HOST_PRIMITIVES`. A Solid test located each
primitive's source by lower-casing the spec key: `./src/components/${key.toLowerCase()}.tsx`. That
had worked for every primitive there had ever been — `View`, `Text`, `Pressable` — and it worked for
one reason: all of them were SINGLE-WORD and all of them were `.tsx`. The first two-word primitive
broke it, with an `ENOENT` about a path rather than a failure about the thing under test.

**The instructive half is what the obvious repair would have done.** Kebab-casing the key fixes the
separator and fails a day later on the extension: the real file is `text-input.ts`, so the
convention rested on TWO coincidences and the fix addresses one. A derivation that has to be right
about several independent facts is not a convention, it is a guess that has not been contradicted
yet.

The repair that does not rot is to stop deriving and start OBSERVING: the file is found by what it
exports (`export function TextInput(`), scanned across the directory. That survives a rename, a
move, and an extension change, and when the component genuinely does not exist it says so about the
primitive instead of about a path.

The general test, and it costs one question: **does every case in my sample share an incidental
property that my rule depends on?** Single-word names, one file extension, one directory depth, one
adapter that happens to be alphabetically last. If yes, the rule is coincidence-shaped and the next
member is the one that finds out — which is the same failure as the stale hand-written list two
sections up, arrived at from the other direction.

## A shared spec field a transform never READS is the quietest failure in this system

Two transforms hit this within an hour of each other on 2026-08-31, by different mechanisms, and
both produce the identical symptom: the feature implemented end to end, every test green, and the
WRONG NATIVE VIEW committed.

```
solid   the transform projects HOST_PRIMITIVES into its own record through a WHITELIST of fields.
        `intrinsicWhen` was dropped in the projection one line before anything could read it —
        every multiline case still lowered to the single-line tag, nothing red.
vue     the natural home for the detection is `refusesLowering`, which BOTH Vue transforms call
        only under `if (entry.observesState)`. TextInput observes no state, so the detection
        would never have run, and the verdict table would have reported the default tag on all
        five rows — an oracle confirming the defect.
```

Neither is a bug in the reading code: the code was correct and unreachable. And neither is
detectable by the shared verdict table, because the table asks lower-vs-refuse and the wrong tag is
still a lower.

**The general form: a spec is data, and data can be silently dropped between the file and the use.**
A field's presence in `host-primitives.cjs` proves nothing about whether any transform sees it. The
structural answer is Solid's — `spec-projection-covers-fields.test.ts`, which diffs the projection's
whitelist against what the spec actually carries and reddens on a field that is neither read nor
explicitly ignored (`defaults` is ignored there, with the reason recorded: defaults are seeded at
runtime, so a compile-time copy would cover only the first render).

Two working habits follow, and the second is cheap enough to be unconditional:

- **When a spec gains a field, grep every transform for the field NAME before trusting any test.**
  Zero hits in a transform that claims to implement it is the whole finding.
- **Check what GATE the new reading sits behind.** A detection added next to existing ones inherits
  their gate by proximity, and an unrelated gate that happens to be false is indistinguishable from
  a detection that decided not to fire.

### The prefix hazard is NOT about tags — third instance, in an identifier

Corrected 2026-09-01, after the two below were both read as a fact about the tag alphabet. The third
instance has no tag in it: `id` is a substring of `nativeID`, so an oracle checking whether an
aliased key SURVIVED the fold (`out.includes('id: "pane"')`) matches the alias's own OUTPUT and
reports the input key as present on a transform that renamed it correctly. That assertion is
unfailable in the exact direction it exists to check.

```
symbiote-text      prefix of  symbiote-text-input           tag,        harmless — verdicts agree
symbiote-switch    prefix of  symbiote-switch-managed       tag,        the false `lower`
id                 prefix of  nativeID                      identifier, the unfailable negative
```

**Fourth instance, and the namespace is not the tag alphabet at all — it is the ngDeclare METADATA.**
An Angular fixture's `dependencies` entry carries `selector: "symbiote-text-input, TextInput"`, so
the bare intrinsic name is in the transform's output whether or not anything lowered. A
`.includes('symbiote-text-input')` verdict therefore reads `lower` for every case, refusals
included — measured 2026-09-02, on a block written specifically to check refusals. Anchoring it to
`'<symbiote-text-input'` fixes it, and the lesson is that the emitter's own quoting is only one of
the boundaries available: here the discriminator is the `<` the template puts in front of a tag and
never in front of a selector string.

So the rule is about SUBSTRING oracles over a namespace where one name extends another, and a
namespace here is a tag alphabet, a prop-key set, a view-name table or an event name — anywhere a
convention builds longer names out of shorter ones, which is everywhere in this repo. Match with a
boundary the emitter already provides: a quoted argument for a tag, `key: ` for a bag entry.

And the direction that bites differs per instance — a false `lower`, an unfailable `not.toContain`
— so identify which of the two an oracle can produce before deciding it is safe.

**Fifth instance, and it is the boundary CLASS rather than the name: a multi-line tag.** A lowering
census keyed on `<symbiote-switch[ >/]` counted zero occurrences of a tag the transform had just
rewritten correctly, because the app writes it as `<Switch\n  testID=…` and the character after the
name is a NEWLINE. Measured 2026-09-02: the same probe reported `Switch 0 lowered / 0 kept` — absent
from the app entirely — and understated every other primitive too (`TextInput 1/7` where the truth
was `7/4`). Use `[\s>/]`.

The tell is the one this file already teaches: **a count of ZERO on both sides of a census is not a
finding, it is a probe that matched nothing.** A name that appears in neither column has to be
explained before it is reported.

### And the tag alphabet has a prefix hazard the oracles cannot see

`symbiote-text-input` is a PREFIX of `symbiote-text-input-multiline`, so every `includes` /
`toContain` verdict on the shorter name passes on the longer one. A transform emitting the wrong one
of the pair reads as correct in any check written the obvious way. Caught by the Svelte session
before the shared row was written, which is the only reason it is a note here rather than an
incident: pin the ABSENCE of the tag that should not be there, not only the presence of the one that
should.

**Grown to FOUR names on 2026-08-31, and the family now fails in BOTH directions.** Splitting the
component path off the lowered tag added `-managed` and `-multiline-managed`, so the base is a prefix
of three siblings:

```
symbiote-text-input                     lowered, single line
symbiote-text-input-multiline           lowered, multiline
symbiote-text-input-managed             the wrappers' tag
symbiote-text-input-multiline-managed   the wrappers' tag
```

A verdict oracle built on `includes(base)` reads any of the four as "lowered", so a REFUSAL that
emitted a sibling would report `lower` and the detection would never run — the false-green
direction. An assertion written `not.toContain(base)` fails when a sibling is present, which is a
false RED. Three of the three runners were exposed, each in its own direction, and all three found
it independently within an hour of the split.

**SIX names across TWO families as of 2026-09-01** — `Switch` landed with the same `-managed` split,
so `symbiote-switch` joined `symbiote-text-input` as a base with siblings. Measured while adding the
`switch-fold-only` row: the `symbiote-text` / `symbiote-text-input` collision had ALREADY been live
in Svelte's verdict oracle for as long as `TextInput` existed, and was harmless — because both
primitives' rows expect `lower`, so reading one's tag through the other's entry gives the right
answer for the wrong reason. **A prefix collision is invisible exactly while the two members share a
verdict**, which is why it survives to be found by the first sibling that needs to refuse. Count the
families when a tag is added, not when a row goes red.

**None of it is reachable today**, because no transform emits a `-managed` tag — the wrappers print
it at render time, after compilation. That is exactly what makes it worth hardening rather than
noting: "safe because nobody has written that yet" is the reasoning the split itself was made to
stop relying on.

Two things about hardening it. Match with a boundary the emitter already provides — Solid's preset
prints the tag as a quoted argument (`_$createElement("symbiote-text-input")`), so quoting the marker
costs nothing and is exact. And **the guard needs its own test, because the hazard cannot be reached
through the transform**: flipping the marker back to a bare substring leaves every row green, so a
break routed through the runner is an arm that moves nothing. Assert on the READER directly — feed it
a sibling and require `refuse` — which is the only form that separates the two implementations.

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

## "Shared" has two kinds, and the difference is REACHABILITY, not publication

A file every adapter needs looks like it belongs beside the other files every adapter needs. It does
not, if the two are shared for different reasons.

Measured 2026-08-31. A self-expiring test fixture that INJECTS a withheld `HOST_PRIMITIVES` entry
started life in `adapters/solid/`, and two other adapters' runners came to require it across the
adapter boundary — the only place in `adapters/vue` that knew `adapters/solid` exists. Both peers
objected independently and both proposed `core/components`, beside `host-primitives.cjs` and
`lowering-fixtures.cjs`, on the precedent that shared transform files live there.

The precedent is real and the destination is wrong. It went to `core/test-utils` instead — and the
FIRST reason written here was false, which is worth more than the fix. It read "a spec mutator must
not be public API"; `core/test-utils` is `private: false` with `publishConfig.access: public`, so the
module is public API either way and the move changed nothing about that. A peer checked the claim
instead of the conclusion.

The real difference is REACHABILITY, and it is sharp:

```
adapters/{solid,vue,svelte,react,angular}
  dependencies      @symbiote-native/components   <- an app gets it transitively with the adapter
  devDependencies   @symbiote-native/test-utils   <- an app must install it on purpose
```

A mutator under `components` needs no line in an app's manifest and sits on the runtime path. Under
`test-utils` it needs a deliberate install and is off that path. That reason survives `test-utils`
later becoming private; "not public API" was false the day it was written.

So the question is not "who needs this file" but **"is it part of the contract, or part of testing
the contract?"** — and the test is not publishability, it is whether the file is reachable without
anyone choosing to reach it. A spec, a specialiser and a verdict table are contract. A fixture, a
harness and an injection are not.

Two mechanical notes for the move: declare the subpath as `{ types, default }` in
`publishConfig.exports` and ship a `.d.cts`, same as every neighbour, or it lands untyped and
nothing catches it. And break-test the subpath rather than trusting a green run — delete the
`exports` entry and confirm the callers stop LOADING; a relative fallback that happens to resolve
looks identical to a subpath that works.

## A compile-time refusal is needed exactly where the transform makes an IRREVERSIBLE decision

Third member of the family that already holds `emitStyleExpressionOnce` and the public-ref list, and
the cheapest to state: a refusal category exists because a transform cannot see something at compile
time. Whether that blindness MATTERS depends on where the adapter applies the affected fold — and
that is an adapter's own choice, which the spec says out loud.

`unreadableAttributeSet` refuses an element carrying a spread, on the reasoning that a transform
cannot enumerate the attributes and so cannot rename `id` to `nativeID`. Measured on Vue 2026-08-31:
a lowered `<View v-bind="bag" />` commits a payload BYTE-IDENTICAL to the wrapper's, `id` folded.
Vue's aliases are applied in the RENDERER, one key at a time, so a bag the transform could not read
is folded anyway. Making the refusal always-run would have cost Vue the lowering of a common pattern
to guard a hazard it cannot reproduce.

The prediction that followed — "adapters folding at COMPILE time need it always" — was checked
rather than relayed, and it did not hold either: Solid folds in `renderer.ts`, Svelte in
`dom-shim/fold-host-bag.ts`. Every adapter that lowers has a runtime fold, so the `id` hazard the
category NAMES is dead everywhere.

**And then the category turned out to be live anyway, for a reason it does not state.** Svelte
measured what a spread actually carries past a transform on a STATEFUL primitive, and it is not
`id`:

```
<symbiote-pressable p={{ ...bag }}>   bag.style = ({pressed}) => ({opacity: …})
committed:  style undefined   opacity undefined
```

Not a wrong style — NO style. Specialising a functional `style` into the resting/pressed pair is a
compile-time rewrite that must SEE the attribute, so a `style` arriving inside an unreadable bag is
silently dropped, and the same blind spot swallows a `children` snippet. Nothing goes red.

So the refusal is right exactly where `observesState` is set and pointless outside it — the
opposite of the "run it always" repair that was proposed twice, which would have cost the lowering
of a common pattern on `View`/`Text` to guard a hazard those primitives do not have. Svelte's test
is parameterised on `observesState` rather than on a list of names, with a case asserting the list
is non-empty so it cannot silently empty out.

**The rule that survives all three measurements, and it is sharper than the layer question this
section started with.** Asking "which layer applies the fold" gets the `id` half right and stops
short: the refusal is not about folds at all. It is about DECISIONS THE RUNTIME CANNOT REDO. A fold
is reversible — the renderer can apply it later, on a bag the transform never read. Choosing the
intrinsic is not: the node is already created, and no prop write moves a node between native views.
Specialising a functional `style` into the resting/pressed pair is not either — it is a rewrite of
an expression that no longer exists at runtime.

```
transform decides       runtime can redo it?   spread must refuse?
id -> nativeID          yes, per key           no
intrinsic tag           NO                     yes
style -> style+active   NO                     yes
```

So: **refuse a spread exactly where the transform reads the attribute list to make a decision
nothing downstream can correct.** That is why the refusal lives under `observesState` on Vue and
Svelte and under the intrinsic choice on Solid, and why "run it always" — proposed twice — was
wrong both times.

### SUPERSEDED 2026-09-01 — the scope was too NARROW, and the third rationale is the one that holds

Both halves above have since been measured false, in opposite directions, and the section is kept
because the sequence is the lesson: **this is the third time the rationale for this refusal died and
the verdict survived**, and each time the correct scope was different.

```
2026-08-31   "a spread breaks id -> nativeID"                  false: every adapter folds at runtime
2026-08-31   "a functional style in a bag commits NO style"    TRUE then, dead now
2026-09-01   "a children SNIPPET in a bag never mounts"        true ON SVELTE, every primitive
```

The middle row expired by construction: `routeProp` now resolves a function `style` at both values
of `pressed` (`isStyleCallback`, `core/engine/src/node.ts`), so the runtime CAN redo that decision
and the table's `style -> style+active  ->  NO` row is wrong. Measured through a real Svelte mount —
`<symbiote-pressable p={{...bag}}>` with a functional style commits `{testID:'probe', opacity: 1}`,
because `applyBagDiff` passes a function straight through and nothing type-inspects it.

The third row is what the refusal now stands on, and it is not about press state at all: a bag key
goes through `routeProp`, and a `children` SNIPPET is not markup there, so the subtree never mounts.
Measured on a STATELESS primitive, both arms:

```
<View {...bag}>                 component   child COMMITS   {testID:'kid', ellipsizeMode:'tail', …}
<symbiote-view p={{ ...bag }}>  lowered     child ABSENT, nothing red
```

So narrowing the refusal to `observesState` — which the section above recommends — would silently
drop children from every lowered `<View {...bag}>` ON SVELTE. Its transform already refused across
every primitive, so the CODE was right and only the recorded reason was wrong; `ref-refusal.test.ts`
now asserts all of them, break-tested by gating on `observesState` (View, Text and TextInput go red,
Pressable stays green).

**"Every primitive" is the scope that was measured; "every adapter" is NOT, and the difference is
this file's own rule pointed at itself.** One adapter was mounted. The mechanism is adapter-shaped:
Svelte's lowered element takes ONE `p={{…}}` bag, so every key — `children` included — passes
through `routeProp`, where a snippet is not markup. An adapter that keeps individual bindings has no
such funnel, and where its children come from is a second variable on top — a `children` KEY is not
children at all in a slot-based framework and is children in a props-based one. Two independent
differences, so Svelte's answer predicts nothing about the other four.

```
svelte                      measured: refuse on every primitive
react vue solid angular     UNMEASURED — not "covered"
```

What generalises is the QUESTION, not the answer: for each adapter, ask what a spread's keys become
on the lowered path, and whether a framework-element-valued key survives that. Three of the four
possible answers are silent failures.

### THIRD death of this rationale, and on Vue the VERDICT dies with it — measured 2026-09-01

The two reasons above are refuted; a third was tried on Vue and it refutes the verdict as well, which
none of the earlier rounds did. Reproduced before implementing, exactly as this section asks.

```
<Pressable v-bind="bag" />   bag = { testID, accessibilityLabel, style: ({pressed}) => ({opacity}) }

refusal ON  (shipped)   _createBlock(_unref(Pressable))            resting/pressed: testID, accessibilityLabel
refusal OFF (lowered)   _createElementBlock("symbiote-pressable")  IDENTICAL, resting and pressed
```

Byte-identical, through `compileSfc` on a real SFC, evaluated, mounted, pressed through the engine's
own listener order. **So `unreadableAttributeSet` is NOT a refusal on Vue** — there is no divergence
for it to prevent, and ratifying it would cost the lowering of `v-bind`, a spelling real templates
use constantly.

The reason it looked like a hazard is that the hazard is REAL and lives one layer up, already
realised on the un-lowered path: `v-bind="obj"` compiles to
`_normalizeProps(_guardReactiveProps(bag))`, and `@vue/shared`'s `normalizeProps` runs
`normalizeStyle` over the style key, which returns `undefined` for a function. A functional `style`
inside a spread was being destroyed by Vue core before any adapter code ran. Fixed in `adapters/vue/src/runtime-helpers` (beside `Teleport`/`vShow`), scoped to `style` only and
covering EVERY primitive — `View` measured to fail identically, so a stateful-only scope would have
left it broken.

**And the first fix covered ONE OF THREE DOORS, which is the more useful half of this entry.** The
same `normalizeStyle` is reached by three different compiler helpers, and only enumerating the
SPELLINGS found them — the mechanism looked singular:

```
<View :style="fn" />                  neither helper    was never broken
<View v-bind="bag" />                 normalizeProps    fixed first
<View v-bind="rest" :style="fn" />    mergeProps        STILL BROKEN behind a green suite
<View :style="[a, fn]" />             normalizeStyle    out of contract, see below
```

Overriding a helper does NOT reach the others: Vue's `normalizeProps` and `mergeProps` call
`@vue/shared`'s `normalizeStyle` by module-internal reference, which a shim cannot intercept. So the
fix is per compiler-emitted helper, and the enumeration is the work. Both overrides break-test
independently — each reddens two rows the other leaves green.

The array spelling is deliberately NOT rescued: RN's own `Pressable.js` types `style` as
`ViewStyleProp | ((state) => ViewStyleProp)`, so a callback inside an array is out of contract there
too, and the engine's `isStyleCallback` only reads a top-level function.

**CORRECTION, same day: the third door was written off too fast.** The paragraph above conflated two
things `normalizeStyle` receives — an ARRAY containing a callback, which is out of contract, and a
BARE callback, which is the contract itself. `:style="({pressed}) => …"` compiles to
`_normalizeStyle(expr)` whenever the compiler cannot keep the binding on the cheap patch-flag path
(an inline arrow and a call expression both leave it; a bare identifier stays), so the third door
takes a top-level callback and destroys it exactly like the other two.

It was unreachable at the time, which is why it measured clean — the lowering transforms rewrote
that attribute into a resting/active pair before Vue ever emitted the helper, so nothing with a
callback in it reached `normalizeStyle`. **A door that is closed by an unrelated mechanism reads as
a door that is not there**, and it opened the moment the state-style split came out of both Vue
transforms. Closed by a `normalizeStyle` override preserving a top-level function only.

The sequencing is the lesson: the enabling fix for a REMOVAL was a defect that only became live once
the removal landed. Ordering the two the other way round — delete the split, then discover the
door — would have shipped a lowered `Pressable` with no style at all.

**The generalisable half: a defect found through one SPELLING is a defect in one CODE PATH, not in
the feature.** "A functional style is dropped" named the symptom and hid the fact that three
unrelated helpers produce it. Before calling such a fix complete, enumerate the source spellings
that reach the same sink and check each — the compiled output names the helper, so it is one grep
per spelling.

**The general form, and it is a new member of this file's refusal family: a refusal is worthless
when the damage is already done UPSTREAM of the decision it gates.** Lowering could neither cause
nor worsen this, because the value was gone before either path saw it. Before implementing a
refusal, check not only whether the defect reproduces but whether it reproduces on the arm that does
NOT lower — if both arms are equally broken, the finding is a bug somewhere else and the refusal is
a distraction wearing its clothes.

**And the probe shape decided the answer.** The first arm was `h(Pressable, { ...bag })`, which
skips `normalizeProps` entirely and showed the style arriving intact — "no divergence, category
dead", right by accident and blind to the real bug one layer over. Only the compiled path reaches
the helper. Third stand-in failure recorded in one day.

### Vue IS clear of the conditionally-invoked-guard hazard, and that was checked rather than assumed

The section above warns that a refusal placed inside `refusesLowering` never runs for a primitive
that does not set `observesState`. On Vue the one irreversible decision a spread could corrupt is the
INTRINSIC CHOICE, and `intrinsicWhenFor` resolves it in BOTH transforms before `observesState` is
consulted — both refuse outright on a spread (`metro-vue-transformer.cjs`, `babel-lower-host-primitives.cjs`,
each with the reason in a comment). So the stateless primitive is covered by a guard that is
genuinely reached, not by dead code behind a flag. Recorded because this file documents the hazard
and not, until now, any adapter's clearance from it.

**The rule that survives, and it is the one this file keeps re-deriving:** a refuted rationale
licenses re-deriving the conclusion, never negating it — and after re-deriving, ask whether the
verdict's SCOPE moved too. Twice it was proposed to widen this refusal to "always" and twice that
was called wrong; on Svelte the third measurement says always is right, for a reason neither
proposal named. Whether that holds elsewhere is an open arm per adapter.

**And the real finding of that measurement is not that today is green — it is WHY it is green.**
Vue's two hazards are closed by two mechanisms that do not know about each other:

```
Pressable   unreadableAttributeSet, inside refusesLowering — reachable ONLY via observesState
TextInput   a spread branch in resolveIntrinsic — written for intrinsicWhen, not for spreads at all
```

Neither consults the other, and neither is keyed on the property that actually matters. **A
primitive carrying an irreversible compile-time decision and NEITHER flag falls through both.** No
such primitive exists yet, which is exactly why the gap reads as coverage: three adapters measured
green, and the green is a coincidence of two unrelated guards happening to cover the two members
that exist.

That also explains why "run the refusal always" sounded right twice and was wrong twice — a real
hazard stood behind it; the category simply named the wrong one, so every repair aimed at breadth
instead of at the criterion.

The repair is to key the refusal on one criterion instead of two unrelated flags — and it is
SMALLER and WEAKER than it first reads, which is worth stating before someone sells it as a fix.
Smaller: no new spec field is needed, because specialisation is switched on by `observesState` and
nothing else (`if (entry.observesState) expandStateStyles(...)` in both Vue transforms), so today

```
irreversible decision  ==  entry.intrinsicWhen !== undefined || entry.observesState === true
```

Weaker: that disjunction covers exactly the set the two scattered guards already cover. It buys the
next primitive inheriting the guard automatically — but only if its decision is one of the two
KINDS that exist. A third kind of irreversible compile-time decision still falls through, and no
enumeration of today's kinds can catch it.

So this is not the `adapterNames()` repair, and the difference is the point: a directory listing
cannot go stale because it enumerates MEMBERS of an open set, while a disjunction of two flags
enumerates KINDS and closes it. Closing the hole for real needs a criterion derived from the
PROPERTY of the decision — "the runtime cannot redo this" — rather than from a list of the forms it
currently takes. Nobody has one, and until then the honest claim is that the hole becomes visible,
not that it is closed.

**The general form, and it is this file's own lesson pointed at a category rather than at a row: a
refuted RATIONALE does not refute the VERDICT.** The stated reason (`id` cannot be folded) is dead;
the verdict (refuse a spread on a stateful primitive) is load-bearing. Both halves had to be
measured separately, and measuring only the stated reason would have removed a real guard.

Two working rules:

- **Before implementing a refusal, try to REPRODUCE the defect it names on your own adapter.** A
  category that cannot be made to fail is a rule about somebody else's layering. Ratifying it costs
  real coverage — here, `v-bind` on a `View`.
- **Ask the layer question first**, because it decides the answer and it is one grep: does this
  adapter apply the fold in the transform, or in the renderer? Two adapters can legitimately give
  opposite answers to one category, and the spec's own text says the layer is the adapter's choice.

### A claim about ANOTHER adapter is a claim you have not checked

Both halves of the exchange above were wrong, in opposite directions, on the same day:

```
a comment in adapters/solid  "Vue refuses to lower any primitive carrying a ref"   -> both Vue paths LOWER it
a message from adapters/vue  "Solid and Svelte fold at compile time, so they
                              need the refusal always"                             -> both fold at RUNTIME
```

Neither was careless in the moment. The first read a rule that is TRUE of Pressable and generalised
it; the second read the spec's note that Solid and Svelte rename `id` in their transforms and
concluded that is the only place they fold. Both were plausible, both were stated as fact, and both
were one grep from being checked.

The asymmetry that makes this worth a rule: a wrong claim about your OWN adapter is corrected by the
next test run, and a wrong claim about a SIBLING sits in a comment for months, is read as
established, and is used to skip work. `<third_party_rn_packages_are_react_only>` and
`<adapter_src_follows_framework_idioms>` mean adapters legitimately differ, so "it works this way
here" carries no information about there.

So: state a cross-adapter fact only with the grep that produced it, or attribute it (`per the
solid session, 2026-08-31`) so the next reader knows it is hearsay. When a sibling's prose is what
stands between you and skipping a task, check it — that check has now paid twice in one day.

## A fact that varies PER ADAPTER must not enter the shared spec, even when it gates a shared rule

Third instance of one shape in a day, and the cheapest to state. The rule "a lowering transform must
not change the observable surface" is shared and correct. What it needs to know in order to fire —
**does this primitive expose a public ref?** — is not shared at all:

```
solid    View/Text declare `ref?: Ref<IHostInstance>` and forward it (view.tsx:83, applyHostRef)
         -> a lowered View hands back the SAME host instance; the surface does not move
         -> Pressable declares none, so lowering would ADD one. Refuse on Pressable only.
vue      a template ref on a STATEFUL component yields the component instance, on an element the
         host node -> lowering changes WHICH object the app gets. Refuse on Pressable/TextInput.
         NOT on View/Text: `hostComponent()` returns a FunctionalComponent, which has no instance,
         so Vue's setRef already falls through to vnode.el. Measured 2026-09-01 through the
         adapter's own mount — isSymbioteNode(ref) is true from the component AND from the tag.
```

So Solid's refusal is narrower than Vue's and both are right — and Vue's own width was overstated
here for four days: "for every primitive" was inferred from Pressable, the one primitive whose ref
hazard is real, while `View`/`Text` are functional and never had it. Nothing was lost by it — both
Vue transforms gate `refusesLowering` behind `entry.observesState`, so the `ref` refusal has only
ever run on Pressable, and a `<View ref>` lowers today. **The prose was wider than the code, which
is the direction that costs a reader rather than a user**: someone reading only this table would
have "fixed" a transform that was already right. Copying Vue's width into Solid would
cost it the lowering of every `<View ref={…}>` to guard a hazard it does not have — which is exactly
`emitStyleExpressionOnce` again: one implementation's constraint promoted into a shared law.

**The consequence for `core/components/host-primitives.cjs`: it must not gain a `declaresPublicRef`
field.** The spec is cross-adapter, the fact is per-adapter, and a shared field would force a single
answer onto five different prop surfaces. The list belongs beside each transform that needs it.

The live risk this leaves, named because it will outlast the session that found it: Solid's check
currently rides `spec.observesState`, and that works by COINCIDENCE — the one primitive that observes
state happens to be the one without a public ref. A stateless primitive with no ref, or a `Pressable`
that gains one, silently flips the gate. The fix is a per-adapter list, not a spec field.

The general test, which is the same one `<prop_types_split_agnostic_vs_per_adapter>` applies to prop
types: **ask whether all five adapters must answer identically by construction.** If a correct
adapter could answer differently, the fact is per-adapter no matter how shared the rule consuming it
is.

## A row can be INEXPRESSIBLE in an adapter's language, which is not `refuse`

The table's vocabulary is `lower` / `refuse`, and both presuppose that the snippet can be WRITTEN.
Angular's runner, added 2026-08-31 as the fifth, found the case that breaks the presupposition:
Angular template expressions have no arrow-function syntax at all, so
`[style]="({pressed}) => (…)"` is not a construct the transform declines — `parseTemplate` raises a
parser error. Two rows (`specialisable-state-style`, `nested-function-state-style`) cannot be posed
there in any form.

**Record it as a skip carrying the parser's own message, never as a `refuse`.** A `refuse` claims
the transform saw the shape and turned it down, which is a fact about the transform; this is a fact
about the LANGUAGE, and collapsing the two would have Angular reporting a verdict it never reached
— the same false-green the control blocks elsewhere in this file exist to prevent, arrived at from
the opposite side.

The corollary for the table's own design: a shared case list assumes one grammar across five
languages, and that assumption held for four adapters by luck (JSX, Vue's expression syntax and
Svelte's are all JS-expression-shaped; Angular's is its own restricted grammar). Before adding a
row that leans on a JS construct, ask whether every target language HAS it.

And the second half Angular got right without being asked: **a runner whose rows nearly all report
`refuse` needs a positive control on the same harness**, or "refuse everywhere" is
indistinguishable from a harness that compiles nothing. Angular's control lowers `View`/`Text`
through the identical path.

## Admission test for a row in the shared lowering table

A row belongs in `LOWERING_CASES` only if **the transforms are what decides it.** The table's
value is that a divergence between four AST plumbings shows up as a red row; a question they do
not answer produces a row that is green under every implementation, including a broken one. That
is the "probe that cannot distinguish the branches" failure
(`.claude/rules/test-harness-false-greens.md`), wearing a parity table's clothes.

Measured 2026-08-30, on the question of whether a lowered element must omit a prop key whose value
is `undefined` (it matters: `onLayout` is in `GATED_EVENT_PROPS`). The answer is that a transform
prints a STATIC attribute list and cannot know a runtime value, so the fold is not expressible at
compile time in any of the four — it would have to be a runtime helper emitted per lowered
element, in every transform, to normalise something the engine already does once for every adapter
(`setProp` collapses `undefined` to absent; see `fabric-boolean-event-gates.md`).

So the test is not "do the transforms agree" — they trivially do — but **"could a transform get
this wrong?"** If no implementation of the transform could produce a different verdict, the row
proves nothing. Two things follow, and the second is the one that gets skipped:

- Absence of such a row is not a coverage gap, and should not be filed as one.
- The reason belongs in writing where the row would have gone, or the next reader files it again.

**Every `refuse` row needs a positive control on the same primitive, and this is the general form
of the trap above.** `refuse` is not an observation, it is the ABSENCE of one — the string "the
intrinsic is not in the output" is produced equally by a transform that refused and by a primitive
no transform can lower. And the second is not hypothetical: withholding an entry from
`HOST_PRIMITIVES` until its runtime half is wired is this project's deliberate practice, so the
ambiguous state recurs by design.

Measured 2026-08-31: `HOST_PRIMITIVES.TextInput` was withdrawn (its behavior was never registered
by any adapter), and both `intrinsic-choice-*` rows went GREEN — reporting the expected verdict
with the detection never once invoked. The fix is a control shape asserted before the row: for
TextInput, a bare `multiline` that MUST lower. When the entry is absent the control fails with
"does not lower even in its control shape, so this row cannot distinguish a refusal from the
primitive being absent", which is the true state, and the row goes green again by itself when the
entry returns.

All three adapters hit this in a different mechanism on the same day — a row green on the wrong
element, a row green on an unimported primitive, a row green on a withheld entry. One symptom:
**the refusal row passes and the detection never runs.** Treat a green `refuse` as unproven until
something on the same primitive is shown to go the other way.

A second thing the table cannot express by default: **its harness splices every snippet into ONE
element.** Vue's spliced them all into `<Pressable>`, which is right for every row about press
state and wrong for the first row about something else. `multiline={isLong}` on a Pressable lowers
— Pressable has no `intrinsicWhen`, so there is nothing to refuse — and a row expecting `refuse`
then fails for a reason that has nothing to do with the rule. Worse in the reverse case: a row
expecting `lower` would PASS on the wrong element and certify a detection that was never invoked.
So a row whose rule belongs to a different primitive must name that primitive and the intrinsic
that counts as lowered for it. Check this the moment a table gains its first row about a
non-default primitive; every adapter's harness has the same hardcoded tag.

The mirror-image error is the one this rule already records above: `emitStyleExpressionOnce`
started as a REFUSAL every transform was to inherit, and turned out to be a property of one
transform's emit shape. Both mistakes are the same misfiling — asking the shared table a question
that lives at a different level. Ask it only what a transform genuinely decides.

## Lowering can change which EXPANSION the compiler emits, and no refusal category covers that

Every hazard above is about a transform's own verdict — lower or refuse, which tag, which fold.
This one is upstream of all of them: the compiler emits **different code for a component and for an
element**, so flipping the tag type silently retargets sugar the transform never looked at.

Measured 2026-08-31 on Vue, both paths, byte-identical output:

```
<TextInput v-model="name">   component   props modelValue + onUpdate:modelValue   <- the wrapper reads these
                             element     onUpdate:modelValue + [[vModelText, name]] <- a runtime DIRECTIVE
```

`vModelText` lives in @vue/runtime-dom, which this project does not ship, so the compiled import
resolved to `undefined` — and `withDirectives` guards with `if (dir)`, so an undefined directive is
SKIPPED rather than thrown. No error, no warning. Native echoes keystrokes on its own, so the field
looks alive while every value derived from it is frozen — a canary that reads as working.

Three things generalise:

- **Ask what the compiler does with each SUGAR on the tag type you are moving to**, not only what
  your transform does with the attributes. `v-model`, `v-show`, `v-slot`, a JSX pragma — each has a
  component form and an element form, and lowering is what moves a call site between them.
- **The repair belongs where the retarget lands.** Here that is the runtime-helpers shim, beside
  `vShow`, which sits there for exactly this reason — one implementation covering SFC, TSX and a
  hand-written `h()`. A transform-side rewrite was the first instinct and would have needed two
  implementations that must agree, for a case where the two paths already agree by construction.
- **A retarget that resolves to `undefined` is the quietest failure shape in the framework**,
  because framework runtimes are full of `if (x)` guards written for optional features. Before
  concluding a lowered element "just drops" a binding, check whether something is being skipped
  rather than dropped.

The corollary for a shim's own scope note: `runtime-helpers/index.ts` said "native-element v-model
is a separate, out-of-scope case", which was TRUE when no primitive lowered and became false the
day one did. A scope note earns a re-read whenever the thing it scopes out becomes reachable.

**Second instance of the same retarget, on a different primitive, and the shim was the thing that
was wrong.** Measured 2026-09-02, device-confirmed on `examples/vue-sfc`: a lowered
`<Switch v-model="on">` also compiles to `vModelText` — Vue emits the TEXT directive for any element
it does not recognise as a DOM input, so one directive now serves two primitives with different
value types. The shim did what upstream must do and stringified: `String(true)` into `props.value`,
which the Switch behavior reads as `props.value === true` and therefore as OFF forever. No tap could
move it, nothing was red.

Two things generalise past the fix (branch the WRITE on the primitive; the READ needed none, because
both behaviors call `onValueChange(value, event)` and the modifier pass leaves a non-string alone):

- **A directive named for one primitive is not scoped to it.** The compiler picks by element, and
  every lowered tag looks the same to it. When a shim exists for one primitive's sugar, enumerate
  which OTHER lowered tags reach it — that list grows every time a primitive joins `HOST_PRIMITIVES`.
- **The four adapters answer this question differently, and only one has the problem.** Solid,
  Svelte and Vue-TSX write RN's own `value` + `onValueChange`, which the lowered path reads directly,
  so their `Switch` lowers with no adapter change at all; Angular's `[(value)]` needed a rename in
  `listen()`. **Two-way SUGAR is the whole hazard** — an adapter without it has nothing to break.

**Solid and Svelte are CLEAR of the retarget class, measured rather than assumed, and their reasons
are different — which is the useful half.** Compiled through each real toolchain 2026-09-02:

```
solid    generate: 'universal'   style / classList / ref  ->  _$setProp(el, name, value)
                                 spread                   ->  not lowered at all
svelte   preprocessor refusal    bind: / use: / spread / {@attach}  ->  stays a component
```

Solid is immune STRUCTURALLY: the universal generator has no DOM-specific expansion to retarget to,
so every attribute reaches the renderer's `setProp` whichever spelling the tag carries. This is also
why Solid never had Angular's `[style]` problem. Svelte is immune by REFUSAL — its preprocessor
lowers an element only when every attribute is a plain name/value pair it can read, stated in that
file as the safety property.

So the hazard needs BOTH halves: a compiler with an element-specific expansion for the sugar, AND a
transform that lowers through it. Vue has both (`v-model` becomes a runtime directive, and the
transform lowers it), which is why the two live bugs of this class are both Vue's. Ask the two
questions separately before clearing an adapter — "does the compiler expand this differently" and
"does my transform refuse it".

## A styled element's prop-key count includes its CSS rule, so a cross-app delta prices both

Measured 2026-08-31, on the question of why a lowered `TextInput` committed 9 prop keys on Vue and
8 on Svelte with `createNode` and `appendChild` byte-identical. The element carries exactly two
attributes in both apps — `class="bench-row-input"` and `value` — and the compiled output of the
real transform confirms nothing else is emitted. Resolved class styles FLATTEN into the payload,
one key per declaration, so the enumerated sets are:

```
vue     9  backgroundColor borderRadius color fontSize height paddingLeft paddingRight text width
svelte  8  backgroundColor borderRadius color          height paddingLeft paddingRight text width
```

The one name is `fontSize`, and it comes from `examples/vue-sfc/App.css` having eight declarations
in that rule where `examples/svelte/App.css` has seven. Zero adapter difference. Counting the other
apps: `examples/react` has seven declarations too (it spells `padding-horizontal`, one key, and
keeps `font-size`), so React predicts to 8 — the same total as Svelte by a different composition,
which is the coincidence this file already warns about one section up.

**So a benchmark arm that adds a STYLED element measures the element plus its rule.** For the delta
to be comparable across columns the rule must be identical in every app, not merely present; the
VALUES are free (96px vs 72px changes nothing) and the SET OF PROPERTIES is not. Two independently
authored canary stylesheets will not agree by default, and nothing in the repo makes them.

Two working notes:

- **Enumerate on a mounted node, not from the stylesheet.** Reading the CSS gives a declaration
  count; the payload is what the comparison is about, and the two differ wherever a shorthand
  expands or a value is dropped. The probe is one mount plus `Object.keys` of the committed props,
  with the app's own rule handed to `registerRules`.
- A controlled input at create carries `text` and nothing else of its own —
  `mostRecentEventCount` is written by the behavior on a change EVENT, so it is absent from a
  create-path payload. Do not budget for it when predicting a create-shaped row.

## A name a BEHAVIOR owns but the ENGINE does not route is dead on the lowered path only

`routeProp` hands an `on*` prop to `setEventListener` — and therefore to the behavior's stash — only
when the name passes `isRegisteredEvent` (`RESPONDER_EVENTS` or the component's ViewConfig). A name
that misses both falls through to `setProp` and sits in `node.props`, where the machine, which reads
the STASH, never looks. A wrapper passes the same callback to the machine directly, so the component
path is unaffected and the two paths disagree in silence.

Measured 2026-09-02, device-reported on `examples/vue-sfc`: the press machine's `ownedListeners`
carry eight names, and exactly one — `pressMove` — was in neither `BASE_EVENTS` nor
`RESPONDER_EVENTS`. On a lowered `<Pressable @press-move>` the card still highlighted (that is
`activeStyle`, engine-side) while its dx/dy readout never moved. One engine line, all five adapters.

The audit is a set difference and costs one command per behavior:

```
ownedListeners  MINUS  (BASE_EVENTS + COMPONENT_EVENTS[component] + RESPONDER_EVENTS)
```

Anything left over is dead on every lowered element that binds it, and it is now a TEST rather than
a command to remember: `core/components/src/behaviors/owned-listeners-are-routable.test.ts` runs the
difference over 15 pairs — the press machine's 8, TextInput's 3 on each of its two tags, Switch's 1
(Image and InputAccessoryView own none, being prop folds only).

Derived on BOTH axes so it cannot rot: the tags come off `HOST_PRIMITIVES`, the names off each
registered behavior via the engine's `hostBehaviorFor`. A primitive or an owned name added later
joins the audit by existing — the `adapterNames()` repair applied one level down. It also asserts
its own `checked` count, because an empty difference and a harness that examined nothing produce the
identical green.

## The sixth surface: a lowered primitive silently loses its wrapper's PROP FOLDS

Every audit above compares two things that both exist — two barrels, two subpaths, two transforms'
verdicts. This one compares an implementation against a DELETION. Lowering removes the component
body, and the body is where the per-primitive prop folds live. Nothing is left behind to report a
gap.

Measured 2026-08-31 on the committed payload, three folds live at once:

```
                        wrapper                     lowered        consequence
TextInput inputMode     keyboardType 'number-pad'   undefined      the default keyboard, on device
TextInput readOnly      editable false              undefined      a read-only field accepts typing
TextInput enterKeyHint  returnKeyType 'search'      undefined      the wrong return key
TextInput (defaults)    underlineColorAndroid       undefined      a Material bar under every input
Pressable disabled      accessibilityState.disabled undefined      announced as ENABLED to a reader
```

Every one is silent in the same way, and the way is worth stating once: **the raw alias reaches
Fabric as a key no ViewConfig declares, which throws nothing, logs nothing and paints nothing.** The
press suppression still worked (the machine reads `node.props.disabled` directly), so the button
behaved correctly and lied to a screen reader. `tsc` green, 5 000 tests green.

The machine-only props leak the other way — `delayLongPress`, `cancelable`, `pressRetentionOffset`
rode into the payload because a wrapper drops them by DESTRUCTURING and a lowered element has no
destructure.

### The check, and why its oracle is imports rather than payloads

The honest oracle is "wrapper and lowered element commit the same payload for the same props", and
it is not reachable from a shared test: rendering a wrapper needs its framework, and there are five.
What IS reachable is that both paths call the same shared fold — every fold lives in
`core/components` precisely because five adapters share it. So `tests/lowered-primitive-fold-parity.test.ts`
diffs the shared-layer VALUE IMPORTS of all five wrappers against the behavior's, intersected across
adapters, with an equality-compared `wrapperOnly` allowlist.

It is a PROXY, with a proxy's failure mode: a fold applied INLINE in a wrapper, without calling a
named shared function, is invisible to it. That is the argument for keeping folds in
`core/components` and calling them by name on both paths.

Three things the first run got wrong, all of them the shapes this file already records:

- **One unlocated wrapper reported a clean tree.** The locator matched `touchable-native-feedback`
  on two adapters and a barrel with zero imports on a third; an intersection across five sets is
  emptied by ONE empty set, so the audit printed "(none)" while three folds were missing. It now
  throws when a primitive does not resolve to exactly one file — a silent miss here is
  indistinguishable from agreement.
- **The adapter list came from `readdirSync('adapters')`** and died on `.DS_Store`. Use
  `adapterNames()`; that is what it is for.
- **The first probe was written inline in a shell heredoc and the quotes were mangled**, so the
  import regex matched nothing and every set was empty — the same "(none)". A probe that returns a
  clean answer rather than an error is the thing to distrust; write it to a file.

### The audit's oracle is IMPORTS, so an INLINE fold reads as agreement

Stated once, because the section above calls the check a proxy without naming the specific blind
spot. `tests/lowered-primitive-fold-parity.test.ts` diffs each wrapper's shared-layer VALUE imports
against the behavior's. A fold applied inline — no named shared function called — imports nothing,
so it is invisible, and invisibility here reads as PARITY rather than as a gap.

Measured 2026-09-01 while taking `Image` to the lowered path. The brief said "derive the entry from
the wrapper"; there were THREE wrappers' worth of fold:

```
react vue solid   call renderImage()                            the shared one
svelte            components/image/image-logic.ts reproduces the mapping BY HAND — its own header
                  says it had to, because nothing was exported to call
angular           folds in an Angular template (components/image/index.ios.ts)
```

Only the first is visible to the audit. The second says out loud that it is a copy and the audit
still cannot see it, which is the sharpest form of the point: **a comment admitting duplication is
not an import**.

So the first step of any "bring primitive X to the lowered path" task is **count the
implementations**, not read the wrapper — and the extraction that gives the behavior something to
call is what collapses them, which is most of the value of the task. Grep the primitive's fold
OUTPUT keys across `adapters/*/src/components/**`, not its input names: a hand copy renames the
locals but has to emit the same payload.

This compounds with the failure already recorded two paragraphs down — an intersection across five
sets is emptied by ONE unlocated wrapper, so a locator miss and an inline fold both surface as the
same clean "(none)". Neither is agreement. The audit now throws on an unlocated wrapper; it still
cannot see an inline fold, and nothing in the repo can.

### The engine seam it needed, and the trap in the obvious placement

`fabricProps` already runs two folds at the one point where the whole bag is known, and both are
keyed on `node.component` — which a wrapper and its lowered twin SHARE (`RCTSinglelineTextInputView`
is the component for both `symbiote-text-input` and `symbiote-text-input-managed`). So a
per-primitive fold added there runs on the wrapper too, which has already folded in its own body.
Double-folding is the hazard, and it is invisible for a fold that happens to be idempotent.

The discriminator that already exists is the BEHAVIOR: it attaches to the lowered tag alone. Hence
`IHostBehavior.foldPayload`, stored on the node at `createElement` (a field, not a lookup —
`fabricProps` runs per node per commit) and applied beside the aria fold.

### The one gap that looked structural, and was our WRAPPER copying the wrong upstream

`android_ripple` read as unfixable: our Pressable wrapper paints it through a dedicated inner View
carrying `nativeBackgroundAndroid`, and a lowered element is a single node with no child. The two
candidate repairs on the table were a refusal in four transforms and "paint it on the element,
needs a device to confirm".

Neither was needed, and the answer was one grep of the vendored source. **RN's own `Pressable` does
not use an inner view** — `useAndroidRippleForView` returns a `viewProps` bag and `Pressable.js:251`
spreads it onto its own View. The background is an ordinary prop of the responder. Our wrapper is
copying `TouchableNativeFeedback`, which genuinely does clone it onto a child, and the resemblance
made a component-shaped constraint look like a native one.

So the fold closes it: `foldPayload` resolves the config and assigns `nativeBackgroundAndroid` /
`nativeForegroundAndroid` onto the lowered element, and `rippleProps` returns undefined off Android
so the branch is inert on iOS.

Two things worth carrying past this instance:

- **Before accepting "a lowered element structurally cannot do X", check how UPSTREAM does X.** Our
  wrapper's shape is one implementation's choice, and the audit compares against the wrapper — so a
  wrapper that over-builds makes its own extra structure look like a requirement. The refusal would
  have cost lowering on every Android Pressable to preserve a node RN does not create.
- **The same read turned up a gap on BOTH paths.** RN also dispatches `Commands.hotspotUpdate(x, y)`
  on pressIn/pressMove and `Commands.setPressed` on pressIn/pressOut — that is what makes the ripple
  originate at the touch point. `grep hotspotUpdate` returns nothing in this tree, so neither our
  wrapper nor the behavior sends them. Pre-existing, unrelated to lowering, and invisible to this
  audit precisely because the audit's oracle is "the lowered path matches the wrapper".

That last point is the audit's boundary stated as a fact rather than a caveat: **it measures parity
with our wrapper, never parity with React Native.** A fold both paths are missing is agreement, and
agreement is what it reports as healthy.

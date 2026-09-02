---
paths:
  - '.claude/**/*.md'
  - 'CLAUDE.md'
  - 'core/**/*.ts'
  - 'adapters/**/*.ts'
  # Two of the four instances below live in file types the first four globs miss, which is the
  # rule's own thesis turned on its frontmatter: a path list is an unowned sentence about itself.
  # The `.cjs` transformers are where the id->nativeID divergence lived, in three copies; a
  # `.svelte` component is not markup here (Pressable's whole press lifecycle is one), so it is
  # exactly a file talking to a framework runtime and to the engine in the same breath.
  - 'adapters/**/*.svelte'
  - '**/*.cjs'
---

# Before recording a claim about someone else's code, read the side that DECIDES

Four times on 2026-08-23, across three sessions, a confident claim was written into a comment, a
rule or a design and was wrong — every time because the reader opened the declaration plus one
convenient side of the usage, and not the side that actually decides the behaviour. Each was two
minutes of reading away, and each was only caught when someone tried to BUILD on it.

```
claim                                   read                        decides            outcome
"removeChild means the node is gone"    engine's own removeChild    the FRAMEWORK      teardown killed live nodes
"still absent at commit means gone"     Solid's replaceNode         Svelte's parking   same, one layer later
"ruleIndex.has(':active') gates it"     the Map + its READ site     registerRules      gate always false,
                                                                    (hooks tokens[0])  feature silently dead
"an object class reaches the engine"    IClassNameValue's TYPE      Vue's createVNode  fix aimed at a
                                                                    (normalises first) non-existent bug —
                                                                                       and would have broken
                                                                                       the style channel
```

The type said an object was possible, so "an object arrives" felt verified. It was not: the
PRODUCER decided, and nobody opened it.

**The rule.** For any claim of the form "X behaves like Y", identify which side of X decides Y —
the writer of a map, the producer of a value, the framework rather than our own layer — and open
THAT file. A declaration tells you what shape a thing may have, never what is actually put in it.

**The sharpest form, and it covers both halves: a claim about a NEIGHBOURING layer is the one that
must be re-derived, because it is the one nobody in either layer owns.** Our code owns its own
behaviour and the framework owns its own; the sentence describing what crosses between them has no
owner, so it is never re-checked by the person who would notice. Every entry above is one of those
sentences.

**Corollary for knowledge files.** A claim inherited from a teammate, a skill, or an older comment
gets re-read at its source before it is written down again. Three of the four above propagated
because they were quoted rather than checked; one reached five files that way.

## The fifth instance was a different shape: the file you are EDITING

Not "read the wrong side" — "lost sight of what already stands in the function you are changing".
Late on the same day, a claim that the class re-push tax was still open went out to two sessions.
It had been closed hours earlier by `isAlreadyPublished`, the first line of `pushClassStyle` — and
the sender had edited that very function that afternoon (`baseStyleOf` is read there and at the
publish site through one helper, so slot 0 cannot drift). Both peers caught it independently.

So the rule above has a near neighbour with no neighbouring layer in it at all: **an open-problem
claim decays fastest of any claim in a multi-session tree, and the check is one grep.** Before
saying a thing is unfixed, open the function it would live in. A file you edited yourself is not
evidence you know its current contents — three sessions write to this tree.

The cost shape is also worth naming: a wrong "already done" wastes a read, a wrong "still open"
sends someone to rewrite working code that a live feature depends on.

## A bisect arm that moves nothing does not refute — it means nothing

The sixth instance, and it is the rule turned on an EXPERIMENT rather than on a claim. A session
defending its transform against a red test zeroed its own local `PENDING_HOST_PRIMITIVES` copy,
saw no change, and reported that as decisive: "not my transform". But the entry it removed had been
made redundant hours earlier — the shared spec now carried the same key, so the arm deleted a
duplicate while the real source stood. Removing the spec entry instead did not help either, and
only cutting the transform out of the pipeline entirely produced the split:

```
CanaryScreen.vue  without the transform installed   OK OK OK
CanaryScreen.vue  with it                           OK THROW THROW
```

**A failure to reproduce is evidence only when the attempt is shown to be CAPABLE of reproducing.**
Same rule pointed at a non-result. Measured 2026-08-31 chasing a flaky test: 3 solo runs, 4 full
suites and a contrived load (six background suites plus fifteen iterations of the target) produced
nothing — and the reason that counts as evidence rather than silence is that the load caught a
DIFFERENT flake while running. Without that, "did not reproduce" and "did not stress anything" are
the same observation. Report the incidental failure; it is the calibration.

**Before reading a negative result, prove the arm removed the cause.** An arm that changes nothing
observable is not evidence of innocence; it is a measurement that did not happen. The cheap check
is to confirm the arm is load-bearing at all — flip it in the direction that should BREAK a passing
case, and watch it break. Same discipline as break-testing a test, applied to a bisect.

Two more things that fell out of the same session and generalise:

- **`compileSfc` was not idempotent for the pair (source, filename)** — `@vue/compiler-sfc`'s
  `parse()` memoizes on exactly that pair, and a nodeTransform mutating the cached AST in place
  hands the next call a node whose `codegenNode` is already consumed. Only a test that compiles one
  source TWICE can see it, which is why a determinism test earns its place. The fix is
  `parseCache.clear()`, not deleting your own key: the key is `source + JSON.stringify(options)`
  from `genCacheKey`, and reproducing it couples you to an internal format across every version
  bump. Clearing a pure memo is always safe.
- **Widening a Map's value type from a string to an object breaks every `.values()` consumer,
  silently.** `new Set(map.values())` became a Set of objects and an `isCustomElement` check simply
  stopped recognising anything. Nothing red — the transform kept running and half of it stopped
  working. When a collection's element type changes, grep every reader of that collection, not just
  the writers.

## The frame that covers all of the above: a verification is a TIMESTAMP, not a property

Every instance in this file is the same failure wearing a different coat — a check that was true
when it was run, recorded as though it were true from then on. The re-push guard ("still open" —
made false hours earlier, by an edit to a function the writer had also edited). The bisect arm
("removes the cause" — made void by the spec gaining the key). The overlay exclusion ("css-parser
pulls in lightningcss" — made void when the dependency sets converged). Each was a correct
observation with an expiry date nobody wrote down.

It was demonstrated live on 2026-08-23, inside the hour: a session verified "all four packed
packages are byte-identical to source", and a `fix-esm-extensions` run landed between that check
and the pack, leaving the installed arm one specifier behind on exactly one line. Harmless there —
Metro resolves both forms — but the claim had already expired when it was made.

**So record a check as "X held at T, by method M", and re-run M rather than quoting the result.**
Where the finding deserves to outlive its run, convert it into a PROPERTY with its own expiry
condition: not "css-parser can be folder-swapped now", but "a folder swap is safe exactly when the
packed dependency set is a subset of what is installed — per package, expiring the moment either
side gains a dependency". The first is a fact about one afternoon; the second stays checkable and
tells the next reader when it stops applying. A knowledge file should hold the second kind.

The corollary for a shared tree: three sessions write here, so the half-life of any observation
about someone else's package is minutes, not days. Re-run, do not recall.

## A design reviewed by three sessions still shipped a correctness hole — implementation found it

Worth recording because the review was not lazy. The invocation design — build the resting/pressed
style pair by calling the style callback twice instead of substituting into it — was weighed on
four axes by two sessions: coverage, runtime cost, purity of the callback body, and mechanism
divergence across adapters. It was sent to three adapters. Every axis was real and none of them was
the bug.

The bug is that calling twice also READS THE STYLE EXPRESSION twice. `style={getStyle()}` runs the
author's call twice per bag build; `style={bag[i]}` evaluates the index twice; `style={flag ? a : b}`
can take different branches on the two reads. It surfaced only when a session sat down to implement
it, and it is a correctness bug rather than a coverage one — the failure is an app doing work twice,
not a component that failed to lower.

**The generalisable form: when a change moves an expression from evaluated-once to evaluated-N-times,
the thing to audit is the EXPRESSION, not the value it produces.** Purity of the callback body was
the axis everyone checked, because that is where the new execution obviously lives. The expression
that names the callback was never in view — it had not changed, so it did not look like part of the
change.

**And the first fix for it was wrong in a way worth more than the bug.** It was written into the
shared spec as a REFUSAL — those three shapes may not lower — and sent to two adapters. A third
session then showed the double read is a property of the EMISSION SHAPE, not of the expression: the
guard had been emitted inline (`typeof f === 'function' ? f(…) : f`), which repeats the expression
three times, and wrapping once instead evaluates it once while calling its RESULT twice. All three
shapes lower correctly under that emission.

So a defect in one transform's output had been about to become a law binding every other transform —
and the adapter that had already done it correctly would have had to give up coverage to satisfy a
shared table encoding someone else's bug. **A shared rule derived from one implementation's failure
is a rule about that implementation until someone checks the others.** The fix that generalises is
almost never "forbid the input"; it is "require the output property that made the input safe" —
here `emitStyleExpressionOnce`, asserted on the emitted text (`occurrences(out, expr) === 1`), which
a wrong transform fails and a right one passes.

What survived as a genuine contract is one line: the callback must be pure in `pressed`, because its
result is invoked twice under any emission.

## A survey whose pattern cannot match every candidate reports UNANIMITY, not a miss

The probe-shaped instance again, one layer lower: not "aimed at the wrong file" but "aimed at all
the right files with a pattern that silently skipped most of them". Measured 2026-08-30, surveying
where four census probes write their output:

```
grep -hoE "writeFileSync\([^,]+" adapters/*/src/node-census.probe.test.* | sort -u
writeFileSync(outPath        <- ONE line, from ONE of the four files
```

`[^,]+` cannot cross a newline, so the three probes whose call is wrapped
(`writeFileSync(\n  'census-solid.txt',`) matched NOTHING and vanished from the survey. `sort -u`
then collapsed what was left into a single line, which reads as "all four do the same thing". On
that basis a claim went out that all four wrote into the repo root. Two did, one wrote inside its
own package via `join(__dirname, …)` and was correct all along — and it was sitting in the same
directory as the broken ones.

**A survey must account for every candidate, not just report what it found.** Count the inputs and
count the matches; when `4 files -> 1 line` the interesting question is which three produced nothing,
and the answer is never "they agree". Cheapest habit: `grep -c` per file first, so a zero is visible
as a zero rather than as consensus.

The disconfirming evidence was IN the output and went unread: the surviving line said `outPath`, a
variable — so the one file the survey did see was already parameterised, which is precisely not the
literal path being asserted about the other three.

**Re-running it now gives a different answer, and both are right — the output above is dated.** After
the probes were fixed the same command returns TWO lines, and a peer reproducing it reported that as
a correction. It is not one: the survey was run before the fix and reflects the tree it was run
against. This is the `a verification is a TIMESTAMP` section applied to the survey itself, so the
command is recorded with the date and state it was run against, not as a reproducible constant.

**And today's two-line output carries a fresh instance of the same class.** One surviving line reads
`writeFileSync('census-react.txt'` — which is not code. It is a fragment of the COMMENT that explains
why the literal path was wrong. So the survey now reports a literal write that no longer executes
anywhere, because `grep` cannot tell an example from an instruction. A survey over source text must
either exclude comments or resolve every hit to a line that runs.

Per-file counts as of 2026-08-30, post-fix — no zero anywhere, which is what makes the collapsed
`sort -u` view the misleading one rather than the counts:

```
3  adapters/react/src/node-census.probe.test.tsx     (2 code + 1 in a comment)
2  adapters/solid/src/node-census.probe.test.tsx
3  adapters/svelte/src/node-census.probe.test.ts
2  adapters/vue/src/node-census.probe.test.ts
```

## A refuted RATIONALE is not a refuted VERDICT

The reading was right and the inference was wrong, which makes this the sharpest trap in this file:
every earlier entry is fixed by opening one more file, and this one is not.

Measured 2026-08-30 on the shared lowering table. A row said `instance-bound-directive` must REFUSE,
because "a lowered element has no component instance for the binding to target". Checking that
premise across all five adapters showed it is false everywhere — no adapter exposes a public `ref`
on `Pressable`, so the binding targets nothing before lowering either. From that I concluded the row
had nothing to defend.

It has. A peer supplied the real hazard: after lowering, `ref` DOES yield the engine node, so the
capability would exist exactly when the transform chose to lower — and whether it lowers turns on an
unrelated sibling attribute. **A surface that flickers with the compiler's verdict is worse than one
that is absent everywhere.** The verdict stands; only its rationale changed.

Two things generalise:

- **"The stated reason is false" licenses re-deriving the conclusion, never negating it.** Both
  hypotheses on offer had argued about which side should change; the check that broke the deadlock
  was testing the row's PREMISE against every adapter. That was the right move and it is only half
  the work — the other half is asking what else could justify the same verdict.
- **The specific blind spot: an ADDED capability reads as harmless.** The habit that "a refusal is
  always safe" is about the transform's VERDICT, not about its effect on the public surface. Lowering
  is an optimisation, and an optimisation that moves the observable surface in EITHER direction is a
  bug — gaining an API on some call sites is as much a divergence as losing one.

## A test run that straddles a peer's write measures neither version

The timestamp rule applied to a RUN rather than to a claim, and it produced the most convincing
wrong result of the day. Measured 2026-08-31 in a tree three sessions write to: a full suite
reported **18 failures across five files**, including a gate that had passed 4/4 four minutes
earlier and that the run's own changes could not touch. Re-running it unchanged gave 490/490.

The tell was in the file times, not in the failures:

```
core/engine/src/accessibility-props.ts   mtime 11:23:22   <- a peer saving it
the run                                  started 11:23:2x
```

The suite imported a half-written module. Every failure was real in the sense that the assertion
did fail; none of them was a fact about any version of the code. **Eighteen failures across
unrelated files, when the change under test is local and small, is itself the signal** — a local
change produces a local red, and breadth that wide means the tree moved, not the code.

So before reporting a red from a shared tree: re-run it once. If it clears, check the mtimes of the
files the failures name against the run window before saying anything at all — and if it does not
clear, the second run is what you report, because the first one measured a save in progress.

The corollary for the other direction is worse and has no cheap check: a run can equally straddle a
write that makes something pass. Green from a single run in a live tree is weaker evidence than red
from two.

## A negative test can be satisfied by an EARLIER guard than the one it names

The probe family again, and the sharpest member: not a probe that cannot fail, but one that fails
for a reason unrelated to its own subject — so it is green under a break of the rule it claims to
cover.

Measured 2026-08-31 on the TextInput selector rule, which accepts only a boolean LITERAL and refuses
everything else. The refusal cases were written as:

```
<TextInput multiline={1} />       expression container, NumericLiteral   <- reaches the rule
<TextInput multiline="yes" />     a bare JSX string attribute            <- never reaches it
```

`staticTruthOf` returns `undefined` for anything that is not a `JSXExpressionContainer` before it
ever inspects the expression, so the second row refused on SYNTAX while its name and its comment
claimed it proved SEMANTICS. Breaking the rule from identity to truthiness made `{1}` go red and
left `"yes"` green — under a rule that would have resolved `'yes'` to the wrong native view.

**A refusal test proves only that SOMETHING refused.** The verdict is the same whichever guard
produced it, so the assertion cannot tell them apart, and a row phrased in the vocabulary of the
later rule reads as coverage of it. The fix is to construct the input so it reaches the rule under
test — here `{'yes'}` rather than `"yes"` — and the check that it does is the break: flip the rule
and require THAT row to move.

Two things generalise:

- **When several guards can produce one verdict, a test of the last one must first clear the
  earlier ones.** Ask which guard the input actually trips, not whether the answer is right.
- **The reason belongs above the case, not in the commit message.** `"yes"` is shorter than
  `{'yes'}` and looks equivalent, so without a note saying why the braces are load-bearing the next
  reader simplifies it back and the coverage silently leaves again.

## A test's NAME is its subject, not the assertion that failed

Measured 2026-08-31, reading a peer's red. The row was titled
`intrinsic-choice-dynamic: refuse — the intrinsic-selecting prop is a runtime value`, it failed, and
I reported that the adapter LOWERS where it should refuse. It does not. The assertion that failed
was a different one in the same test — a control arm asserting the CONTROL shape lowers:

```
expect(sfcControl, 'does not lower even in its control shape…').toBe('lower')
Received: "refuse"
```

So the adapter refused everything, which was correct for a spec with the entry withdrawn, and the
control was doing exactly its job: reporting that the row cannot tell a real refusal from an unknown
primitive. I had inferred the DIRECTION of the failure from the word `refuse` in the title — which
is the expectation the row is named for, not the thing that broke.

**A multi-assertion test reports under one name, and the name describes the subject.** The moment a
test grows a control arm, a guard, or a precondition, its title stops predicting which assertion
moved — and control arms are exactly what this project has been adding all week, so the trap is
getting more common, not less. Read the `expect` line and the received value; the title tells you
where to look, never what happened.

Same shape as everything else in this file: a declaration (here, a test name) says what a thing is
ABOUT, never what it did.

## Before following a precedent, read what MAKES it one

The convention trap has a twin that is easier to fall into, because following precedent is the
correct instinct. Both are the same move: a rule inferred from a sample, without checking which
property the sample's members actually share.

```
sample                                    inferred rule            actual property
view.tsx / text.tsx / pressable.tsx       "lowercase the name"     all one-word, all .tsx
host-primitives / lowering-fixtures /     "shared .cjs live in     all PUBLIC SUBPATHS of a
  specialize-state-style .cjs                core/components"        shipped package
```

Both were measured on 2026-08-31 and both cost a wrong placement. The first broke on `TextInput` —
and note it was holding on TWO coincidences, so a fix for the name alone would have failed on the
extension a day later. The second sent a spec-MUTATING test fixture toward `core/components`, whose
three `.cjs` neighbours are published API an app can import without adding a single line to its
manifest.

**The check is one question: what do all the members of the sample have in common BESIDES the thing
I am matching on?** If the answer is "something", that something is the rule and the resemblance is
a coincidence. Sample size does not help — three files agreeing is exactly what makes the wrong
property look like a convention.

Corollary, from the second case: **"shared" is not one property.** Shared-as-specification and
shared-as-test-fixture belong in different packages, and the tell is not whether a file is public —
`core/test-utils` publishes too — but whether a consumer reaches it WITHOUT asking: a runtime
`dependency` of every adapter arrives on its own, a `devDependency` has to be installed on purpose.

## Two guards that overlap leave the SECOND one unverified, and nothing says so

The earlier-guard trap above is about a test INPUT satisfied by a guard it does not name. This is
the same shape moved into production code: two guards in sequence, both correct, both believed
covered — and on the current input set the first one intercepts every case that would exercise the
second, so the second has never run.

Measured 2026-08-31 on a lowering runner's verdict reader. It carries three mechanisms: a tag FAMILY
(the base plus the `intrinsicWhen` alternative), a QUOTED match so a name cannot be satisfied by a
longer sibling, and a throw when a wrapper-only tag leaks into a transform's output. Removing the
quotes left the suite **21/21 green.**

The reason is the overlap: the only tag in today's alphabet that exploits prefix matching is
`…-managed`, and the leak check throws on it BEFORE the marker comparison is reached. So the
boundary was protecting against a case another guard already caught, and its own correctness was
resting on nothing.

**The tell is that the guard reads as belt-and-braces.** That is exactly the guard nobody
break-tests, because it looks like defence in depth — and defence in depth is precisely two things
covering one case, which means one of them is unmeasured.

The check is per MECHANISM, not per file: break each one separately and require a DIFFERENT test to
go red for each. Where a break moves nothing, either the mechanism is redundant today (say so, with
the input set that makes it so) or it needs a case reaching it past the earlier guard. Here that was
a hypothetical tag — `symbiote-text-input-someday` — which is legitimate in a reader's own unit
test: the property under test is "matches a whole name, not a prefix", not today's tag list.

Two smaller findings from the same pass, both from the block being declared the reader's OWN test
and therefore not entitled to lean on the table it serves:

- **A derived list must be derived from the code that WRITES the value, not restated.** The
  wrapper-only tags were a two-string literal while the real names are private constants in
  `render-text-input.ts` — a rename would have silently emptied the guard. Deriving them by calling
  the render fn and reading `descriptor.type` costs less than exporting the constants, and the
  derivation is itself witnessed, because the leak case feeds a literal name and requires the throw.
- **A reader with no negative arm is satisfied by a reader that always says yes.** A `verdictOf`
  hardcoded to `'lower'` passed both existing cases. The table does catch it — but the block's whole
  premise is that the table cannot reach these paths, so it may not borrow the table's coverage.

## A guard built on a proxy ENDORSES the first case the proxy gets wrong

The precedent trap, turned on a test. `ref-refusal-matches-components.test.ts` existed to keep a
hand-written refusal list honest by re-deriving it from the component sources — the right structural
move, and it had a break-test. Its question was "does this component declare a public `ref`".

That is not the rule. The rule is **would lowering hand the app something DIFFERENT from what the
component hands it**, and "declares a ref" is a proxy that agreed with it for exactly as long as the
set was View, Text and Pressable:

```
View, Text   ref?: Ref<IHostInstance>      lowered yields the same node     lower
Pressable    no ref declared               lowering would ADD a handle      refuse
TextInput    ref?: Ref<ITextInputHandle>   lowering would SWAP the handle   refuse   <- proxy says "lower"
```

So a lowered `<TextInput ref>` silently dropped `clear`, `isFocused` and `setSelection` — and the
guard was GREEN, because it was asked the proxy's question and answered it correctly. **A guard
whose oracle is a proxy does not merely miss the case; it certifies it**, which is worse than no
guard: the next reader sees a derived, break-tested check and stops looking.

Two things generalise:

- **When a set of two or three grows a fourth member, re-derive the ORACLE, not just the data.**
  The list was self-deriving and still wrong, because the derivation asked the wrong question.
  Sample size is what makes a proxy look like the rule (see the precedent section above).
- **The check ordering encoded the same coincidence.** The ref test sat below an
  `if (!spec.observesState) return true` early-return, which was harmless while the only
  ref-refusing primitive also observed state. TextInput observes nothing, so the early-return fired
  first and the refusal never ran. Order checks by what they ASK, never by what happens to work —
  two independent questions must not share a gate.

## A guard built on a PROXY does not miss the first case where the proxy lies — it CERTIFIES it

Worse than the overlapping-guards trap above, and worse than no guard at all, because a
source-derived check with a working break-test is exactly the one nobody re-reads.

Measured 2026-08-31. A transform refuses to lower an element carrying a `ref`, and the refusal list
was validated by `ref-refusal-matches-components.test.ts`, which re-derives it from the component
sources so a hand-written list cannot go stale. Good shape, green, break-tested. Its question was
**"does this primitive declare a public ref?"** — a PROXY for the real rule, and the two agreed for
as long as the set was `View`/`Text`/`Pressable`:

```
View, Text   ref?: Ref<IHostInstance>      lowered gives the same thing   lower
Pressable    declares none                 lowering would ADD a ref       refuse
TextInput    ref?: Ref<ITextInputHandle>   lowering SUBSTITUTES it        refuse   <- proxy said "lower"
```

The real criterion is "does the lowered path hand back THE SAME thing the component does", and it is
just as mechanically derivable from the ref's TYPE. The proxy answered "declares one, so lowering is
safe" for the first primitive whose ref is a different type — and the guard then stood behind that
answer.

**State the rule, then ask what your check actually asks.** Where the two differ, the check is a
proxy, and a proxy's blast radius is every future member of the set — it will keep agreeing until
the first case it cannot see, and that case arrives looking approved.

The same session found the order hazard beside it: the ref check sat below an early
`if (!spec.observesState) return true`, harmless while the only refusing primitive happened to
observe state. `TextInput` does not, so the early exit fired first and the ref check never ran —
the conditionally-invoked-guard trap (`adapter-parity-audit.md`), reached from a third direction.
Both breaks were verified separately and fail different counts, which is what tells them apart.

## And when the rationale dies, ask whether the verdict survives on a NARROWER scope

The section above says a false reason licenses re-deriving the conclusion, not negating it. The
follow-up question is the one that was missed twice in one day: **the answer is often "the verdict
holds, but for fewer cases than the rule states"**, and both of the obvious moves — ratify it
everywhere, delete it everywhere — are wrong.

Measured 2026-08-31 on `REFUSAL_CATEGORIES.unreadableAttributeSet`, the refusal to lower an element
carrying `{...spread}`. Its stated reason is that a transform cannot enumerate the bag and so cannot
fold `id` -> `nativeID` inside it. On an adapter whose fold runs in the shim rather than at compile
time, that reason is simply false, and the payloads prove it:

```
<View {...bag}> lowered   ==  the wrapper's payload, byte for byte   (bag = id/class/testID)
nativeID folded on both, raw `id` on neither
```

Deleting it there would have been a real defect, because a spread can also carry a FUNCTIONAL
`style`, and the state-style split is a compile-time rewrite that must SEE the attribute:

```
<symbiote-pressable p={{...bag}}>  bag.style = ({pressed}) => …
committed:  style undefined   opacity undefined      <- not a wrong style: NONE
```

So the refusal is dead on `View`/`Text` and load-bearing on anything carrying `observesState` — one
category, two scopes, and the reason on the second has nothing to do with the reason written down.
The rule that generalises: after showing a rationale false, enumerate what ELSE the refusal is
standing in front of before either keeping or dropping it, and write the test parameterised by the
property that actually decides (here `observesState`), never by the list of names that happen to
have it today.

The cost asymmetry is what makes this worth the extra step rather than defaulting to "keep it, it is
safe": an always-firing refusal is not free — it costs lowering on a shape real code writes
constantly — while a refusal scoped to the primitives that need it costs nothing at all.

## Cite it so the next reader can re-verify

The same day produced three citation defects with the same root — a reference that cannot be
checked without re-reading everything around it.

- **Per fact, never a span.** `Text.js:288-291` described two defaults with two unrelated
  assignments interleaved; the real lines are `:289` and `:291`. It read as a span, so it was
  copied into five files.
- **Name the build.** `solid-js/universal` ships `.js` and `.cjs` two lines apart; `@vue/runtime-core`
  ships several builds of the same file. Two records naming different numbers look like a
  contradiction until someone opens both.
- **Prefer the expression to the line for a multi-build file** — `if (klass && !isString(klass))`
  survives a version bump and a build swap; a line number survives neither.
- **Line numbers in OUR OWN files rot fastest of all.** One went stale the same hour it was
  written, in the message that proposed the rule. Cite a symbol name in our code: it is unique,
  greppable, and moves with the edit.

## A break-test that will not go red has TWO explanations, and the flattering one is checked first

The bisect rule above says an arm that changes nothing is a measurement that did not happen. The
same fact has a second reading that is easy to skip past: **maybe the code the arm removed was not
doing anything.**

Measured 2026-09-01, adding a `typeof Component === 'string'` children branch to Vue's
`createAnimatedComponent`. The branch had a mechanism behind it, read out of `@vue/runtime-core`'s
own `normalizeChildren` — for an element Vue unwraps a slots object by calling `children.default()`
and recursing on the RESULT rather than going back through `h`, so a slot returning a lone VNode is
re-read as an object, found to have no `.default`, and dropped with no error. A test was written,
the branch removed, and the suite stayed green. The conclusion drawn was "the fixture uses an array,
which survives either implementation" — true in general, so the fixture was changed to a lone VNode.
Still green. Only then was the actual value measured: **Vue wraps every slot at `initSlots`, so
`slots.default()` returns an array whatever the author wrote.** The hazard is prevented one layer
earlier and the branch never ran.

Two things generalise, and the second is the one that cost the extra round:

- **When a break-test will not go red, "my fixture is wrong" and "my code is unnecessary" are both
  live.** Reaching for the first twice in a row is how dead code ships with a confident comment
  explaining a mechanism that is real but unreachable — which is strictly worse than no comment,
  because the next reader inherits the mechanism as established.
- **A hand-built stand-in for a framework-normalised value is not that value.** The probe that
  started this passed a raw `{default: fn}` literal to `h()` and did reproduce the failure — because
  a raw literal is exactly what the framework never hands you. Probe the value the production path
  produces, or the probe is about your literal.

The cheap check that would have ended it at the first green: print what the input actually IS at the
call site, before theorising about what the consumer does with it.

## A qualifier that is obvious in the sending context is ABSENT in the receiving one

The cross-adapter rule above says a claim about a sibling is the one nobody re-checks. This is its
transport half, and it is narrower and cheaper to apply: the failure is not a wrong claim, it is a
correct claim whose scope evaporated in transit.

Measured 2026-09-01. A Svelte session measured that a lowered element carrying a spread drops a
`children` snippet, and reported it as holding "universally" — unambiguous in a message about one
adapter, where it plainly meant *across every primitive*. It was then written into
`.claude/rules/adapter-parity-audit.md`, a file whose entire job is telling FIVE adapters what to
do, where the same word reads as *across every adapter*. One arm had been mounted. Nobody following
that section would have run their own.

Neither side could see it from inside their own half — the writer reads what they wrote, the reader
reads what they meant. So the check cannot be "was I careful"; it has to be mechanical:

**Write the qualifier even when the sentence is obviously about one thing.** "on Svelte", "for
Pressable", "at create time" — three words, and they are the difference between a measurement and a
law. A term that carries its scope implicitly is exactly the term that loses it when quoted.

The same day's companion failure makes the pair: a session caught this class in someone else's
framing, recorded it as a lesson, and committed it itself one edit later. Recognising the pattern
does not confer immunity to it, which is the argument for the mechanical habit over the vigilant one.

## A file-locating glob can hand you a TEST file, and the answer still looks clean

Measured 2026-09-01, on the question "did `Image`'s spec key land before its runtime half was
registered" — a question whose wrong answer is a device-only silent fold gap, and whose proposed
remedy was reverting a shared key under three parallel sessions.

The probe:

```bash
f=$(find adapters/$a/src -name "register*.ts" | head -1)
grep -c "registerImageBehavior" "$f"
```

`register.test.ts` sorts before `register.ts`, so on the one adapter whose tree carries both, the
probe read the TEST and reported `0`. Four adapters answered "registers" and one answered "MISSING",
which is exactly the shape of a real gap — a single omitted member is what every audit in this repo
is built to find, so the false answer arrived wearing the costume of a true one.

The truth was the opposite: all four register it, and the fifth (React) has no `register.ts` at all
because it folds in its host config.

Three things generalise:

- **`head -1` over a glob is an unordered choice presented as a decision.** If more than one file can
  match, either match exactly (`adapters/$a/src/register.ts`) or fail loudly on a count other than
  one. `tests/lowered-primitive-fold-parity.test.ts` already throws when a primitive does not resolve
  to exactly one file, for this reason.
- **A `*.test.ts` sibling is the likeliest wrong match**, because test files are named after the
  module they test. Any locator built on a module name will find its test first about half the time.
- **When a probe's answer matches the shape of the bug you are hunting, distrust it hardest.** The
  reflex is the opposite — a result that confirms the hypothesis feels finished. Here the confirming
  result was the artifact.

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

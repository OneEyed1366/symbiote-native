---
name: symbiote-perf-measurement
description: "How SymbioteNative measures performance, and the current numbers against stock React Native. Read BEFORE quoting any ratio, before writing or editing a fixture under `core/engine/cpp/tests/js/**`, before running `bench:itest`, before attributing a regression to the engine or to an adapter, and before shipping any change justified by a speed claim. Holds: the eight-step js-framework-benchmark suite and its current table; the oracles that make two columns comparable at all (node census, `PROPS_PER_STEP` write counter, `laidOut`); the assert-build trap (`test:itest` compiles `REACT_NATIVE_DEBUG`, which makes list append O(N^2) and does not exist in the build that ships); best-of-N on small-ms rows because timing noise is one-sided; one ruler / one sitting; break-testing a guard; and the measured NEGATIVE results — changes priced and deliberately NOT taken, so they are not re-derived. Trigger on: 'is X faster', 'benchmark', 'bench:itest', 'perf regression', 'how do we compare to stock React Native', 'create is slow', 'why is Angular/Solid/React slower', 'measure this change', 'Swap anomaly', 'Clear is slow', 'profile the engine'."
---

# Measuring SymbioteNative

Two builds, two jobs. Never read a timing off the first:

```bash
pnpm run test:itest     # correctness — asserts ON. The reason the harness exists.
pnpm run bench:itest    # timings — NDEBUG + -O (RN_ENABLE_DEBUG_STRING_CONVERTIBLE stays ON)
pnpm run bench:itest:jsc # the same timings under a JIT — the second ruler, never a column beside the first
pnpm run test:cpp       # the gtest arm — the ONLY one that builds more than one runtime, on JSC
pnpm run test:android   # the second host build, compiling the #ifdef ANDROID branches

SYMBIOTE_ITEST_BYTECODE=1 …   # compile each bundle with `hermesc -O` and run the BYTECODE
```

**A JS number taken without `SYMBIOTE_ITEST_BYTECODE=1` is an `-O0` number and a device runs `-O`**
(§21). It is not a scale factor: the same flag left the bare Fabric arm unmoved and halved our own
fill, because the optimizer works on exactly what our JS is made of. Set it for anything whose
subject is JS.

**HERMES IS THE RULER** (2026-09-22). Every build above but `bench:itest:jsc` and the gtest arm hosts
the tester on Hermes, which is what a device runs; JavaScriptCore is the arm you now ask for by name.
The switch is `-DSYMBIOTE_JS_ENGINE`, and the scripts pass it EXPLICITLY rather than leaning on the
CMake default — a cache variable persists in a build directory, so a default alone would have left
every existing `build/` quietly on the old engine, which is the one failure mode this choice exists to
prevent. It needs a `hermes-engine` destroot from any example's `pod install`; the configure fails
loudly when there is none.

Why it is not a preference: the JIT does not scale conclusions, it **inverts** them. The engine costs
LESS than a bare Fabric driver under JavaScriptCore (0.90x) and twice as much without it
(2.03x), and the premise the buffer rests on is substantially a JavaScriptCore artefact (§18c). The
gtest arm stays on JSC deliberately — it builds a runtime per case, which is what caught a cache keyed
on `&runtime` (see the negative-results table).

**The assert build's SHAPE is wrong, not just its scale.** `NDEBUG` off also defines
`REACT_NATIVE_DEBUG` (`ReactCommon/react/debug/flags.h`), which compiles
`ensureYogaChildrenLookFine` + `ensureYogaChildrenAlignment` into
`YogaLayoutableShadowNode::appendChild`. Each walks the parent's whole child list, so building an
N-child list one append at a time is **O(N^2) there and O(N) in the build that ships** — 3 554 ms
against 27 ms for 10 000 appends. It once put `materialize` at 61% of a create when it is ~27%, and
reported a complexity in list width that does not exist off the harness. A number whose ORDER is
right and whose SHAPE is wrong survives review; that is what makes this worse than no number.

**And it runs the other way too: a new fixture must be run under `test:itest` before it lands, not
only under `bench:itest`.** The assert build compiles guards the shipping build does not, and two
fixtures written this way went straight to CI and ABORTED there (2026-09-22): `fill-scaling-cost`
tripped Yoga's 16 384 child-list ceiling on its widest arm, and `surface-width-cost` read
`readSurfaceTelemetry` on a surface that had not committed, which asserts in
`TransactionTelemetry::getCommitStartTime`. The second is the instructive one — in Release that same
read returns an UNDEFINED TIME POINT and prints it, so the fixture had been quoting a garbage number
for its baseline arm the whole time. **The assert build is not a stricter ruler, it is the only one
that tells you the fixture is wrong.**

## The method, in the order it must be applied

### 1. Read the counters before the milliseconds

Two columns whose node or prop-key counts differ are **not one workload**, and their ms mean
nothing. This has caught real errors in both directions — a stock app not rebuilt after the row
gained a node (read as 1.31x), and an adapter whose "win" was a step that committed nothing.

### 2. A census counts NODES, and two trees with the same nodes can be built by different code

Three times this has had to be written down:

- a missing `<TextInput>` — `stock-suite.itest.tsx` built `h('RCTSinglelineTextInputView')`, a bare
  Fabric view, while every adapter arm built `h('text-input')`, which reaches a host behavior that
  seeds a prop, wires four listeners and attaches a press machine. **Both commit ONE node named
  `TextInput`**, so the census could not see it. Priced afterwards: RN's own `TextInput` costs
  50-53 us per instance, our tag costs 15-17.
- Angular's flat row — identical structural counters, 19% of the prop KEYS absent.
- the general form: **when an arm names a HOST COMPONENT where its counterpart names a primitive,
  the two are not one workload however the census reads.**

Corollaries: the census must assert **absolute** counts, not that before matches after (two empty
censuses match perfectly). And shadow names are not element names — `RCTText` commits as
`Paragraph`, its string child as `RawText`, `RCTSinglelineTextInputView` as `TextInput`.

### 3. A census cannot see a REPAINT — assert the WRITES too

`PROPS_PER_STEP` in `bench-suite.ts` is the second oracle: what each step must WRITE, which is a
property of the workload rather than of any renderer. It found a step that committed the right tree
and did nothing — Angular's `select` reported `setProps=0 batches=0` and was the fastest column of
six, with the missing write surfacing two steps later in `remove`. No node was added, so the node
census matched throughout.

`drivesEngine: false` is how the stock arm is exempted, as a named flag rather than a zero — because
`setProps=0` is also exactly what a step that silently failed to apply reports, and telling those
two apart is the entire job of that oracle.

### 4. `laidOut` explains the table, and it can be asked of stock too

`readSurfaceTelemetry` takes a SURFACE id, so it answers about a tree React's own renderer drove
(`getAffectedLayoutNodesCount`, `getNumberOfTextMeasurements`). Read it off `__symbioteEngineNative`
directly — importing `@symbiote-native/engine` in a file carrying `@symbiote-platform-extensions`
kills the bundle at `Platform.ios.js`.

It is what turns a ratio into a mechanism: on `remove` stock re-lays out 6 988 Yoga nodes against
our 1 001, and the wall follows (15.5 against 4.6). **The thesis of this project shows up as a node
count before it shows up as a millisecond.**

### 5. Release only, one ruler, one sitting

The same comparison read 13% **faster** in Debug and 30% slower in Release — the sign of the
headline metric flips. Every column must be taken back to back in one run; ratios move ±0.08
between sittings and the whole machine drifts with them (stock's `Create` read 141.1, 151.8 and
153.9 an hour apart the same day). **Read a band, not a figure, and never compare a row against one
taken in another sitting.** A column that moves 75% means the machine moved, not the code.

### 6. Small-ms rows need best-of-N, and the minimum is the reading

Timing noise is one-sided — it only ever ADDS — so the **minimum** of several runs is the closest
reading to the work itself, while a mean carries every interruption into the ratio. The runner
spawns a process per test file (60+), so a sample can be descheduled for longer than a 0.45 ms
measurement. Five samples per width, and a **fresh fixture per sample** (a cleared list has nothing
left to remove; re-timing the same one reports a beautifully flat curve for the wrong reason).

### 7. For a complexity claim, read a FACTOR, not a millisecond

Linear work doubles when the input doubles; quadratic quadruples. And **count what a read RETURNS,
not how often it is made** — `childrenOf` was entered 2 002 times for 2 000 rows, perfectly linear,
while the handles those calls returned came to 2 001 001, N(N+1)/2 to the unit. A crossing counter
alone would have missed it. Guard with the handle count, not the clock, so the quadratic cannot come
back quietly while the milliseconds drift.

### 8. One change per measurement

A run carrying two changes cannot attribute either. **A change with no instrument signature must be
measured alone, or it cannot be measured at all**: an engine guard has a fingerprint (`WRITES`
14003 -> 12003, exactly 2 per row) and an adapter's proxy rework has none, so a combined run
establishes only the half that leaves a mark. Split a port from a correction the same way — a port
is a MOVE, and folding a behaviour change into one makes both unattributable.

**A change this file cannot measure is a change not shipped.** An `if (tagName.empty())` skip over
the rule chain is a few tenths of a millisecond against an arm whose own spread is ~2.5 ms; it was
not written, for that reason alone.

### 9. Controls, and what invalidates a verdict

- **A control that drifts with the subject is machine state.** A uniform shift across untouched rows
  carries no verdict at any size.
- **A monotone gate makes its before-arm unrepeatable.** `hasHostBehaviors()` turns on and never
  off, so the cold arm exists exactly once per process and best-of-N is not available to it. Any
  before/after separated by a one-way switch is a **print, not a gate** — a 1.5x tripwire on such a
  ratio duly went red in the full suite while the same pair read fine run alone.
- **A build that fails is a measurement that did not happen.** `-Werror` rejected a now-unused
  function after a call was stubbed for an A/B; five runs went to the stale binary and looked clean.
  Read the compiler's exit, not the numbers that follow it.

### 10. Fixture hygiene — three ways a fixture lies to itself

- **`readSurfaceTelemetry` zeroes on read**, so a case that commits without reading hands its
  counters to the next one. An arm reported `setProps` 12 006 where its tree writes 12 003 and its
  own oracle called the difference a finding; it was the previous case's housekeeping. Drain them.
- **A fixture's own setup is state the next case inherits.** `countCrossings` installs a wrapper over
  the standing host, so a second case calling it wrapped the wrapper and every `applyOps` counted
  twice — 2 000 crossings reported for 1 000 removals.
- **An assertion that reads its subject twice is not asserting about the same thing twice.** A lazy
  getter over `readSurfaceTelemetry` answers about the LAST commit, so a cost assertion read 0 while
  the `print` on the line above showed 1, and passed. Capture at commit.

### 11. Break-test every guard

A guard that has never failed is one you are only hoping works. **A RED that throws is not a RED
that fails** — re-run until the message is an assertion. Break it in the way that keeps every symbol
used (invert a gate rather than deleting a branch), or `-Werror` turns the break-test into a
non-build. And check which cases stayed GREEN under the break: "the explicit value survived" is a
one-sided oracle, true of a rule that never ran at all, and needs the ERASURE asserted beside it.

**A BARE `toBeGreaterThan(other)` BETWEEN TWO TIMED ARMS IS NOT A GATE.** This has now failed its own
break-test twice in one day, in unrelated fixtures:

- §18n: hoisting the instance so the arm allocated NOTHING still read 0.032 against empty's 0.031 and
  passed.
- §18r: pointing the arm at an UNREGISTERED tag still read 0.725 against 0.657 and passed.

Timing noise is one-sided but it is not small, and two arms a few percent apart order themselves at
random. **The margin must come from the measured separation**: take the real gap and the broken gap,
and put the bound between them (1.5x real against 1.10x broken -> assert 1.25x). Stating it that way
in the comment is also what stops the next person from "tidying" the factor away. And the only way to
know which of the two you have written is to break it and watch — the bare form looks identical.

**A RATIO MARGIN IS CALIBRATED PER BUILD.** CI runs the ASSERT build, which triples a plain create
(2.2 us against 0.65) while an additive cost stays put, so a 1.25x margin measured on `build-release`
fails a real 1.17x there — it passed for days only because the gap sat inside the bar
(`create-element-ladder`, 2026-09-23). Gate a release-calibrated ratio on `__DEV__ === false`; on the
assert build print it. And when a change moves an adapter CONTRACT (what the renderer is called with),
run the whole `test:itest`, not only the fixtures you touched: a counter pinned to the old contract
(`adapter-create-cost`'s class channel) lives in a file you did not open.

### 12. Two harness facts that cost a day each

- **Every React arm ran the DEVELOPMENT React** until the defines were made to follow the build
  (`isBenchBuild` in `scripts/run-itests.mjs`). Worth ~16% of an arm. It also blocked the stock arm
  outright and **silently**: `ReactFabric-prod` sets React's internals up in their production shape,
  a development `createElement` calls `dispatcher.getOwner()`, React catches, retries three times
  and reports through RN's error dialog into `console.error`. The caller sees a component that RAN
  and an empty surface. Capture `console.error` in any stock fixture.
- **The harness has exactly ONE surface**, `kSurfaceId = 1` (`symbiote-host.h`). Rendering into a
  root tag of its own — the careful-looking choice — commits into a surface nothing can read and
  reports an empty tree while `render` returns perfectly clean. And "render returned" is not "a node
  committed": React schedules its work, so `flushTimers()` then `mounted()` is what settles it.

One more: **do not read `commitMs`/`layoutMs` for a step whose commit was SKIPPED.**
`readSurfaceTelemetry` answers off `getCurrentRevision().telemetry`, so a skipped commit leaves the
previous commit's numbers standing. Use `mountingLogs()` to ask whether the platform was told
anything.

### 13. A test that "flakes" in the full run and passes alone

Points at shared filesystem state, not at a build. The audits walk `adapters/` while the Svelte
suites write and `rmSync` a `.smoke-compiled-*.mjs` beside their own source, so `readdirSync`
followed by a separate `statSync` leaves an ENOENT window. `readdirSync(dir, {withFileTypes:true})`
collapses it into one syscall. The second window — `readFileSync` on a listed path — cannot be
collapsed, so it rethrows **labelled** as a race rather than being swallowed: skipping an unreadable
file would turn a report the guard exists to make into silence.

Sweep query, worth keeping:

```bash
\grep -rln "readdirSync" tests core adapters --include="*.ts" | \grep -v "/build/" |
  while read f; do \grep -q "statSync" "$f" && ! \grep -q "withFileTypes" "$f" && echo "RACY: $f"; done
```

One of the five hits was deliberately LEFT ALONE — `adapters/svelte/src/host-tag-invariants.test.ts`
wraps its `statSync` in a try/continue and FOLLOWS symlinks on purpose, and `dirent.isDirectory()`
is false for a symlink. **A mechanical sweep is wrong wherever the pattern is load-bearing.**

Two framings that outlive the fix: **a failure with no assertion in the message is not evidence of
flakiness, it is evidence that something threw**; and **a race you closed is not the same claim as a
test that stopped failing** — say which one you have.

### 14. On device, assert the example's INSTALLED versions before reading a millisecond

A canary resolves `@symbiote-native/*` at `"latest"` through a gitignored `.npmrc` pointing at
Verdaccio, so what it runs is whatever was last published there — not the working tree. Found
2026-09-21 in `examples/react`: engine **0.4.0** against a source at 1.1.0, adapter and components
**1.0.0** against 3.0.0. `examples/bare-rn` carries no `@symbiote-native` dependency by
construction, so it is always current — which makes the default failure **current stock against a
months-old us**, in the direction that reads as our regression.

It is invisible in the app: an old engine renders the screen perfectly. The tell is `tsc` in the
example — the errors name the INSTALLED `.d.ts` (`ICommitProfile` missing ten fields,
`readSurfaceTelemetry` not exported) while the source has both. Cheaper still, and the check to
actually run first:

```bash
for p in engine react components; do
  \grep -m1 '"version"' examples/react/node_modules/@symbiote-native/$p/package.json
done   # against core/engine, adapters/react, core/components
```

`pnpm run registry:sync` then reinstall; see `symbiote-local-dev-registry` for why npm can still
answer `up to date` with stale bytes.

**The same trap, one example at a time (2026-09-22).** `registry:sync` with no arguments refreshes
every example, but a run aimed at one leaves the rest behind, and nothing says so: `examples/react`
came back on engine 1.1.0 while `angular`, `vue-sfc`, `solid` and `svelte` all stayed on 0.4.0. They
still build and still print a full table — a stale canary does not look stale.

**The tell is on the screen itself, and it costs one glance before any millisecond: a NON-ZERO
`FABRIC CALLS` table on our arm means the example is on an old engine.** §15's zero is a property of
the native tree host, so a column reporting `10000/9000/9` is committing through the JS
`nativeFabricUIManager` — a different commit path, not a different adapter. Reading it beside a
current arm compares two engines under the names of two frameworks. The published prop-key count
gives the same answer twice over: 48 001 against the 87 001 stock sends for the identical row.

`ngc`/`tsc` failing in ONE example on a field the source has (`'nodesCreated' does not exist in type
'ICommitProfile'`) is the compile-time face of it — repair, never patch the example to the old shape:

```bash
pnpm run registry:refresh examples/angular examples/vue-sfc examples/solid examples/svelte
```

`refresh` wipes `node_modules` and `package-lock.json` first, which is the point: `"latest"` already
resolved to 0.4.0 in the lockfile, so a plain `npm install` prints `up to date` and changes nothing.

### 15. The census on our arm is `readCommitProfile().nodesCreated`, and three facts about it

The JS wrapper a stock app counts with — `global.nativeFabricUIManager.createNode` — reads **zero**
on any runtime carrying the native tree host, because our creates are issued from C++
(`SymbioteTree.cpp`, `uiManager.createNode`, counted one-for-one at `walkCost_.created += 1`) and
never touch that global. A FABRIC CALLS table of zeroes is that, not a broken install. The count
comes off `readCommitProfile()` instead; the stock arm keeps its JS wrapper, and both terminate in
the same `UIManager::createNode`.

- **`walkCost_` is FILE-SCOPE in `SymbioteTree.cpp`**, shared by every surface and drained on read,
  so a reader asks exactly ONE surface per window. Summing two would read the second as zero.
- **Reading surface telemetry before a commit lands ABORTS a debug build.** Fabric's
  `TransactionTelemetry::getCommitStartTime` asserts `commitStartTime_ != kTelemetryUndefinedTimePoint`;
  in a release build it reads an undefined time point instead, silently. Gate the read on the
  window's own commit count, not on having a surface id.
- **A surface mints its own container node on its FIRST commit, not in `createSurface`.** That is
  the `+1` behind 10 003 for an adapter against 10 002 for stock, and it is asserted in
  `commit-profile-census.itest.ts` rather than explained in a table footnote.

Break-tested by making the increment count double: the two absolute-count cases went red carrying
numbers, and **the "a commit that mints nothing reports zero" case stayed green** — the one-sided
oracle of §11, true of a counter that never runs at all.

### 16. Every instrument above stops at `completeRoot`. The differ's output is the half a device pays

`mountingLogs()` — drained by `mounted()`, which pulls the transaction — is the ONE reading in this
harness that speaks about the host's half of a commit. A stub platform applies a mutation as a struct
swap; a device applies it as a `UIView` created, inserted, or handed a new props object. **So a
mutation this directory prices at nothing is microseconds on a phone, and mutation VOLUME is the one
currency headless is structurally blind to.** Opt in with `countsMutations` on a bench driver; it
costs a `mounted()` per step and sits outside the stopwatch.

Taken 2026-09-21: stock, react and vue agree on **all eight steps, kind for kind and type for type**
— `create` 10 001, `replace` 20 000, `partial` 300, `select` 4 901, `swap` 1 996, `remove` 1 007,
`append` 10 001, `clear` 19 991. The engine hands the host exactly the work stock does. **Mutation
volume is not where the device gap lives**, and that is now a measured negative rather than an
assumption.

It did not read that way at first, and the detour is the more useful half of this entry.

### 16a. `nativeID` and `testID` are not one prop, and the third fixture bug of §2

The first reading had `swap` and `remove` at **5.0x** — where stock told the host about the ROW, we
told it about everything inside the row. React is in mutation mode and Vue is another reconciler
entirely, the two arms agreed to the instruction, and the conclusion "so it is the engine" looked
forced. It was wrong. **The stock arm wrote `nativeID` on its row and all five adapter arms wrote
`testID`** — §2's rule again, in its third costume: two columns that differ in one prop are not one
workload, however the census reads.

`ViewShadowNode::initialize` is where they part:

```
nativeId  -> formsStackingContext  (and therefore formsView)
testId    -> formsView ONLY
```

A node that forms a view but NOT a stacking context does not isolate its subtree from the differ, so
when its siblings shift the whole subtree is enumerated and re-reported. `subtree-mutation-shape.itest.ts`
holds it at one variable — same tree, same removal, same walk
(`created=0 cloned=2 reused=999 setProps=0 laidOut=1001` in every arm):

```
nativeID on the row     Update/View  997   1.00 per moved row
testID   on the row     Update/View 3985   4.00 per moved row
```

Seven arms in that file, and the six that are NOT the finding are what make it one: plain views,
texts, our tagged texts, a list filled on a second commit, and both adapter cell kinds. Raw engine or
React adapter makes no difference; text, state and `TextInput` make no difference; **the prop makes
all of it.** Every suite arm now writes `nativeID`, and the eight steps agree.

Two things to carry off it:

- **`testID` on a list row costs four host mutations per moved row instead of one**, in stock React
  Native as much as here — it is Fabric's rule, not ours. Worth knowing before putting one on a row
  in a long list, and worth checking before reading any list benchmark that has one.
- The whole table below was re-taken after the prop change, because it alters what the differ does on
  every step that moves a row. **What the change itself cost cannot be read off the two tables**: the
  sitting moved with it (stock's `Create` 168.9 → 175.7 on a row the change does not touch), and §5
  forbids reading a row against one taken in another sitting. Pricing it would need both rows in one
  process, which no fixture does today. What can be said is that no ratio flipped and no column
  changed order.

### 17. Project the headless number onto the device instead of perfecting the ruler

**The projection this section existed to state is gone: §22 measured the thing it was projecting.**
A device reads 0.82x on `Create`, so there is no deficit to cut and no offsets to carry. What the
exercise was worth keeping is the METHOD and the way it failed.

```
17 := {
  method: "a headless millisecond is not a device millisecond, so state a PROJECTION — an offset
           per arm, an aim in headless milliseconds — and let a device falsify it. Read every
           candidate change against that aim, never against 1.00x",
  it_was_re_derived_three_times: "JSC 169.2/115.8 -> +133 ms and a 50 ms cut · -O0 Hermes
                                  200.7/163.1 -> +125 and 57 · -O bytecode -> +92 and 39.
                                  The shape of the conclusion survived every ruler change",
  what_it_correctly_said: "the cut could not come from the headless path. A React create decomposes
                           into four parts and only two are ours —
                             React's reconciler ~55 ms  (stock runs it too)
                             our fill           ~24      OURS, the JS that builds the buffer
                             our half of apply  ~10      OURS, ~1.0 us per node (§19)
                             Fabric's half      ~37      createNode, ShadowTree::commit, Yoga
                           Driving BOTH our lines to zero did not reach the cut it asked for",
  why_it_was_WRONG: "the one input never re-measured was the device reading itself. Every
                     re-derivation re-took the headless side on a new ruler and carried the 1.25x
                     forward unexamined — and the 1.25x was §18g, two screens stopping their clocks
                     a React phase apart",
  LESSON: "re-deriving a projection on a better ruler makes the arithmetic sharper and leaves the
           unmeasured input exactly as wrong as it was. Three re-derivations, one instrument defect,
           and the defect was in the number nobody re-took"
          -> "when a projection survives a ruler change, that is not corroboration — ask which of
              its inputs was NOT re-measured, and re-measure that one",
}
```

### 18. The buffer hypothesis, from suspicion to closure

The whole §18 family is one investigation: "we are slower than stock on a device, and the buffer is
why." It ran for two weeks across two rulers and is CLOSED — §18c cleared the crossing, §18n/§18o/
§18p/§18q priced every other separable form of it, and §22 closed it again on the hardware. What
follows is the evidence, compressed. Read §22 first for the verdict; read these for why a given
avenue is not worth re-walking.

```
18 := {
  hypothesis: "the harness runs JavaScriptCore with a JIT, a device runs Hermes with none, so the
               device penalises JS and that is our gap",
  decomposition: "raw-fabric-vs-engine.itest.ts, one tree, two drivers —
                  RAW    build 69.2  completeRoot 9.4              total 78.6   10 001 JSI calls
                  ENGINE fill  22.4  apply 15.2  commit 33.3       total 70.9   ONE crossing
                         of which createNode 16.6, the same C++ both arms pay per node",
  WRONG_SIGN: "stock's create is ~52 ms of JS and per-call JSI where ours is ~22 ms of JS. An
               interpreter multiplies the JS half, so Hermes should hurt STOCK more and our ratio
               should IMPROVE on a device. It got worse"
              -> "arguing from 'no JIT' predicts the wrong sign",
  suspect_left: "our crossing is ONE call carrying a 12 000-entry array that C++ reads element by
                 element. Asymmetric in our direction, scales with the tree, unmeasurable here",
  jsc_baselines: "best of three, 7 003 decoded nodes on a thousand-row create:
                  decodeMs         4.0 ms  571 ns/node   the whole create op
                    instanceHandle 1.5     214           constructing react::InstanceHandle
                    publish        2.4     343           of which setNativeState 157
                    remainder      0.9     186           checkSlot + handles.getValueAtIndex()
                  applyMs         49.0                   both calls, walk and Fabric's commit",
  how_to_read_a_device: "not whether decodeMs is large in ms but whether its SHARE of applyMs moved.
                         A phone is slower at everything, so 8% staying 8% clears the buffer",
  narrowing: "the op SPINE already crosses as an Int32Array through ArrayBuffer::data
              (SymbioteTree.cpp:423-433) — no per-element JSI, nothing to win. The SIDE TABLES do
              not: handles, instanceHandles, values, strings each read with getValueAtIndex,
              ~22 000 times on a thousand-row create",
  upstream: ["facebook/react-native#33898 'JSI Performance is noticeably poor when working with
              Arrays', closed Resolution: Answered — a C++ loop over
              array.getValueAtIndex(rt, i).asNumber() is visibly slower than the same loop in JS",
             "facebook/hermes#182 — JSI still exposes no TypedArray interface, so ArrayBuffer is
              the only zero-copy door and the side tables cannot use it as they stand"],
  do_not: "start moving the side tables on this reasoning alone — the whole decode is 3.9 ms here,
           under the ~2.5 ms spread of an arm (§8)",
  instrument_guarded: "commit-profile-census.itest.ts asserts applyMs > 0, decodeMs > 0 and
                       decodeMs < applyMs — RELATIONS, since a millisecond is not reproducible and
                       containment is the claim a device reading rests on. Break-tested by pinning
                       decodeMs to zero; red with an assertion, not a throw",
  ruled_out_by_READING: ["commit options are identical — we enter Fabric with
                          {enableStateReconciliation: true, mountSynchronously: false,
                          source: CommitSource::React} (SymbioteTree.cpp:1944) and so does React
                          (UIManagerBinding.cpp:480). No per-commit work hiding in a flag",
                         "JSC_useJIT=0 changes nothing — the macOS JavaScriptCore.framework is a
                          release build with env options compiled out. A null result about the
                          switch, not about the JIT"],
  ANSWERED_BY: "§18c (headless, Hermes) and §22 (device: decode is 1.8% of apply, against 8% on JSC)",
}
```

### 18b. React Native had this exact problem and built Fantom — and a Hermes host is within reach

```
18b := {
  precedent: "private/react-native-fantom is RN's own headless integration-testing and benchmarking
              runtime — 'Hermes, Fabric, C++ TurboModules, Bridgeless ... in a fast headless
              environment', explicitly so measurements need no device. We cannot USE it (its README
              limits it to tests inside packages/react-native, experimental) but it settles whether
              the idea works",
  pieces_on_disk: "examples/*/ios/Pods/hermes-engine/destroot/
                     Library/Frameworks/macosx/hermesvm.framework   universal, x86_64 + arm64
                     include/hermes/hermes.h                        makeHermesRuntime(...)
                     include/jsi/                                   Hermes's OWN jsi headers",
  status: "BUILT and now the DEFAULT (see the header). -DSYMBIOTE_JS_ENGINE=jsc asks for the old
           host; bench:itest:jsc is the script",
  host_facts: ["Hermes needs setImmediate BY NAME — its Promise implementation lives in
                InternalBytecode.js and schedules every resolution through it, so the first await
                anywhere dies with \"Property 'setImmediate' doesn't exist\" pointing at bytecode.
                Reads as an engine fault, is a missing host facility. Added to PLATFORM_PRELUDE",
               "Hermes does not drain its own microtasks — JSC drains whenever the JS stack empties,
                which is why the tester's loop never had to ask. runtime.drainMicrotasks() each round"],
  near_miss: "Hermes does not implement ES6 block scoping unless asked. RuntimeConfig's
              ES6BlockScoping defaults to FALSE, so a let/const in a loop gets ONE binding for every
              iteration and each closure sees the last value. The harness's own report() is such a
              loop, and the symptom was a run that executed the LAST case of a file once per case
              and reported it as that many passes — plausible, green and wrong. RN never meets it
              (its Babel preset lowers block scoping); esbuild refuses to, so makeRuntime() turns
              the flag on"
             -> "a device runs a LOWERED bundle with the flag off, so this arm's codegen is not
                 byte-for-byte a device's",
  hazards: ["the framework is a pod-install artefact, not a tracked dependency — a CMake target
             into examples/*/ios/Pods breaks on a clean clone, which is why configure FAILS rather
             than falling back to JavaScriptCore. THIS BROKE CI the moment Hermes became the
             default: a runner does `pnpm install --ignore-scripts` and never `pod install`.
             Fixed by `scripts/fetch-hermes.mjs` — the pod is `Pre-built`, so what CocoaPods does
             is fetch ONE Maven tarball (hermes-ios-<version>-hermes-ios-release.tar.gz, ~27 MB,
             version from react-native/sdks/hermes-engine/version.properties) and unpack it.
             CMake now searches `.hermes/destroot` after the examples glob"
            -> "when a build step starts depending on a native artefact, ask what produces it on a
                runner BEFORE the ruler changes; ccache is unaffected — ReactCommon's ~700 objects
                compile with unchanged flags and still hit, only the handful of TUs that gained
                -DSYMBIOTE_USE_HERMES recompile",
            "the JSI ABI must match — Hermes ships jsi/ headers in destroot and our C++ compiles
             against ReactCommon's. A jsi::Runtime vtable from one header set against a dylib built
             from the other is UB that will not look like one; it will look like a wrong number",
            "Hermes has no JIT, so a JSC reading is a SECOND RULER, never a column beside a Hermes
             one (§5). Two tables, and a ratio only ever read within one of them",
            "every bench:itest figure taken before 2026-09-22 is JavaScriptCore; the Hermes table
             starts its own history rather than continuing that one"],
}
```

### 18c. The Hermes arm answered §18, and the answer is the opposite of the hypothesis

```
18c := {
  fixture: "raw-fabric-vs-engine.itest.ts — the same tree through both drivers, on both engines",
  table: "                      JSC     Hermes
          RAW    build         69.2     26.4 ms   stock's protocol, 10 001 JSI calls  2.6x FASTER
          ENGINE fill          22.4     34.1      OUR JS building the buffer          1.5x SLOWER
                 decodeMs       4.0      1.6      the JSI read §18 accused            2.5x CHEAPER
                 decode share   8.0%     4.3%     of applyMs
          RATIO  engine/raw    0.90x    2.03x",
  provenance: "the Hermes RAW row is post-§18l (29.2 / 1.88x before that arm stopped paying a
               property trap stock does not). The JSC column was not re-run — JSC is no longer
               the ruler",
  VERDICT: "the buffer's own crossing is INNOCENT — reading a 12 000-entry array element by element
            is cheaper on Hermes than on JSC, absolutely and as a share. §18 closed",
  what_it_found_instead: "the premise the architecture rests on — ten thousand small JSI crossings
                          are expensive and one big one is not — is substantially a JSC artefact",
  per_node: "both arms end in the same UIManager::createNode, and WALK prices it (17.6 ms JSC,
             18.5 Hermes for 10 002 nodes). Subtracting it from RAW's build:
                       ours, fill   stock, JS + JSI   ours/stock
             JSC         2.44 us       5.77 us          0.42x   we win 2.4x
             Hermes      3.41          0.98             3.48x   we lose 3.5x",
  caveat: "the subtraction assumes RAW's createNode costs what ours does — same function, same
           count, so sound, but an inference rather than a reading. The crossing ITSELF is priced
           directly under 'The boundary, priced' (2.51 us JSC vs 0.58 Hermes), same verdict,
           no subtraction",
  design_reading: "the buffer trades JS-side work for boundary crossings, priced on an engine where
                   stock pays 5.77 us/node and JS is JIT-compiled. On the engine a device runs stock
                   pays 0.98 and our JS is interpreted, so the trade runs backwards. Nothing in
                   core/engine is wrong; the premise moved",
  corrected: "the clause 'the fill is dominated by allocating a node object ... no trick removes it'
              was an ASSERTION and §18n measured it false — the node object is 16% of a create",
  the_number_nobody_has: "what a per-call engine would cost WITH the retained tree and clone-on-write
                          still in place. RAW is not that arm (it keeps no tree). A day's work, and
                          the only honest way to ask whether the buffer still earns its place",
  suite_dilutes_it: "both arms there also pay React's reconciler, so create ratios move only
                     React 0.68 -> 0.82, Vue 0.77 -> 0.89, Solid 0.56 -> 0.59",
}
```

The JSC-to-Hermes suite table this section used to carry is superseded by **The current numbers**
below, which is `-O` bytecode. Its one durable line: taken after §18e's payload fix, the create
ratios moved 0.82/0.89/0.59 -> 0.83/0.87/0.60, inside the sitting's own spread. **Headless cannot
price what those props cost a main thread.**

### 18d. Where the fill loses its 1.5x, per operation — and the style write is twice the rest

```
18d := {
  fixture: "fill-phase-cost.itest.ts on both rulers, same tree (us/op, thousand-row create):
                          JSC     Hermes  factor
            create node  1.24     1.66    1.34x
            prop write   0.77     1.30    1.69x
              style      1.19     2.41    2.03x  <- the outlier, dearest op in the fill
              scalar     0.66     0.90    1.36x
            append       0.48     0.72    1.50x
            fill total  27.2 ms  40.7 ms  1.50x",
  why_style_stands_out: "everything else degrades by the 1.3-1.5x an interpreter costs across the
                         board; this one degrades twice as hard, which says it is doing work a JIT
                         was hiding rather than work that is intrinsically expensive. The path is
                         routeProp in core/engine/src/node.ts, where the class+style merge lives",
  split: "style-write-cost.itest.ts, the same key and object through setProp with no slot redirect,
          no id alias, no animated resolution, no class merge, no published-parts bookkeeping,
          over 10 000 fresh nodes taking a FIRST write:
                        JSC          Hermes       factor
          setProp     0.60 us       0.84 us       1.40x   the buffer write itself
          scalar      0.60          0.84          1.40x   the same write THROUGH routeProp
          routeProp   1.15          2.12          1.84x   a style write
          machinery   0.54 (47%)    1.28 (61%)    2.37x   the difference",
  localised: "a scalar takes the identical routeProp entry — dev-prop set, slot field, two id
              aliases, animated gate, class-key set — and costs 0.00 us over the floor on BOTH
              engines. The generic prologue is free; all 1.28 us is inside the key === 'style'
              branch, which is stylePartsOf + pushClassStyle and nothing else",
  branch_arms: "style dedup 0.33 (parts exist, identity guard returns)
                style cold  2.12 (parts ALLOCATED, published: 0.33 + alloc + pushClassStyle + 0.85)
                style warm  2.85 (parts exist, key walk misses, published against a fresh pair)
                -> the parts object + pushClassStyle is ~0.94 us. Warm > cold is not a paradox: it
                   pays the four-key walk cold skips and misses sharedStylePair",
  COUNT_ERROR: "first published as 12.8 ms of a create by multiplying by the fixture's 10 000 NODE
                count. A thousand-row create makes ~4 000 style WRITES (FILL SPLIT: style=9.6 ms at
                2.39 us), so the machinery is ~5.1 ms"
               -> "a per-write microsecond is a millisecond only after the RIGHT count; this
                   overstated the prize threefold",
  verdict: "'split the style-write path' stays a recorded NEGATIVE — 0.94 us over ~4 000 writes is
            3.8 ms of a 156 ms create, 2.4%, in the most delicate code in the engine.
            parts.published is what the setNativeProps restore path and the unchanged-class dedupe
            both key on, and moving it off the parts object is what that 2.4% would have to pay for",
  discipline: "a new ruler is a reason to re-CHECK the negative-results table, not a licence to
               re-derive it. Two entries re-checked this round and both held — this one, and the
               registry-miss row whose original reasoning (a JIT's warm-up) should not have survived
               an engine without a JIT and did",
  SHIPPED: "isSameShallowStyle had no identity check, so re-pushing a hoisted style constant — the
            commonest shape there is, and what Solid does on every signal change because it has no
            diff — allocated two key arrays and walked them to reach the answer identity gives.
            One line: 1.12 us -> 0.32 us per deduped write on Hermes, against a 0.84 us buffer
            write. The compare was dearer than the write it protects",
  break_test_found_nothing: "inverting the line (an identical object reporting 'changed') left
                             1 044 unit tests and 512 itests green, because pushClassStyle's own
                             isAlreadyPublished catches the republish downstream (sharedStylePair
                             memoizes the pair by the explicit object). The comment first written on
                             it claimed a deliberate behaviour trade at the in-place-mutation edge
                             and was WRONG; corrected in place"
                            -> "a speed change with no behaviour signature is justified by its
                                measurement alone (§8), and a false claim about what it trades is
                                worse than the change is good",
  untested_contract_found: "a style holding a nested value re-pushed by the same reference must not
                            re-mount the view; nothing asserted it, because the one case that
                            existed used four scalars and passed through the key walk.
                            class-style-republish.itest.ts now pins it"
                           -> "the state a break-test exists to find: a guard held up by a second
                               guard nobody named",
  general: "the JavaScriptCore ruler was flattering every line of JS we own — the fill split, the
            boundary prologue, the adapter deltas. Re-read on Hermes before deciding anything",
}
```

### 18e. The mutation oracle never compared PAYLOADS, and the two arms differed

```
18e := {
  bug: "StubViewTree::recordMutation writes type, nativeID and index and NO PROPS AT ALL, so every
        'byte-identical mutations' claim this suite ever made was about the SHAPE of the payload and
        never its contents",
  why_it_matters: "on a device the contents are what the main thread spends its time on —
                   updateProps:oldProps: walks the fields that differ and builds layers for the
                   ones that need them",
  found: "harness.ts's payloadOf over committedTree(), one bench row, both renderers. Stock carried
          three props we did not:
            Paragraph  accessible=true   Text.js:145   `accessible !== false` on iOS
            Paragraph  overflow=hidden   Text.js:547   the component's own default style
            TextInput  accessible=true   TextInput.js:583",
  size: "seven props a row, in the direction that FLATTERED us — every adapter column in this suite
         was read on a lighter row than the baseline",
  parity_bug_first: "an app on this engine got text VoiceOver treats differently, and that does not
                     clip. Fixed as two tag rules in SymbioteFabricProps.cpp beside the
                     ellipsizeMode/allowFontScaling pair (<platform_behavior_is_a_tag_rule_in_cpp>)",
  fix_makes_the_DEVICE_ratio_worse: "headless it moved nothing (0.82/0.89/0.59 -> 0.83/0.87/0.60) —
                                     setting three keys during the fold is free here. On a device
                                     accessible on 3 000 Paragraphs is accessibility-element work
                                     and overflow: hidden is clipsToBounds"
                                    -> "our device column was measured LIGHT; the gap did not grow",
  oracle: "ROW_PAYLOAD in bench-suite.ts, asserted from BOTH sides — stock-row-traits.itest.tsx
           proves it is what RN's own renderer commits, row-payload-parity.itest.tsx proves ours
           matches. Two files because one bundle cannot hold both, and the constant lives in
           neither: a string each side copied would agree with itself forever. Break-tested, both red",
  trap_1: "counting mounting TRANSACTIONS does not count commits.
           MountingCoordinator::pullTransaction diffs baseRevision_ against lastRevision_ and a
           commit merely overwrites the latter, so a pull yields ONE transaction whatever happened
           between drains and `while (pullTransaction())` counts the CALLER's drains. It read 1
           everywhere, indistinguishable from a true answer of 1. The honest instrument is the
           shadow tree's getCurrentRevision().number (harness.ts's commitNumber()), break-tested in
           commit-count.itest.ts to read 3 for three commits and stay put on a commit that changed
           nothing. With it: EVERY arm commits exactly once per step, stock included",
  trap_2: "the platform-extensions directive is a GREP over the entry's whole text, so naming it in
           a comment turns it on. A sentence of prose explaining why a file must not carry it made
           the bundle carry it, and the file died in processColor with '__fbBatchedBridgeConfig is
           not set' — an error that reads as a missing native module",
}
```

### 18f. The device arms style differently from each other, and it costs nothing

```
18f := {
  question: "examples/react's row is styled with className=\"bench-row\" (class registry +
             pushClassStyle) while its baseline examples/bare-rn writes style={styles.benchRow},
             a hoisted StyleSheet.create object. Every headless arm writes a style OBJECT, so the
             class path runs on the device and nowhere in the comparison the ratios come from"
            -> "§2 one level up: not between two arms of the suite, but between the suite and the
                app it describes",
  priced: "class-vs-style-cost.itest.ts, 5 000 nodes, Hermes, payload oracle on both pairs first
           (a class and the object it compiled from must commit the same payload, and they do):
           create  style 1.98 us/node  class 2.05  +0.07  1.02x
           select  style 2.53          class 2.02  -0.57  0.78x",
  verdict: "nothing. 0.07 us over 5 000 styled nodes is 0.35 ms of a create, and on the
            select-shaped rewrite the class path is FASTER — it merges two small rules where the
            object arm rewrites nine keys. Do not re-open it",
  audit_also_confirmed: "the two screens otherwise match — same row shape
                         (view/text/pressable x2/text-input), same RN version, Podfiles differing
                         only in the target name. The device comparison is sound at the app level",
}
```

### 18g. The two device screens do not stop the clock in the same place

Both comments claim the same definition of done — "completeRoot has returned" — and they are not the
same point. React's `commitRootImpl` runs `resetAfterCommit` and THEN `commitLayoutEffects`:

```
commitMutationEffects
resetAfterCommit      -> our surface.commit() -> completeRoot -> runPostCommitHooks()   OURS STOPS
commitLayoutEffects   -> useLayoutEffect on the screen component                        STOCK STOPS
```

`adapters/react/src/host-config.ts:143` is the whole of it: our commit IS `resetAfterCommit`, so the
engine's post-commit hook fires one phase earlier than a layout effect can. **Stock's device window
is strictly larger than ours by the layout-effect phase**, and that phase is not empty on its arm:
its row is built from RN's `<Pressable>` and `<TextInput>`, which attach refs and run their own
layout work, where our row is `<pressable>` and `<text-input>` tags with no React component at all.

The asymmetry ran in OUR favour, which is why nothing went red over it: it inflates stock's number.
**It is the whole of the withdrawn 1.25x** (§22).

It cannot be fixed by moving stock's stop earlier — a stock screen has no post-commit hook. Fixed
2026-09-22 as a SECOND number taken in a layout effect beside the post-commit one:
`ISuiteEntry.settledMs` in `examples/react/screens/BenchmarkScreen.tsx`, printed as `VS STOCK`. The
post-commit pair stays the cross-adapter column; the layout-effect pair is the us-against-stock one.

**Read `VS STOCK` against `bare-rn`'s `ALL MOUNTED`, never react's own `ALL MOUNTED`** — bare-rn
already stops in a layout effect, so the two are the symmetric pair despite the different labels.
Any table dated before 2026-09-22 has only the wrong column. **Only `examples/react` has the second
stopwatch**; the other four adapters still stop in the post-commit hook, so their stock ratios are a
floor until each grows its own settled reading (Vue `nextTick`, Svelte `tick()`, Solid post-render,
Angular `afterNextRender`).

The ordering is safe rather than lucky: the post-commit hook calls `resolve`, and a promise callback
is a microtask, so it cannot run until the whole synchronous commit — layout effects included — has
finished, which is why the effect can leave its reading in a ref for `timed` to pick up.

RN emits no phase entries a screen could read instead, checked rather than assumed: its
`PerformanceEntryType` is `MARK`, `MEASURE`, `EVENT`, `LONGTASK`, `RESOURCE` and nothing for commit or
mount.

Headless does not have this problem: `runBenchSuite` times `driver.apply()`, which awaits the whole
React commit on every arm, layout effects included. **The headless ruler and the device ruler measure
different windows**, so a headless millisecond and a device millisecond were never the same quantity
even before the engine differed.

### 18h-18j. The deprecated props path, array growth, and bytes instead of milliseconds

```
18h := {
  found_by: "reading React Native's own tracker first — the method this investigation runs on",
  defect: "RawPropsParser used to convert every jsi::Value to folly::dynamic before building a
           RawValue; RN removed the round trip behind opt-in `useRawPropsJsiValue`
           (react-native PR #48047, #48231). We are on the WRONG side by construction: our payload
           is built in C++ from the op buffer, so SymbioteTree.cpp:1364 passes
           react::RawProps(std::move(forFabric)), the constructor RawProps.h:65 labels
           'Deprecated. Do not use.'",
  per_prop_not_per_node: "RawPropsParser::preparse —
                          Mode::JSI     values_.emplace_back(runtime, std::move(value))  MOVED
                          Mode::Dynamic values_.emplace_back(pair.second)                COPIED",
  shape: "every prop deep-copied into the parser's value table; a style prop is a flattened object.
          Stock never pays it (React hands createNode a jsi::Object). Asymmetric in our direction
          and scaling with the tree — the shape §18 says a suspect must have",
  priced: "raw-props-mode-cost.itest.ts, 4 000 nodes, slope with node count fixed:
           one more scalar prop  build 10 ns   createNode  44 ns
           a style object        build 56 ns   createNode 347 ns  (303 over a scalar)",
  size: "~5 000 scalars + ~4 000 styles on a thousand-row create = 1.61 ms of 162 ms = 1.0%",
  warm_up_error: "the scalar figure was first published as 104 ns — the fixture's own warm-up. The
                  first commit in a process is dearer, and under 60-way parallelism it read 18.0 ms
                  against 7.5 alone, enough to make the NARROW arm dearer than the wide one.
                  Discarded warm-up commit + best-of-two per width halved it to 44 ns"
                 -> "a slope whose two members did not pay the same warm-up is not a slope;
                     the tell was a fixture that only fails in company",
  gate_removed: "it went red a SECOND time at a smaller margin. The whole slope is ~0.9 ms across
                 two arms and 60 concurrent testers move a reading by more than that, so the file
                 now asserts only that both arms committed and its numbers come from a SOLO run"
                -> "a claim smaller than the run's own noise is not a claim (§8); a print, not
                    a gate (§9)",
  escape_is_worse: "the JSI path means handing createNode a jsi::Object, built per node with a JSI
                    write per prop — the exact per-prop crossing the buffer exists to remove, at
                    0.58 us each on Hermes. In the negative-results table; do not re-open it on the
                    strength of the RN issue alone",
}

18i := {
  lead: "facebook/hermes discussion #1634 — Hermes arrays are segmented because 'the largest
         contiguous allocation it can do is 4MB', which 'adds cost to every array operation'.
         takeBatch() replaces strings/values/instanceHandles/handles with fresh empty arrays, so
         four tables re-grow 0 -> ~10 000-12 000 every commit (the op spine keeps its Int32Array)",
  measured: "side-table-growth-cost.itest.ts, best of three, Hermes:
             10 000 entries: grown 25 ns/entry · presized 42 ns · reused 24 ns
             growth shape: 3 000 -> 24 ns/entry · 12 000 -> 24 ns/entry · 1.00x for 4x the entries",
  verdict: "FLAT across 4x, so the doubling amortises completely and there is no growth penalty at
            our sizes — the segmentation claim belongs to an older Hermes, and static_h allocates
            array storage with CanBeLarge::Yes",
  freshness_is_free: "a warm array reads the same 24 ns, so the freshness takeBatch() needs for
                      correctness (applyOps reads handles while attaching native state) costs
                      nothing to keep",
  the_fix_is_a_pessimisation: "new Array(n) reserves NO capacity in Hermes — its constructor calls
                               JSArray::create with the default capacity then only setLengthProperty
                               (lib/VM/JSLib/Array.cpp). It sets length, not storage: 42 ns vs 25",
  carry_beyond: "on Hermes, push onto an empty array is the fast path and new Array(n) + index
                 assignment is 1.7x slower. The C++ instinct is backwards here",
}

18j := {
  why: "every instrument above prices work with a wall clock. Allocation is a second cost, paid
        later and elsewhere, and a phone's heap pays it far more often than a Mac's",
  lead: "octanejs/octane#1007 — a native renderer on Hermes comparing two universal frameworks
         driving the SAME host structure with the SAME property changes, on metrics this directory
         had never produced. Elapsed fell 36.4 s -> 6.5 s while cumulative allocation barely moved"
        -> "the win was in the collector, not in the work",
  instrument: "heapInfo() + collectGarbage() in harness.ts over jsi::Instrumentation::getHeapInfo —
               hermes_totalAllocatedBytes, hermes_allocatedBytes, hermes_heapSize,
               hermes_numCollections and two peaks. EMPTY on JavaScriptCore by jsi's own default
               (jsi.cpp:307 returns an empty map), so a fixture skips rather than dividing by zero",
  arms: "allocation-volume.itest.ts + stock-allocation-volume.itest.tsx, slope over two widths:
         RAW       579 bytes/node   the protocol floor: createNode, no tree, no reconciler
         ENGINE  3 175              our mutation API, no reconciler above it
         ADAPTER 6 381              React ON our engine — what an app runs
         STOCK   6 680              React on Fabric's protocol — what bare-rn runs",
  verdict: "the bottom pair is the comparison, and we are 4.5% UNDER stock. The hypothesis that our
            retained tree + buffer + side tables leaves more for the collector is dead, in our
            favour. Our engine adds ~2 600 bytes/node over the floor; React's reconciler adds
            ~6 100 over the same floor and an app pays that either way",
  keep: ["byte counters are deterministic where wall clocks are not — engine/raw read 5.28x three
          runs running, to the hundredth. Reach for bytes first when a question can be posed in them",
         "ENGINE is NOT the arm to compare against stock, and the first version of this file did:
          it carries no reconciler, reads 2.1x under stock and says nothing about an app. Adding
          ADAPTER moved the answer from 'half' to 'the same'"],
}
```

### 18k-18m. Retention as a gate, a floor arm paying a tax stock does not, and no Hermes cliff

```
18k := {
  lead: "the octane thread turned on two rows no instrument here could produce —
         live JS after GC 54.10 MB against the other renderer's 0.37 MB;
         live JS after unmount 0.22 against 0.23. Unmount matched, after-GC did not"
        -> "that renderer held a tree it had been told to drop, and ONLY a heap reading says so:
            a wall clock cannot, and neither can a mutation count — the platform WAS told to delete",
  transfers_to_us: "facebook/hermes#982 — the collector sees a HostObject as a small JS object and
                    has no idea what native memory hangs off it. Our handles are exactly that:
                    JS objects carrying NativeState pointing at C++ nodes in SymbioteTree",
  gate: "retention-after-clear.itest.ts makes it a CONTRACT, not a number: a surface that has built
         and cleared a thousand rows holds no more than before, asserted cycle over cycle because a
         leak of one row list is a SLOPE and not a step",
  reading: "floor 0.32 MB · 0.68 -> 0.68 -> 0.68 -> 0.68 · drift 0 KB over 3 cycles",
  break_test: "push every node into a module-scope array: 1.06 -> 1.43 -> 1.79 -> 2.18 MB,
               a clean ~370 KB/cycle, failing with an assertion rather than a throw",
  precondition: "the case asserts the tree is EMPTY before it reads a byte — a clear that quietly
                 failed would leave the rows standing and the heap would climb correctly",
  second_half: "a heap reading proves the JS half was released and only INFERS the other. Ownership
                is JS-anchored (children strong, parent raw; a node lives while a parent holds it or
                while JS names it through NativeState), so C++ follows JS. The shape that inference
                would miss is reanimated#10527: a container keyed by surface that nothing empties.
                SymbioteTree has no such container (committedSurfaceId is a field, not a registry),
                and liveNodes — a LEVEL, the one counter readSurfaceTelemetry does not drain on
                read — turns that from a reading of the code into a reading of the process:
                liveNodes 1001 -> 1001 -> 1001 -> 1001 · after an empty surface 1",
  why_the_empty_cycle: "flat has two readings and only one is a defect — the tree keeps a list
                        forever, or keeps the LAST until something supersedes it. It is the second.
                        A surface-keyed leak would have been a staircase",
}

18l := {
  bug: "nativeFabricUIManager is a jsi::HostObject, so a property read on it is not a lookup —
        it RUNS CODE. UIManagerBinding::get (.vendors/react-native/.../uimanager/
        UIManagerBinding.cpp:184) allocates a std::string from the name, walks a compare chain in
        declaration order, and returns a FRESH jsi::Function from createFromHostFunction capturing
        the UIManager, a second copy of the name and the arity. Every access",
  stock_does_not_pay: "ReactFiberConfigFabric.js:45-60 destructures the whole surface at module
                       scope and never touches the HostObject again",
  defect: "raw-fabric-vs-engine.itest.ts held the binding OBJECT and wrote binding.createNode(...),
           re-entering the trap on all 10 002 creates and 10 001 appends"
          -> "the arm named 'stock's protocol' was stock's protocol PLUS a tax stock does not pay,
              and §18c's whole verdict was computed off it",
  priced: "host-object-resolution-cost.itest.ts — identical tree twice in one process, interleaved,
           best of three, arms differing ONLY in where the method reference comes from (both behind
           an arrow wrapper, so the destructure is not also worth one JS call):
           resolved 37.4 ms · bound 34.7 ms · 2.7 ms over 20 003 accesses = 0.13 us each",
  fix: "resolve the five methods once inside fabric() and return an ORDINARY object — one function,
        no call site touched",
  moved_against_us: "RAW build 29.2 -> 26.4 ms, engine/raw 1.88x -> 2.03x, §18c's per-node row
                     1.18 -> 0.98 us for stock and 3.02x -> 3.48x for the ratio",
  keep: ["the single-shot reading said 0.44 us and was WARM-UP, 3.5x the truth. One arm goes first,
          and in a fresh process first means lazy C++ init, a cold allocator, an unwarmed surface.
          Interleave and take each arm's minimum — a two-case file cannot, the harness runs cases
          in order",
         "ask of any FLOOR arm: is it doing something the thing it stands for does not? A floor
          wrong in our favour hides a gap; this one was wrong against stock and flattered us by ~8%
          of RAW. §2 reaches the JSI boundary too — a census cannot see a property access any more
          than it can see a repaint"],
}

18m := {
  claim_tested: "facebook/hermes#1294 — a loop over a large array at 1400 ms on Hermes against 60
                 on JSC, 23x. §18c has our fill at 34.1 against 22.4, 1.5x",
  why_not_the_same: "direction matched, magnitude an order apart, causes different in KIND: 1.5x is
                     what ordinary code costs without a JIT, 23x is a CLIFF — a slow path the
                     workload fell into at size",
  test_on_one_build: "a cliff engages at SIZE, interpretation does not. fill-scaling-cost.itest.ts,
                      4x per step, best of three, fresh tree per sample:
                        500   1.8 ms  3.68 us/node
                       2000   7.7     3.84   4.18x
                       8000  31.2     3.90   4.06x
                      32000 122.8     3.84   3.94x",
  verdict: "flat across 64x, factors within 0.2 of linear, three sittings. #1294 is not our
            situation and there is no slow path behind the 1.5x",
  under_bytecode: "re-taken on -O (§21) the curve reads flat to 8 000 and rises at 32 000 —
                   1.665 / 1.725 / 1.861 / 2.580 us. Nothing about the code changed: the JS halved
                   and the SAME absolute collector cost stopped being hidden by it. Verdict
                   unchanged (the benchmark's 10 000 nodes sit at the flat end); the gate widened
                   2x -> 3x for that reason rather than to pass",
  bucketed_2026_09_22: "the nodes are now spread over containers of 4 000 rather than one flat list.
                        Yoga's debug build asserts a child list under 16 384
                        (YogaLayoutableShadowNode.cpp:1036), so the 32 000 arm ABORTED test:itest
                        while passing bench:itest. The containers are built before the clock starts
                        and the timed loop is unchanged; the figures above are the post-bucketing
                        re-take (32 000 read 2.34 flat, 2.58 bucketed)",
  break_test: "an `at`-proportional inner loop in the fill: 10.8 -> 29.6 -> 104 -> 417 us,
               16x per 4x step, failing with an assertion rather than a throw",
  keep: "a symptom match needs an ORDER, not a direction. Everything is slower without a JIT, so
         'slower on Hermes' matches every issue in that tracker and identifies none of them",
}
```

### 18n-18p. The fill split: the node object is 16%, the hash tables 20%, the op store 7%

```
18n := {
  overturns: "§18c's assertion that the fill is dominated by allocating a node object — it was an
              assertion, not a reading",
  fill: "fill-phase-cost.itest.ts, 10 000 nodes / 13 000 props / 10 000 appends, -O (-O0 beside):
         create 11.2 ms  1.12 us/node (2.35)  53%   <- the largest single line we own anywhere
         prop    7.3     0.56 us/write (1.18) 35%   style 0.85 (2.07) · scalar 0.49 (0.88)
         append  2.7     0.27 us/append (0.74) 13%",
  optimizer: "a flat ~2.1x across all three phases; the PROPORTIONS survive the ruler change
              even though every millisecond does not",
  floor: "node-allocation-floor.itest.ts — SymbioteNode is not exported, so an ordinary object of
          the same 16 slots in the same order, -O (-O0):
          empty {} 0.016 (0.031) · 16-field literal 0.061 (0.412)
          · FIELDS constructor + 16 assigns 0.180 (0.274) <- the shape production builds
          · whole createElement 1.120 (2.350)",
  verdict: "the object is ~16% of a create; the other ~0.94 us/node is code we wrote",
  REVERSED_BY_RULER: "on -O0 the constructor was 1.5x CHEAPER than the literal (0.274 vs 0.412) and
                      this section said so. On -O the literal is 3x CHEAPER (0.061 vs 0.180)"
                     -> "a micro-optimisation read off the un-optimized harness pointed the OPPOSITE
                         way from the truth on a device. The sharpest warning here about §21",
  gate_break_test: "`expect(fields).toBeGreaterThan(empty)` PASSED with the instance hoisted out of
                    the loop so the arm allocated nothing — 0.032 vs 0.031. Re-armed as
                    `toBeGreaterThan(empty * 3)`, inside the measured 9x margin"
                   -> "a directional gate needs a MARGIN from the measured separation, or it is
                       decoration; the only way to know is to break it and watch",
}

18o := {
  subject: "the two hash-table ops recordCreateElement runs per node:
            placementPending.add(handle) — Set<object>, one entry per created node
            intern(viewName) — stringIds.get(text), Map<string, number> over ~6 names.
            recordAppendChild adds to the same Set, so a create runs ~10 000 Map gets
            and ~20 000 Set inserts",
  why_suspected: "Hermes's own next-stable notes admit our version is the slow one — OrderedHashMap
                  reworked around a contiguous data table with the index off the GC heap.
                  The only named Hermes weakness landing on a line we execute per node",
  fixture: "hash-table-cost.itest.ts, loop control subtracted, fresh Set per sample because
            production clears placementPending every batch and the growth IS the workload",
  priced: "-O: Map.get 0.033 · Set.add 0.038 · per created node 0.110   (-O0: 0.052 / 0.040 / 0.133)",
  verdict: "20% of §18q's 0.55 us plain create. Real, not the answer",
  share_trap: "the tables barely moved under -O (0.133 -> 0.110) while everything around them halved
               — they are C++ builtins, so the optimizer only speeds the JS reaching them. Their
               SHARE grew 6% -> 12% with the work unchanged"
              -> "a share is two numbers (same effect §18m saw with the collector)",
  withdrawn: "the '74% unsplit' tally this section used to carry — wrong denominator, see §18q",
}

18p := {
  claim_tested: "the buffer's STORAGE — the strongest remaining form of 'the buffer is our
                 bottleneck', and the only one with a named Hermes mechanism behind it",
  mechanism: "typed-array element access goes through the generic object-lookup path with no
              special case; even Static Hermes 'doesn't know about typed arrays and integers'
              (facebook/hermes #1634, #1685). push writes OP_STRIDE = 6 Int32Array slots per op,
              and a thousand-row create emits 12 005 ops = ~72 000 interpreted stores",
  fixture: "op-store-cost.itest.ts — four ways to hold the same 12 000 ops, loop control
            subtracted, -O bytecode, best of five",
  priced: "control 0.27 ms
           INT32       0.78   0.042 us/op   what push does today
           PLAIN       0.66   0.032         pre-sized number[], 1.3x cheaper
           PUSH        0.37   0.008         number[] grown by .push(a,b,c,d,e,f), 5x cheaper
           PLAIN + set 1.03   0.063         the only SHIPPABLE shape, 1.5x WORSE",
  size: "0.042 us/op x 12 005 = 0.50 ms of a 21.2 ms fill = 2.4%; 7% of a plain create.
         Even a FREE op store leaves the fill where it is",
  why_no_fix: "the Int32Array is the contract with applyOps, which reads ONE JSI array element by
               element. A plain array must be copied back, and Int32Array.prototype.set(plainArray)
               is not a memcpy — it reads each entry as a JSValue and converts. PUSH owes the same
               copy for the same reason",
  shape_of_result: "the part with a named mechanism behind it is the SMALLEST of the four tested"
                   -> "the expensive part of the buffer is the bookkeeping around the write,
                       not the write",
}
```

### 18q. A plain create, fully accounted, and §18r: one node in ten is 60% of the phase

```
18q := {
  fixture: "create-element-ladder.itest.ts, case 1 — three rungs, each a strict subset of the
            next, all on the ENGINE's own exports, takeBatch() between samples",
  ALLOC:  "new FieldsNode(...)              0.17 us  31%  the 16-slot object",
  RECORD: "recordCreateElement(handle, ...) 0.27     49%  slotOf + intern + placementPending.add
                                                          + instanceHandles.push + the 6-slot push",
  FULL:   "createElement('RCTView')         0.55    100%",
  REST:   "FULL - ALLOC - RECORD            0.11     20%  two string compares, hasHostBehaviors,
                                                          configPayloadFold, call frames",
  verdict: "a plain create is 100% accounted for; the buffer half is its biggest single piece",
  cross_check: "ALLOC 0.17 here vs §18n's 0.18, different fixture a day apart",
  unmeasured: "slotOf + instanceHandles.push + frame = ~0.12 us, as large as both hash tables",
  withdrawn: "§18o's '74% unsplit' — it divided micro-arms by fill-phase-cost's 1.12 us/node,
              an AVERAGE OVER THE ROW, while every arm priced a bare RCTView"
             -> "dividing one fixture's numerator by another's denominator; survived 3 sections",
}

18r := {
  question: "0.55 us for a plain create vs fill-phase-cost's 1.12 for the same phase",
  fixture: "create-element-ladder.itest.ts, case 2 — the three node KINDS the row is made of,
            cold arms first because the registry gate is monotone (§9)",
  raw_text: "0.47 us",
  plain_cold: "0.56",
  plain_armed: "0.62   registry miss = 0.066",
  tagged_text_input: "8.0   14x a plain create",
  weighted_row: "1.30 against the row's 1.12",
  answer: "the tagged primitive is 8.0 x 1/10 = 0.80 us of 1.12 = ~60% of the create phase,
           ~38% of the whole JS fill, from one node in ten",
  already_known: "'a tagged primitive costs 15-17 us to mount, attach 8.4-9.4' under A create,
                  fully attributed — the same 8.0, filed as a win against RN's 50-53 us TextInput",
  lesson: "a number can be a win against the baseline AND the largest line on your own side;
           filing it under the first reading is how it stayed unexamined",
  registry_miss: "0.066 us/node, ~12% of a plain create. fill-phase-cost reads it NEGATIVE and
                  calls it below the instrument — true there, because that arm differs by one
                  boolean inside a workload where one node in ten costs 8 us"
                 -> "a quantity buried under a 14x outlier is measured in the wrong place",
  points_at: "not the buffer",
}
```

### 18s-18w. The interior of the tagged primitive, and the two fixes that shipped

```
18s := {
  fixture: "create-element-ladder.itest.ts case 3 — an EMPTY behavior under an unused tag
            separates the engine's attach machinery from a real behavior's own attach()",
  plain_armed: "0.65 us",
  plus_empty_behavior: "0.98  -> machinery = 0.31 (Map hit, 4 field writes, recordSetTag, 2 Set.add)",
  plus_real_text_input: "8.0  -> the behavior itself = 7.0 = 87% of the tagged create",
  scale: "0.70 of the row's 1.12 us/node = ~52% of the create phase, from ONE function in
          @symbiote-native/components",
  nothing_close: "node object 0.17 · whole recording half 0.26 · op store 0.04",
}

18t := {
  fixture: "text-input-attach-ladder.itest.ts — five synthetic behaviors, each a strict superset,
            built from the engine's own exports, one tag each, all arms in ONE case,
            gates STRUCTURAL not comparative (§11). -O, best of five, three runs",
  ladder: "empty 0.85 · +state object 1.13 (+0.29) · +setProp('mostRecentEventCount') 1.59 (+0.44)
           · +four text-input listeners 2.38 (+0.79, 0.20 each) · +attachPressMachine 6.6 (+3.9)
           · the real behavior 7.4 — the imitation is faithful",
  listeners: "a <TextInput> installs ELEVEN — its four plus the press machine's seven",
  ruled_out: "none of the eleven is in GATED_EVENT_PROPS, so none fires the extra setProp
              (first guess, checked, wrong)",
  scale: "the press machine alone is ~4 us on one node in ten = ~36% of the create phase,
          the largest single item in this investigation",
  why_it_exists: "refine: focusOnPress — tapping a text input focuses it",
  levers: "defer everything but the gesture entry point to the first touch = ~4 us/input;
           make a listener cheaper than 0.20 us = 2.2 us/input. Both engine-side, neither buffer",
  NOT_a_gap: "RN mounts one too — TextInput.js:629 calls usePressability(config) — and RN's whole
              input costs 50-53 us against our 8"
             -> "absolute cost worth removing; will not move one ratio in the table",
}

18v := {
  split_of: "attachPressMachine's 3.9 us",
  objects: "1.65 us  (Set for timers, press runtime, host of 4 closures, 9-field state, WeakMap)",
  listeners: "2.42   (0.345 each) — and 0.345 DID NOT ADD UP: a lone setBehaviorListener is 0.12,
              and an install cannot be dearer inside a loop than outside one",
  root_cause: "installListeners iterated a Map — `for (const [event, key] of KEY_BY_EVENT)`
               builds the pair object per entry",
  priced: "Map + destructure 1.04 us · array of tuples 0.39 (SHIPPED) · two parallel arrays 0.29",
  why_not_parallel_arrays: "0.1 us cheaper, gives up the pairing a silent drift would unwire",
  result: "the real behavior 7.4 -> 6.3 us/input, per-listener 0.345 -> 0.27. 606 unit tests green",
  size: "~0.7 us on one node in ten = ~0.7 ms of a 102 ms create, under 1%. Ships because it is
         free, not because it is large; only a fixture can resolve it (§8)",
  trap: "a non-capturing arrow is not a closure for pricing — `() => undefined` read 0.030 us and
         the optimizer may hand back ONE object per loop; capturing node + name reads 0.050"
        -> "an arm must have the shape production has, not the cheapest that type-checks (§18l)",
  rejected: "one shared dispatcher for the machine's seven closures — 6 x 0.05 = 0.3 us, 4% of the
             node, against a real loss of legibility",
}

18w := {
  sweep: "\\grep -rnE \"for \\(const \\[[a-zA-Z_, ]+\\] of \" core/engine/src core/components/src adapters/*/src",
  hits: "28, and READING them is the work — most are cold. structured-style.ts's resolveRecord
         looks alarming and is WeakMap-cached on the style object (4 runs per benchmark);
         registry.ts's fold is per component name; render/index.ts is per surface"
        -> "a sweep finds shapes; only the call graph says which are hot",
  hot: ["adapters/react/src/host-config.ts applyProps + applyUpdate",
        "adapters/angular/src/primitives/shared.ts",
        "adapters/angular/src/descriptor-to-angular"],
  defect: "all walked a props bag with Object.entries, which allocates the outer array AND a pair
           array per key, eagerly",
  priced: "object-iteration-cost.itest.ts, four keys, -O, three runs:
           Object.entries 0.426 us/node · Object.keys 0.234 (SHIPPED) · for...in 0.144 (REJECTED)",
  result: "0.19 us/node, ~1.9 ms of a 102 ms create — 3x the press-machine fix, four characters.
           applyUpdate's own first loop was already Object.keys, four lines above the one that wasn't",
  why_not_forin: "walks the prototype chain, so an inherited key would be routed as a prop.
                  A reconciler's props bag has no prototype TODAY — a fact about today, not a contract",
  combined: "§18v + §18w = ~2.6 ms of a create, under 3%, and the suite resolves neither",
}
```

### 18u. On the device's own compiler there is no unexplained headless loss left

Three rows of the `-O` table sit at or above 1.00. All three are accounted for, and the engine is in
none of them:

| row             | ratio | whose                                                                                                                                                                                            |
| --------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React `Swap`    | 1.65  | the **mutation-mode tax** `<M1+M2>` chose deliberately. Not one prop write crosses; ~15 ms is React's own mutation commit with a host config doing nothing. No other adapter pays it.            |
| Angular `Clear` | 1.43  | **Angular's teardown.** The engine is 2.8 ms of 24.5 — and 2.4-3.8 ms of EVERY adapter's clear, measured the same sitting. The wall spans 13.5 (React) to 24.5 (Angular) on a flat engine cost.  |
| Solid `Select`  | 1.34  | a 4 ms spread on a 12 ms row, and `Select` is Fabric's on both sides — a layout-dirty style change on one row of a thousand re-lays out the whole tree for stock's renderer exactly as for ours. |

**The buffer hypothesis was tested in five separable forms and each came back small or explained:**
the crossing (§18c, innocent and cheaper on Hermes), the node allocation it implies (§18n, 31% of a
plain create), the storage it writes into (§18p, 7%, and the shippable alternative is 1.5x worse),
the whole recording half (§18q, 49% of a plain create) and the behavior-attach machinery (§18s,
0.31 us). The one genuinely large line found anywhere is a `<TextInput>`'s press machine (§18t, ~4 us)
and stock pays for the same thing. §22 then closed it on the device too.

### 19. There is no unnamed third in `applyOps`, and a created node is 77% Fabric

`raw-fabric-vs-engine.itest.ts` prints `applyMs=48.1 walk=24.7 decode=3.9 setProp=1.2 strings=0.2
structure=1.2`, and those subtract to **16.8 ms with no name on it** — which looks exactly like a
third of our C++ half waiting to be found. It is not ours. `completeSurface` is called from inside
`kOpCommit`, so `ShadowTree::commit` and the Yoga pass are INSIDE `applyMs` while being reported on
their own counters; subtracting the named phases without them bills the platform's commit to our op
loop. **The defect was the subtraction.**

`apply-op-loop-cost.itest.ts` closes the books by slope, two widths per kind in one process
(per NODE, ns):

```
             apply   walk  decode  setProp  structure  fabric (yoga)  UNNAMED
create        4322   2336     537      241        117    993 ( 956)       99
create-1v     4100   2306     552       39        112    995 ( 958)       95
append        4723   2399     567      233        114   1314 (1275)       97
setProp       2648   2288       0      288          0     55 (   0)       17
```

Everything above closes to **~99 ns per node**, which is the op loop's own dispatch and is nothing.
Two things worth keeping out of it:

- **A created node costs ~4.3 us inside `applyOps`, of which ~1.0 us is ours** (decode + setProp +
  structure + loop) and ~3.3 us is Fabric's `createNode`, commit and Yoga. On the benchmark's 10 000
  nodes that is ~10 ms ours against ~33 ms the platform's. **The 50 ms of §17 is not in the C++
  apply path** — it is in the JS half (~74 ms: ~57 the reconciler, ~17 the fill) or device-only.
- **`create-1v` is the control that killed the value-table theory.** Same nodes, same ops, one shared
  prop value instead of a distinct one per node: `setProp` drops 241 -> 39 ns, so the value
  conversion is real and already named, and the unnamed remainder does not move. A cost that follows
  the entry count is the table's; this one follows neither.

And a rule the negative remainder taught: **a phase that subtracts to a NEGATIVE cost is a phase
counted twice.** Subtracting `layoutMs` beside `commitMs` drove it to -854 ns per node, because Yoga
runs inside the commit.

### 20. Read the bundle before theorising about it, and never bisect with a silenced tool

A tester stack trace names a line in the BUNDLE, and the runner deletes the bundle.
`SYMBIOTE_KEEP_BUNDLES=1` keeps it and prints the directory. One `sed` over the named line ended a
chain of five wrong hypotheses about esbuild, Hermes block scoping and lazy module init: the bundle
simply had no declaration for the identifier, because **the SOURCE no longer had one**.

What had removed it was the bisect itself — a `for` loop of `git stash push -- <file>` / `git stash pop`
with `>/dev/null 2>&1` on both. A pop that does not apply cleanly reports and leaves the stash behind,
and with the output thrown away the loop pushes again and the next pop restores the wrong entry. It
cost two module-scope `const`s and the comment above them in `stock-suite.itest.tsx`, and **it also
truncated this file by 700 lines** — recovered by replaying the session's own edits from the
transcript onto the committed version. The symptom in both cases was a failure with no edit and no
rebuild behind it, which reads as anything but an editing accident.

Two rules: **never silence the tool you are bisecting with**, and **when a failure appears without a
rebuild and without an edit, suspect the tree before the toolchain** — `git diff` the file the trace
names, first.

### 21. The harness never ran the optimizer, and a device does — `SYMBIOTE_ITEST_BYTECODE=1`

**Every JS-side figure this file has ever published is an `-O0` figure.** `symbiote-tester.cpp:288`
does `runtime.evaluateJavaScript(StringBuffer(source))`, so Hermes compiles at load — and that
compile does NOT run the optimizer. A release app ships `.hbc` built by `hermesc -O`.

Measured three ways on one fixture, same binary, same sitting:

```
                              loop control
source, runtime-compiled      0.14 / 0.27 ms
hermesc -O0 bytecode          0.14 / 0.31       identical — which is the proof
hermesc -O  bytecode          0.05 / 0.11       2.7x
```

**It is not a scale factor, and that is why it matters here rather than being a footnote.** `-O`
works on JS loops and small function calls, which is what our fill IS, and does nothing for JSI calls
into C++, which is what stock's protocol is:

```
                     -O0 (every number before this)   -O (what a device runs)
RAW    build              26.4 ms                          25.4      unmoved
ENGINE fill               34.1                              17.5     1.9x cheaper
RATIO  engine/raw          2.03x                             1.62x
per node, ours             3.41 us                           1.75
per node, stock JS+JSI     0.98                              0.84
       ours / stock         3.48x                            2.08x
```

So the JS-side gap §18c reports is **2.1x, not 3.5x**. We still lose it; it is a third smaller than
this file has been saying, and the whole difference is a compiler flag the harness was not passing.

**`-Xes6-block-scoping` is mandatory and its absence does not look like a compiler flag.**
`symbiote-host.h:145` builds the runtime `withES6BlockScoping(true)`, which reaches only what the
RUNTIME compiles. `hermesc` defaults it off, so `const one` in a `for…of` stops being per-iteration
and every closure in `report()`'s case chain captures the LAST case. The run then reports that one
case three or four times and every earlier arm as "an arm did not run" — **a wrong answer rather than
an error.** A single-case fixture passes happily, which is exactly how this hid for an hour.

Two fixtures moved under it and NEITHER was a defect: `fill-scaling-cost` (see §18m) and
`retention-after-clear`, where the tree holds two lists per cycle instead of one and needs a second
empty surface to settle — `-O` keeps a local alive across a collection that `-O0` had already
dropped. Flat either way, which is the claim the file makes; the number of steps was never it.

**Re-taken under it, same day**: the suite table below, the fill split in §18n and the hash shares in
§18o. What is still `-O0` and says so where it appears: the create attribution under **A create,
fully attributed**, the boundary prices, and every figure in the negative-results table — those stay
correct against each other and overstate every JS line against a device.

Cost: ~72 s of `hermesc` on a 115-file run, counted as build time. Worth it for `bench:itest`, not
for the correctness loop, which also wants un-inlined stack traces.

### 22. The device answered it, and the answer is that we are not slower

Taken 2026-09-22 on an iPhone 17 / iOS 26.5 simulator, Release, after the §18g instrument fix:
`examples/react`'s `VS STOCK` column against `examples/bare-rn`'s `ALL MOUNTED`. Both stop in a
`useLayoutEffect`; **never read react's own `ALL MOUNTED` against stock**, that is the one-phase-early
column and it is what produced the withdrawn number below.

```
          stock        react          vue        solid       svelte      angular
Create    278.1   228.1 0.82   231.4 0.83   201.3 0.72   200.8 0.72   407.1 1.46
Replace   289.0   252.6 0.87   254.6 0.88   218.7 0.76   268.5 0.93   428.7 1.48
Partial    33.2    20.2 0.61    15.5 0.47    10.7 0.32    14.2 0.43    22.3 0.67
Select     10.8     5.9 0.55     4.8 0.44     5.5 0.51     8.4 0.78    15.7 1.45
Swap       10.7    27.8 2.60     7.4 0.69     5.4 0.50     7.0 0.65    17.1 1.60
Remove    126.3    36.4 0.29     6.3 0.05     9.3 0.07     7.5 0.06    18.5 0.15
Append    398.0   292.8 0.74   252.4 0.63   203.7 0.51   197.6 0.50   428.2 1.08
Clear      10.8    13.9 1.29    11.7 1.08    11.8 1.09    10.6 0.98    44.0 4.07
```

Best of three to five per column, minimum taken.

**Angular re-read 2026-09-23** (same simulator, best-of-4, after the tag directives, `StyleHost`
and the `[style]` renderer rework): Create 320.3, Replace 351.5, Partial 23.5, Select 15.3, Swap
17.9, Remove 19.2, Append 336.8, Clear 39.9 — the build-shaped rows ~20% down, the small ones flat.
Stock was NOT re-run that sitting, so 1.15x / 1.22x / 0.85x against the 278.1 above are indicative.

**`Remove` reads 8x higher on stock than headless predicted, and that is the thesis rather than
noise** — it survived best-of-N on every column. Headless the row is 15.7 against 3.9-7.2 (2-4x); on
device it is 126.3 against 6.3-18.5 (7-20x). §4 already held the mechanism as a node count — stock
re-lays out ~7 000 Yoga nodes where we replace one slot and it re-lays out ~1 000 — and the device
supplies what a test host cannot: what that difference COSTS with real layout and real UIKit mounting
underneath. **The rows where we win biggest are the rows headless understates most**, which is the
opposite of the caution this skill carried for months.

Its mirror is `Select`: ours reads 5.9 on device against 12.0 headless — faster on the slower machine,
through best-of-N on both. A headless millisecond and a device millisecond were never the same
quantity (§18g), and this row is where that stops being a caveat and starts being a discrepancy worth
chasing: something in the headless `Select` path does work the device does not.

**Only React's column is stopped where stock stops** (§18g) — the other four stop in the post-commit
hook, one phase earlier, so their ratios are a FLOOR. React prices that phase at 6.6 ms of its own
`Create`, about 3%.

**Angular is the one adapter above stock, and the device WIDENS its deficit instead of preserving
it.** Four of five arms carry off the headless table almost unchanged — React 0.82 to 0.82, Vue 0.81
to 0.83, Svelte 0.71 to 0.72, Solid 0.63 to 0.72 — and Angular goes 0.90 to 1.46 on `Create`, 1.43 to
4.07 on `Clear`. It is also the only adapter whose row is a live component instance rather than a
lowered intrinsic tag (LView, DI scope, two `EventEmitter`s, ~81 us each headless), which is the cost
a simulator charges more for and a test host charges less. **So the headless ruler transfers for
lowered adapters and does NOT transfer for a component-per-row one** — the first rule this table
establishes that the headless table could not.

Its `WRITES` also differ: 11 001 on a create against 9 001 for Vue/Solid/Svelte and 9 013 for React,
two extra props per row. That is ~1.6 ms and explains none of the 180, but by §1 it means the Angular
column is not quite the same workload before it is a different speed. Fix the screen before the next
sitting.

**The 1.25x is withdrawn.** It was never a reading of the same window on both sides, and the corrected
window puts every create-shaped row under stock — the headless lead survives the device rather than
being spent by it. The two rows above 1.00 are the two the headless table already named as
framework-side: React's `Swap` (mutation mode, `<M1+M2>`, a deliberate choice no other adapter pays)
and `Clear` (each framework disposing 2 000 component instances).

**The buffer hypothesis is closed, and it was closed against a criterion registered BEFORE the
reading.** The footnote under `ENGINE PER STEP` states the test in advance: on JavaScriptCore `DECODE`
is 8% of `APPLY`, so if reading the `Int32Array` element by element through JSI is what a device costs
us, `DECODE` must have become a large share of `APPLY` there. It read **1.8%** — a quarter of the JSC
share, not a third of `APPLY`:

```
              APPLY   DECODE   share      COMMITS   CROSSINGS   NODES
Create        111.7      2.0    1.8%          1          2      10000
Replace       125.3      2.1    1.7%          1          2      10000
Append        128.9      2.3    1.8%          1          2      10000
```

Hermes reads the buffer FASTER than JavaScriptCore did. That agrees with §18c and §18p from the other
direction, and it is the one form of the hypothesis a fixture could not settle. Register the criterion
before the run, in the screen's own text, and a device reading can answer a question instead of
inviting a story about it.

`CROSSINGS 2` on every row is the second half of it: the buffer is not fragmenting into a crossing per
mutation, which is the failure mode §18 kept worrying about. `COMMITS 1` says no foreign commit landed
inside the window.

**The `FABRIC CALLS` table reads `0/0/0` on our arm, and that is not a broken counter.** The C++ tree
host issues `createNode` straight into `UIManager`; it never passes through the JS
`global.nativeFabricUIManager` that `fabric-call-counter.ts` wraps, so the file's like-for-like census
is structurally unavailable to us on a runtime carrying the native module. Both `examples/react/index.js`
and the screen's own footnote say so — read them before filing it as a defect. What replaces it is
`NODES` from the engine's own C++ walk, printed in `ENGINE PER STEP`: **10 000 against stock's 10 001
`createNode` calls** (stock's extra is the container), with stock's `BY VIEW NAME` confirming the shape
— `RCTRawText` 3 001, `RCTText` 3 000, `RCTView` 3 000, `RCTSinglelineTextInputView` 1 000.

**Status: best-of-N is satisfied (§6), one sitting per app is not (§5).** Each column is the minimum of
three to five runs, so the digits are readings rather than samples. What is still owed is the columns
being taken back to back: six apps were built and run in sequence over an hour, and §5's own record is
stock's `Create` moving 141.1 / 151.8 / 153.9 across one day. So read a band of roughly ±0.05 on every
ratio, and do not split hairs between Vue's 0.83 and React's 0.82.

The first attempt at Vue was VOID and it is the reason §14 grew a new tell: it read `Create` 240.2 on
an engine three minor versions old, caught by its non-zero `FABRIC CALLS` before the millisecond was
believed. Refresh every example, not the one being measured.

Still owed on the instrument: a settled reading in the other four screens (Vue `nextTick`, Svelte
`tick()`, Solid post-render, Angular `afterNextRender`), which turns their floor into a reading.

## The current numbers

Headless, 1 000 rows, `bench:itest` Release on Hermes **as `hermesc -O` bytecode**
(`SYMBIOTE_ITEST_BYTECODE=1`, §21) — the compiler a release app ships. One arm per run, best of
three, one sitting, 2026-09-22. Ten native views per row (three `View`, three `Text`, three raw text,
a `TextInput`): 10 002 nodes for stock, 10 003 for an adapter (its own container). Ratio is
ours / stock.

```
              stock   react     vue   solid  svelte  angular      ratio = ours / stock
Create        125.2   102.2   100.9    78.3    89.3    113.0      0.82 0.81 0.63 0.71 0.90
Replace       137.1   111.7   122.6    91.7   123.7    123.1      0.81 0.89 0.67 0.90 0.90
Partial        18.7     8.6     8.3     6.5     7.1      6.1      0.46 0.44 0.35 0.38 0.33
Select         11.7    12.0    12.6    15.7    11.9     11.1      1.03 1.08 1.34 1.02 0.95
Swap           13.6    22.5     4.6     6.1     4.8      4.3      1.65 0.34 0.45 0.35 0.32
Remove         15.7     5.0     4.8     7.2     3.9      4.0      0.32 0.31 0.46 0.25 0.25
Append        137.1   122.5   116.9   105.7   108.1    131.8      0.89 0.85 0.77 0.79 0.96
Clear          16.2    12.2    15.3    16.0    15.9     23.1      0.75 0.94 0.99 0.98 1.43
```

**This replaces the `-O0` table of the same day, and the optimizer moved the rows unevenly — which is
the finding, not a caveat.** Same binary, same fixtures, same sitting discipline; only the compiler
differs:

```
             create ratios             swap (React)   clear
-O0    0.81 0.86 0.60 0.72 1.11           2.22        0.67-0.92, Angular 0.78
-O     0.82 0.81 0.63 0.71 0.90           1.65        0.75-0.99, Angular 1.43
```

- **No adapter is above stock on a create-shaped row any more.** Angular went 1.11 -> 0.90 on create,
  1.11 -> 0.90 on replace, 1.13 -> 0.96 on append. Its deficit was its own JS machinery — LViews, DI
  scopes, `EventEmitter`s — and that is exactly what the optimizer eats. The adapter never changed.
- **React's `Swap` improves but stays the one loss**, 2.22 -> 1.65. It is the mutation-mode tax
  `<M1+M2>` chose; `-O` shrinks React's own commit walk, it does not remove it.
- **`Clear` gets WORSE for every adapter**, and Angular's crosses 1.00 (0.78 -> 1.43). Stock's clear
  is Fabric deleting nodes and gains little from `-O`; the framework teardown that makes up our
  column is JS and should have gained — that it did not is the one row this table cannot explain and
  the only place `-O` moved something against us.

Absolute times fell 35-40% across every column, which is the two-thirds-of-a-JIT the optimizer buys.

**This replaces the JavaScriptCore table that stood here through 2026-09-21, and the ruler moved the
rows unevenly — which is the finding, not a caveat.** Both tables are post-§18e, so the only thing
that changed is the engine:

```
                 create ratios          mutation-row margin       Clear
JSC      0.83 1.01 0.69 0.75 1.06    remove 0.24-0.28 (~4x under)   1.09-1.95, every adapter ABOVE stock
Hermes   0.81 0.86 0.60 0.72 1.11    remove 0.35-0.49 (~2.3x under) 0.67-0.92, every adapter UNDER stock
```

**Create barely moves; the rows we WIN lose about half their margin, and `Clear` inverts outright.**
That is §18c's mechanism seen at suite scale: stock's ten-thousand-crossing protocol is the thing the
JIT was subsidising, so taking the JIT away helps stock most exactly where stock crosses most — the
mutation rows. Create is flat because both arms there also pay React's reconciler, which dilutes
everything. Absolute times rise for every column (stock's create 153.9 -> 200.7): Hermes is slower
than JSC for both sides, and kinder to stock's shape.

It reproduced: this sitting's four shared arms land within 0.02 of §18c's four-arm Hermes table taken
a day earlier from a different invocation — the only cross-check either table has.

The machine was loaded during this sitting, with single readings as far out as 5x the minimum
(`append` 987.8 against 208.1). That is what best-of-N over a one-sided noise distribution is for: do
not read the spread as a band, read the minimum as the reading.

No arm carries an exemption: every column writes the same props and commits the same tree, asserted
before any millisecond is read. All six are structurally identical on create —
`created=10000 setProps=10000 batches=2 nodes=10003`, `walk` 25.8-26.9, `apply` 44.0-47.6.

Fixtures: `core/engine/cpp/tests/js/{stock,react,vue,solid,svelte,angular}-suite.itest.*`, one
`bench-suite.ts` owning the state machine, the steps and the oracles. A seventh arm — the engine's
own mutation API with no reconciler above it — is `update-shapes-cost.itest.ts`.

**What this table is**: Hermes, the engine a device runs, but still a test host rather than a real
Fabric pipeline and no app-level Babel lowering. A sound comparison of the six columns AGAINST EACH
OTHER on one ruler. Re-measure on device before publishing a ratio against stock.

### A create, fully attributed (10 003 nodes) — JSC, and NOT re-taken on Hermes

```
fill    24   ours, JS      prop writes 12 · appendChild 5 · creates 6
apply   16   ours, C++     decode 4 · setProp 1.5 · structure 1.2 · rawtext ~3 · op loop ~6
commit  34                 materialize 24 (of which UIManager::createNode 17) + Fabric commit 8.5
total   74                 0.90x of a bare-`nativeFabricUIManager` driver doing nothing else
```

The floor arm is `raw-fabric-vs-engine.itest.ts`: the same tree through
`createNode`/`appendChild`/`completeRoot`, no retained tree, no diff, no buffer. On JSC **the engine —
retained tree, clone-on-write, payload building and all — costs LESS than a driver that does nothing
but call Fabric** (0.90x). **On Hermes the same pair reads 2.03x** (§18c), so that sentence is a
JavaScriptCore result and does not carry to a device. What DOES carry is the split: an adapter's
deficit against stock is largely its own reconciler — on a 10 000-node create the engine is ~72 ms and
the framework above it is ~35 (Solid), ~57 (React) or ~90 (Angular).

Per-node JS, from `fill-phase-cost.itest.ts`: create 1.19-1.38 us, prop write 0.79-0.82, append
0.47-0.49. **A creation costs more than a prop write**, which inverts the intuition — it allocates,
records an op, and asks two registries. The prop average hides a 1.8x split: a style write is
1.25 us against a scalar's 0.70.

A tagged primitive costs **15-17 us to mount** (`reconciler-floor.itest.tsx`) — attach 8.4-9.4 plus
post-commit 6.4-8.6. Every `<TextInput>` mounts a press machine, which is why `behaviors/pressable.ts`
shows up in a profile of a row holding no Pressable. Read it against RN's own `TextInput` at
50-53 us before calling it a regression.

### The rows that are not ours, and why

| row              | what it is                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Select`         | **Fabric's**, to within one node. A layout-dirty style change on one row of a thousand re-lays out the whole tree — 6 999 for stock against 7 000 for us. Not ours to remove.                                                                        |
| React `Swap`     | the **mutation-mode tax** `<M1+M2>` chose deliberately. Engine 3.3 ms of 23.4 on JSC (34.7 on Hermes), not one prop write crosses; ~15 ms is React's own mutation commit measured with `insertBefore` replaced by a no-op. No other adapter pays it. |
| `Clear`          | **engine 2.4-3.8 ms on EVERY adapter**, measured in one `-O` sitting, while the wall spans 13.5 (React) to 24.5 (Angular). The whole spread is each framework disposing 2 000 component instances, and Angular's 1.43x is Angular's (§18u).          |
| Angular `Create` | ~81 us per row-component instance (LView, DI scope, two `EventEmitter`s, two getters), measured against an inlined row. An app author's choice the adapter cannot remove.                                                                            |
| Solid `Clear`    | 2 000 drains from `cleanChildren` at 2.8 us each, plus ~6.5 us per removal of Solid's own reactive teardown — ~13 ms on a 2 000-row clear, which is stock's whole step. The loop is internal to `solid-js/universal`; what we supply is three lines. |

### The boundary, priced

A read is a batch boundary, so a framework navigating the tree it is building enters `applyOps` once
per MUTATION. `small-batch-crossing-cost.itest.ts`:

```
                         before    after
 drain, all in           5.54 us   2.76 us
   of which the crossing 4.88      2.05
   of which ours         0.70      0.70      `takeBatch` — six allocations, and NOT the cost
 prologue, empty batch   4.38      1.54      2.8x
 bare JSI host call      0.13      0.13      the floor, and the control that made this findable
```

`performance.now()` takes no arguments, so it prices the CALL and nothing else — 0.13 us against a
4.4 us entry is a factor of 34, which says the cost is work we do on the way in. It was
`arguments[n].asObject(runtime).asArray(runtime)` four times: the checking pair runs an `isObject`
and an `isArray` per table, eight JSI round trips for four arguments. `getObject`/`getArray` carry
`assert`s that are LIVE in the Debug harness, so a malformed batch still aborts there while the
shipping build pays nothing. `parentsOf`/`subtreesOf` keep their checks — those are batched reads.

## Negative results — priced and NOT taken

Recorded so they are not re-derived. Each was measured.

| candidate                                                          | why not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| drop `configPayloadFold` from `createElement`                      | 0.17 us of 1.24 — 13% of a creation, ~1.3% of a create                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| make `tag` optional so an untagged node skips `attachHostBehavior` | **0.066 us/node, ~12% of a plain create** — isolated in §18r, where it is a clean positive three runs running. `fill-phase-cost`'s own arm reads it as NEGATIVE and calls it unmeasurable, because there it is one boolean inside a row whose tenth node costs 8 us. Still not taken: 12% of the cheap nine tenths is ~4% of the phase, and it would break every test registering under a Fabric name. **The reason changed from "unmeasurable" to "small", which is not the same claim.** |
| remove `subtreesOf`'s `.filter(isSymbioteNode)`                    | 0.6 ms, but it is the type NARROWING, not a check — removing it costs an `as` or an `ITreeHost` declared over our own type                                                                                                                                                                                                                                                                                                                                                                 |
| split the style-write path                                         | 5 ms of a 29 ms fill, of a 72 ms engine, of a 106-164 ms create — 3-4% at best, in the most delicate code in the engine. **RE-PRICED ON HERMES and the verdict holds**: the parts object plus `pushClassStyle` is 0.94 us over ~4 000 style writes = 3.8 ms of a 156 ms create, 2.4%. A new ruler is a reason to re-check this table, not a licence to re-derive it.                                                                                                                       |
| replace the CSS-class path with style objects on the device screen | priced in `class-vs-style-cost.itest.ts` (§18f): +0.07 us/node on a create — 0.35 ms — and the class path is 0.78x on a select. The two device arms genuinely style differently; it is not a cost.                                                                                                                                                                                                                                                                                         |
| move off `RawProps(folly::dynamic)`, the path RN deprecated        | priced in `raw-props-mode-cost.itest.ts` (§18h): 44 ns per scalar prop and 347 ns per style prop inside `createNode`, which is **1.61 ms of a 162 ms create — 1.0%**. Escaping it means building a `jsi::Object` per node, i.e. re-introducing the per-prop JSI writes the buffer exists to remove. The cure costs more than the disease.                                                                                                                                                  |
| attack GC pressure from the retained tree, buffer and side tables  | `allocation-volume.itest.ts` + its stock half (§18j): React on our engine allocates **6 381 bytes/node against stock's 6 680** — we are 4.5% UNDER. The engine adds ~2 600 bytes over the protocol floor where React's reconciler adds ~6 100, and an app pays that either way. There is no pressure to remove.                                                                                                                                                                            |
| presize or recycle the buffer's four side tables                   | `side-table-growth-cost.itest.ts` (§18i): growing from empty is **24-25 ns/entry and FLAT** (24 at 3 000, 24 at 12 000 — doubling amortises completely), recycling a warm array reads the same 24, and `new Array(n)` + index writes is **42 ns, 1.7x WORSE**. There is no growth cost to remove, and the obvious fix is an anti-optimisation.                                                                                                                                             |
| intern `PropNameID`s / cache `UIManagerBinding::getBinding`        | 1.8% of the prologue — **and reverted**: both keyed on `&runtime`, which treats an ADDRESS as a lifetime. `symbiote_tree_tests` builds a JSCRuntime per case, so it aborted in `~JSCRuntime` with a dangling API string. Green on `bench:itest`, red on CI.                                                                                                                                                                                                                                |
| eliminate Solid's 2 000 drains                                     | ~4 ms of 23.6, for a JS-side child cache the architecture exists to refuse                                                                                                                                                                                                                                                                                                                                                                                                                 |
| answer `parentOf` from the PENDING op instead of draining          | Angular's virtualized FlatList drains once per cell (the outlet anchor is placed in the batch it is read in): 152/127 batches on create/replace against React's 26/2. Tried 2026-09-23 (`placementPending` as child→parent map, `remove` of an unknown node still drains): batches fell to exactly 26/2 and the wall moved 40.3→38.9 / 35.5→34.3, inside the spread. **A crossing count is not a cost** — `applyOps` time is the ops. Reverted.                                               |
| `if (tagName.empty())` skip over the rule chain                    | a few tenths of a ms against a ~2.5 ms arm spread — unmeasurable here                                                                                                                                                                                                                                                                                                                                                                                                                      |
| intrusive linked list for `insertBefore`                           | would make insert/remove/`nextSiblingOf` all O(1), but we BEAT stock on `Swap` — the core data structure does not get replaced over a row nobody has lost                                                                                                                                                                                                                                                                                                                                  |
| move the torn-down mark into C++                                   | buys the 1.7 ms crossing and costs one per INSERT (~9 000 on a create, today a `WeakSet` miss)                                                                                                                                                                                                                                                                                                                                                                                             |
| hunt a Hermes slow path behind the fill's 1.5x (hermes#1294)       | the per-node cost is FLAT across 64x — 3.68 to 3.84 us from 500 nodes to 32 000 (§18m). There is no cliff to find; 1.5x is the engine.                                                                                                                                                                                                                                                                                                                                                     |
| cheaper node allocation on the create path                         | the object is 0.27 of a 2.35 us create — 12% (§18n). Even a free allocation leaves 88%.                                                                                                                                                                                                                                                                                                                                                                                                    |
| route around Hermes's slow `OrderedHashMap` on the create path     | `Map.get` + two `Set.add` come to 0.11 us/node — ~12% of what a create spends outside the object (§18o). Real, and too small to chase.                                                                                                                                                                                                                                                                                                                                                     |
| write ops into a plain array instead of the `Int32Array`           | 1.3x cheaper to write and **1.5x worse once copied back** — `Int32Array.set(plainArray)` converts per entry, and C++ still needs the typed array. The whole op store is 2.4% of the fill anyway (§18p).                                                                                                                                                                                                                                                                                    |

**A monotone-gate pair can never carry an assertion** (see method §9), so the registry-miss result is
a print in its fixture, not a bound.

## NativeScript-Angular is not a faster reference (researched 2026-09-22, source-read, not measured)

Source in `.vendors/nativescript/{NativeScript,angular,ios,android}`. Same Angular on top — LView, DI,
per-row component — so our Angular `Create` 1.46x is paid there too; NS adds its own costs underneath:

```
crossing   per prop, synchronous: Property setter -> [setNative] (core/ui/core/properties/index.ts:367)
           first apply also READS native via getDefault(); _batchUpdate dedupes, still 1 call/prop
call       V8 FunctionTemplate -> objc_getClass(string) -> hash lookups -> respondsToSelector -> libffi
           (ios/NativeScript/runtime/Interop.mm:1624); JS proxy + Persistent + retain per new UIView
engine     V8 LITE MODE on iOS = jitless (runtime/Runtime.mm:332) — same no-JIT position as Hermes
layout     iOS in JS (layouts/stack-layout/index.ios.ts), sizeThatFits + setFrame crossing per node;
           Android in Java (ui-mobile-base widgets)
css        selector match per view in onLoaded (styling/style-scope.ts:739), JS
estimate   ~5-15 crossings per node on create; no single-crossing commit anywhere
```

No NS-vs-Fabric benchmark exists (2025-2026); all published NS numbers are vendor, ≤2022, old-bridge RN.
NS's real answer to a 1 000-row list is `ListView` virtualization (only visible rows get a component),
not a faster renderer. **Do not cite NS as evidence our Angular deficit is architectural.**

## Instruments added 2026-09-22

```
ALLOC line     runBenchSuite prints KB allocated + GCs per step (hermes_totalAllocatedBytes delta,
               read outside the stopwatch). Deterministic — compare arms to the KB in one run
profiler       SYMBIOTE_PROFILE_DIR=<dir> -> Hermes sampling trace per step (bench-suite) or per
               tag create (primitive-suite); `node scripts/prof-top.mjs <trace> [N] [regex]` gives
               self/inclusive %. Never read RESULT/PRIM from a profiled run
primitive-suite  <arm>-primitive-suite.itest.ts: 19 app-facing tags x create/update/swap/remove/
               clear, PINNED nodesPerItem census. Arms: angular (SYMBIOTE_ELEMENTS), vue
```

Measured with them (Hermes -O, 2026-09-22):
- Angular allocates LESS than every adapter on the row bench (18.9-21.5 MB create vs 20-22.6 Vue/
  Solid/Svelte, 45 stock). GC is not Angular's problem; its gap is CPU in the tick.
- A row COMPONENT costs ~6 us + 1.3 KB/row (`angular-inline-row-suite` vs elements). Inline rows
  make select/swap WORSE (no OnPush boundary). The old "81 us per row instance" is dev-mode/JSC.
- Engine commit is identical across adapters (~354 vs ~352 samples Angular/Vue); the whole Angular
  delta is the framework phase (711 vs 387 samples on create).
- Per @for item Angular costs ~5 us + 1.2 KB over Vue even on a one-node item (primitive `view`
  11.9 vs 6.8 ms) — embedded LView + container insertion + an update pass per item. Runtime-only
  work cannot reach it (`<angular_no_template_transform>`).
- Outliers on EVERY adapter: touchable-opacity (56-78 ms, 25-28 MB / 1 000) and button (70-93 ms,
  26-28 MB). Engine/components-side, not Angular.
- Hidden `modal` commits a ModalHostView on every adapter; RN commits nothing (`Modal.js:280-288`).

## Angular's per-node cost: a runtime answer to a compile-time question (researched 2026-09-22)

A browser `<div>` gets NO runtime entity: ngtsc checks it against `DomElementSchemaRegistry` (a static
table, hardcoded — `ngtsc/typecheck/src/checker.ts:244`, not pluggable), and the element pays only
`createElement` + `setProperty`. Directive matching runs once per TView (first create pass), never per
row. Our `SYMBIOTE_ELEMENTS` is one `@Directive` per tag, added for TYPE-CHECKING only — and it ships
to runtime `dependencies`, instantiating per element: 86.6 ms / 1 000 rows (`angular-elements-suite`).

```
done        directives typecheck-only via RUNTIME def mutation (`withholdFromRuntimeMatching`, no
            build step — build-time stripping is banned, `<angular_no_template_transform>`). All
            tag directives withheld incl. the read-back four (2026-09-22: flush finds the view
            lazily via ɵgetLContext + ɵViewRef, `change-detection-flush.ts`)
            SymbioteStyleHost DELETED (2026-09-22). `[style]` = object/string through Angular's
            own styling engine (typed so ngtsc rejects an array/function); an RN array or
            press-state callback is `[styleProp]`, a plain property the renderer routes to
            `style`. Shipping shape (ng-elements) now allocates what the bare arm does:
            create 21 476 -> 19 315 KB. Zero directive instances per tag
            (`element-directive-free.test.ts`); only attribute-matched CallbackHost/form
            accessors remain, where an app binds `[on*]`/ngModel
styling     Angular's own styling engine is the next-largest per-element cost: a `[style]` OBJECT
            costs ~640 B + ~1.8 us per element over `[styleProp]` with the same object (primitive
            `view` 2 499 vs 1 858 KB, 12.6 vs 10.8 ms / 1 000). Only an input claim avoids it, and
            a claim is a TAG directive (a `[style]` selector never matches: the matcher skips style
            markers) at 5-9 us on EVERY element — dearer than the engine. Renaming `[style]` at
            build time is banned (`<angular_no_template_transform>`, reconfirmed 2026-09-23), and
            **telling apps to write `[styleProp]` instead is banned too** — nobody writes it. So
            `[style]` is THE path and the only lever is the renderer's own half of its cost
            (`openStyleRun` / `canonicalStyle` / `flushStyling`); `[styleProp]` stays only for what
            `[style]` cannot carry (RN arrays, press callbacks). Renderer half priced 2026-09-23 by
            stubbing `setStyle`: 11.5 -> 10.0 ms / 1 000 `view`, most of it the publish `[styleProp]`
            pays too. Taken: a fresh node's keys are matched against a published style chosen by the
            FIRST key (Angular sends keys SORTED), no accumulator unless they diverge — ALLOC `view`
            2 499 -> 2 179 KB, ng-v 6 387 -> 6 021 KB; wall unmoved within the spread
row comp    2 LView (embedded + component) + createRenderer/destroy per instance — Angular's, not ours;
            the only removal is a build-time inline of the row into @for, which NOBODY has shipped
prior art   angular-three: tags under CUSTOM_ELEMENTS_SCHEMA, no per-node directive (renderer.ts:190)
            krausest: every Angular entry writes the row inline in @for — row-component cost unmeasured
cheap wins  `(out)` on a component host also fires our renderer.listen (wasted); predeclare
            `__ngContext__` on the node (hidden-class transition per host)
```

## Where this came from

The full dated journal — every before/after, every superseded reading, the device tables taken on
the retired JS retained-tree engine — lives in git history, not here. What survived the prune is the
method, the current table, and the negative results. `README.md` publishes a reader-facing version of
the table above; re-measure before changing it.

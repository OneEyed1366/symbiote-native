---
name: symbiote-perf-measurement
description: "How SymbioteNative measures performance, and the current numbers against stock React Native. Read BEFORE quoting any ratio, before writing or editing a fixture under `core/engine/cpp/tests/js/**`, before running `bench:itest`, before attributing a regression to the engine or to an adapter, and before shipping any change justified by a speed claim. Holds: the eight-step js-framework-benchmark suite and its current table; the oracles that make two columns comparable at all (node census, `PROPS_PER_STEP` write counter, `laidOut`); the assert-build trap (`test:itest` compiles `REACT_NATIVE_DEBUG`, which makes list append O(N^2) and does not exist in the build that ships); best-of-N on small-ms rows because timing noise is one-sided; one ruler / one sitting; break-testing a guard; and the measured NEGATIVE results — changes priced and deliberately NOT taken, so they are not re-derived. Trigger on: 'is X faster', 'benchmark', 'bench:itest', 'perf regression', 'how do we compare to stock React Native', 'create is slow', 'why is Angular/Solid/React slower', 'measure this change', 'Swap anomaly', 'Clear is slow', 'profile the engine'."
---

# Measuring SymbioteNative

Two builds, two jobs. Never read a timing off the first:

```bash
pnpm run test:itest    # correctness — asserts ON. The reason the harness exists.
pnpm run bench:itest   # timings — NDEBUG + -O (RN_ENABLE_DEBUG_STRING_CONVERTIBLE stays ON)
pnpm run test:cpp      # the gtest arm — the ONLY one that builds more than one JSCRuntime
pnpm run test:android  # the second host build, compiling the #ifdef ANDROID branches
```

**The assert build's SHAPE is wrong, not just its scale.** `NDEBUG` off also defines
`REACT_NATIVE_DEBUG` (`ReactCommon/react/debug/flags.h`), which compiles
`ensureYogaChildrenLookFine` + `ensureYogaChildrenAlignment` into
`YogaLayoutableShadowNode::appendChild`. Each walks the parent's whole child list, so building an
N-child list one append at a time is **O(N^2) there and O(N) in the build that ships** — 3 554 ms
against 27 ms for 10 000 appends. It once put `materialize` at 61% of a create when it is ~27%, and
reported a complexity in list width that does not exist off the harness. A number whose ORDER is
right and whose SHAPE is wrong survives review; that is what makes this worse than no number.

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

## The current numbers

Headless, 1 000 rows, `bench:itest` Release, one sitting, 2026-09-21. Ten native views per row
(three `View`, three `Text`, three raw text, a `TextInput`): 10 002 nodes for stock, 10 003 for an
adapter (its own container). Ratio is ours / stock.

```
              stock   react     vue   solid  svelte  angular      ratio = ours / stock
Create        153.9   127.2   155.4   106.0   115.7    162.7      0.83 1.01 0.69 0.75 1.06
Replace       162.6   137.8   169.5   113.3   131.1    181.0      0.85 1.04 0.70 0.81 1.11
Partial        35.0    10.3    13.0     6.8     9.0     10.3      0.29 0.37 0.19 0.26 0.29
Select         13.8    13.9    13.7    15.3    13.6     13.8      1.01 0.99 1.11 0.99 1.00
Swap           17.8    23.7     6.4     6.4     7.0      5.6      1.33 0.36 0.36 0.39 0.31
Remove         20.5     5.4     5.0     5.4     5.5      5.7      0.26 0.24 0.26 0.27 0.28
Append        186.0   136.3   153.1   115.3   131.3    172.7      0.73 0.82 0.62 0.71 0.93
Clear          14.8    16.6    20.9    28.9    16.2     22.3      1.12 1.41 1.95 1.09 1.51
```

No arm carries an exemption: every column writes the same props and commits the same tree, asserted
before any millisecond is read. All six are structurally identical on create —
`created=10000 setProps=10000 batches=2 nodes=10003`, `walk` 25.8-26.9, `apply` 44.0-47.6.

Fixtures: `core/engine/cpp/tests/js/{stock,react,vue,solid,svelte,angular}-suite.itest.*`, one
`bench-suite.ts` owning the state machine, the steps and the oracles. A seventh arm — the engine's
own mutation API with no reconciler above it — is `update-shapes-cost.itest.ts`.

**What this table is**: JavaScriptCore rather than Hermes, a test host rather than a real Fabric
pipeline, no app-level Babel lowering. A sound comparison of the six columns AGAINST EACH OTHER on
one ruler. Re-measure on device before publishing a ratio against stock.

### A create, fully attributed (10 003 nodes)

```
fill    24   ours, JS      prop writes 12 · appendChild 5 · creates 6
apply   16   ours, C++     decode 4 · setProp 1.5 · structure 1.2 · rawtext ~3 · op loop ~6
commit  34                 materialize 24 (of which UIManager::createNode 17) + Fabric commit 8.5
total   74                 0.90x of a bare-`nativeFabricUIManager` driver doing nothing else
```

The floor arm is `raw-fabric-vs-engine.itest.ts`: the same tree through
`createNode`/`appendChild`/`completeRoot`, no retained tree, no diff, no buffer. **The engine —
retained tree, clone-on-write, payload building and all — costs LESS than a driver that does nothing
but call Fabric.** So there is no create-path win left in the engine worth the name, and an adapter's
deficit against stock is its own reconciler: on a 10 000-node create the engine is ~72 ms and the
framework above it is ~35 (Solid), ~57 (React) or ~90 (Angular).

Per-node JS, from `fill-phase-cost.itest.ts`: create 1.19-1.38 us, prop write 0.79-0.82, append
0.47-0.49. **A creation costs more than a prop write**, which inverts the intuition — it allocates,
records an op, and asks two registries. The prop average hides a 1.8x split: a style write is
1.25 us against a scalar's 0.70.

A tagged primitive costs **15-17 us to mount** (`reconciler-floor.itest.tsx`) — attach 8.4-9.4 plus
post-commit 6.4-8.6. Every `<TextInput>` mounts a press machine, which is why `behaviors/pressable.ts`
shows up in a profile of a row holding no Pressable. Read it against RN's own `TextInput` at
50-53 us before calling it a regression.

### The rows that are not ours, and why

| row | what it is |
|---|---|
| `Select` | **Fabric's**, to within one node. A layout-dirty style change on one row of a thousand re-lays out the whole tree — 6 999 for stock against 7 000 for us. Not ours to remove. |
| React `Swap` | the **mutation-mode tax** `<M1+M2>` chose deliberately. Engine 3.3 ms of 23.4, not one prop write crosses; ~15 ms is React's own mutation commit measured with `insertBefore` replaced by a no-op. No other adapter pays it. |
| `Clear` | engine 3-5 ms; the other 13-23 is each framework disposing 2 000 component instances. React's framework half is 14.6 ms — stock's *entire* step. Svelte's is 13.7, already under it. |
| Angular `Create` | ~81 us per row-component instance (LView, DI scope, two `EventEmitter`s, two getters), measured against an inlined row. An app author's choice the adapter cannot remove. |
| Solid `Clear` | 2 000 drains from `cleanChildren` at 2.8 us each, plus ~6.5 us per removal of Solid's own reactive teardown — ~13 ms on a 2 000-row clear, which is stock's whole step. The loop is internal to `solid-js/universal`; what we supply is three lines. |

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

| candidate | why not |
|---|---|
| drop `configPayloadFold` from `createElement` | 0.17 us of 1.24 — 13% of a creation, ~1.3% of a create |
| make `tag` optional so an untagged node skips `attachHostBehavior` | the armed build comes back **faster**, run after run. Ten thousand failed registry lookups are smaller than the warm-up the first build pays. It would also break every test registering under a Fabric name. |
| remove `subtreesOf`'s `.filter(isSymbioteNode)` | 0.6 ms, but it is the type NARROWING, not a check — removing it costs an `as` or an `ITreeHost` declared over our own type |
| split the style-write path | 5 ms of a 29 ms fill, of a 72 ms engine, of a 106-164 ms create — 3-4% at best, in the most delicate code in the engine |
| intern `PropNameID`s / cache `UIManagerBinding::getBinding` | 1.8% of the prologue — **and reverted**: both keyed on `&runtime`, which treats an ADDRESS as a lifetime. `symbiote_tree_tests` builds a JSCRuntime per case, so it aborted in `~JSCRuntime` with a dangling API string. Green on `bench:itest`, red on CI. |
| eliminate Solid's 2 000 drains | ~4 ms of 23.6, for a JS-side child cache the architecture exists to refuse |
| `if (tagName.empty())` skip over the rule chain | a few tenths of a ms against a ~2.5 ms arm spread — unmeasurable here |
| intrusive linked list for `insertBefore` | would make insert/remove/`nextSiblingOf` all O(1), but we BEAT stock on `Swap` — the core data structure does not get replaced over a row nobody has lost |
| move the torn-down mark into C++ | buys the 1.7 ms crossing and costs one per INSERT (~9 000 on a create, today a `WeakSet` miss) |

**A monotone-gate pair can never carry an assertion** (see method §9), so the registry-miss result is
a print in its fixture, not a bound.

## Where this came from

The full dated journal — every before/after, every superseded reading, the device tables taken on
the retired JS retained-tree engine — lives in git history, not here. What survived the prune is the
method, the current table, and the negative results. `README.md` publishes a reader-facing version of
the table above; re-measure before changing it.

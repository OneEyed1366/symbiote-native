---
name: symbiote-perf-measurement
description: "Symbiote performance measurement — read BEFORE claiming any part of the engine or an adapter is slow, before optimizing core/engine/src/commit.ts, and before writing or changing a benchmark. Holds the two instruments (the headless vitest micro-bench at core/engine/src/__tests__/reconcile.bench.ts, and the on-device readCommitProfile() seam in commit.ts feeding examples/react's BenchmarkScreen), the industry ruler we report against (js-framework-benchmark / krausest operation list, so numbers stay comparable to Vue/Svelte/Solid/Million), the DIRTY-MARKING design that now guards that walk (ISymbioteNode.dirty + markDirty in node.ts, the early exit in commit.ts, where every mark lives, the four traps — listeners must NOT mark, structural ops mark the parent not the moved child, the root container is marked at the commit entry point because top-level nodes have no parent, anchors are cleared in renderableChildren — and the silent-stale-UI failure mode it introduces), the measured before/after constants (no-op commit on 9761 nodes 3.4 ms -> 0.001 ms; one prop in a 10 005-node sectioned screen 3.2 ms -> 0.063 ms; an unmarked walk was ~0.5 us/node and ~77% of a commit), the rule that a FLAT benchmark tree cannot express a subtree-skip win so a bushy case must sit beside krausest's flat one, and that create-shaped rows are read off min because GC makes their p75 useless, the props-object-per-node-per-commit allocation finding and the --max-semi-space-size=64 requirement that follows from it, and the reasoning rule that a per-adapter spread (React 2 frames / Vue 1 / Svelte 0 on the same screen) CANNOT be caused by engine code every adapter shares. the FIVE-ADAPTER ANCHOR CENSUS (censusRetainedTree + readCommitProfile's childScans/childFlattens, one anchor-flatten-cost test per adapter) whose measured table — react/solid 0 anchors, vue 2, angular 3001, svelte 4002 per 1000 rows — closes rather than opens the suspect, because nodesVisited is identical under all five and the adapter carrying the MOST anchors is the fastest on device. Trigger on 'is X slow', 'optimize reconcile', 'dirty marking', 'anchors are slow', 'renderableChildren', 'why do we drop frames', 'add a benchmark', 'measure the commit path', a GC/jank investigation, or any proposal to port Million.js-style block/edit-map ideas."
---

# Measuring SymbioteNative

Two instruments, two different questions. Never answer a performance question
from either one alone.

```
MICRO   core/engine/src/__tests__/reconcile.bench.ts
        headless vitest bench (tinybench), slot faked via installFabric()
        answers: what does the walk cost in isolation, per node

DEVICE  readCommitProfile() in core/engine/src/commit.ts
        → examples/react/components/JsFrameRateMeter.tsx
        answers: what does it cost on Hermes, and does the user see it
        reports: % of window · nodes/commit · ms/commit

A per-node figure is NOT among them any more, and re-adding one would lie. `walkMs /
nodesVisited` was honest only while the walk visited every node; dirty-marking collapsed
the denominator to the nodes it did not skip while the numerator still covers everything
reconcile does (the JSI createNode/appendChild calls included). It read 13.4 us/node
before and 438 us/node after, on a device that had got ~2x FASTER. `nodes/commit` is the
skip itself; a true per-node cost now needs a full walk, i.e. a cold mount.

Also: when the JS thread is at 0 fps the meter's own rAF loop cannot close a sampling
window, so every cell on screen is a STALE leftover from the last window that did close.
Read the meter only while frames are still arriving.
```

## The ruler: krausest, not something we invented

Operations come verbatim from [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark):
create 1k · replace all 1k · partial update (every 10th of 10k) · select row ·
swap 2 of 1k · remove row · create 10k · append 1k to 10k · clear. Warmup counts
matter (5 for the update-shaped ops, none for the create-shaped ones).

Why this list and not ours: Vue, Svelte, Solid, Inferno and Million all report
against it, so our numbers stay comparable to theirs. Do not invent a nicer
operation set — comparability is the whole point.

Caveat when quoting a row-count number cross-framework: our "row" is ONE engine
node; krausest's row is ~7 DOM nodes. The per-node diagnostic series is the
number to quote, because it carries its own unit.

## Measured — desktop V8, macOS arm64, Node 22, 2026-08 (BEFORE dirty-marking)

Historical baseline, superseded by dirty-marking below — kept as the regression signature
an unmarked full-tree walk produces.

One changed prop, tree size varies (p75):

```
   100 nodes   0.046 ms
   500         0.222 ms
  2000         0.93  ms
 10000         5.12  ms        → linear, ~0.5 us per node
```

```
§walk_indifferent_to_change_size := {
  measured: "change 1000 rows of 10 000 = 6.61 ms vs change 1 row of 10 000 = 5.12 ms",
  ⟶ "1000x the real work buys 1.3x the time — ~77% of a commit is the walk itself",
  cold_mount_10000_rows: "10.3 ms, 10 002 native createNode calls — only 2x the cost of touching one prop on an already-mounted tree of the same size: creating native nodes is cheaper than re-walking to discover nothing changed",
  frame_arithmetic: "16.6 ms / 0.5 us = ~33 000 nodes to burn one frame on desktop V8; Hermes on device is materially slower, multiplier established by the device instrument only — never assume it",
}
```

## The allocation finding (may matter more than the time)

`fabricProps(node)` builds a **fresh props object per node per commit**, so every
commit produces garbage the size of the tree. On default V8 semi-space the
10 000-node bench is unusable — `mean 105 ms, ±91% rme` vs `4.7 ms, ±1.6%` with
`--max-semi-space-size=64`. That is why `pnpm bench` sets it.

This is a property of production, not an artifact of the harness. On a phone
under Hermes there is no semi-space to widen, and a GC pause eats a whole frame.
Any fix that removes the per-node walk removes this allocation with it.

## The fix: dirty marking (landed 2026-08-18)

`ISymbioteNode.dirty` means **"this node's own props changed, or something below it
did."** `reconcile` returns an unchanged subtree's handle by reference without
rebuilding its props or descending into it.

```
node.ts    markDirty(node)  walks node.parent upward, STOPS at the first
                            already-dirty ancestor  → a burst of mutations under
                            one subtree costs one chain walk, not N
commit.ts  reconcile()      clears the flag on every node it visits, so the
                            invariant "an ancestor of a dirty node is dirty"
                            survives across commits
```

Marks live in: `setProp`, `setText`, `detach`, `appendChild`, `insertBefore`,
`removeChild` (node.ts) · `SymbioteSurface.detach` (surface.ts, splices
`parent.children` directly) · `setNativeProps` and `commitContainer` (commit.ts).

### Four things that are easy to get wrong

**Listener changes deliberately do NOT mark.** `node.listeners` never reaches
Fabric — dispatch reads it off the retained node — and React hands a fresh handler
closure on nearly every render. Marking there would re-dirty the whole tree every
commit and hand the entire win back. The one listener that does change a Fabric
prop, `layout`, raises `onLayout` through `setProp` and is marked that way.

**Structural ops mark the PARENT chain, never the moved child.** A child that only
changed position may legitimately still be clean, and a mark on an already-dirty
child would stop instantly and never reach the new parent. Reparenting is caught by
re-checking `committed.parent` on the early-exit path instead of by a flag.

**The synthetic root container must be marked at the commit entry point, not by
bubbling.** A surface's top-level nodes carry `parent === undefined` (surface.ts
sets it deliberately), so no mark can ever reach the container above them — it would
stay clean, early-exit, and swallow the whole commit. This is what made every
Animated / `setNativeProps` test fail on the first attempt: 21 red tests, all of them
"the value never arrived", because `setNativeProps` calls `commitContainer` directly
rather than going through `commitChildren`. Hence the unconditional `markDirty(container)`
in `commitContainer`.

**Anchors are cleared in `renderableChildren`, the only place that visits one.**
Anchors (Vue fragments / v-if / v-for placeholders) are flattened out of the walk and
never reach `reconcile`, so nothing else can clear them. A permanently-dirty anchor
would swallow every later mark from its subtree — markDirty stops at it — and the real
parent would never learn anything changed. Silent stale UI, no error.

### The failure mode it introduces, and the guard

Forget one mark and the screen keeps showing the old value: no crash, no error,
nothing to grep for. Two guards:

- `warnIfStale` in commit.ts — under DEBUG only, recompute the skipped node's props
  and `dlog` a `DIRTY-MISS` line naming the node if they differ.
- `core/engine/src/__tests__/dirty-marking.test.ts` — one row per public mutator
  proving its change survives a commit that is otherwise entitled to skip the tree,
  plus `readCommitProfile().nodesVisited` assertions that lock in the skip itself
  (a skip is invisible in the output: a correct engine and a correct-but-slow engine
  emit byte-identical Fabric calls). Both halves were mutation-tested — dropping one
  markDirty reddens exactly one row, disabling the early exit reddens the visit counts.

## Measured — desktop V8, same host, 2026-08-18 (AFTER dirty-marking)

p75, before → after:

```
select row (1000 rows)                 0.50 ms  →  0.21 ms     2.4x
1 prop, 10 000-node FLAT table         4.29 ms  →  2.19 ms     2.0x
1 prop, 10 005 nodes / 244 sections    3.22 ms  →  0.063 ms   51x
no-op commit, 9761 nodes               3.42 ms  →  0.001 ms ~3400x
```

Cold mount pays ~3-6% (read off `min`, see below).

```
§flat_tree_hides_subtree_skip := {
  claim: "a FLAT benchmark tree cannot express a subtree-skip win, and krausest's is flat",
  reason: "one parent + N leaf children ⟶ any change re-clones the child set and re-appends all N handles (Fabric persistent-tree protocol, not our walk, no dirty flag removes it) — that's the whole 2.0x on the flat row",
  bushy_case: "sections → rows → a few nodes: a change in one row leaves every other section untouched — the 51x row",
  rule: "benchmarking anything that skips work needs a bushy case beside krausest's flat one or you measure your own optimization out of existence — both series live in reconcile.bench.ts, kept side by side",
}
§create_rows_read_min_not_p75 := {
  reason: "create/mount rows allocate hard enough that GC dominates",
  evidence: "same create-10k row: p75 12.4 / 16.5 / 15.8 / 14.6 ms across 4 runs, rme swinging ±5%..±85%, while min held 9.4-10.0 ms",
  ⟶ "p75 is not a signal on these rows, not comparable run to run — read min",
}
```

## Running the micro-bench

```sh
pnpm bench     # NODE_OPTIONS=--max-semi-space-size=64 vitest bench --run
```

Read **p75, not mean**, on `create 1000` / `create 10 000` / `replace all` — those
allocate thousands of fresh nodes per iteration, so one major GC drags mean and
max while p75 stays put. The rest is stable under ±3% rme.

The slot is faked with `installFabric()` from `@symbiote-native/test-utils`, the same
harness the engine's unit tests use. When adding a case, verify it produces a real
`completeRoot` with the expected `createNode` count — a bench that silently measures
a no-op commit reads as a fantastic result.

## The on-device seam

`readCommitProfile()` returns `{ commits, walkMs, nodesVisited }` and zeroes the
accumulator, so a sampler gets disjoint windows. It is **deliberately not gated
behind `isDebug()`**: two `performance.now()` calls per commit are noise next to
the walk they measure, and the number is only meaningful from a **release build**
(dev-mode JS drowns the signal — this is also why RN's own Fantom harness refuses
to benchmark a non-optimized build). The `dlog` beside it stays gated as usual and
carries `walk=N.NNNms`.

Reaching it from an example app requires the documented pack loop
(`<examples_vs_dot_examples>` in CLAUDE.md) — `pnpm pack` from `core/engine`, a
`file:` specifier, delete **both** `node_modules/@symbiote-native/engine` and
`package-lock.json`, `npm install`, then `pod install`. Verify by grepping the
installed `build/index.js`, never by trusting the install output.

`symbiote-devtools-inspector`'s Rozenite tree-sync panel pushes a full retained-tree snapshot
on every post-commit rather than diffing — deliberately not optimized against this skill's
numbers until a real perf problem is MEASURED on a large tree, not preemptively.

## The reasoning rule that saves the most time

**A per-adapter spread cannot be caused by code every adapter shares.**

Observed on the Canary `ParityDemo` sticky `SectionList`, same scenario across
examples: React drops 2 frames, Vue 1, Svelte 0. `reconcile` is one function
behind all four adapters, so it contributes the SAME term to each. Whatever
produces a 2/1/0 spread lives above the engine — in how much work the framework
does per state update (here: `VirtualizedList` churn per scroll frame).

The converse trap, equally important: this bounds the walk from ABOVE only.
"Svelte drops 0" means `walk + svelte_work <= 16.6 ms`; the walk could still be
12 ms of that. Three equations, four unknowns — underdetermined. Do not read
"does not explain the spread" as "is not worth fixing"; they are different claims.

## Three perf hypotheses, one session, and what killed each (2026-08-20)

Chasing Angular's ~3x on a 1000-row build. The order matters: each looked convincing when it was
picked, and only one survived to a shipped change — which itself bought nothing.

```
hypothesis                       killed by                       cost of finding out
ChangeDetectionStrategy.OnPush   headless counters, byte-         one measurement
                                 identical with and without
104 000 wasted setProp calls     device A/B after shipping the    a fix, a repack, a device run
(vs Solid's 12 000, 90 000 of    fix: every row within +-10%,
them writing undefined)          ms/commit back to 0.7
+33% engine nodes (12/row vs 9)  open — but the arithmetic is     -
                                 against it, see below
```

**A reduction in WORK is not a reduction in TIME, and the gap can be total.** Cutting 90 000 engine
calls to zero changed nothing measurable on Hermes. The calls were real waste and the fix stays —
104 000 calls to build a byte-identical Fabric tree is indefensible on its own terms — but it
explained none of the 3x. Report a work-count win as a work-count win; the time claim needs the
device, every time.

**Sanity-check the arithmetic BEFORE building the fix.** "+33% nodes causes 3x time" requires a
sharply superlinear cost, and none had been located. That check costs one minute and would have
demoted the suspect before anyone designed a counter for it. Ask what shape of curve the hypothesis
implies, then ask whether anything in the code has that shape.

**Design the probe to be able to refute.** The strongest form found here was SUBTRACTIVE and
in-place: rather than synthesising Angular's node tax inside a faster adapter (where the mechanism
differs and the headroom hides the effect), strip the composed components out of Angular's own row
so it retains 9 nodes instead of 12, behind a toggle so both numbers come from one build in one
session. Same framework, same binary, one variable.

## `ms/commit` at constant `nodes/commit` separates a code regression from a dirty environment

The single most useful diagnostic of the session, and it took seconds:

```
                    baseline    suspicious run    clean reinstall
nodes / commit           63              69            60
ms / commit             0.7             4.8           0.7
create 1000 rows     2383ms          5464ms        2161ms
```

The middle column looked like a catastrophic 2.3x regression from a just-installed engine change.
But the SAME work per commit taking 7x the time cannot be caused by a change that only ever removes
calls — no code edit makes a fixed amount of work intrinsically slower. It was a stale install; a
clean reinstall landed back on the baseline. Whenever a benchmark moves right after a package swap,
read the per-unit number first: if work-per-commit is flat and time-per-commit exploded, suspect the
environment, not the diff. Corollary: never compare a debug run against a release baseline — and
say which build produced a number when reporting it.

## Related paths that look like ours but are not

- Sticky headers have two paths: `sticky-native` (offset attached on the UI
  thread, JS never wakes) vs the `sticky-js` fallback (`Animated.event` on
  `onScroll`, JS every frame). Chosen by `isNativeAnimatedAvailable()` in
  `adapters/*/components/scroll-view/shared.ts`. Establish which one is live
  before attributing a scroll cost to the engine.
- RN's own `preventShadowTreeCommitExhaustion` flag (default **off** in 0.86) makes
  `ShadowTree::commit()` stop retrying after `MAX_COMMIT_ATTEMPTS_BEFORE_LOCKING`
  and take a recursive lock. Commit starvation needs CONCURRENT committers, so it
  is a weak suspect for us (no Reanimated), but rule it out before optimizing.

## Measured — on device, iOS 26.5 simulator, Hermes, 2026-08

```
§hermes_per_node_cost := {
  measured: "13.4 us/node — ~27x the desktop V8 figure (0.5 us/node, which had an optimizing JIT; Hermes is a bytecode interpreter with none)",
  rule: "never project desktop numbers onto a device by eye",
  ⟶ "16.6 ms / 13.4 us = ~1240 nodes burns one full frame (not the ~33 000 the desktop figure suggests)",
  observed: "a 1191-node screen, one commit, 16 ms walk = 3.2% of a 500 ms sampling window while otherwise idle — an ordinary screen reaches ~1200 nodes, one commit of it costs a whole frame before any framework work",
}
```

Device reproduces the micro-bench's predicted shape:

```
Select row      (1 row of 1000 changes)     180 ms
Partial update  (100 rows change)           275 ms
```

100x the real work, 1.5x the time — cost tracks tree size, not change size, on device
as headless. Absolutes are from a DEBUG build, inflated several-fold; only the ratio
transfers. Absolute device numbers require `npm run ios:release`.

## Measured — on device, RELEASE build, iOS 26.5 simulator, 2026-08-18

The absolutes. Everything above this line that says "device" is a DEBUG build and inflated
several-fold; these are the numbers to quote.

```
                              ALL MOUNTED     VIRTUALIZED      (Debug, all-mounted)
Create 1,000 rows                254.7 ms         45.6 ms          835.9 - 882.5 ms
Replace all 1,000 rows           229.1 ms         44.9 ms          852.6 - 870.2 ms
Partial update, every 10th        31.8 ms         11.1 ms          140.5 - 141.9 ms
Select row                         9.3 ms          9.5 ms           83.0 -  85.8 ms
Swap 2 rows                       35.4 ms         12.0 ms          112.0 - 113.6 ms
Remove row                       103.3 ms         24.1 ms           87.2 - 107.2 ms
Append 1,000 rows                345.9 ms         21.4 ms                   953.0 ms
Clear                              9.6 ms         16.7 ms                    21.6 ms
Create 10,000 rows              (not run)         50.8 ms           never completed
```

All-mounted figures are at ~2 000 rows = 17 991 native views (screen's own counter agrees with
`rows * 9`). Release is roughly 3-9x Debug; do not mix the two columns.

```
§select_row_decomposed := {
  180ms: "Debug, before dirty-marking",
  83ms: "Debug, after -> 2.2x from the engine change",
  9.3ms: "Release, after -> 8.9x from the build mode, 19x combined",
}
§headline_is_meter_not_table := {
  idle_meter: "ENGINE RECONCILE WALK 0.1% of window · 75 nodes/commit · 0.4 ms/commit; JS-THREAD FRAME RATE 60 fps",
  before: "same screen's walk was 96-98% of the JS window at 0 fps",
  ⟶ "walk is no longer the bottleneck; 75 nodes/commit is dirty-marking doing its job",
  what_still_costs: ["native view creation (Append 1 000 = 9 000 fresh views = 345.9 ms)", "flat-parent child-set re-append (Fabric persistent-tree protocol)"],
  evidence: "Select row 9.3 ms (props-only clone, children array identical) vs Remove row 103.3 ms / Swap 2 rows 35.4 ms (structural — parent re-clones + re-appends every child handle)",
  open: "further wins are app-level (virtualize) or need a different Fabric API — NOT more work on the walk",
}
```

## Measured — Vue SFC, on device, DEBUG build, iOS 26.5 simulator, 2026-08-18

Taken with the CURRENT screen (engine post-commit stopwatch), so these ARE comparable to any other
flavor measured the same way — and are NOT comparable to the React Debug column further down,
which used the old `useLayoutEffect` stopwatch.

```
                              ALL MOUNTED     VIRTUALIZED
Create 1,000 rows               1122.8 ms        139.0 ms
Replace all 1,000 rows          1224.1 ms        157.7 ms
Partial update, every 10th       101.1 ms         19.7 ms
Select row                        66.2 ms         13.0 ms
Swap 2 rows                       71.6 ms         22.6 ms
Remove row                        70.1 ms         23.8 ms
Append 1,000 rows               1377.6 ms         29.1 ms
Clear                           (not run)        196.4 ms
Create 10,000 rows              (not run)        167.8 ms

meter, idle    1.4 % of window  ·  59 nodes/commit  ·  7.2 ms/commit  ·  60 fps
```

```
§vue_comparability_check := {
  passed: "screen reported rows: 1999 · 17991 native views mounted, 1999*9 = 17991 exactly ⟶ INVARIANT 2 holds on device for Vue, same ruler as React",
  nodes_per_commit: "59 (Vue) vs 75 (React) — same order of magnitude, expected: engine shared, only commit count per framework's reactivity differs",
}
§vue_clear_anomaly := {
  observed: "virtualized Clear = 196.4 ms > Create 10,000 = 167.8 ms on same column, vs React Release Clear = 16.7 ms",
  status: "NOT yet a finding — 3-9x Debug/Release gap explains some of it, tearing down 11 000 rows of reactive state is a plausible Vue-specific cost",
  open: "do not act until same build mode measured on both sides",
}
```

## Measured — Svelte, on device, DEBUG build, iOS 26.5 simulator, 2026-08-18

Same screen, same engine post-commit stopwatch, same build mode as the Vue column above — so
Svelte and Vue ARE directly comparable to each other, and neither is comparable to React's
Release column.

```
                              ALL MOUNTED     VIRTUALIZED
Create 1,000 rows                875.3 ms        251.1 ms
Replace all 1,000 rows          1008.3 ms        130.4 ms
Partial update, every 10th        83.0 ms         18.4 ms
Select row                        64.0 ms         20.5 ms
Swap 2 rows                       67.2 ms         12.6 ms
Remove row                        68.9 ms         29.7 ms
Append 1,000 rows                989.5 ms         35.1 ms
Clear                           (not run)        222.5 ms
Create 10,000 rows              (not run)        304.2 ms

meter, idle    0.4 % of window  ·  56 nodes/commit  ·  2.3 ms/commit  ·  60 fps
```

```
§svelte_beats_vue_all_mounted := {
  measured: "1.2-1.4x faster than Vue on every all-mounted row (Create 875 vs 1123, Replace 1008 vs 1224, Append 990 vs 1378, Partial 83 vs 101)",
  why: "meter: 2.3 ms/commit (Svelte) vs 7.2 ms/commit (Vue), near-identical 56 vs 59 nodes/commit — same node count, 1/3 the time ⟶ spread is NOT the engine walk (shared code, same input size), it is per-framework commit overhead",
  cross_check: "nodes/commit 56 (Svelte) · 59 (Vue) · 75 (React), same screen — engine does same work under all three, only commit COUNT + overhead vary",
}
§ruler_weakness_press_order := {
  bug: "VIRTUALIZED column is press-order dependent, spec does not pin order — each op's cost includes tearing down whatever was on screen when pressed",
  example: "Svelte virtualized Create 1,000 = 251.1 ms > Vue's 139.0 ms (inverts the all-mounted verdict); screen reported rows: 11000, i.e. that press followed Create 10,000, so it measured teardown-of-11000 + create-of-1000, not create",
  correction: "NOT confined to the virtualized column as first assumed — hits any row whose cost scales with current row count, in either column (see press_order_changes_the_structural_rows below for the fix scope)",
}
§svelte_sticky_path_a_correct := {
  observed: "pinned SECTION 77 sits directly above row 77.1/77.2/77.3 — React and Vue agree",
  ⟶ "three adapters correct on shared buildListPlan.stickyChildPositions output makes the Angular mismatch an Angular-projection defect, not a bug in the shared sticky plan",
}
```

The Angular-side investigation of that mismatch — two O(N) projection fan-outs, three falsified
fix attempts, device fps per adapter — is `angular-adapter` skill §21; its change-detection root
cause (CheckAlways vs SignalView, `markForCheck()` cost) is `angular-adapter-change-detection`
§5/§13-§15a — both layer Angular-specific probes on top of the general method here.

## Measured — React, on device, DEBUG build, iOS 26.5 simulator, 2026-08-18

Re-taken with the CURRENT screen so React finally sits in the same column as Vue and Svelte. The
older React Debug figures scattered above this file used the `useLayoutEffect` stopwatch and are
superseded by these.

```
                              ALL MOUNTED     VIRTUALIZED
Create 1,000 rows                839.8 ms        105.8 ms
Replace all 1,000 rows           832.0 ms        108.0 ms
Partial update, every 10th       135.9 ms         39.6 ms
Select row                        82.4 ms         32.0 ms
Swap 2 rows                      114.8 ms         21.6 ms
Remove row                       418.6 ms         68.0 ms
Append 1,000 rows               1678.0 ms         78.4 ms
Clear                           (not run)         50.6 ms
Create 10,000 rows              (not run)        118.4 ms

meter, idle    0.4 % of window  ·  75 nodes/commit  ·  1.9 ms/commit  ·  60 fps
```

## The three-adapter comparison, DEBUG, all-mounted, same ruler

```
                            React      Vue     Svelte
Create 1,000 rows           839.8   1122.8      875.3
Replace all 1,000 rows      832.0   1224.1     1008.3
Partial update, every 10th  135.9    101.1       83.0
Select row                   82.4     66.2       64.0
Swap 2 rows                 114.8     71.6       67.2
Remove row                  418.6     70.1       68.9   <- see the ordering caveat below
Append 1,000 rows          1678.0   1377.6      989.5   <- see the ordering caveat below

meter   ms / commit           1.9      7.2        2.3
        nodes / commit         75       59         56
```

`nodes/commit` landing at 75 / 59 / 56 across three independent frameworks is the check that the
ruler is one ruler: the engine gets the same amount of work under all three, and only how many
commits each reactivity system emits, and what it costs around each, varies. `ms/commit` — React
1.9, Svelte 2.3, Vue 7.2 — is where the real adapter spread lives.

<press_order_changes_the_structural_rows>

```
§press_order_regression := {
  bug: "two runs of the SAME adapter, same build, same screen differ up to 4x on structural ops — screen does not pin button-press order; Remove/Append cost scales with current row count (flat parent re-appends every child handle on structural change)",
  measured: "React Debug, old run -> new run — Create 1,000: 835.9-882.5 -> 839.8 (reproduced); Replace all 1,000: 852.6-870.2 -> 832.0 (reproduced); Partial, every 10th: 140.5-141.9 -> 135.9 (reproduced); Select row: 83.0-85.8 -> 82.4 (reproduced); Swap 2 rows: 112.0-113.6 -> 114.8 (reproduced); Remove row: 87.2-107.2 -> 418.6 (NO — 4x); Append 1,000 rows: 953.0 -> 1678.0 (NO — 1.8x)",
  root_cause: "5 rows reproduce inside 1-3%; the 2 that don't are exactly the ones whose cost depends on current row count — run ended at rows: 1999, i.e. an Append had already grown the list before they were pressed",
  scope: "hits the ALL-MOUNTED column too, not just virtualized — broader than the Svelte section's virtualized-only note assumed",
  rule: "compare adapters only on reproducible rows (Create, Replace, Partial, Select, Swap) plus the meter; a cross-adapter gap on Remove/Append is not evidence until order is pinned — React 418.6 vs Svelte 68.9 above is most likely an ordering artifact, NOT a React defect, do not investigate it",
  open: "fix = screen drives a fixed operation sequence from a known state (reset to N rows before each timed op) — a ruler-contract change in benchmark-screen-spec.md that must land in all five flavors at once or it becomes drift",
}
```

</press_order_changes_the_structural_rows>

## krausest's OPERATIONS transfer to native. Its SCALE does not.

Take the operation list verbatim — create/replace/partial-update/select/swap/remove is
the right vocabulary and keeps our numbers comparable. Do **not** take the row counts.

krausest is a _web_ benchmark. 10 000 rows there is 10 000 DOM nodes: heavy, but a
browser does it. On a native host the same JSX is a different animal. Measured
2026-08-18, `examples/react` BenchmarkScreen:

```
BenchmarkRow  = View + (Text+RawText) x3 + Pressable-View x2  =  9 native nodes
10 000 rows   = 90 000 native views, unvirtualized, in a plain ScrollView
observed      = RAM climbing 2.1 -> 2.5 -> 2.8 GB, JS thread 0 fps, never completed
                (~31 KB per view = ShadowNode + props + UIView + CALayer. Nothing
                leaked; the mount was simply still running.)
```

```
§ram_growth_diagnosis_rule := {
  rule: "monotonically growing RAM separates the two diagnoses — a finite workload allocates a bounded amount and stops; growth over minutes means a loop or a workload that cannot finish, distinguishable before touching a profiler by counting the native nodes the JSX expands to and multiplying",
  evidence: "1 000 rows (9 000 views) completed in 882 ms — 10 000 was never 10x, it was off the cliff",
  ⟶ "no RN app mounts 90 000 views (RN's answer is FlatList/VirtualizedList) — a 10k row count measures the absence of virtualization, not the engine",
}
```

**Do not assert "that ceiling is the platform's, not ours" — the screen is built to
measure it.** BenchmarkScreen carries a MOUNT MODE toggle (`bench-mount-mode`): the same
rows and the same operations, differing only in how many rows are mounted at once.

```
ALL MOUNTED    rows.map into a ScrollView - krausest's own shape. The only mode whose
               numbers compare to the published web ones, and the only one that dies.
VIRTUALIZED    FlatList with getItemLayout - what a real app ships. Row count stops
               deciding how many views exist, so a create measures the WINDOW plus the
               list's bookkeeping, NOT N rows of commit. Say so when quoting it.
```

### Measured both ways — iOS 26.5 simulator, Debug, 2026-08-18

```
§stopwatch_caveat := {
  warning: "do not put these numbers beside ones taken later",
  cause: "timed with the screen's ORIGINAL stopwatch (React's useLayoutEffect); the screen now stops in the engine's registerPostCommit, which fires EARLIER — inside commitContainer right after completeRoot, vs useLayoutEffect only after React's whole commit phase returns, non-trivial work on a 2 000-row list",
  ⟶ "every figure below is systematically LARGER than the same op measured today — comparing a pre-2026-08-18 column against a later one measures the stopwatch, not the adapter. Re-measure both sides with the current screen before comparing flavors",
}
```

```
                            ALL MOUNTED (2 runs)      VIRTUALIZED
Create 1,000 rows            882.5 / 835.9 ms            116.0 ms
Replace all 1,000 rows       870.2 / 852.6 ms            124.4 ms
Partial update, every 10th   141.9 / 140.5 ms             33.8 ms
Select row                    85.8 /  83.0 ms             31.7 ms
Swap 2 rows                  113.6 / 112.0 ms             24.5 ms
Remove row                   107.2 /  87.2 ms             33.5 ms
Append 1,000 (1k -> 2k)              953.0 ms             35.3 ms
Clear                                 21.6 ms                  -
Create 10,000 rows            never completed             126.3 ms
RAM / JS thread              2.8 GB / 0 fps          331 MB / 60 fps
```

```
§row_count_is_nearly_free := {
  measured: "Create 1,000 = 116.0 ms, Create 10,000 = 126.3 ms — the two all-mounted runs are independent presses, agree within a few percent (repeatable, not samples)",
  ⟶ "10x the rows for 1.09x the time: row COUNT is nearly free, the wall was mounting and nothing else — 10 000 rows is comfortably achievable, 90 000 simultaneous native views is not",
  comparability: "the two columns are NOT comparable to each other (virtualized mounts a window, does far less work by design) — compare only within a column; only ALL MOUNTED may be read next to krausest's published web numbers",
  virtualized_caveat: "figures time the FIRST window only — useLayoutEffect stops the clock after that commit's completeRoot, list fills the rest asynchronously; honest as time-to-first-frame, not settled-list",
}
§side_findings := {
  cost_tracks_mounted_not_touched: "virtualized Partial update (33.8 ms, touches 1 100 rows) and Select row (31.7 ms, touches one) converge — same shape the micro-bench predicted",
  creation_dwarfs_teardown: "all-mounted Append 1,000 (+9 000 views) = 953.0 ms vs Clear (-18 000 views) = 21.6 ms — same story as the 10k wall; caveat: Clear times only the JS side, native unmount happens after completeRoot",
  ladder: "Create 1,000 then Append 1,000 repeatedly locates the mounting wall precisely; history rows record each measurement against its own rowCount",
  wall_is_hosts: "every view created by stock Fabric C++ via RCTComponentViewRegistry (native_core_is_untouched) — engine's whole contribution is calling createNode; React's own renderer hits the same wall",
}
```

## Measure at realistic scale, or you measure nothing

```
§stickyheaderindices_quadratic_crash := {
  bug: "first stickyHeaderIndices workload in an example app crashed iOS within seconds — shipped, passed every test, never run in a real app (grep + git log: zero uses across examples/)",
  root_cause: "adapters/react/.../scroll-view/shared.ts bumped parent state on every header's onLayout, re-rendering all N children per header — quadratic; RN instead pushes the value into the predecessor imperatively through a ref (ScrollView.js:1136-1141) and never re-renders",
  scale_dependence: "3-header Canary screen never showed it; 200-header benchmark screen died — quadratic defects need scale to surface",
  native_symptom: "RCTComponentViewRegistry: Attempt to dequeue already registered component — names nothing relevant",
  how_found: "JS error text absent from both .ips and os_log; only in `xcrun simctl spawn <device> log show --predicate 'process == \"Canary\"'` — reach for that log first on any release-build SIGABRT",
}
§logbox_destroys_its_own_error_trap := {
  root_cause: "the registry abort is LogBox reporting the bug, not the bug — a JS error mounts LogBox's own surface into Fabric, that mount trips the same RCTComponentViewRegistry abort, and the process dies while rendering the error, taking RN DevTools with it: the message is destroyed by the thing displaying it, and every later logging layer dies with the process",
  fix: "keep LogBox off screen, swallow the report yourself — at the top of the app entry, above registerApp",
  verified: "this is how 'Maximum update depth exceeded' was finally read, after two failed attempts at capturing it any other way",
  scope: "temporary scaffolding — put back rather than reinventing; remove only once the device run is green, never mid measurement-session",
}
```

```js
LogBox.ignoreAllLogs(true);
const reported = new Set();
globalThis.ErrorUtils?.setGlobalHandler?.(error => {
  const message = String(error?.message ?? error);
  if (reported.has(message)) return; // an update loop rethrows forever and buries its own stack
  reported.add(message);
  console.error(
    '[trap]',
    message,
    '\n',
    String(error?.componentStack ?? error?.stack ?? ''),
  );
});
```

Lessons: a component is unverified until it runs at the scale it claims to support; a
bisect on ONE parameter (200 → 5 sections) separated "structural bug" from "scale bug" in
a single reload, after two static-analysis hypotheses had already been formed and killed.

## The anchor census — measured 2026-08-20, and it closes a suspect rather than opening one

Third instrument, added when Angular's benchmark create looked ~3x slower than the others while its
point operations were normal. Two halves, both permanent and both release-build-safe:

```
core/engine/src/commit.ts   readCommitProfile() gains childScans / childScanProbed /
                            childFlattens / childFlattenProbed / childFlattenWidest
                            — what renderableChildren costs over the window
core/engine/src/node.ts     censusRetainedTree(roots) -> nodes / anchors / emptyRawTexts /
                            renderable / flattenWidths (widest first)
adapters/*/src/anchor-flatten-cost.test.*   one per adapter: the canary BenchmarkRow x1000
                            through each REAL reconciler, numbers via dlog (DEBUG=1)
```

Same list, same row, 1000 rows, five real reconcilers:

```
adapter    nodes  anchors  renderable  nodes/row  flatten sites  widths
react       9001        0        9001       9.00              0  -
solid       9001        0        9001       9.00              0  -
vue         9003        2        9001       9.00              1  [1002]
angular    12002     3001        9001      12.00           1001  [1001, 3, 3, 3, ...]
svelte     13004     4002        9002       13.00           3002  [1001, 5, 5, 5, ...]
```

```
§anchor_count_is_an_adapter_property := {
  react_solid: "a component is a function returning children — zero nodes",
  vue: "components free, but a v-for FRAGMENT costs 2 anchors, wherever it appears",
  angular: "one host element per composed component INSTANCE — 3/row here (row + 2 Pressables)",
  svelte: "TWO anchors per composed component with a render tag, +2 per each-block — 4/row",
  ⟶ "grepping adapter sources for 'anchor' (4/17/26/15/292 for react/vue/svelte/solid/angular) ranks them WRONG: it measures how much each adapter talks about anchors, not how many it builds",
}
```

Per operation, `childScans` / `childFlattens` / widest flatten:

```
op        react        solid        vue          angular        svelte
create    9002/0/0     9002/0/0     9004/1/1002  12003/1001/1001  13005/3002/1001
select       3/0/0        3/0/0        5/1/1002   1006/   2/1001      8/   3/1001
partial    403/0/0      902/0/0      404/1/1002   1603/ 101/1001    705/ 202/1001
append    9003/0/0     9002/0/0     9004/1/2002  13003/1001/2001  13005/3002/2001
```

```
§anchors_do_not_explain_the_create_gap := {
  hypothesis: "Angular's anchors defeat renderableChildren's fast path on the 1000-wide list, so every reconcile pays an O(children) scan + a fresh array + recursion",
  true_part: "defeated, yes — the list flattens on EVERY operation, over 1001 children",
  falsifier_1: "commits = 1 for every adapter on every op. The wide flatten happens ONCE per commit, not once per child reconcile — there is no quadratic term to find",
  falsifier_2: "nodesVisited is 9002 for ALL FIVE on create. Anchors are flattened out before reconcile, so the walk does identical work under every adapter — the engine cannot be the source of a per-adapter create gap (the reasoning rule above, now measured rather than argued)",
  falsifier_3: "SVELTE pays more of this than Angular — 4002 anchors, 3002 flatten sites, 13005 scans vs 12003 — and is the FASTEST adapter on the device table above (Create 875 ms vs React 840 / Vue 1123)",
  ⟶ "SUSPECT CLOSED. Angular's create cost is above the engine: template instantiation, directive machinery, change detection. Look at angular-adapter §21 / angular-adapter-change-detection, not at commit.ts",
}
§why_no_fix_landed := {
  a_skipped_child_counter: "would make the probe O(1) — saves ~9-11k predicate evaluations per create. But it helps the adapters with NO anchors (they pay only the probe) and barely helps Angular (which still pays the flatten, the recursion and the array), i.e. it widens the very gap it was meant to close. Costs a new mutable field on the hot ISymbioteNode shape — the exact thing ANCHOR_COMPONENT's sentinel-name design avoided — and its drift failure mode is a silent wrong render",
  b_memoized_flat_list: "kills probe+flatten+recursion, but the cache must also invalidate on a structural change inside any ANCHOR descendant; bubbling a structure version through anchors breaks markDirty's stop-at-first-dirty, and re-validating each anchor is O(anchors) again — no better for the only tree that needs it",
  c_remove_angular_anchors: "checked, structural. Renderer2.createElement is the only seam and must return a node Angular can appendChild into and use as parentNode for the component's own template; LView[HOST] cannot be empty. anchor-host-registry.ts already does the only thing available — stop it painting",
  d_taken: "instrument, close the suspect, change nothing. The scans are wide (1001) but happen once per commit, and the adapter that pays most is the fastest",
  honest_cost_of_the_instrument: "+2 integer increments per renderableChildren call, +3 more per flatten (~24k per Angular create). Same un-gated style as propStats, for the same reason",
}
```

Two harness traps this cost a round each:

- **An app-authored Angular component must `registerComposedComponent(selector)` in the test**, as
  the babel-register-composed plugin does for the real app. Without it the row's host falls through
  to a real `createNode`: the row measured TEN native views instead of nine and one of its three
  anchors showed up as a painted view — a different tree, quietly.
- **Vitest cannot import `@symbiote-native/svelte`'s components** — they are `.svelte` files and no
  svelte plugin is wired into `vitest.config.ts`. Svelte's column composes a local Pressable stub
  over the raw `symbiote-view` host tag instead; same node count, same composition depth.

A `core/*` change is invisible to `examples/*` until the pack loop runs, so none of this is on
device yet — the counters only reach a canary's meter after `pnpm pack` + reinstall + `pod install`.

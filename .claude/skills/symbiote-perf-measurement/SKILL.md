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

## Measured — desktop V8, same host, 2026-08-22 (the props/identity split)

Two changes landed together on `core/engine`, and they are worth reading side by side because one
of them is the cautionary tale and the other is the result.

**`propsDirty` (the clone-bubble fast lane).** `dirty` answered two questions; splitting off "did
THIS node's own props change" lets reconcile reuse the committed payload by reference instead of
rebuilding it with `fabricProps()` and deep-comparing. Real work removed — and far less of it than
intended:

```
one prop changed        visited   propsBuilt   propsReused     (propsBuilt+propsReused = the old
flat 10 000 nodes        10 002        1            2           number of rebuild+deep-compare)
sectioned 244 sections      260        1            5
```

**2 nodes on a flat tree, 5 on a screen — not "most of the walk".** Every other visited node takes
the EARLIER early exit and never reached the props code at all: dirty-marking had already taken
that win in August. Wall-clock sits inside this host's noise. Counters assert the change; no time
claim is made for it.

```
§count_the_population_before_building_the_fix := {
  mistake: "designed a fast lane for 'most of the visited nodes' without ever counting how many nodes reached the code it optimizes",
  cost: "a full implement + test + mutation-test + A/B cycle to learn the population was 2-5",
  ⟶ "the counter that answered it was ~10 lines and could have run FIRST — same shape as the arithmetic sanity check in the three-hypotheses section above, applied to POPULATION rather than to curve shape",
}
```

**`mirror` WeakMap → a `committed` field on the node.** Framed as architectural honesty (see
`symbiote-engine-core` §3 — it is what makes "the engine builds its own second tree" factually
wrong), it turned out to be the change that MOVED. `reconcile` did `mirror.get(node)` for every
node it visited — including all the early exits — so the lookup was the per-visited-node cost.

A/B interleaved across two rounds to defeat host drift (see the caveat below — this matters):

```
                                          field: min / p75        WeakMap: min / p75      delta
1 prop, flat 10 000 (visited 10 002)   3.925/4.065 3.877/4.136  4.546/4.772 4.399/4.682   -12..14%
1 prop, flat 2 000  (visited  2 002)   0.744/0.860 0.738/0.829  0.796/0.916 0.791/0.921    -7..10%
1 prop, 10 005 / 244 sections (260)    0.112/0.126 0.110/0.138  0.110/0.126 0.111/0.125     none
1 prop, flat 100 / 500                                                                      none
no-op commit, 9 761 nodes (visited 3)  0.0018      0.0018       0.0018      0.0018          none
```

`min` ranges do not overlap on the two rows that moved, both rounds agree, and — the part that
makes it a finding rather than a number — **the effect appears exactly where visits are many and
vanishes where they are few**, scaling as ~35 ns/node at 2 000 and ~58 ns/node at 10 000, which is
the right order for a V8 WeakMap lookup. Hypothesis predicted a per-visited-node saving; the
measurement is a per-visited-node saving.

Scope, stated so nobody over-quotes it: a bushy screen shows NOTHING here, because dirty-marking
already holds its visits at 260 of 10 005. The win lands on WIDE child sets — which is the
`Append 1 000 rows` / `Remove row` structural shape that is still the expensive one on device. Not
carried to a device yet; Hermes' WeakMap-vs-property ratio is unmeasured, do not assume this one.

```
§interleave_ab_or_measure_the_host := {
  measured: "two BEFORE runs of IDENTICAL code, back to back, differed by +6..11% on four bench rows with ±1% rme each",
  ⟶ "a single before/after pair on this host cannot resolve anything under ~15%; the first such pair read as a 15% REGRESSION and was pure drift",
  method: "toggle the diff with git stash and interleave A/B/A/B in one session; trust a row only when both rounds agree AND the min ranges do not overlap",
  corollary: "rme is within-run scatter and says NOTHING about between-run drift — a tight rme on both sides is exactly how a drift artifact disguises itself",
}
```

## The app-shaped series, and what counting first saved (2026-08-22)

Neither series above is what a shipping app does per frame. krausest's flat table asks "how much
does ONE huge commit cost"; an app asks "how much does a STREAM of small commits cost while 60 of
them must fit in 16.6 ms". `reconcile.bench.ts` now carries a third series built for that question:
a navigation stack that leaves previous screens MOUNTED, windowed lists, and animation frames as
the unit of work.

It was built to price a proposed optimisation (skip recursing into clean children, "2b") and it
killed it outright. The census, one commit each, 20 warmup commits, steady state:

```
shape / dynamics                      nodes   visited  early  built reused  append  us/commit
 4 screens x 20 rows | anim x1          748         9      5    1.0    3.0       7      16.5
12 screens x 20 rows | anim x1        2 244        17     13    1.0    3.0      15       8.9
32 screens x 20 rows | anim x1        5 984        37     33    1.0    3.0      35      24.1
12 screens x 60 rows | anim x1        6 564        17     13    1.0    3.0      15       8.3
32 screens x 60 rows | anim x1       17 504        37     33    1.0    3.0      35      25.3
32 screens x 60 rows | anim x5       17 504       122    108    5.0    9.0     116      51.7
32 screens x 60 rows | anim x5 sep.  17 504        89     83    1.0    4.6      87      41.9  (x5/frame)
32 screens x 60 rows | window step   17 504        96     92    0.0    4.0      95      38.5
```

```
§visited_does_not_scale_with_tree_size := {
  measured: "17 504 nodes, one animation frame, 37 nodes visited — and 748 nodes visits 9",
  cause: "visited tracks the SIBLING COUNT along the path from root to the changed node, not the tree; dirty-marking prunes every untouched screen whole",
  ⟶ "the '10 002 visited' figure the flat bench produces is a property of an unvirtualized 10 000-child parent, i.e. of the absence of a FlatList — not of a large app",
  killed: "'2b: stop recursing into clean children'. Its population is 13-108 per commit, not thousands, and the whole walk is 0.1-0.4% of a frame on desktop V8",
}
§early_exits_pair_1_to_1_with_appendChild := {
  measured: "early=108 / append=116 · early=33 / append=35 · early=92 / append=95, every shape",
  ⟶ "for each JS early-exit an optimisation could remove there is ~one appendChild JSI call it CANNOT — the parent re-appends every child handle by protocol",
  rule: "before optimizing the JS half of the walk, check what the protocol half costs beside it; here they are the same count and only one of them crosses JSI",
}
```

### What the same fixture DID find: one commit per animated leaf

The JS-driven Animated path commits **once per animated leaf per frame** — `flushValue` collects
leaves, each `update()` calls `setNativeProps`, and `setNativeProps` calls `commitContainer`
synchronously (`commit.ts`). So N concurrent animations that cannot use the native driver pay N
full walks from the root container, where one walk would do.

Bench, p75, 32 screens x 60 rows:

```
5 animated values, ONE commit          0.0553 ms/frame
5 animated values, a commit EACH       0.0429 ms x 5 = 0.2145 ms/frame     3.9x
1 animated value                       0.0171 ms
windowed list steps one row            0.0399 ms
```

Confirmed by the counters rather than inferred: 5 x 89 = 445 visits/frame separate vs 122 batched.

Desktop V8 puts that at 1.3% vs 0.33% of a frame. **Do NOT quote a device figure from it** — the
rule against projecting by eye holds, and the only measured Hermes/V8 ratio here (13.4 vs 0.5
us/node on the WALK, pre-dirty-marking) is not this workload. What transfers is the RATIO, 3.9x,
and the mechanism.

Scope before anyone acts on it: this is the JS-driven tier only. `useNativeDriver` animations never
enter JS per frame, so the finding bites exactly the animations that cannot use it — layout props,
JS-computed values.

### …and then RN's own source said the batching is the wrong fix

**Do not build the batching scope. Read this first.** Checked against `react-native@0.86.0` the same
day: on Fabric, RN does **not commit per animation frame at all**. Its decision tree lives in
`src/private/animated/createAnimatedPropsHook.js:127-190`, and the branch that ships is the last one:

```js
// This is a Fabric instance and setNativeProps is supported.
instance.setNativeProps(node.__getAnimatedValue());     // direct native write, NO commit
…
// React commit is not fast enough to drive animations. This is where setNativeProps comes in
// handy but the state between Fiber tree and Shadow tree needs to be kept in sync.
// The goal is to call `scheduleUpdate` as little as possible … Debounce is set to 48ms, which
// is 3 * the duration of a frame. 3 frames was the highest value where flickering was not observed.
timerRef.current = setTimeout(() => scheduleUpdate(), 48);
```

`instance.setNativeProps` is `ReactNativeElement.setNativeProps` →
`NativeDOM.setNativeProps(node, updatePayload)`, where `NativeDOM` is the **TurboModule
`'NativeDOMCxx'`**, not `global.nativeFabricUIManager` — though `Libraries/ReactNative/FabricUIManager.js`
still declares `setNativeProps` on the UIManager Spec too, so there are two candidate routes and
**which one is live must be proven on device** (`<native_module_name_is_platform_specific>`: a
headless fake resolves any name). The gate is `shouldUseSetNativePropsInFabric`, and its default is
**`true`** — this is RN's normal path, not an opt-in.

So RN commits **once per 48 ms**; we commit **once per animated leaf per frame**. That is 60x more
commits per animation, not the 3.9x the batching row prices, and it means the batching finding is a
3.9x win on the wrong axis. Our `IFabricSlot` (`core/engine/src/fabric.ts`) does not declare
`setNativeProps` at all — the capability was never wired, not evaluated and rejected.

What makes this a design task rather than a one-liner, and what to settle before writing code:

- **Payload filtering.** RN runs `createAttributePayload(props, viewConfig.validAttributes)` before
  the native call. We have the ViewConfig machinery (`registry.ts` / `view-config.ts`) but the
  equivalent filtering does not exist on this path.
- **The resync, which is a DIFFERENT divergence for us.** RN debounces because its Fiber tree does
  not know about the animated props. Our `setNativeProps` writes `node.props`, so our retained tree
  stays truthful — what would go stale is `node.committed.props` versus what Fabric actually holds.
  That is precisely the condition `warnIfStale` reports as `DIRTY-MISS`. Decide explicitly whether a
  direct write updates the committed record, marks `propsDirty`, or neither; each choice trades a
  redundant re-send against a stale mirror, and the wrong one is silent.
- **The synchronous contract.** A caller today reads the committed result on the next line and
  `dirty-marking.test.ts` does exactly that. Whatever replaces the commit must keep that observable
  or change the test deliberately.

### Built instead: a targeted commit — and it makes the batching question mostly moot

Reading RN's C++ settled the design. `UIManager::setNativeProps_DEPRECATED`
(`ReactCommon/react/renderer/uimanager/UIManager.cpp:438`) is NOT a free direct write: it stores the
payload on the `ShadowNodeFamily` and then commits — `shadowTree.commit(cloneTree(family, …))`,
cloning the path to one family in C++. And `ShadowNode::clone` re-applies those props on every later
clone, overriding React's (`UIManager.cpp:146`), so the value is STICKY and a declarative write of
the same prop can never win again. Hence `_DEPRECATED`.

So the cost RN avoids is not "a commit", it is "a commit that walks down from the root in JS" — and
our semantics are the cleaner ones. `commitTargeted` (see `symbiote-engine-core` §4a) does the same
shape in JS: clone the node, clone the ancestor chain, reuse every sibling handle off its committed
record. `setNativeProps` routes through it.

```
32 screens x 60 rows (~17 504 nodes), p75      min      rme
1 animated value, general commit    0.0179   0.0159   ±1.67%
1 animated value, targeted          0.0040   0.0031   ±2.18%     4.5x
```

Counters agree with the mechanism: 37 visits → 5.

```
§that_bench_row_understated_the_targeted_path := {
  error: "concluded from it that batching the animation flush was obsolete, because 5 x 0.0040 beat 0.0542",
  cause: "the bench row animates a HEADER TITLE — nothing wide on its ancestor chain. Cloning an ancestor means re-appending every one of its children, so the cost of a targeted commit is set by how many children the ancestors HAVE, not by the chain's length",
  measured: "same fixture, same targeted path: header title = 4 clones / 35 appends per frame; a list row leaf under a 60-row content view = 6 clones / 98 appends. 2.8x, from the target's position alone",
  ⟶ "a per-frame cost measured on ONE target is not the path's cost. Pick the target from the app, not from the fixture's convenience",
}
```

## The dirty-set census, and where Fabric work is actually recoverable (2026-08-22)

Counted per commit on the app-shaped fixture, before the commit clears the flags: how many nodes
are dirty, the UNION of their ancestor chains, and the Fabric calls that follow.

```
32 screens x 60 rows (17 440 nodes)   dirty  chainUnion  visited  clone  append  completeRoot
1 prop, 1 node                            1           6      102      6     100        1
5 props, same screen                      5          14      126     14     120        1
5 props, 5 different screens              5          26      378     26     372        1
every 10th row of the top list            6          16      132     16     125        1
windowed step (structural)                1           4      104      4     103        1  (+9 create)
whole top screen re-props                60         124      456    124     395        1
5 props, five SEPARATE commits            -           -      510     30     500        5
```

Three findings, and they point in different directions.

```
§the_general_commit_is_already_clone_optimal := {
  measured: "clone === chainUnion EXACTLY, in every row: 6/6, 14/14, 26/26, 16/16, 124/124",
  ⟶ "within one commit there is no redundant cloning to remove — dirty-marking plus the reuse path already collapse N overlapping chains into their union",
  kills: "'merge the ancestor chains of N dirty nodes' as a Fabric-call optimisation; the walk already does it. It remains a JS-walk optimisation only",
}
§append_is_the_floor_and_it_dominates := {
  measured: "1 prop on 17 440 nodes: 6 clones, 100 appends — 94% of the Fabric calls",
  cause: "cloning an ancestor produces an empty child list; every child handle is re-appended. content has 60 rows, the container has 32 screens",
  ⟶ "pure protocol. No JS-side optimisation touches it, and any claim of speeding up 'Fabric work' that does not name the commit COUNT is wrong",
}
§the_commit_count_multiplies_that_floor := {
  measured: "the same five writes: ONE commit = 14 clones / 120 appends / 1 completeRoot; FIVE commits = 30 / 500 / 5",
  ⟶ "4.2x the appends, 2.1x the clones, 5x the completeRoot — REAL Fabric work, and the only axis on which it is recoverable",
  who_pays_it: "the JS-driven Animated flush, which commits once per animated leaf per frame (flushValue -> update() -> setNativeProps)",
}
```

So the corrected priority, replacing the one recorded above:

1. **Batch the animation flush.** ~4.5x fewer Fabric calls for N concurrent JS-driven animations
   (5 x (6 clone + 98 append) separate, against 14 + 110 batched). This is the only remaining item
   that reduces NATIVE work rather than JS work. Blocked on a contract question, not a design one:
   `setNativeProps` is synchronously observable today and `dirty-marking.test.ts` relies on it, so it
   needs an explicit batching scope around the frame flush — beside the `flushSuspendDepth`
   mechanism `animated/graph.ts` already has for composite/colour channels.
2. **An aware commit** (the engine accumulating its own dirty set instead of rediscovering it):
   visits 102 -> 6 for a single change on a 17 440-node app. Worth up to about half the total work,
   since visits and Fabric calls sit at roughly 1:1 today — and by §the_general_commit_is_already_-
   clone_optimal it buys nothing on the Fabric side. Population is small (1-6 dirty nodes in every
   realistic scenario, 60 when a whole screen re-renders), so a set is cheap to hold.
3. **Nothing else.** `append` is the floor and it is 89-94% of a commit's native calls.

```
§the_oracle_pattern := {
  problem: "a targeted algorithm and the general one emit the same Fabric tree when the targeted one is right, and NOTHING is red when it is wrong",
  oracle: "after a targeted commit, run the GENERAL commit and assert it does nothing — zero clones, zero completeRoot",
  why_it_works: "the general path is the reference implementation; anything the targeted one missed is work the reference still finds",
  caught: ["an ancestor's child set rebuilt from a STALE committed snapshot, so a sibling added since the last commit never reached Fabric", "a non-atomic bail that mutated the committed record and cleared dirty flags before failing, leaving the fallback to commit an orphan handle"],
  ⟶ "neither was visible to tsc, to a value assertion, or to any other test in the suite",
}
```

Not measured on device. What transfers is the ratio and the mechanism.

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

## CPU-profiling the commit path headless, and the two traps in getting a profile at all

The bench tells you a row got slower. It never tells you which function. For attribution, take a
real CPU profile — it is ~20 lines and it named every finding in the create-path pass below.

**`--cpu-prof` does not reach the code you care about.** Vitest runs tests in a worker; the flag
profiles the MAIN process, so the top of the profile is Vite's own module loading and your engine
never appears. `--pool=forks` does not fix it either — the fork's execArgv is tinypool's, not
yours. Drive the profiler from INSIDE the test instead:

```ts
const { Session } = await import('node:inspector/promises');
const session = new Session(); session.connect();
await session.post('Profiler.enable');
await session.post('Profiler.setSamplingInterval', { interval: 100 }); // default 1000us is too coarse
buildTheTree(); surface.commit();                                      // one untimed warm-up first
await session.post('Profiler.start');
for (…) { … }
const { profile } = await session.post('Profiler.stop');
```

**Shape the tree like the app, not like the bench.** `reconcile.bench.ts`'s row is ONE `RCTView`
with two props; the benchmark screen's row is nine views with real colors. The create path's cost
is per-node and per-prop, so the bench row understates both — profile against 1000 rows x 9 views.

## `dlog` cannot make a hot path free — only an `if (isDebug())` block can

`dlog` gates the `console.log`, not its ARGUMENT: a template literal is evaluated at the call site
whatever the switch says. `debug.ts` has said so in a comment for a while, and `reconcile`'s create
branch violated it anyway — three messages per created node, one of them with three
`JSON.stringify` calls, i.e. 27 000 of them per 9 000-node Create with logging off.

The thunk form `dlog(() => …)` fixes the string but not the allocation: it mints a closure per
node. On a per-node path use one plain `if (isDebug()) { … }` around the whole block, which costs
neither. Same fix for a function that exists only to log (`logScrollChildren`): put the boolean
first, before its own string scans.

## The create-path pass — headless 1.4x, on device 1.06x, and the ratio is the lesson

Read this section BEFORE quoting any headless bench number as a device expectation. The pass below
was measured headless, predicted 1.4-1.55x on device, and delivered ~1.06x. The prediction was
stated in advance and it failed — what follows is both halves.

`min`, `pnpm bench`, krausest rows, three columns so the Node-only half stays separable:

```
                        before   +alloc/memo   +env cache
create 1000 rows        0.8126     0.5581        0.2793
replace all 1000        0.8143     0.5757        0.2898
create 10 000           8.8917     5.7393        2.8700
append 1000 to 10 000   2.7033     2.3006        0.7141
clear 10 000            1.9614     1.7823        0.5045
partial update 10 000   2.4002     2.2991        0.8455
select / swap / remove  ~0.171     ~0.155        ~0.039
```

```
§create_path_pass_2026_08_23 := {
  driver: "CPU profile of 1000 rows x 9 views (recipe above), not the bench's 1-node row",
  alloc_fixes: [
    "fabric-props.ts fabricProps: Object.entries ⟶ Object.keys — entries allocates a
     two-element array PER KEY on top of the outer one",
    "fabric-props.ts: flattenStyle no longer shallow-COPIES a single style object the
     caller only reads; the array form still needs it (merged result has no stable identity)",
    "commit.ts reconcile create branch: 3 eager dlog messages/node ⟶ one if (isDebug()) block",
    "commit.ts logScrollChildren: isDebug() gate moved ahead of its two .includes() scans",
  ],
  complexity_fix: "fabric-props.ts processedStyle — a style object is SHARED (StyleSheet.create
    and the class registry each hand out one object per rule), so resolving per node is
    O(nodes x styleKeys) for an answer that varies with O(distinct styles). Cached on the style
    object's identity in a WeakMap, keyed by component (processValue consults that component's
    ViewConfig processors). The ONLY complexity change in the pass; the rest are constant-factor.",
  narrows: "an in-place style mutation used to be picked up when some OTHER prop on the same node
    changed in the same commit; now it is not. It never reached Fabric on its own before either —
    setProp compares with Object.is and skips a same-identity write.",
  col3_is_a_node_artifact: "debug.ts caches process.env.DEBUG (read once at module load, the
    __SYMBIOTE_DEBUG__ hatch stays dynamic). process.env crosses into the host environment on
    every read in Node — 17% of self time — while on Hermes `process` is a shim and the canary's
    babel inlines DEBUG outright. Isolated by a separate bench run for exactly this reason.",
  ⟶ "column three is Node-only and must never be quoted; column two is 1.4-1.55x headless",
  verified: "4718/4718 tests, tsc --build clean, 104/104 emitted files identical across all 12
             examples after overlay",
}
```

### What it actually did on device — Release, iOS 26.5 sim, Create 1000 all-mounted

```
            prior run   after     delta
stock         179.7     186.8     +7.1   ← code unchanged: this IS the run-to-run noise floor
react         232.9     217.8    -15.1
vue           398.0     397.4     -0.6
svelte        491.5     475.8    -15.7
solid         336.9     316.7    -20.2
```

```
§headless_overstates_a_native_bound_path := {
  predicted: "1.4-1.55x on create, from the fake-fabric bench",
  measured: "~1.06x — 15-20 ms off ~220-480 ms, against a 7.1 ms baseline drift",
  arithmetic: "15.1 ms saved at a 1.4x JS speedup ⟹ engine JS = 15.1/(1-1/1.4) ≈ 53 ms of react's
    218 ms Create, i.e. ~24% — and 53 ms is almost exactly the react↔stock gap of the prior run
    (53.2 ms). The payload-building JS WAS the whole gap; it is only a quarter of create.",
  root_cause: "installFabric() stubs the native side to zero, so our JS is 100% of the headless
    measurement and ~24% of the device one. The bench compares our JS against ITSELF correctly and
    overstates device impact on any path whose cost is mostly JSI + Fabric C++ + Yoga.",
  ⟶ "a headless win on a NATIVE-BOUND path (create/mount) needs dividing by that path's JS share
     before it is quoted. On a JS-bound path (the walk, dirty-marking) the bench is direct.",
  residual: "react↔stock Create gap 53.2 ⟶ 31.0 ms (5.9 ⟶ 3.4 us/node). The remaining 31 ms is NOT
    payload-building — that was just removed and priced. Next instrument is the JSI CALL COUNT
    against stock, derivable headless + from ReactFiberConfigFabric.js; no simulator needed.",
  also_found: "angular's composed/flat row toggle: composed 12 nodes/row = 942.9 ms (78.6 us/node),
    flat 9 nodes/row = 418.2 ms (46.5 us/node). 33% more nodes, 2.26x the time ⟹ composition costs
    1.7x PER NODE on top of the extra nodes — the per-component-host anchor, and it is non-linear.
    Angular is worst of five even flat (2.2x stock).",
  open: "next headless profile head: GC 22%, reconcile body 17%, fabricProps 12.5%,
         createRawText 5% — but weight each by the ~24% JS share before expecting a device delta",
}
```

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

## Batching the animation flush: the measurement reversed the design (2026-08-22)

`setNativeProps` now QUEUES and publishes at the microtask boundary, so N leaves animating in one
frame produce ONE commit. The first implementation batched by falling back to the general walk
whenever more than one node was pending, on the census's reasoning that commit count multiplies the
appendChild floor. Measured, 32 screens x 60 rows (~17 504 nodes), p75:

```
                                                     before        after the union
1 animated value  via setNativeProps                 0.0018 ms     0.0022 ms   (-20%, see below)
5 animated values via setNativeProps, one per flush  0.0191 ms     —           the pre-batch frame
5 animated values via setNativeProps, ONE flush      0.0275 ms     0.0083 ms   2.3x vs unbatched
5 animated values via setProp + one general commit   0.0254 ms     —           the reference
```

**Read the first attempt's row again: 0.0275 vs 0.0191 — batching was 1.9x SLOWER than not
batching.** One walk over 17 504 nodes costs more than five chain clones, so "fewer commits" is not
by itself a win. What makes batching pay is the UNION: five rows of one list share four ancestors,
and the union clones each of them once — re-appending that 60-child list once instead of five times
— while still emitting a single `completeRoot`. Cloning cost 25 -> 9 for five leaves, pinned in
`animated-commit-cost.test.ts` ("clones each shared ancestor ONCE").

The -20% on the single-leaf row is the Map/Set bookkeeping the generalised function carries. It is
0.4 us per frame and a size-1 fast path would duplicate the whole planner to recover it; not taken.

**The bench row for a queued API has to close the frame itself.** `setNativeProps` alone times the
enqueue and reports a fictional win; every app-shaped row that drives it calls `flushNativeProps()`
inside the timed body. Same trap as any deferred-work benchmark: measure to the point the work is
actually done, not to the point it is scheduled.

**And the headless bench UNDERSTATES the batch's value**, because the fake slot's `completeRoot` is
nearly free while a real one is a C++ shadow-tree commit plus layout plus mount. The JS numbers
above are the floor of the win, not the whole of it — the device is where 5 completeRoots vs 1 gets
priced. Not yet measured there.

## The stock-React-Native baseline: `examples/bare-rn` (2026-08-22)

A twelfth example exists that is NOT a SymbioteNative canary: `examples/bare-rn` is plain
react-native 0.86 with React's own Fabric renderer and **zero `@symbiote-native/*` dependencies**,
carrying a port of the same `BenchmarkScreen`. It answers the question the adapter-vs-adapter table
cannot: how does any of this compare to the thing we are a layer on top of. Banner reads
`Original React Native, not Symbiote Native` so a screenshot can never be mistaken for a canary.

Verified identical between it and `examples/react`: all 20 measurement constants (`ROW_BATCH`,
`NATIVE_VIEWS_PER_ROW`, the LCG seed and its three constants, the four krausest indices, the
suite order and timeout, every sticky/section constant), the 9-native-views-per-row shape, and
the `<FlatList>`-inside-`<ScrollView>` nesting. No `StrictMode` in any example's `index.js` — check
this first if a baseline number ever comes back exactly doubled.

**What is NOT comparable, and it is the virtualized column:** the baseline runs RN's own
`FlatList`/`SectionList`/`VirtualizedList`, the canaries run our ports of them. All-mounted is the
clean cross-renderer comparison. Also absent from the baseline: the engine-reconcile-walk panel
(stock RN exposes no commit profiler — do NOT fake it with zeros), the nav header, and the line-tag
pill; present instead: a banner (3 views + StatusBar). Style resolution differs (`className` +
engine class registry vs `StyleSheet` ids).

### Measured, iOS 26.5 simulator, RELEASE, 1 000 rows × 9 views, 2026-08-23

```
ALL MOUNTED   stock   react     vue   svelte   solid
Create        179.7   232.9   398.0    491.5   336.9     every adapter LOSES  1.3-2.7x
Replace       190.3   257.0   415.6    752.2   375.8     every adapter LOSES  1.4-4.0x
Append        273.7   323.7   393.0    635.9   340.4     every adapter LOSES  1.2-2.3x
Clear          46.7     7.0       —     34.6    11.4     every adapter WINS
Partial        21.8    22.1    15.9     13.0     8.2     tie -> 2.7x WIN
Select          8.4     7.0     7.1      7.4    14.2     tie
Swap            7.1    29.0     6.4      8.2     6.8     tie, except React 4x worse
Remove         94.6    86.5     8.7      9.1     7.2     Vue/Svelte/Solid WIN 10-13x

VIRTUALIZED   stock   react     vue   svelte   solid
Create          4.4     8.6    11.3     14.8     6.4
Replace         4.9    12.4    10.0     10.6     5.6
Partial         1.8     6.1     2.2      1.3     0.5
Select          1.7     5.3     0.9      0.8     0.5
Swap            1.8     5.2     2.4      1.9     1.0
Remove          3.4    12.0     2.5      2.1     3.2
Append          3.0    11.4     3.0      1.7     4.1
Clear           1.3     2.0     0.8      0.8     0.3
```

(`vue Clear` was cut off in the screenshot and is the one unread cell.)

**One axis loses, and it is node CREATION.** Create / Replace / Append move ~9 000 nodes and every
adapter is 1.2-4.0x slower than stock there. Everything that mutates an already-mounted tree ties
or wins, `Remove` by 10-13x. That is one hot path to attack, not a slow renderer.

**Why `Remove` splits 94.6 / 86.5 / 7.2 the way it does, and why it is not an engine result.**
Removing one row of a thousand costs React a walk over a thousand fibers whatever host mutations
it ends up emitting. Stock pays that plus persistent-mode cloning; our React adapter pays the same
fiber walk — hence 94.6 vs 86.5, twins. Vue/Svelte/Solid walk nothing and emit one `removeChild`.
So the 13x is the framework, delivered THROUGH the engine — which is the project's whole thesis
showing up as a number: Solid on RN updates a list an order of magnitude faster than RN does.

**React is the outlier three times over, all in one adapter**: `Swap` 29.0 against 6.4-8.2,
`Remove` 86.5 against 7.2-9.1, and every row of the virtualized column. One plausible common root
(the per-change fiber walk over the list), unverified.

### The Debug run inverted the headline result — do not benchmark adapters in Debug

The same comparison in Debug put our React at **803.0 vs stock 925.5 on Create, i.e. 13% FASTER**.
Release says 232.9 vs 179.7, **30% SLOWER**. Not a magnitude error — the SIGN flipped on the single
most-quoted metric in the whole table, and a session very nearly shipped "we beat stock React
Native on Create" off it.

Debug is not merely 3-9x slower; it is 3-9x slower **non-uniformly across operations**, and
create-shaped work (dominated by native view construction, which Debug inflates least) is affected
differently from update-shaped work (dominated by JS, which Debug inflates most). That reweighting
is what reverses comparisons. Debug is usable to find WHICH column is interesting; it can neither
size an effect nor establish its direction.

Corollary already paid for once: the Svelte dom-shim tax read as `+13.6%` in Debug and 2.1-4.9x in
Release (`symbiote-engine-core`, the ShimNode note).

### Ruled out as explanations (do not re-derive these)

- **The two harnesses stop the clock at the same point.** Canary: the engine's post-commit hook.
  Baseline: a dep-less `useLayoutEffect` — `resetAfterCommit` (which ends in `completeRoot`) runs
  immediately before `commitLayoutEffects`. Both definitions of "done" are "completeRoot returned".
- **Both settle mechanisms are structurally unguarded and neither fires.** `runPostCommitHooks`
  runs every registered hook on ANY engine commit, and the baseline's dep-less layout effect runs
  after ANY render of the screen — so in principle an unrelated commit could stop a step's
  stopwatch early. Traced every commit source on that screen: suite steps and their resets are
  serialised through `await runStep`; `pendingRef` is set and `mutate()` called in one synchronous
  task; `JsFrameRateMeter`'s four `setState`s share the default lane with the pending step update,
  so React batches them into one render and one commit; `ActionButton` is a `Pressable` whose
  feedback is React state batched inside the touch event (the 130 ms deferred release lives in
  `touchable.ts`, the TouchableOpacity family, which it does not use); no `Animated`, no
  `setNativeProps`, one surface. React never flushes a render that excludes a same-lane pending
  update, which is what closes it. **Latent, not active — but note that today's `setNativeProps`
  coalescing added a commit source that is NOT React-driven, so on any screen with a JS animation
  this stops being latent.** The guard (check the commit is the step's own) is deferred to the
  release-build switch, so no column is half-old and half-new.
- **The list-diagnostics tap is free.** `recordListFrame`/`recordCellMove` return on
  `subscribers.size === 0` before building the frame, and only `examples/solid/screens/
ListDiagnostics.tsx` ever subscribes — never the benchmark screen.
- **The windowing logic is shared, so it cannot explain an adapter spread.**
  `core/components/src/state/virtualized-list{,-reducer,-diagnostics}.ts` is one state machine
  behind all five; each adapter supplies only lifecycle, and their wiring files are comparable in
  size (react 1142 lines, vue 1317, solid 1504) — there is no stub among them.

### The open work this produced, in priority order

1. **The create path.** One cause behind all three lost rows on all four adapters, and the metric
   everyone reads first. ~9 000 `createNode` calls where our per-node overhead (build the flat
   props object, `routeProp` + ViewConfig lookup, class-registry resolution) stacks on top of the
   same JSI calls stock makes. Attack this before anything else.
2. **The three React-adapter outliers** — `Swap` 4x, `Remove` 10x, the whole virtualized column —
   against its own sibling adapters on the same engine and the same shared windowing state machine.
   Suspected common root: the per-change fiber walk over the list. Unverified.

Not open: "why are we slower than stock everywhere". We are not — see the table.

Both were measured in DEBUG. Release moves these numbers 3-9x and **non-uniformly per operation**,
so re-measure before acting on either.

## Counting JSI calls on BOTH stacks — the one number stock and the canaries share (2026-08-23)

`readCommitProfile()` counts the ENGINE's reconcile walk, which stock React Native does not have —
so below wall-clock the two stacks shared no number at all. `global.nativeFabricUIManager` is what
both actually drive; counting calls there is the only like-for-like instrument.
`examples/*/fabric-call-counter.ts` is it: one import-free file, byte-identical in all six examples
(import-free is what lets it live in `bare-rn`, whose whole value is zero `@symbiote-native/*` deps).

```
§never_leave_a_replacement_on_the_global := {
  rule: "global.nativeFabricUIManager may be non-HostObject for ONE synchronous instant, never longer",
  why: "UIManagerBinding::getBinding() (ReactCommon/react/renderer/uimanager/UIManagerBinding.cpp:41)
        does global.getProperty(...).asObject(rt).getHostObject<UIManagerBinding>(rt)
        on every commit and every event dispatch",
  symptom: "native abort, NO red box, JS log ends at `Running \"<App>\"` — reads as a broken
            toolchain or a bad build, not as a diagnostic that overwrote a global",
  second_reason: "createAndInstallIfNeeded (same file, :27) SKIPS installing the real binding
                  when the global is already non-undefined",
  cost_paid: [copy-the-properties, Proxy] ⟶ both crashed identically; the Proxy rewrite chased
             an eager-property-read theory that was never the cause,
}
§one_instant_is_enough := {
  fact: "both renderers read the binding ONCE and cache — same reason (the binding mints a fresh
         host function per property access)",
  react: "module-scope destructure, Libraries/Renderer/implementations/ReactFabric-dev.js:18694",
  engine: "getSlot() builds a cached facade, core/engine/src/fabric.ts",
  both_lazy ⟶ "the moment is schedulable from index.js: React's module is required on first render
               (Libraries/ReactNative/RendererImplementation.js:26), getSlot() runs on first commit",
  shape: "install counting view -> force the bind (require ReactFabric | call getSlot()) -> restore
          in `finally`",
}
§preserve_host_function_arity := {
  bug: "a (...args) wrapper reports length === 0",
  breaks: "core/engine/src/fabric.ts feature-detects the batched-children clone bindings BY ARITY
           (cloneNodeWithNewChildren.length >= 2, ...AndProps.length >= 3)",
  consequence: "every adapter silently degrades to the per-child appendChild path — a DIFFERENT
                commit path measured under the name of the real one; no error anywhere",
  fix: "Object.defineProperty(wrapped, 'length', { value: original.length })",
}
§not_counted := [
  "methods a renderer reads off the global lazily at CALL time (React: measure, dispatchCommand,
   sendAccessibilityEvent, setIsJSResponder, findNodeAtPoint) — they hit the restored binding",
  "setNativeProps — RN's Animated reaches it through NativeDOM, a TurboModule, not this global",
]
§fairness := {
  cost: "one JS call + one branch per JSI crossing, ~18 000 on Create 1 000",
  rule: "it is in EVERY timing once installed ⟶ install on all six examples or on none;
         a half-installed set makes the wall-clock columns incomparable, not just the counts",
}
```

### Measured — stock React Native, all-mounted, 1 000 rows, DEBUG, iOS 26.5 simulator, 2026-08-23

Counts are build-invariant so this table stands; the Debug TIMES from the same run do not (Create
read 964.6 ms against 186.8 in Release).

```
                        createNode  appendChild  clones   propKeys
Create 1000                   9001         9036       7      62001
Replace all                   9000         9035       6      62000
Partial · every 10th           100         1535     306        100
Select row                       1         1036       8          4
Swap 2 rows                      0         1035       6          0
Remove row                       1         1035       7          1
Append 1000                   9001        10036       7      62001
Clear                            1           36       7          1
```

```
§flat_parent_reappend_is_fabric_not_us := {
  evidence: "Select / Swap / Remove each touch ONE row and each costs ~1035 appendChild on STOCK",
  ⟶ "the flat-parent child-set re-append is Fabric's persistent-tree protocol; React pays it too,
     so it is not an engine cost and not a fixable one from JS",
}
§partial_update_creates_nodes := {
  observed: "100 changed rows -> 100 createNode, 306 clones",
  cause: "changing a <Text>'s content in persistent mode makes a NEW RCTRawText, not a clone;
          the 306 are ~3 ancestors per touched row",
}
```

## The second pass: what it costs, and the two optimisations that bought nothing (2026-08-23)

The create gap has a name now, and it is not allocations. Release, iOS 26.5 sim, all-mounted,
1 000 rows x 9 views, `examples/react` vs `examples/bare-rn`.

```
§the_second_pass_is_what_mutation_mode_MEANS := {
  fact: "adapters/react/src/host-config.ts:113 — supportsMutation: true, supportsPersistence: false",
  consequence: "React mutates the retained tree like a DOM and leaves; SOMEBODY must then translate
    mutable -> Fabric's persistent form, and that somebody is reconcile. The second pass is not an
    implementation accident, it is the definition of the mode",
  stock_by_contrast: "persistence mode — React clones inside its OWN fiber walk
    (.vendors/react/.../ReactFiberConfigFabric.js:196-207 createInstance -> createNode inline,
     :171 appendInitialChild -> appendChildNode inline). One walk, no second visit",
  why_we_chose_it: "deliberate, CLAUDE.md M1+M2 — drive React through the shared engine commit path
    (risk R2). Also the ONLY mode Vue/Svelte/Solid/Angular have: they cannot do persistence at all",
}
§create_decomposition := {
  measured: "react 222.6 total, reconcile window 63.4 (ENGINE PER STEP COMMITS column);
             stock 195.5; gap 27.1",
  the_arithmetic_that_matters: "gap (27.1) << window (63.4). Our pass 1 is ~36 ms CHEAPER than
    stock's single pass, because payload-building and every JSI call were deferred out of it",
  ⟶ "the second pass is NOT 63 ms of waste: ~36 ms is relocated work stock also does,
     ~27 ms is the genuine re-visit tax = ~3 us/node over 9136 nodes",
  THE_SLIP_TO_NOT_REPEAT: "quoting the WHOLE window as the prize. Done 2026-08-23 for Vue —
    '296.7 - 70 = 227, so 1.52x becomes 1.16x'. Wrong twice over: most of the window is work stock
    also does, and what IS removable comes off only in persistence mode, which
    Vue/Svelte/Solid/Angular have no seam for at all. Subtract the TAX, never the WINDOW, and check
    the adapter can even take the mode",
  the_27ms_below_IS_ITSELF_SUPERSEDED: "the gap-minus-window derivation below reads as a
    measurement and is not one. Profiled, the walk's whole JS is 6.5 ms and the bookkeeping ceiling
    is ~9 ms on device, 3% of Create — see '## The commit walk, split by measurement' at the end of
    this file. Do not quote the 36/27 split from here",
  per_node_tax_is: "recursive call + viewNameFor + committedOf + renderableChildren probe +
    3 dirty flags + the 8-field committed record write",
  sanity: "headless V8 measured the bare walk at ~0.5 us/node; 6x on Hermes is the usual ratio",
}
§persistence_mode_for_react_buys_a_TIE := {
  claim: "222.6 - 27 = ~195.5 = stock, exactly",
  why_not_a_win: "in persistence mode React does the clone walk itself — we would pay precisely
    what stock pays. Everything else is already at parity or better (we send 32 001 prop keys where
    stock sends 62 001 and still only draw level)",
  price: "a SECOND commit path in the engine, breaking <clone_on_write_lives_in_engine>'s
    'a persistence bug is fixed once, for all adapters'",
  verdict: "not worth it in that form — 27 ms on an operation the user sees once per screen",
  the_one_axis_where_we_could_BEAT_stock: "JSI crossings. Stock floors at 18 035 (9001 createNode +
    9034 appendChild); batched clone puts us at 15 009 and the floor is ~10 000. UNPROVEN — batching
    measured as a wash, so the ~1.6 us/crossing estimate (derived from 2 000 fewer crossings moving
    the window 67.2 -> 64.0) is itself in doubt",
}
§the_second_pass_cannot_explain_the_ADAPTER_SPREAD := {
  trap: "'the second pass kills perf everywhere' is the intuitive read and the numbers refuse it",
  constant: "same 9001-node tree, VISITED ~9136 under all five, so the window is ~the same term",
  arithmetic: [
    "react 217.8 = ~63 + ~155", "solid 316.7 = ~63 + ~254", "vue 397.4 = ~63 + ~334",
    "angular 418.2 = ~63 + ~355", "svelte 475.8 = ~63 + ~413",
  ],
  ⟶ "it is 28% of the FASTEST adapter and 13% of the slowest; delete it entirely and Svelte is
     still ~413 vs stock 195.5. The spread lives in each framework's own pass 1",
  open_caveat: "anchors differ wildly (react/solid 0, vue 2, angular 3001, svelte 4002) and an
    anchor defeats renderableChildren's fast path, so svelte/angular windows may NOT be ~63.
    Settle it by reading ENGINE PER STEP off all five canaries — free, the screen already has it",
  cheaper_than_timing: "WRITES/NOOP on the same screen answers pass 1 by COUNTING (react 14037/6000).
    Precedent: Angular's Pressable pushed 104 000 setProp where Solid used 12 000, 90 000 of them
    writing undefined over an absent key",
}
```

### Two optimisations, both correct on paper, both worth zero on device

Kept because the reasoning was sound and the answer was still no — and because between them they
close the whole "attack the allocations" direction.

```
§allocation_removal_measured_ZERO := {
  did: ["committed record's child list stored BY REFERENCE, copy-on-write in markStructureDirty
         — create went 9 003 slices -> 1, counted by wrapping Array.prototype.slice",
        "committed record written IN PLACE on the update path instead of replaced"],
  headless: "bench min create 0.2787 -> 0.2442 (-12.4%) … but that run also carried for...in",
  on_device: "Create 217.8 (frozen) -> 222.6, i.e. +2.2% against a ~4% noise floor. NOTHING",
  ⟶ "9 002 array allocations per create are below this instrument's resolution. The cost is the
     VISIT, not the garbage. Do not propose another allocation-shaving pass without a new argument",
  kept_anyway: "strictly less garbage, no behaviour change; the CoW half does buy a new invariant
    (mark BEFORE mutating children) — see .claude/rules/engine-mutations-must-mark-dirty.md",
}
§for_in_lost_on_hermes := {
  did: "Object.keys -> for...in in fabricProps' three hot loops",
  counted: "10 007 key-arrays per create -> 3 (wrapped Object.keys)",
  headless_V8: "create/replace min -12-13%",
  on_device: "Create 217.8 -> 243.2 (+11.7%) while stock moved 186.8 -> 195.5 (+4.7% = its noise
    floor). Partial 23.3 -> 52.7. Fabric counts and prop payload byte-identical either way
    (9000/8000/9, 32 001 keys) — so nothing below the JS changed",
  reverted: "core/engine/src/fabric-props.ts, with the finding at the loop; the revert restored
    EVERY row to the frozen baseline (222.6 / 251.3 / 312.3 / 20.8 / 84.6)",
  ⟶ "Hermes' for-in is not V8's enum cache. The headless bench ranks ALGORITHMIC counts (how many
     arrays, how many visits) and CANNOT rank two spellings of the same loop",
  method_note: "read the adapter against stock in the SAME run — stock moving 4.7% is what proves
    11.7% is real and not drift",
}
```

### The window is genuinely a constant — Vue measured, 2026-08-23

Closes the `open_caveat` above for the no-anchor case, and settles "the second pass kills perf
everywhere" as false. Release, same simulator, same session, batch OFF on both.

```
§second_pass_window_is_flat_across_adapters := {
  measured: "react Create 222.6 total / 63.4 reconcile; vue 393.6 / 67.4",
  ⟶ "pass 1: react ~159, vue ~326 — Vue's entire 171 ms deficit is its OWN runtime above the
     engine (vdom build + patch + reactivity for 9 000 nodes), not the engine and not the adapter",
  the_seam_is_clean: "vue asks the engine for the SAME work and is tidier at it —
    VISITED 9044 vs 9136, WRITES/NOOP 14003/2001 vs 14037/6000 (a THIRD of React's noop writes),
    Fabric calls identical 9000/8000/9 at 32 001 keys",
  consequence: "deleting the second pass outright leaves Vue at ~326 vs stock 195.5, still 1.7x.
    It is 28% of the FASTEST adapter and 17% of Vue — it cannot be the universal culprit",
  still_open: "svelte (4002 anchors) and angular (3001). An anchor defeats renderableChildren's
    fast path, so THEIR window may not be ~65. Vue has 2 anchors, so this run does not test it.
    Solid has 0 and should land beside react",
  batching_footnote: "vue moved all three create-shaped rows the SAME direction with batch ON
    (393.6->370.9, 427.0->412.6, 402.8->387.2, -3.4..-5.8%) where react's signs contradicted.
    Inside the 4% floor, so not a verdict — but batching behaves differently per adapter and the
    earlier react-only 'wash' should not be generalised to all five",
}
```

### Svelte closes the anchor caveat — the window is flat at ~64 ms, full stop (2026-08-23)

```
§anchors_do_NOT_make_the_second_pass_nonlinear := {
  measured: "Release, same session, batch OFF, Create 1 000 rows",
  table: [
    "react   222.6 total / 63.4 window / ~159 pass1 /    0 anchors",
    "vue     393.6 total / 67.4 window / ~326 pass1 /    2 anchors",
    "svelte  500.8 total / 63.6 window / ~437 pass1 / 4002 anchors",
  ],
  ⟶ "4 002 anchors moved the window by nothing. They are flattened in renderableChildren and
     never reach reconcile — svelte's VISITED is 9044, not ~13 000",
  closes: "the open_caveat two sections up, and with it 'the second pass kills perf everywhere':
    it is 28% of the fastest adapter and 13% of the slowest",
  the_seam_is_CLEANEST_on_svelte: "WRITES/NOOP 12001/0 — zero wasted writes, against react's
    14037/6000. The engine is not the problem for ANY adapter",
}
§the_real_anomaly_is_pass_1 := {
  fact: "svelte spends 437 ms building the same 9 000 nodes react builds in 159",
  why_it_is_an_anomaly: "on js-framework-benchmark svelte and vue are at least level with react
    on create; here they are 2.0x and 2.75x worse",
  structural_hypothesis: "react = host config over a reconciler DESIGNED for an abstract host;
    vue = createRenderer, same; svelte = DOM EMULATION (adapters/svelte/src/dom-shim/*, ShimElement
    /ShimNode/ShimText). Svelte compiles against document/Node/firstChild/before() and its web
    speed rests on those being native calls — under us they are JS objects, per node",
  NOT_yet_measured: "cloneNode(deep) exists in the shim but `fragments: 'tree'` builds fragments
    with explicit createElement, so it may not be on the hot path. Do not assert it",
  how_to_settle_it_without_a_device: "COUNT shim / nodeOps calls per adapter to build the same
    9 001-node tree. Build-invariant, headless-honest, no Hermes needed — the same discipline that
    produced every reliable finding today",
}
```

## Headless DOES reproduce the device gap — but only in production, and only on the margin

```
§headless_must_run_NODE_ENV_production := {
  bug: "vitest resolves every framework's DEV build; the adapter comparison is then a
    comparison of dev overheads, and it is NOT uniform across frameworks",
  measured: "create 4 000 rows, react 297.5 -> 156.7 ms (1.9x), vue 534.3 -> 218.3 (2.4x).
    Vue's dev half is createDevRenderContext / startMeasure+endMeasure / guardReactiveProps,
    ~11% of its profile, plus the allocation it drives",
  ⟶ "a dev-build run ranked vue 2.09x react; production ranks it 1.36x. Every headless
     adapter number in this skill predating 2026-08-23 that did not set NODE_ENV is suspect",
  rule: "NODE_ENV=production on every headless adapter benchmark. Metro's release bundle sets
    it, so production is the only build the device numbers can be read against",
}
§NODE_ENV_production_is_NOT_enough_for_solid := {
  measured: "2026-08-23. NODE_ENV=production AND `vitest --mode production` both left solid-js
    resolving to dist/dev.js — splitProps alone 17% of the profile — and loaded BOTH builds at
    once (dev.js and solid.js functions in one profile, i.e. two reactive runtimes)",
  cause: "resolution, not the env var. solid-js's exports declare a `development` condition ahead
    of the plain `import`, and vite-plugin-solid RE-ADDS that condition from its own config() hook,
    so pinning resolve.conditions/ssr.resolve.conditions in the config does not win either",
  fix: "pass `dev: false, hot: false` to solidPlugin() in the config the probe runs under.
    Verify by GREPPING the profile for `dist/dev.js` and expecting zero — `dist/universal.js` +
    `dist/solid.js` is the correct production pair for generate:'universal'",
  ⟶ "check WHICH BUILD a profile actually sampled before reading it. The env var is a claim; the
     file names in the profile are the measurement. Same discipline as reading prettier's detail
     lines over its summary (`test-harness-false-greens` §6)",
}
§read_the_MARGINAL_row_cost_not_the_total := {
  bug: "the 1 000-row total is dominated by mount + V8 tier-up, which compresses the ratio",
  measured: "vue/react at 1 000 rows = 1.19x; the same run's 1 000->4 000 slope = 1.80x, and
    the device Create ratio is 1.77x",
  method: "run 1 000 and 4 000, take (t4000 - t1000) / 3 000 ms per row, compare THAT",
  validated: "prod marginal vs device Create — svelte 2.21 vs 2.25, solid 1.51 vs 1.42,
    vue 1.36 vs 1.77. Close enough to iterate locally; the device stays the arbiter",
}
§vue_the_cost_is_vues_own_component_instance := {
  instrument: "node:inspector Profiler inside the probe. --cpu-prof NEVER flushes from a
    vitest worker (it is killed, not exited) - connect a Session and write the profile yourself",
  window_split: "4 000 rows, production, self time bucketed",
  table: [
    "            window  framework  engine  adapter  vm+gc",
    "react          199       57.0    49.2     51.8   40.7",
    "vue            249       89.2    56.9     46.4   56.6",
    "delta          +50      +32.2    +7.7     -5.4  +15.9",
  ],
  ⟶ "neither the engine nor the vue adapter is the cause - together they are 103.3 ms against
     react's 101.0, a tie. 48 of the 50 ms delta is vue runtime-core plus the GC it drives",
  ruled_out: [
    "reactive Proxy leaking into the retained tree - 0 of 301 nodes, 0 prop bags, 0 values",
    "toPublicInstance graft per node - 0.9% of the create window",
  ],
  root_cause: "OUR primitives are Vue COMPONENTS. One bench row = 7 component instances
    (Row + View + 3 Text + 2 Pressable), each paying createComponentInstance / initProps /
    initSlots / setupRenderEffect. On the web a <div> is a host element and costs none of that -
    which is exactly why vue is level with react there and 1.8x behind here",
  measured_lever: "same 36 001-node tree, View/Text swapped for the intrinsic tags
    'symbiote-view'/'symbiote-text': 138.0 -> 118.5 ms, 14.1%. Pressable stays a component,
    it carries real logic",
  probe_trap: "h(tag, props, () => [...]) passes a SLOT FUNCTION. A host element wants an
    ARRAY. Get it wrong and the A/B builds a different tree - the first run of this one read
    -54.7% until both sides were pinned to the same 36 001 nodes",
  open: "moving View/Text to intrinsics costs the typed prop surface in templates, and
    normalizeVueAttrs (2.7%) + resolveTextProps must relocate into patchProp / createElement",
}
§svelte_builds_2_5x_the_tree := {
  measured: "1 000 bench rows: svelte census nodes=23 006 where react/vue/solid build 9 001,
    for an identical 9 003 renderable. 4 000 rows: 92 006",
  ⟶ "14 005 extra retained objects per 1 000 rows, allocated and walked by pass 1 before the
     commit walk flattens them away. Consistent with svelte's 2.21x marginal cost",
  next: "which shim path mints them - anchors/comments per {#each} block, or ShimText padding",
}
```

## The lowering, on device — and the first time headless UNDER-shot

```
§vue_lowering_device_result := {
  change: "SFC <View>/<Text> compile to their intrinsic tag; the adapter's own components render
    the tag too (4 call sites: Pressable x2, Button, TouchableNativeFeedback)",
  measured: "iOS 26.5 sim, Release, 1 000 rows x 9 views, all-mounted, batch OFF",
  table: [
    "            stock   vue before   vue after   before x   after x",
    "Create      195.5        397.4       296.7      2.03x     1.52x",
    "Replace     208.8        399.4       293.9      1.91x     1.41x",
    "Append      282.6        385.1       274.6      1.36x     TIE",
  ],
  attribution_is_clean: "reconcile window 67.4 -> 70.0 ms (unmoved), FABRIC 9000/8000/9 and
    32 001 prop keys byte-identical ⟶ not one native call saved or added. The whole 25-29% is
    pass 1, exactly where the profile put it",
  vs_our_react_adapter: "1.77x -> 1.33x",
  batch_toggle_on_the_same_binary: "Create 296.7 -> 298.4, window 70.0 -> 76.7 ⟶ batching still
    buys nothing on Create; the earlier verdict stands",
}
§headless_under_shot_here_and_that_is_the_lesson := {
  predicted: "12-14% (the h()-based intrinsic A/B)",
  delivered: "25-29%",
  why: "an h() A/B models only the component-instance saving. The SFC path ALSO gets static-prop
    hoisting (544 hoisted refs across the example) and patch flags, neither of which a component
    ever gets — so the compiled path beats what a hand-written h() comparison can express",
  ⟶ "headless mis-estimates in BOTH directions. for...in over-promised 12% and cost 11.7%; this
     under-promised by half. Use it to rank ALGORITHMS and to find the hot function; never to size
     a win. Only the device sizes a win (`perf-claims-need-numbers`)",
}
§quote_the_stock_sample_from_the_SAME_session := {
  slip: "Append 274.6 was called a WIN against a stock 290.8 taken hours earlier. The same-day
    stock run read 282.6, which makes it 0.97x — a tie, inside the ~4% Create noise floor",
  rule: "a cross-binary claim needs both columns from the same sitting. This is the second time
    today the stock column moved enough to change a verdict",
}
```

## After the lowering, GC is the biggest bucket — and the first allocation removed (2026-08-23)

```
§gc_became_number_one_by_subtraction := {
  post_lowering_profile: "headless, production, 4000 rows, self time bucketed:
    vue-framework 89.2 -> 57.1 (-36%) · engine 56.9 -> 42.9 · adapter/app 46.4 -> 43.9 ·
    vm+gc 56.6 -> 61.5",
  reading: "GC did not get worse. It went from third to first because the other three shrank —
    its absolute number barely moved",
  ⟶ "the hypothesis is NOT 'GC is slow', it is 'the create path allocates too much per node and
     GC is the bill'. Per node today: the node object, fabricProps' `out`, commitClassStyle's
     entry + style array",
}
§toPublicInstance_moved_to_the_prototype := {
  was: "core/engine/src/host-instance/index.ts Object.assign'd SIX closures + one object literal
    onto every node, per node",
  cost: "9 000-node create = 54 000 closures, each pinning its own context; plus an
    Object.assign hidden-class transition off the createElement literal's shape",
  who_paid: "Vue, Solid, Svelte — all graft eagerly at createElement. React grafts lazily in
    getPublicInstance and never did",
  fix: "the six methods are prototype methods on a `SymbioteNode` class in core/engine/src/node.ts;
    createElement/createRawText construct it; toPublicInstance is now the identity, kept because
    it names the seam every adapter calls",
  cycle: "node.ts now imports measure/setNativeProps/dispatchViewCommand from commit.ts, which
    imports node.ts. Deliberate and safe — neither side touches the other at module-evaluation
    time. The alternative (installing the prototype from host-instance at load time) is the exact
    registration-side-effect shape Metro's inlineRequires drops in release builds",
  measured_headless: "16 001 nodes, build+commit, arms alternated in one process, NODE_ENV=production:
    min 4.3 -> 3.5 ms (-18.6%), heap 18.0 -> 13.4 MB (-25.8%). Median moved -52.7% and is
    GC-noise — read the min",
  device: "Vue, Release, iOS 26.5 sim, batch OFF: Create 296.7 -> 274.8 (-7.4%), Replace
    293.9 -> 279.7, Append 274.6 -> 266.2. FABRIC 9000/8000/9 + 32 001 keys and the reconcile
    window (~65 ms) byte-identical, so all of it is pass 1 — the graft's own location",
  device_vs_stock_same_sitting: "stock Create 196.8 / Replace 187.9 / Append 280.2.
    Create 1.52x -> 1.40x (VERDICT — stock Create read 186.8/195.5/196.8 across three sittings,
    +0.7% across the two bracketing this change). Append 266.2 vs 280.2 = 0.95x, Vue level with
    stock on a create-shaped row. Replace gets NO verdict: stock's own Replace drifted
    211.6 -> 208.8 -> 187.9, 10%, so 1.41x -> 1.49x is the STOCK column moving",
  headless_OVER_shot_this_time: "-18.6% on min predicted, -7.4% delivered — opposite direction to
    the lowering's under-shoot. Two mis-estimates in two attempts, in two directions. Headless
    ranks algorithms; it does not size wins",
  batch_still_a_wash_on_this_binary: "Create 268.1 on / 274.8 off, Append 276.5 on / 266.2 off —
    different signs. Batching demonstrably WORKS (FABRIC 9000/5000/1009 vs 9000/8000/9) and still
    buys nothing",
  outlier_to_not_misread: "the batch-off run reported an 80.1 ms Create window against ~65 ms
    everywhere else — a first-step warm-up spike, not a regression. Replace 64.4 and Append 65.4 in
    the SAME run, and Create 64.7 in the batch-on run, are the three votes that settle it",
  guard: "core/engine/src/host-instance/host-instance.test.ts, 'keeps the methods on the shared
    prototype, not on the node' — asserts !Object.hasOwn AND method identity across two nodes.
    Break-tested: re-adding an Object.assign graft fails 3 of 15; every OTHER test in that file
    still passes, which is why the own-property assertion had to exist",
}
```

## The commit walk, split by measurement — and the ~27 ms traversal tax was wrong (2026-08-23)

```
§the_27ms_traversal_tax_was_a_DERIVATION_not_a_measurement := {
  how_it_was_wrong: "it took the whole react-vs-stock Create gap (27.1 ms) and assigned it to the
    walk. Measured properly the walk's ENTIRE JS is 6.5 ms headless on 9 002 nodes",
  method: "8 trees built BEFORE Profiler.start so the samples are commit-only; 1537 samples,
    20 us interval, NODE_ENV=production, fake Fabric slot",
  split_of_one_6.5ms_commit: [
    "26.5% 1.73ms (garbage collector)",
    "23.7% 1.54ms reconcile — its own body: recursion, committedOf, flags, committed record",
    "16.3% 1.06ms processedStyle + 14.2% 0.93ms fabricProps + 2.1% processValue = payload",
    " 3.7% 0.24ms renderableChildren + isSkippedAtCommit",
    " 3.5% 0.23ms nextTag",
  ],
  device_map: "6.5 ms x ~6 (Hermes/V8) = ~39 ms of the 65 ms window; the remaining ~26 ms over
    17 000 JSI crossings = 1.5 us/crossing, which independently matches the 1.6 us/crossing
    estimate derived from the batching experiment — two roads, same number",
  ⟶ "the ceiling on eliminating the second pass is the ~9 ms of bookkeeping (24% of 39), i.e. 3%
     of a 274.8 ms Create — and unreachable, since the recursion, viewNameFor, renderableChildren
     (anchors) and the committed record are required in ANY design. A fresh-subtree fast path was
     NOT built: it can only remove a slice of that 9 ms",
  probe_caveat: "the probe gave each row a FRESH style object, so processedStyle always missed its
    cache; the payload share is if anything overstated there",
}
§processedStyle_memo_cache_is_DEAD_on_every_real_path := {
  claim: "fabricProps takes the memoized branch only on `isRecord(node.props.style)`, and after
    routeProp that is NEVER true",
  measured: "routeProp(node,'style',{flex:1}) leaves style = [null,{flex:1}];
    routeProp className leaves [{},null]; both leaves [{},{flex:1}] — commitClassStyle (node.ts)
    ALWAYS writes a two-element array, by design (the re-push is setNativeProps' restore path)",
  consequence: "every styled node in every adapter takes the flattenStyle(array) branch instead:
    one fresh merged object per node per commit, then per-key processValue. The cache and its
    12-line comment describe a case that does not occur",
  what_RN_does_instead: "no cache either — it never allocates the intermediate.
    ReactNativeAttributePayload.create -> addProperties -> diffProperties(null, {}, props, valid)
    and addNestedProperty RECURSES over the style array writing straight into the ONE updatePayload
    object (.vendors/react/packages/react-native-renderer/src/ReactNativeAttributePayload.js:208).
    flattenStyle appears ONLY in diffNestedProperty (:189/:198), i.e. the UPDATE path where an
    array meets an object — never on create",
  other_RN_differences: [
    "RN allocates the payload LAZILY (updatePayload starts null, created on the first valid prop)",
    "RN filters by viewConfig.validAttributes; we send every prop",
    "RN's own source says `// TODO: Fast path` on addProperties — even upstream routes create
     through the generic differ",
    "RN uses `for (const propKey in nextProps)` in diffProperties — the exact shape we measured as
     SLOWER on Hermes (§for_in_lost_on_hermes). Do not 'fix' ours to match; the device decided",
  ],
  per_node_allocations_on_the_create_path: "commitClassStyle's entry object + its 2-element style
    array (per style WRITE), flattenStyle's merged object, fabricProps' `out` — before the node
    object and the committed record. GC is 26.5% of the walk and this is where it comes from",
  web_search_was_worthless_here: "a targeted query for ReactNativeAttributePayload/diffProperties/
    flattenStyle returned eight 2026 'New Architecture explained' SEO posts and zero internals.
    For RN renderer internals read .vendors/react-native and .vendors/react; the web has nothing",
}
§payload_rewritten_to_RNs_shape := {
  what: "fabric-props.ts's addStyle recurses over the style slot on POSITION writing keys straight
    into the ONE payload object; the flattenStyle-then-hoist intermediate is gone and
    processedStyle's memo now runs per ENTRY, so it fires",
  counts_build_invariant: "on a 9 002-node create with 6 hoisted style objects — before: 9 002
    flattenStyle calls, each allocating a merged object, then per-key processValue on all of them.
    After: 9 002 cache lookups and 6 resolutions",
  semantics_preserved: "a later entry still wins, and a later EXPLICIT undefined still CLEARS an
    earlier value (processedStyle now keeps undefined-valued keys so addStyle can see them). One
    recorded divergence: the clear also removes a same-named TOP-LEVEL prop, which flattening did
    not — theoretical, style keys and native prop keys do not overlap",
  headless_CANNOT_size_this: "four AFTER runs read 5.12 / 5.44 / 5.68 / 6.02 ms; the BEFORE run
    read 5.94. The +-18% spread swallows the effect entirely. The composition DID move —
    payload bucket 1.46 -> 1.02 ms — but quote the allocation counts, not the ms",
  device_said_otherwise_and_it_is_the_THIRD_mis_size: "Vue Release, batch OFF: Create
    274.8 -> 258.5 (-5.9%), Append 266.2 -> 252.5 (-5.1%), Replace 279.7 -> 274.5. The RECONCILE
    WINDOW moved ~65 -> 50.9/56.0/56.1 ms, i.e. -12 ms, where the headless composition predicted
    ~2.6 ms scaled. FABRIC 9000/8000/9 + 32 001 keys byte-identical.
    Tally so far: lowering UNDER-shot (12-14% predicted, 25-29% delivered), the prototype move
    OVER-shot (-18.6% min, -7.4% delivered), this one UNDER-shot by ~4.6x. Three attempts, three
    wrong magnitudes, two directions. Headless ranks; the device sizes. No exceptions yet",
  prediction_error_worth_keeping: "I predicted the reconcile window would NOT move, on the reasoning
    that the change was 'in the payload, not in the walk'. Wrong: fabricProps is CALLED FROM
    reconcile, so payload cost is inside the window by construction. The window dropping is the
    correct attribution signal for any fabric-props change, not a surprise",
  vue_cumulative_today: "397.4 -> 296.7 (SFC host-primitive lowering) -> 274.8 (toPublicInstance
    prototype) -> 258.5 (payload shape). Against a same-day stock Create of 196.8: 2.03x -> 1.31x.
    Append 252.5 vs stock 280.2 = 0.90x — the first time an adapter is genuinely FASTER than stock
    React Native on a create-shaped row",
  guard: "core/engine/src/__tests__/fabric-props-style.test.ts. Break-tested by disabling the memo
    lookup: exactly the 'resolves a shared style object once' identity assertion fails, 1 of 9 —
    every correctness test passes with the cache dead, which is how it stayed dead for months",
  the_general_lesson: "a memo whose branch condition is decided in ANOTHER file (commitClassStyle
    always writes an array; fabricProps only memoized a bare object) is dead code that reads as an
    optimization. Test the SHAPE the caller actually produces, and assert cache identity — a
    correctness test cannot tell a live cache from a dead one",
}
§profile_the_shape_that_SHIPS := {
  trap: "adapters/vue/src/node-census.probe.test.ts builds rows with h(View, …) — the COMPONENT
    path. After the SFC lowering the device runs intrinsic tags, so a profile taken through that
    probe prices a path that no longer ships",
  fix: "the probe must use HOST_VIEW/HOST_TEXT with ARRAY children (a tag ignores slot children),
    keeping Pressable a component because it still is one on device",
  ⟶ "after any compile-time lowering, re-check every probe's tree shape before trusting it",
}
§vue_create_profile_after_three_fixes := {
  measured: "headless, production, 4 000 rows, lowered shape, settled machine:
    create 128.2 ms · walk 16.1 ms · 36 002 nodes · 56 000 prop writes / 8 000 no-ops",
  buckets: "vue-runtime 31.4% · vm 26.0% (GC 31.0 ms alone) · engine 23.7% · adapter 15.6%",
  top_after: "GC 31.0 · routeProp 6.0 · reconcile 5.1 · track 5.0 · pressable 5.0 · mountElement
    4.0 · fabricProps 3.8 · createReactiveObject 3.0",
  what_went_away: "commitClassStyle 9.3 -> absent (was the largest non-GC frame);
    hasAnyAriaKey 1.7 -> absent; forwardAttrs 3.1 -> 2.0",
}
§three_more_of_the_same_class := {
  commitClassStyle: "was a WeakMap<node, parts> plus `{...prev, ...patch}` — a patch literal, a
    merged copy, a hash get and a hash set PER class/style write, and there are 56 000 prop writes
    on a 4 000-row create. Now node.styleParts, a lazily-created three-slot object written IN
    PLACE. Same side-table-to-field move as `committed`, second time it paid",
  hasAnyAriaKey: "ARIA_KEYS.some(key => props[key] !== undefined) allocated a closure per call
    because the callback captures props — once per accessibility-bearing instance, 8 000 per
    create. Indexed loop instead",
  HANDLED_ATTRS: "an ARRAY behind `.includes()` in Vue's Pressable forwardAttrs, walked in full for
    every key that is not handled, which is most of them. A Set",
  the_pattern_stated_once: "all three, and the three before them, are the same bug: a per-NODE (or
    per-instance) cost for something that varies per KIND. Look for a side table keyed on the node,
    a spread that rebuilds an object nobody kept, a closure inside a hot callback, and an array
    used as a set",
}
§dont_profile_right_after_the_full_suite := {
  measured: "the same probe read 227.8 ms immediately after a 4 789-test run and 128.2 ms on a
    settled machine — a 78% inflation with no code change, larger than any effect measured today",
  rule: "run a profile standalone, and repeat it until two runs agree before reading anything",
}
§the_three_allocation_fixes_ON_DEVICE := {
  device: "iOS 26.5 sim, Release, vue-sfc, 1000 rows x 9 views, all-mounted",
  before_after: "Create 258.5 -> 255.0 · Replace 274.5 -> 269.3 · Append 252.5 -> 247.0 ·
    Partial 16.5 -> 14.8 · Clear 16.4 -> 15.6",
  window: "reconcile 50.9/56.0/56.1 -> 49.8/50.4/50.9 — flat within noise, as predicted:
    styleParts and hasAnyAriaKey are pass 1, only fabricProps sits inside the walk and it
    was already cut the round before",
  fabric: "9000/8000/9 and 32 001 keys byte-identical, so nothing structural moved",
  verdict: "-1.4% / -1.9% / -2.2% on the create rows is INSIDE the ~4% Create noise floor and
    carries no verdict on its own. What makes it credible is that all five rows moved the same
    direction, and Partial's -10% is outside its own spread. No stock sample this sitting",
  headless_vs_device: "headless said 143.3 -> 128.2 = -8.6%; device delivered ~-1.5%. FIFTH data
    point, and the third OVER-shoot. Running tally of headless error: lowering -2x (under),
    prototype +2.5x (over), payload -4.6x (under), this one +5.7x (over). Headless ranks
    algorithms; it does not size wins, in EITHER direction",
  why_over_this_time: "the whole win is allocation pressure, i.e. GC, and GC was 31.0 ms of the
    128.2 ms headless window on V8. Hermes collects differently and the profile is not
    transferable. Prefer a device read before believing any GC-shaped estimate",
}
```

## Isolating ONE engine change on device when the local engine carries unrelated work

The usual way to get a local `core/engine` onto a device is `registry:publish` + `registry:refresh`
or a `pnpm pack` + `file:` swap. Both bring the WHOLE working tree — and in a shared worktree that
routinely means several sessions' uncommitted changes arriving at once. The delta is then
unattributable, which is the failure this whole skill exists to prevent.

**Hand-port the one change onto the npm build already installed in the example instead.** The
example's `node_modules/@symbiote-native/engine/build/*.js` is plain readable JS — the same
functions, the same comments, only compiled — so a small guard or early return transplants in a few
lines. Between the two arms, exactly one thing differs.

Done 2026-08-23 for `isAlreadyPublished`: `examples/solid` held npm engine 0.3.0, which predates
the `styleParts` field refactor and still carries `classStyleParts` as a `WeakMap` — the guard went
in right after `classStyleParts.set(node, entry)` with the same four comparisons. Verified before
building: the module still imports (`node --input-type=module -e "import('./node.js')"`), and
`grep -c styleParts` still reads 0, proving the rest of the engine is untouched.

Rules for using this:

- **Mark it in the file.** A `MEASUREMENT PATCH, not a real install` comment naming the source of
  truth and the revert command, or the next person reads a divergent `node_modules` as an install.
- **Revert is `pnpm run registry:refresh examples/<name>` or a reinstall** — never assume the patch
  will be noticed later.
- **The real change still lands in `core/engine/src` first**, with its tests. The transplant is an
  instrument, never the implementation.
- **Only for a change small enough to transplant by eye.** Anything touching several functions, or
  a build whose shape has drifted from the source, is a re-pack — the transplant's whole value is
  that you can see it is the same change.

## The reconcile window's own noise floor: ±8% with the work held identical

`COMMITS 1 · NN.Nms` on the ENGINE PER STEP table is read constantly as if it were a precise
instrument. It is not. Measured 2026-08-23 across the two `examples/solid` arms of the
`isAlreadyPublished` A/B, on the rows where **VISITED, WRITES and every FABRIC counter were
byte-identical between arms** — i.e. rows where the engine provably did the same work twice:

```
              VISITED  WRITES     window
Create           9043  12001    62.9 -> 63.1   +0.3%
Replace          9042  12000    66.1 -> 64.0   -3.2%
Append          10043  12001    71.1 -> 65.3   -8.2%
Select (moved)   4043 -> 1046   1001 -> 2      10.3 -> 1.0    <- the one real change
```

So the window drifts up to ±8% with the work held constant, and in BOTH directions within one pair
of runs. That is wider than the ~4% floor established for the Create wall time, which is not a
contradiction: the window is a smaller sample of the same run, and it CONTAINS the createNode /
appendChild JSI calls, so it carries the native side's variance without the averaging the full
operation gets.

**Consequence: never attribute a single-digit-percent window movement to a code change.** A window
that moved while the counters did not is noise; a window that moved WITH the counters is signal.
The Select row above is what signal looks like — 10x, alongside a 500x drop in writes.

This also settles a shape that looks paradoxical and is not: fewer writes with a LONGER window.
Seen on Vue the same day (Create 49.8 -> 50.9, Append 50.9 -> 56.0, with writes falling 14003 ->
12003). Solid's control arm above moved -8.2% on Append with writes UNCHANGED, i.e. the same
magnitude in the opposite direction from no cause at all — so the Vue reading needs no mechanism,
it needs a repeat.

---

## An allocation sampler makes a TIMING A/B unreadable — and it looks like a code regression (2026-08-23)

Found while profiling Svelte's first pass. `HeapProfiler.startSampling` costs **~2.3x wall clock**
on a create-shaped workload. Both arms of an A/B ran with it on and the arm under test read
**33 ms -> 77 ms**, which parses perfectly as "that change was a catastrophic regression". Reverting
the change left it at 77 ms — which is the only reason the instrument was suspected at all.

what_actually_happened := {
change_under_test: "applyBagDiff's `Object.keys` loop rewritten as `for...in` + Object.hasOwn",
first_verdict: "33 -> 77 ms, 'for...in is 2.3x slower', revert",
the_revert_did_not_restore_it: "still 77 ms. The sampler had been enabled in the SAME edit that introduced the arm",
real_verdict_with_the_sampler_off: "for...in 32.8 / 33.3 vs Object.keys 35.7 / 34.1 / 33.7 — INSIDE the noise. Neither shape is faster; keep Object.keys, it needs no hasOwn guard",
}

Two rules follow, and the second is the general one:

- **Gate allocation sampling behind an env flag and never leave it on for a timing arm.** A CPU
  sampling profiler at 80us is cheap enough to leave running; a heap sampler is not.
- **A revert that does not restore the baseline means the instrument moved, not the code.** Re-run
  the untouched arm before believing any A/B — that single check is what separated a real 2.3x
  measurement artefact from a fabricated performance claim about `for...in`.

### Profiling a framework adapter's FIRST PASS — the harness shape that works

The engine's own commit walk is already instrumented (`readCommitProfile`). Everything BEFORE it —
the framework runtime plus the adapter's shim — is not, and it is where an adapter's create gap
actually lives (Svelte: ~90 of the ~98 ms it trailed Vue by).

harness := {
mount_every_surface_EMPTY_first: "then time only the row-push. Otherwise a teardown sits inside the profiled window and its GC is charged to the create",
one_module_instance_per_iteration: "`await import('file://...?v=N')` gives each surface its own module-scoped control object, which is what makes the empty-mount-first shape possible at all",
bucket_self_time_by_url: "framework runtime / adapter shim / engine / compiled template / (garbage collector). The bucket table is the finding; the top-40 function list only says which line inside the winning bucket to open",
NODE_ENV=production: "or the framework's dev build is what gets profiled. Vitest resolves esm-env's `development` condition by default",
discount_the_inspector: "`node-internal · post` is the profiler's own transport, 11-12% of self time here. Subtract it before computing percentages",
}

The Svelte instance of this read GC 28.9% / framework 26.9% / engine 16.0% / shim 15.6%, i.e. the
largest bucket was the collector and the second largest was code we do not own. That is what sent
the work to allocation rather than to algorithms — see `svelte-adapter-dom-shim` §34 for the four
fixes and their numbers.

## A second data point on what one component instance costs, and where it stops explaining things

DERIVATION, not a measurement — quote it as such. Two adapters had the same four host-primitive
wrappers per row removed on 2026-08-23, so the per-instance cost can be divided out twice:

```
vue     Create 397.4 -> 296.7   100.7 ms / 4 000 instances   ~25 us
solid   Create 337.9 -> 284.7    53.2 ms / 4 000 instances   ~13 us
```

Vue's figure is INFLATED, because its lowering also bought static-prop hoisting and patch flags
that a component never gets. Solid's compiler emits neither, so ~13 us is the closer read on the
wrapper itself — and the two landing within 2x of each other, from very different runtimes, is what
makes "wrapping a host primitive in a component costs ~10-25 us" worth carrying.

**Where it stops working.** The tempting next step is "so the residual deficit against stock IS
component instances". That holds for Vue and does NOT generalise. Both rows still carry three
instances (the app's own row component + two Pressables), so at ~13 us Solid's remaining instance
cost is ~39 ms of 288.1; removing both Pressables would leave ~262 against stock's ~190. Vue's
arithmetic closes its gap, Solid's leaves ~70 ms unexplained. Whatever else Solid pays on create,
it is not instances — so treat the instance figure as a term in the budget, never as the budget.

## Check the installed engine BEFORE comparing two adapter columns — the version cannot tell you

Each `examples/*` carries its own installed `@symbiote-native/engine`, and **all of them report the
same version whatever build is inside**. Measured 2026-08-23: six examples, all `0.3.0` in the
manifest, three different builds on disk. The three engine cuts of that month — the `styleParts`
field, the prototype move for the public-instance graft, the `fabricProps` payload rewrite — had
reached vue-sfc and svelte, two of three had reached vue-tsx, and react, solid and angular had none:

```bash
for ex in react vue-sfc vue-tsx svelte solid angular; do
  d=examples/$ex/node_modules/@symbiote-native/engine/build
  printf '%-10s %s %s %s\n' "$ex" \
    "$(grep -lq styleParts $d/node.js && echo yes || echo no)" \
    "$(grep -lq 'class SymbioteNode' $d/node.js && echo yes || echo no)" \
    "$(grep -lq addStyle $d/fabric-props.js && echo yes || echo no)"
done
```

Why it matters beyond tidiness: those three were worth ~42 ms of Vue's Create, and the prototype
move is one **Solid and Svelte were specifically owed** (both graft the public instance eagerly;
React does not). So a cross-column deficit computed while one column sits on the older build
silently contains that gap — and it will be attributed to the adapter, because nothing on the
screen says otherwise.

This bit for real: a "~70 ms Solid carries beyond its component-instance cost" figure was derived,
handed to another session, and had to be withdrawn once the installed builds were compared. The
number was not wrong arithmetic; it was arithmetic across two different engines.

`pnpm run registry:publish` then `registry:refresh examples/<name>` re-levels one example. The tool
this paragraph used to name, `overlay-local-packages.mjs`, was deleted 2026-09-02; its default list
was the CI four and **excluded solid**, which is how the table above happened. The registry route
derives its package set from each example's own manifest, so it has no list to fall out of.

## A lowering ratio measured on the benchmark row is an UPPER BOUND — say so beside the number

The benchmark row is the best case for host-primitive lowering, by construction: it never reads
`pressed`, so its `Pressable`s carry no functional style and no parameterised child, and every one
of them lowers. Real screens do not look like that. Measured over `examples/svelte` 2026-08-23, the
preprocessor lowered **7 of 10** `<Pressable>` call sites and refused 3 — `CanaryScreen` twice
(functional style + parameterised snippet) and `ActionButton` once (`style={({pressed}) => …}`) —
and `ActionButton` is the shape that dominates by instantiation site.

So Solid's Create 261.2 → 159.8 (−38.8%, and 0.86x against stock) is real, byte-identical Fabric
and all, AND it is a ceiling rather than an expectation for an arbitrary app. **Those two sentences
belong together.** Quoted alone the number overstates, and it overstates in the direction everyone
already wants to believe, which is what makes it worth a rule.

The refusal rate is cheap to produce and belongs in the same report: run the adapter's real
transform over the example's own sources and count lowered vs refused, naming which construct
refused.

**Count INSTANTIATIONS, not call sites.** The two disagree and the call-site number flatters you,
because a refusing component is usually a shared one. Measured on `examples/vue-sfc` 2026-08-23:
10 of 13 call sites lower — 77%, which reads as almost solved — but one of the three refusals is
`ActionButton`, instantiated **90 times** in that app. So the refusing side dominates the node
count while the lowering side dominates the file count, and the ratio a benchmark is read against
is about nodes. Report both if you like; quote the instantiation one.

**But it is not systematically the WORSE number — it is simply the different one, and which way it
moves depends on whether the dominant component lowers or refuses.** Recounted the same day,
`examples/svelte` went the other way: 8 of 10 call sites (80%) became **96 of 98 instantiations
(98%)**, because the component that dominates there is `ActionButton` at 83 uses and it is the one
that had just been migrated to `:active`. Vue's count fell for the mirror-image reason — its
dominant component was still refusing. So the metric is not a pessimism correction; treating it as
one is how a good result gets talked down and a bad one gets talked up.

**Count STATIC mount sites weighted by component reuse — never runtime multiplicity.** `BenchmarkRow`
is 2 uses in source and 1 000 instances at runtime; folding that in gives 2096 of 2098 and measures
the benchmark rather than the app. The rule invites exactly this inflation, so state the exclusion
beside the number. Screens registered with a navigator by reference read as 0 uses in a grep and
should be counted as one mount each. That also catches the opposite error — a transform that over-fires reads as a
better ratio, so a 10-of-10 result on a real app is a reason to check the refusals, not to
celebrate.

**And weight by what is MOUNTED AT ONCE, which is the trap the two rules above do not cover.**
A per-screen root reads as many sites and is one instance: `examples/svelte` has 18 `<SafeAreaView>`
sites, one per screen, and exactly one screen is mounted — so the honest figure is 1 node out of
~9 000, not 18. "It sits at the root of every screen" reads as high frequency and means the
opposite; the roots are mutually exclusive. Weighting those 18 by reuse gives a number wrong in the
FLATTERING direction, which is why this is its own check and not a corollary.

That count is a whole candidate's worth of work, so run it FIRST. Proposed 2026-08-30: lower
`SafeAreaView`, `RefreshControl` and `InputAccessoryView` across four transforms. Three greps —
18 mounted-one-at-a-time, 0 uses, 0 uses in `examples/svelte` — put the whole batch below the
instrument's resolution, not merely inside the 15-20 ms floor, and it was dropped before anyone
wrote a transform. **Below resolution is a verdict, and it comes with its own reading of the
result: if the number moves, something else moved.** A candidate that cannot express a difference
is the perf twin of `.claude/rules/canary-visual-defects.md`'s step 1.

The migration path is what turns the bound into the number: a refusing `style={({pressed}) => …}`
becomes a lowerable element the moment it moves to an `:active` CSS rule
(`.claude/rules/host-primitive-tier.md`). Report the two counts, and the ceiling stops being
theoretical.

## Predict with a number, not a direction — and prefer a prediction whose MISS has structure

The Svelte Pressable readout is the worked example, and it is the best-instrumented change this
project has made. The prediction, written before the build: lowering removes 3 anchors × 2
Pressables × 1 000 rows ≈ 6 000 of the 8 002 residual anchors, so `renderableChildren` stops losing
its fast path and — unlike Vue's and Solid's lowerings — **the commit window must move too, not
just pass 1**.

```
anchors    8 002 -> 2        predicted ~2 000 would remain
flattens   6 002 -> 2        the direct mechanism behind the window
window      59.9 -> 46.7 ms  pass 1 293.5 -> 107.4
nodes     23 006 -> 9 004    renderable 9 002, level with every other adapter
fabric      9000/8000        createNode / appendChild unchanged
```

Direction and mechanism held; the MAGNITUDE was wrong, and that is where it paid. The residual
2 002 had been attributed to something other than the Pressables and were in fact downstream of
them: a COMPONENT boundary among an each-block's children forces the block to keep per-item
anchors that a purely element child does not need. Removing the last component from the row removed
its own anchors _and_ the block's.

Two rules fall out.

**A prediction that can only be right or wrong teaches less than one whose miss has structure.**
This one was refutable in two independent ways — the window could have held while the total fell
(anchors are not where the model says), or the anchor count could have held. It failed at neither,
and the size error still bought a mechanism nobody had written down.

**A window that moves WITH its counters is signal; a window that moves alone is noise** — the
window's own spread is ±8%, measured on runs whose counters were byte-identical. So state, before
the run, which counter the window is supposed to move with. Here it was `flattens`, and 6 002 → 2
beside 59.9 → 46.7 ms is the pair. Without a named counter the same window drop is unreadable.

Corollary on invariants: state them at the strength they actually hold. The FABRIC oracle here is
`createNode` / `appendChild` / prop keys — clones moved 9 → 11 on container chrome and that
invalidates nothing. An invariant quoted more strictly than it is gets discarded wholesale the
first time it "fails".

## The counters have a BLIND SPOT, and "counters identical → noise" is unsound where it applies

The standing oracle — _a window that moves while the counters hold still is noise; a window that
moves WITH them is signal_ — rests on an assumption nobody had stated: **that all the work passes
through the counters.** One path does not.

`setBehaviorListener` (`core/engine/src/node.ts`) writes into `node.listeners`, a Map, and reaches
`setProp` only for a name in `GATED_EVENT_PROPS`. Every other listener write is invisible to
`WRITES`, to `VISITED`, and to every FABRIC counter. So a change that attaches host behaviors —
tier-2 `Pressable` does six `setBehaviorListener` calls per instance — can add thousands of writes
per Create and leave the instrument reading byte-identical.

Verified at source 2026-08-24, after a Create move of +12.8% arrived with `WRITES 12001/0` matching
the recorded Svelte value exactly. The counters said "nothing changed"; a path they cannot see had.

So before reading a flat counter set as noise, ask which paths the change touches and whether any of
them bypasses `propStats`. Listener attachment is the known one; a new one arrives whenever a
mutation entry point writes somewhere other than `node.props` / `node.children`.

## Count the population BEFORE the work, not only when reporting it

The per-site-vs-per-instance discipline elsewhere in this file exists to keep a lowering RATIO
honest. It has a second use that is worth more and was nearly missed: run it on the CANDIDATE LIST,
before anyone writes a transform.

Measured 2026-08-30. Tier-1 was scoped as three pass-through primitives — `RefreshControl`,
`SafeAreaView`, `InputAccessoryView` — lowered across four adapters, one transform each. The audit
that justified it was a source audit: what does each component body do beyond spreading props. Every
answer was encouraging. Nobody counted the nodes until a session did, and then:

```
SafeAreaView         1 instance per screen, one screen mounted   ->  1 node of ~9000
RefreshControl       0 instances in any example
InputAccessoryView   0 instances in any example
```

So the ceiling on the whole batch was ~0.01% of a create, and four sessions were one message away
from spending a transform pass each on it. The work was cancelled on the count, not on a measurement
— no build, no device run, no instrument.

**The check is one question asked before the plan, not after the patch: how many NODES does this
touch on the tree we actually measure?** A source-level audit answers "is this lowerable" and reads
as a go/no-go, but it is silent on size — and the two questions feel like one because a component
that is easy to lower feels worth lowering. The refusal-population arithmetic already in this file
is the same tool; point it at the candidates first.

The related trap, in the other direction, is on the same page: an APPROVED batch's own population
estimate was quoted per SITE (`4-5 aria sites of ~640 tags = 0.7%`), and per-site figures have been
wrong here by 90x when one site is a component with many call sites. It happened to be sound that
time — all the aria props sat in a single `AccessibilityDemo` file used once per example — but
soundness was established by checking, not by the percentage looking small.

## An acceptance criterion inherits its instrument's blind spot

Written 2026-08-31, while adding a second benchmark arm. The criterion protecting every previously
recorded number was: _the unchanged arm must commit BYTE-IDENTICAL Fabric counters._ It is the right
requirement and it was checkable, and it would still have passed a change that moved the thing it
existed to protect.

The new arm appends one child under a conditional. In Solid that is a `<Show>`, and the question
"what does a FALSY conditional cost" has two answers, not one:

```
                     createNode   retained nodes
plain row                 4             4
+ <Show when={false}>     4             4      <- Solid: free in both
```

Solid pays nothing. **Svelte would have paid 2 retained nodes per site and 0 native ones**
(`svelte-adapter-dom-shim` §32: 14 004 anchors against 9 001 renderable nodes, `{#if}` worth two
apiece). A criterion reading only Fabric counters is blind to exactly that: the anchors never reach
Fabric, so the acceptance check passes while `VISITED` and the reconcile walk both move on 1 000
rows — and the "unchanged" arm silently stops being comparable to every number it was meant to
anchor.

**So an acceptance criterion is a probe, and it carries whatever its instrument cannot see.** Before
accepting one, ask which dimension it reads and whether the change can move a different one. Here
the change was structural, so the retained tree had to be measured beside the native counters; the
result is a measurement either way, and it happened to be free.

The general shape, and it is the same trap this project keeps hitting from new angles: **a check
phrased in one instrument's vocabulary certifies only what that instrument measures.** The nearest
neighbours are `.claude/rules/verify-the-deciding-side.md` on a probe aimed at the wrong file, and
on a guard whose oracle is a proxy — this is the version where the probe is aimed correctly and
reads the wrong DIMENSION.

## The run-to-run spread on a create row is ~15-20 ms, not ~4%

The `~4%` figure recorded elsewhere in this project came from STOCK React Native samples across
sittings. Measured directly by the user on `examples/svelte`, 2026-08-24, repeating the suite on one
unchanged Release binary: **15-20 ms between runs on the create-shaped rows.**

At ~175 ms that is ~10%, more than twice the floor a reader would infer from the 4% figure. A Create
move of 154.1 → 173.9 (+19.8 ms) that looked like a clear regression — outside 4%, with two engine
fixes freshly landed and a plausible mechanism proposed for it — is simply inside the spread, and
carries no verdict at all.

**Quote the floor for the row and the binary you are on, and get it by repeating the suite rather
than by inheriting a number.** Two runs back-to-back on one binary cost thirty seconds and are the
only thing that turns a delta into a finding. Both this project's near-misses on this — reading a
sampler's 2.3x cost as a code regression, and this one — were paid for by a comparison whose noise
floor had never been measured on the arm doing the comparing.

**Confirmed independently on a second adapter, 2026-08-30.** `examples/solid`, one Release binary,
after two press-path engine fixes that cannot touch the create path: Create 159.8 -> 154.3 (-5.5 ms)
while Append 166.8 -> 184.7 (+17.9 ms), with `VISITED` 9041, `WRITES` 12001/0 and every FABRIC counter
(9000/8000/9 @ 32001) byte-identical across the pair. Two create-shaped rows moving in OPPOSITE
directions in the SAME run is the cleanest available proof that the spread is the instrument — no
change can make one create row faster and its twin slower — and +17.9 ms lands exactly in the 15-20 ms
band Svelte established. So the band is a property of the harness, not of one adapter.

The corollary worth having: **on a create row, prefer the ms delta to the percentage.** The same
17.9 ms reads as +10.7% on Solid's Append and would read as +5% on a 350 ms row, so a percentage
silently rescales the floor with the row while the underlying spread does not move.

## Two sessions reading one arm are two SAMPLES — and the band is set by the dominant cost, not the row

Angular's lowered arm was read twice off the device, ~2 minutes apart, one Release binary, no rebuild
between them. Two sessions each read their own screenshot and reported:

```
            14:40-41   14:43      spread
Create        202.3     198.7      -1.8%
Replace       210.9     240.6     +14.1%
Partial        71.0      46.5     -34.5%    <- 24.5 ms on a ~60 ms row
Select         20.9      15.6
Swap           25.8      24.9
Remove         26.5      27.6
Append        201.7     212.9      +5.6%
Clear          34.8      32.6
```

Two things follow, and the second is the one that cost a wrong call.

**A peer reporting different numbers for the arm you just read is a second sample, not a
contradiction.** The reflex is to hunt a transcription error — and the previous section's whole
argument is that a second sample is expensive to get and worth thirty seconds. Here it arrived for
free and was nearly discarded. The check is the clock in the status bar of the screenshot, before
any reconciliation of the two tables.

**The ~15-20 ms band is a CREATE-row figure and does not transfer by row size.** Partial moved
24.5 ms, which is 40% of its own wall, and the reason is visible in the engine profile: Partial's
commit window is 2.7 ms against a 46-71 ms wall, so ~95% of that row is Angular's own pass 1. A row
dominated by framework change detection inherits THAT machinery's variance, not the engine's. So the
floor is a property of `(row, adapter, binary)` — quote all three, and never infer a row's floor from
its magnitude.

The wrong call this produced, stated so it is not repeated: Partial reading 27.6 flat and 46.5 lowered
was called "not noise, because it touches 100 rows and is not a small-ms row". **Row count does not
set a noise floor; the dominant cost does.** Two samples of the lowered arm alone span 46.5-71.0, so
the cross-arm delta carries nothing until the flat arm is sampled twice from the same binary. Create
and Append survive the same test — 202.3/198.7 and 201.7/212.9 both sit inside the create band — which
is why those two rows carry a verdict here and the other six do not.

## The second precondition for comparing two columns: equal PAYLOAD, not equal node count

"Check the installed engine before comparing two adapter columns" has a twin, found 2026-08-30 and
missed for a week. Angular's benchmark column was declared comparable on the strength of `9 nodes/row,
matching every other column`. The node count was right and the conclusion was wrong:

```
                    nodes/row   createNode/appendChild   PROP KEYS
angular flat/lowered    9            9000/8000            26001
every other column      9            9000/8000            32001
```

Exactly 6 fewer keys per row. Angular's flat row reaches its 9 nodes with a bare `View` carrying a
`(press)` listener, while every other column — `examples/bare-rn` included, so stock too — mounts two
real `<Pressable>`s and pays for `hitSlop`, `pressRetentionOffset`, `delayLongPress`, `disabled`,
`android_ripple`, the responder claim and the accessibility fold. The row's own comment said so; the
comparability claim was made from the counter, not from the row.

**Every structural counter agreed while 19% of the payload was absent**, which is why the node count
is the wrong instrument: it measures the tree's shape and says nothing about what each node carries.
The check that catches this is the prop-key total read BESIDE the structural counters — one number,
already on the screen, and it disagrees the moment the rows differ in kind.

The cost was a published ratio. `Append 212.9 vs stock 280.2 = 0.74x, Angular beats stock React
Native` was stated to the user before the shapes were checked, and it is withdrawn: a cheaper row
beating a richer one is not a renderer result. Flat-vs-lowered remains sound because both arms are
Angular's own diagnostic row; only `composed` may be read against another adapter or against stock.

Generalised: **before comparing two columns, name what a single row CONTAINS in each, not how many
nodes it has.** Where the two disagree, the comparison is between benchmarks, not between renderers.

**And then the sentence above was itself too weak — corrected the same day.** "Read the prop-key
TOTAL beside the structural counters" was offered as the fix, and it was promptly used as an
acceptance bar: an Angular arm was told to reach 32 001 keys, the number the other columns read.
That is the same error one level down. A total is reachable by different routes, and the Angular
session's own investigation suggested composed reaches its number partly through four accessibility
gate flags its template forwards eagerly — flags NO other adapter emits. Two columns agreeing on a
total while disagreeing on which keys make it up is a coincidence, not comparability, and an
acceptance bar written on the total ratifies it.

So the check is the **SET of key names**, diffed against one other adapter, not the count. It is
cheaper than the argument about totals it replaces, it says immediately which side is missing what,
and unlike a total it cannot be satisfied by accident. Keep the total as a cheap tripwire — a
disagreement there is always real — but never as the passing condition.

The generative mistake is worth naming because it is easy to repeat: **an acceptance bar copied as a
NUMBER from another column silently assumes both sides reach it the same way.** Copy the derivation,
not the value.

## What the same five frameworks cost on the WEB — the ruler for "is this deficit ours?"

Measured 2026-08-31 off the live krausest results (Chrome 150, keyed, median of the `total`
duration, expressed against `vanillajs-keyed`). This is the number to reach for whenever an adapter
trails its siblings here: it separates "this framework is expensive" from "our adapter is expensive".

```
                                  geo   run1k  create10k  replace  remove  clear
vanillajs-keyed                  1.00    20.2     209.7     21.6     9.6      8.3
solid-v1.9.3                     1.10    20.8     225.5     23.2     9.7     10.7
svelte-v5.42.1                   1.16    21.4     228.4     24.2     9.9      9.6
vue-v3.5.39                      1.26    24.5     264.5     27.0    11.9     11.4
angular-cf-signals-v22.0.0       1.60    34.2     321.5     37.7    12.1     20.0
angular-cf-v22.0.0               1.64    34.5     317.9     39.4     9.5     20.0
react-hooks-v19.2.0              1.78    23.6     424.3     29.1    10.9     16.3
```

Three readings that settle arguments this project has actually had:

- **Angular is mid-pack on the web and BEATS React on the geometric mean.** So "Angular is just a
  slow framework" does not explain a 2.2x native deficit against Vue — on the web the expected gap is
  ~40% on create. A deficit past that is ours.
- **Signals buy Angular almost nothing here** (1.60 vs 1.64), so a native investigation should not go
  looking for wins in converting more state to signals.
- **Angular's `clear` is ~2x everyone else's on the web too.** A row that is anomalous in BOTH places
  is the framework's, not the adapter's — and that is the cheapest way to triage one.

The order matters when quoting it: this is a DOM benchmark and ours is a Fabric one, so the two are
never directly comparable in absolute terms. What transfers is the RANKING and the rough size of the
gaps between frameworks, which is exactly what a "why is this adapter behind" question needs.

The data is not on the page — `current.html` is a 549-byte SPA shell. It lives inline in the bundle
it loads (`index-*.js`), as `ne=[{f:<frameworkIdx>,b:[{b:<benchIdx>,v:{total:[…]}}]}]` beside
`re=[…frameworks…]` and `H=[…benchmarks…]`. Extract those three array literals by bracket-matching
(the bundle quotes with backticks, so a naive scanner breaks) and compute the ratios locally; a
plain fetch of the HTML gets nothing, and `type: 0` is the duration-benchmark filter.

## An acceptance criterion stated in FABRIC counters cannot see a retained-tree cost

Measured 2026-08-31, adding a `TextInput` arm to the benchmark row across six examples. The spec
said the control arm must commit "byte-identical FABRIC counters" — `createNode`, `appendChild`,
prop keys. Every one of those is a count of what reached the slot, and the whole Svelte lowering
story is that anchors never reach the slot at all.

The spec also said HOW to build the arm: one extra child under a condition. On Svelte that is
`{#if}`, and a false one is not free:

```
50 rows, plain shape          anchors   renderable
row with no condition             3        451
row with a FALSE {#if}           53        451
```

One anchor per row, `renderable` unmoved — so the native tree is identical, every stated criterion
passes, and the CONTROL arm now carries 1 000 extra retained nodes at benchmark size. The
contamination lands in exactly the currency the criteria cannot read, on exactly the arm the delta
is measured against.

Two things generalise, and the second is the one that cost the spec:

- **Read both layers whenever a change is structural.** Fabric counters answer "what did native
  receive"; `VISITED` / the retained node count answer "what did the engine keep". A conditional,
  a wrapper, a fragment can be free in the first and not the second — that asymmetry is the
  mechanism behind Svelte's whole anchor story, so it is the first thing to check, not the last.
- **A spec must state the OUTCOME, never the syntax.** "One extra child under a condition" reads
  as a requirement and is really an implementation that happens to be free on some frameworks.
  Solid measured `<Show when={false}>` at 0/0; Svelte measured `{#if}` at +1 anchor per row and
  correctly used two row components with a single condition at the list level instead. Same arm,
  same acceptance, different syntax — and only the second phrasing lets an adapter be right in its
  own idiom (`<adapter_src_follows_framework_idioms>`).

React and bare-rn are exempt by construction rather than by luck, and the check is one grep: the
React adapter creates no anchors at all (`createAnchor` appears in vue, svelte, solid and angular,
and in zero react files), and bare-rn does not go through this engine.

## A `dlog` ARGUMENT is not gated — the callee's own `isDebug()` cannot refuse work already done

`dlog` is off by default and CLAUDE.md prices it at "one property read per call, nothing emitted".
That is true of `dlog`. It is not true of the CALL SITE: the argument is evaluated first, so

```js
dlog(`angular createElement ${name} -> ${descriptor.component}`);
```

builds a string on every one of a Release build's 10 000 `createElement` calls and then throws it
away. Measured 2026-09-02: nine such sites on the Angular renderer's hot paths — `createElement`,
`createComment`, `appendChild` ×2, `insertBefore` ×2, `removeChild` (three `describeHost` calls and
a template literal), `setValue`. No other adapter's renderer logs on these paths at all (vue zero
`dlog` sites, svelte zero, solid one), so this was Angular-only weight in pass 1.

`dlog` accepts a thunk (`string | (() => string)`), which defers the build but allocates a closure
per call. `if (isDebug()) { … }` allocates nothing and is the form the same file already uses for
`tagAnchorForDebug`.

**The oracle has to be a SOURCE assertion, and that is the part worth carrying.** The runtime cannot
distinguish the two: `dlog` gates itself, so an ungated site emits exactly nothing when DEBUG is
off, and every behavioural probe stays green. A first attempt spied on `console.log` and passed in
BOTH arms — the cost being guarded is the argument, which no observer sees.
`adapters/angular/src/renderer/debug-logging.test.ts` brace-matches every `if (isDebug()) {` region
and requires each `dlog(` to fall inside one. It found the hottest site on its first run, which the
hand pass had missed.

Generalise it as: **when the thing you are optimising is invisible to every runtime observer, the
test belongs on the source, not on the behaviour** — and check that the behavioural test you were
about to write can actually fail before trusting it.

## A "touched-set" rewrite: the SPEED case is dead, the ARCHITECTURAL case is not — do not conflate

**Corrected 2026-09-05, same day, after the first version of this section got it wrong.** It was
written as "measured and DECLINED", which took a performance measurement and used it to close an
item that was on the list for two reasons. The numbers below are sound and the conclusion drawn
from them was not: the buffer exists so the adapter's knowledge reaches the engine intact, and a
microsecond count cannot speak to that. Kept here in full, because the measurement is exactly the
right INPUT TO SCOPING — it says do not sell the buffer as a speed win and do not over-engineer it
for O(k) — and because the substitution it demonstrates is worth recognising:

**a measurement can only decide the question it measured.** An item justified on two grounds needs
both answered; measuring the cheaper one and reporting a verdict on the whole is how architectural
work gets closed by a benchmark that was never about it.

Recurring proposal, and it sounds obviously right: the commit walk visits every child of a dirty
parent (`VISITED 1046` for two changed nodes on a 1 000-row list), so replace the boolean dirty
marks with a set of touched nodes and visit only those. Measured 2026-09-05 with `pnpm bench`
BEFORE writing any of it, and the numbers say do not.

```
1 prop, 10 005 nodes across 244 sections   min 0.0124 ms
1 prop, 10 000 nodes FLAT                  min 0.5990 ms      48x
select row (1000 flat rows)                min 0.0526 ms
no-op commit, 9 761 nodes                  min 0.0004 ms
```

Dirty marking already delivers wherever a win exists: at the SAME node count a bushy tree is 48x
faster than a flat one, and a no-op commit is essentially free. What is left is one shape — a single
wide FLAT parent — and there the O(n) is **Fabric's protocol, not our walk**. A parent whose child
set changed must re-specify ALL N child handles to `cloneNodeWithNewChildren`; no dirty structure of
any kind removes that. `reconcile.bench.ts`'s own header said so and it was worth re-reading rather
than re-deriving.

So a touched-set can only remove the per-clean-child `reconcile` CALL, not the O(n) beside it: about
50 ns per visit, so ~25 us on a 1 000-row Select against a device wall time of 5.5-8 ms for that
row. Not worth a rewrite of the commit path.

**And it corrects a framing this branch had been using.** `VISITED 1046` was quoted as "the adapter
told us what changed and we go looking for it again". Half true — the visits are cheap, and the
array rebuild beside them is protocol-mandated. **The number is large and the time is not**, which
is exactly why a count is not a cost.

What the numbers legitimately constrain: expect the buffer to be **performance-neutral**, and hold
it to that rather than to a win. A wide flat parent must still hand `cloneNodeWithNewChildren` all N
handles, so `VISITED`/`WRITES`/FABRIC counters should come out byte-identical — which makes them a
correctness oracle for the change rather than a scoreboard.

Separately, and genuinely small: caching the child-handle ARRAY on the mirror stops a dirty parent
allocating a fresh N-element array per commit. Contained, and the bench above measures it directly.

## `flush()` "moving to the adapters" was already done — under two other names

Same session, same shape: a design item that turned out to describe the existing state. The
contract's `flush()` is meant to put the transaction boundary in the framework's hands rather than
the engine's. It already is — the engine offers two strategies and every adapter picks per call
site:

```
react     1 .commit()                        sync, from resetAfterCommit
vue       8 .requestCommit()                 microtask-coalesced
svelte   11 .requestCommit()
solid     3 .commit()   1 .requestCommit()
angular   3 .commit()  12 .requestCommit()
```

The engine never imposed one. What is missing is only the NAME — `flush()` as the contract's verb
instead of `commit`/`requestCommit` — which is an API-surfacing task, not a behavioural change.
Do not scope it as one.

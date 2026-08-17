# Benchmark screen — porting spec (normative)

## Why this document exists

The benchmark screen is a **RULER**. The point of having one per example is to run the same
measurement under React, Vue, Svelte and Angular and read the differences as differences *in the
adapter*. A difference caused by the screens having drifted apart is worse than no measurement at
all: it is indistinguishable from a real finding, and it will be acted on.

So this is not "port the screen, use your judgement". Everything under INVARIANTS is copied
exactly. Where a framework genuinely cannot express something the same way, that must be reported,
never quietly substituted.

## Normative source — read all three before writing anything

- `examples/react/screens/BenchmarkScreen.tsx` — the screen itself
- `examples/react/components/JsFrameRateMeter.tsx` — the frame / commit meter
- `examples/react/App.css` — the style blocks: `.bench-*`, `.section-header`, `.parity-row`,
  `.note-text`, `.section-label`, `.info-text`, `.hero-*`, `.line-tag*`, `.screen`, `.flex1`

## INVARIANT 1 — the measurement seam (the one that silently voids everything)

The clock **must** stop in the engine's post-commit hook:

```ts
import { registerPostCommit, unregisterPostCommit } from '@symbiote-native/engine';
```

Register on mount, unregister on unmount. Start the clock immediately before the mutation, stop it
inside the hook.

**Do NOT use the framework's own after-render hook** — not `nextTick`, not `tick()`, not
`afterNextRender`, not `useLayoutEffect`. React commits synchronously inside its own commit phase
while Vue / Svelte / Angular schedule `completeRoot` on a microtask, so each framework's hook fires
at a *different point relative to the native commit*. Four different hooks measure four different
quantities under one name and the cross-adapter table becomes fiction. `registerPostCommit` is one
definition of done everywhere: `completeRoot` has returned.

The row count is **passed into** the measure call, never read back from state afterwards — the hook
is registered once and would otherwise close over stale state:

| op | rowCount passed |
|---|---|
| Create · Replace | `ROW_BATCH` |
| CreateLots | `ROW_BATCH_LARGE` |
| Append | `rows.length + ROW_BATCH` |
| Remove | `rows.length - 1` |
| Clear | `0` |
| Select · Swap · Update | `rows.length` |

## INVARIANT 2 — nine native views per row, exactly

`BenchmarkRow` expands to **9** native views:

```
View                        1
Text + RawText   x3         6     (id, label, remove-glyph)
Pressable -> View x2        2
```

A port that produces 8 or 10 puts every number on that screen ~11% off the others. Count them, do
not assume. Keep `NATIVE_VIEWS_PER_ROW = 9` and the markup identical: outer `View.bench-row` (plus
`.bench-row-selected` when selected), `Text.bench-row-id`, `Pressable.flex1` wrapping
`Text.bench-row-label`, `Pressable.bench-row-remove` wrapping `Text.bench-row-remove-text`.

## INVARIANT 3 — constants, verbatim

```
ROW_BATCH                        1000
ROW_BATCH_LARGE                  10000
NATIVE_VIEWS_PER_ROW             9
BENCH_ROW_HEIGHT                 44
UPDATE_STRIDE                    10
UPDATE_SUFFIX                    ' !!!'
SELECT_INDEX                     1
REMOVE_INDEX                     3
SWAP_LOW_INDEX                   1
SWAP_HIGH_INDEX                  998
HISTORY_LIMIT                    20
STICKY_SECTION_COUNT             200
STICKY_ROWS_PER_SECTION          3
SECTION_LIST_SECTION_COUNT       16
SECTION_LIST_ROWS_PER_SECTION    32
SECTION_LIST_ROW_HEIGHT          30
SECTION_LIST_HEADER_HEIGHT       28
SECTION_LIST_FOOTER_HEIGHT       0
```

Meter: `FRAME_BUDGET_MS = 1000/60`, `DROPPED_FRAME_THRESHOLD_MS = FRAME_BUDGET_MS * 1.5`,
`SUSPENDED_FRAME_MS = 1000`, `SAMPLE_WINDOW_MS = 500`. It reports **% of window · nodes/commit ·
ms/commit** — never a µs/node figure, which stopped being meaningful once dirty-marking let the
walk skip nodes (the denominator collapsed while the numerator did not).

## INVARIANT 4 — deterministic row data

Labels come from a seeded LCG, **not** `Math.random()`, so every adapter builds a byte-identical
row list — label length feeds text measurement and that noise would land straight in the compared
numbers:

```
RANDOM_SEED = 1 · LCG_MULTIPLIER = 1_664_525 · LCG_INCREMENT = 1_013_904_223 · LCG_MODULUS = 2 ** 32
randomState = (randomState * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS
nextRandom() = randomState / LCG_MODULUS
```

`ADJECTIVES` / `COLOURS` / `NOUNS` copied verbatim; label is
`` `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}` ``. Row ids start at 1, never reused.

(krausest forbids tuning the IMPLEMENTATION for the benchmark. Pinning the data generator's seed
is not that.)

## INVARIANT 5 — operations, order, labels

```
Create 1,000 rows · Replace all 1,000 rows · Partial update · every 10th row · Select row ·
Swap 2 rows · Remove row · Create 10,000 rows · Append 1,000 rows · Clear
```

`Clear` also empties the recorded history: a duration stays pinned beside its button until that
operation runs again, so a number measured under one set of conditions otherwise reads as current
under another (a Create 10,000 timed in virtualized mode sat next to the button in all-mounted mode
and looked like an all-mounted result). Clear's own measurement still lands.

## INVARIANT 5b — the suite is the comparable output; the buttons are not

**Cross-adapter numbers come from ONE button, `Run benchmark suite`. Individual button presses are
for poking at the screen and MUST NOT be quoted in a comparison.**

Why, measured 2026-08-18 on React Debug, same build, two runs: `Remove row` 87-107 ms against
418.6 ms and `Append 1,000 rows` 953 against 1678 ms, while Create / Replace / Partial / Select /
Swap reproduced inside 1-3%. Both diverging operations cost in proportion to the rows on screen (a
flat parent re-appends every child handle on any structural change), so pressing them by hand
measures whichever buttons were pressed before them. A cross-ADAPTER gap read off those rows is
press order, not the adapter.

The suite fixes the starting state instead. Exact sequence — `runStep` awaits the SAME engine
post-commit seam for untimed steps as for timed ones, so each measurement begins from a state the
suite chose:

```
setup   clear            (untimed, AND ONLY IF the list is non-empty — see below)
TIMED   Create 1,000 rows                from 0
TIMED   Replace all 1,000 rows           from 1,000
TIMED   Partial update · every 10th row  from 1,000
TIMED   Select row                       from 1,000
TIMED   Swap 2 rows                      from 1,000
TIMED   Remove row                       from 1,000
setup   clear, fill 1,000                (untimed)
TIMED   Append 1,000 rows                from 1,000
setup   clear, fill 1,000                (untimed)
TIMED   Clear                            from 1,000
```

Required properties, all of which a port gets wrong by default:

- **No step may be a no-op — this is a HANG, not a slow number.** `commitContainer` returns early
  when a commit produced no native change: in `core/engine/src/commit.ts`,
  `if (!result.changed) { …; return; }` sits ABOVE `runPostCommitHooks()`. So a mutation that
  changes nothing never fires the post-commit hook, its `await` never resolves, and the suite
  stalls until the per-step timeout with the screen stuck on "Running suite…".

  The leading `clear` is therefore **conditional on the list being non-empty** — read the current
  row count at suite start, which every flavor has to hand. Every later step changes the tree by
  construction (`Create` runs from a guaranteed 0; each `fill` mints fresh ids and labels because
  the LCG has advanced; each `clear` runs against a non-empty list), so the leading one is the only
  guarded step.

  An earlier revision of this spec instead prescribed an unconditional warm-up `fill` before that
  `clear`. It was wrong in exactly the case it was meant to cover: press `Create 1,000 rows` once
  on a freshly mounted screen and then run the suite, and `resetRowData()` + `fill` reproduces the
  identical rows, making the warm-up itself the no-op. Caught during the vue-tsx port, fixed in
  all five flavors.
- **`resetRowData()` at the start**, rewinding BOTH the LCG seed and `nextRowId`. They are module
  state and drift with every press, so without the rewind two runs are not the same input.
- **All-mounted only, and no 10,000-row step.** 10 000 rows is 90 000 native views, which the host
  does not survive. A suite that hangs the screen measures nothing.
- **A per-step timeout** (`SUITE_STEP_TIMEOUT_MS`, 30 s) resolving to a `timeout` row rather than
  awaiting forever — a broken adapter must be named in the report, not freeze the screen.
- **Individual operation buttons are inert while the suite runs.** A press mid-suite installs its
  own pending record over the suite's, and the next commit stops the wrong stopwatch — attributing
  one operation's cost to another, silently. The requirement is only that the guard reads the
  CURRENT value at call time; the mechanism is per-framework and a second holder is not wanted.
  React needs a `useRef` because `measure` is a `useCallback` and reading state would capture a
  stale closure. Vue's `ref`, Svelte's `$state` and an Angular signal are all live reads, so those
  three use the single reactive holder that already drives the button title.
- **Output line, verbatim:** `<label> — <duration> · from <startRows> rows`.

## INVARIANT 6 — the two mount modes

- **ALL MOUNTED** — every row straight into the outer ScrollView, krausest's own shape. The only
  mode comparable to the published web numbers, and the only one that dies at 10 000.
- **VIRTUALIZED** — `FlatList` in a bounded box (`.bench-rows-viewport`, 420px) with an exact
  `getItemLayout` over `BENCH_ROW_HEIGHT`. Row count stops deciding how many views exist.

The toggle shows the projected view count when switching INTO all-mounted
(`Switch to all-mounted (90000 views)`): doing that with a large row set in state mounts all of it
on the next commit and hangs the screen, so the number has to be visible before the press.

Row-count line: `rows: N · <views> native views mounted · selected: <id|none>`, where `<views>` is
`rows.length * NATIVE_VIEWS_PER_ROW` all-mounted and `~1 window x 9` virtualized.

## INVARIANT 7 — the two sticky paths

- **PATH A** — plain ScrollView, `stickyHeaderIndices`, `STICKY_SECTION_COUNT` ×
  `STICKY_ROWS_PER_SECTION`, every row mounted, `nestedScrollEnabled`, class `.bench-sticky` (320px).
- **PATH B** — SectionList, `stickySectionHeadersEnabled`, `SECTION_LIST_SECTION_COUNT` ×
  `SECTION_LIST_ROWS_PER_SECTION`, `scrollEventThrottle={16}`, class `.bench-sticky`, and
  **`getItemLayout`** — the flat RN-shaped one. Copy `sectionListItemLayout` verbatim: it decodes a
  flat index into header / item / footer within a section. The section header carries
  `height: SECTION_LIST_HEADER_HEIGHT` inline, because that number must agree with the arithmetic
  and splitting it across two files is how the pair drifts apart.

## INVARIANT 8 — testIDs

`benchmark-scroll` · `bench-op-<opId>` · `bench-result-<opId>` · `bench-row-count` ·
`bench-mount-mode` · `bench-rows-virtualized` · `benchmark-sticky-scroll` ·
`benchmark-sticky-section-list` · `bench-fps` · `bench-dropped` · `bench-walk-share` ·
`bench-walk-nodes-per-commit` · `bench-walk-ms-per-commit` · `bench-fps-reset` ·
`bench-run-suite` · `bench-suite-empty` · `bench-suite-<opId>` (one per timed step)

## Packaging — required; the prop and the seam are unreleased

`SectionList.getItemLayout` and `registerPostCommit` / `unregisterPostCommit` exist only in the
working tree. Point the example's `package.json` at the packed tarballs with `file:` specifiers,
relative to the example dir:

```
file:../../core/engine/symbiote-native-engine-0.2.0.tgz
file:../../adapters/vue/symbiote-native-vue-0.4.0.tgz
file:../../adapters/svelte/symbiote-native-svelte-0.2.1.tgz
file:../../adapters/angular/symbiote-native-angular-0.7.0.tgz
```

**Both** deletions are required or npm silently serves a stale extracted copy:

```
rm -rf node_modules/@symbiote-native/<pkg> && rm -f package-lock.json && npm install
```

Verify against the INSTALLED build, not the install output:

```
grep -c registerPostCommit node_modules/@symbiote-native/engine/build/index.d.ts   # expect 1
```

Always `pnpm pack`, never `npm pack` (see the `examples_vs_dot_examples` invariant in CLAUDE.md).
The `file:` specifiers are temporary and get swapped back at release.

## Wiring

Add the route the way the example's own siblings do — its `routes.ts` (or equivalent),
`navigation-lines.ts`, the menu screen, `App.*`. Route name `Benchmark`, `performance` line colour,
same hero copy. `.claude/rules/canary-flavor-self-reference.md` applies: a canary names ITS OWN
framework, never React Native, in any user-visible string.

## Verify

**Use the flavor's OWN typecheck script — `npm run typecheck` — never a literal `tsc -p
tsconfig.json`.** Measured 2026-08-18 on `examples/vue-tsx`: its `tsconfig.json` inherits
`"jsx": "react-jsx"`, so a bare `tsc` resolves the React JSX namespace and every Vue TSX file in
the example fails TS2607/TS2786 — 447 errors in `CanaryScreen.tsx` alone, all pre-existing. That
flavor's real gate is `vue-tsc -p tsconfig.typecheck.json`, which points `jsxFactory` at
`VueJsx.createElement` precisely to dodge it. Angular additionally needs a real AOT build
(`tsconfig.angular.json`), because plain `tsc` misses template-typing failures.

```
cd examples/<flavor>
npm run typecheck
npx eslint <files added>
npx prettier --check <files added>
```

Lint and format the ADDED files only, and check a pre-existing sibling before reporting a failure:
several examples have files that already fail prettier/eslint on `HEAD`, and a flavor-inappropriate
rule can fire on idiomatic code (React's `no-unstable-nested-components` on Vue scoped slots).

**`npx eslint` on a `.vue` or a `.svelte` file checks NOTHING, and exits 0 while saying so.**
Verified 2026-08-18 in `examples/vue-sfc` and `examples/svelte`: every example's `eslint.config.js`
is a bare re-export of `@react-native/eslint-config/flat`, whose flat-config `files` patterns cover
only `.js/.jsx/.ts/.tsx`. An unmatched file is reported as `File ignored because of a matching
ignore pattern` — a WARNING, exit code 0 — and `eslint --print-config` on it returns `undefined`.
So "eslint clean" on those two flavors is vacuous, and quoting it as verification is how an
unlinted screen ships looking checked. It is not an ignore-file problem; `--no-ignore` changes
nothing.

| flavor | linted by eslint? | the real gates |
| --- | --- | --- |
| react (`.tsx`) · vue-tsx (`.tsx`) · angular (`.ts`) | yes | `npm run typecheck` + eslint + prettier |
| vue-sfc (`.vue`) · svelte (`.svelte`) | **no** | `npm run typecheck` (`vue-tsc` / `svelte-check`) + prettier |

Report: files added/changed, how many native views the row expands to **and how that was counted**,
which hook stops the clock, and the actual verification output. Any invariant that could not be met
exactly must be named, not substituted.

## Known, legitimate differences — read these BEFORE comparing any two columns

The ports are identical everywhere the spec can make them identical. These two places it cannot,
and both change how a number must be read. Neither is drift; both were found while porting and are
recorded here so nobody reads them as findings.

**1. PATH A is not comparable on Svelte — it does strictly less work.**
`ScrollView.stickyHeaderIndices` is a documented KNOWN GAP on that adapter
(`adapters/svelte/src/components/scroll-view/scroll-view-props.ts:7-15`): Svelte hands a component
an opaque `Snippet` — a render function, not an indexable child list — so there is no mechanical
way to pull "child at index N" out and re-wrap it, the way React's `Children.toArray` and Vue's
`slots.default()` do. The Svelte port composes each header with `ScrollViewStickyHeader` by hand,
so the MOUNTED VIEW COUNT matches; what is absent is header cross-talk — no `headerLayoutYs` map,
so `nextHeaderLayoutY` is undefined and a pinned header is never pushed off by the next one.
A faster PATH A on Svelte therefore means "did less", not "did it quicker".
PATH B (`SectionList` / `stickySectionHeadersEnabled`) has no such gap and IS comparable — worth
knowing, because the canaries' own sticky screen (`ParityDemo`) uses PATH B on every flavor, so
earlier cross-adapter sticky observations are not affected by this.

**2. Angular carries one extra anchor node per component instance.**
Every `<BenchmarkRow>` also gets a non-painting anchor host (`ANCHOR_HOST_COMPONENTS`,
`angular-adapter` skill §11). It creates NO native view, so INVARIANT 2's count of 9 still holds and
the millisecond figures stay comparable — but the engine's shadow tree carries one extra node per
row, and that shows up in the meter's **`nodes / commit`**. React's `memo`'d row adds none. Compare
`nodes / commit` across adapters only with that offset in mind.

## The drift check — this document, read against the reference screen

`examples/react/screens/BenchmarkScreen.tsx` is the reference. After ANY edit to a benchmark
screen, diff the changed flavor against it invariant by invariant, and prove INVARIANT 2 (nine
native views per row) against a fake Fabric slot — that one cannot be read off the source at all.

**A grep-based parity script used to live at `scripts/audit-benchmark-screen-parity.mjs`. It was
deleted 2026-08-18 and should not be rebuilt.** It matched strings, not meaning, and every failure
mode it had was the same one: it reported PASS on screens that had genuinely drifted. It matched
tokens inside comments (a comment reading "not Math.random()" failed the no-random check); it
demanded everything live in one file until it was taught to follow imports (vue-sfc factors the
sticky blocks out, which is idiomatic); and its one substantive check — that the `getItemLayout`
arithmetic agreed across flavors — extracted the object RETURN TYPE annotation instead of the
function body, so it compared a string identical in every flavor and passed vacuously until a
deliberate mutation test caught it. A check that cannot fail is worse than no check, because the
green line gets quoted as evidence. Compare against the reference and this spec instead.

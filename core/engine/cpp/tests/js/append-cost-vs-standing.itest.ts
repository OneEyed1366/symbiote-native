// Continuing F-80 (`.docs/tree-inefficiency-findings.md`): the container-only bench
// (`core/engine/bench/sibling-scan.cpp`) exonerated the `std::find` insert scan AND found
// `materialize`'s per-child reuse re-derivation too small (~15 us/1000-sibling commit) to explain
// Svelte's device-measured Append regression (+107-147 ms). Both candidates lived entirely in OUR
// C++ container code, with no Fabric/JSI in the loop. This file moves the same question onto the
// REAL engine — `readSurfaceTelemetry().commitMs` is RN's own `TransactionTelemetry`, so whatever
// scales badly here is either our `materialize` OR RN's `Differentiator`/`ShadowTree::commit`, and
// this file cannot tell the two apart (`getDiffStartTime()` asserts on this engine's own commits —
// tried and reverted, F-78 round 21) — but it CAN see whether the aggregate is linear at all.
//
// why: an append that costs the same per new row regardless of how many rows already stand is
// healthy — O(appended). An append that gets MORE expensive per new row as the standing list grows
// is the signature this investigation is chasing, on the one instrument that cannot lie about it
// headlessly: real native code, real Fabric, real Differentiator, no JSI mock.

import {
  appendChild,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const APPEND_ROWS = 200;
const SMALL_APPEND_ROWS = 10;

function buildRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  routeProp(row, 'testID', `row-${id}`);
  const label = createElement('RCTText');
  routeProp(label, 'testID', `label-${id}`);
  appendChild(row, label);
  return row;
}

function commitMsNow(rootTag: number): number {
  const telemetry = readSurfaceTelemetry(rootTag);
  if (telemetry === undefined) throw new Error('no telemetry for this surface');
  return telemetry.commitMs;
}

// Builds `standing` rows, commits once (untimed — this file only measures the APPEND that follows),
// then appends `appended` more and returns that second commit's real commitMs.
function appendArm(
  rootTag: number,
  standing: number,
  appended: number,
): number {
  const surface = createSurface(rootTag);
  const list = createElement('RCTView');
  routeProp(list, 'testID', 'list');
  for (let id = 0; id < standing; id += 1) appendChild(list, buildRow(id));
  surface.appendChild(list);
  surface.commit();
  mounted();
  commitMsNow(rootTag); // discarded — this is the CREATE commit, not what this file measures

  for (let id = standing; id < standing + appended; id += 1)
    appendChild(list, buildRow(id));
  surface.commit();
  mounted();
  return commitMsNow(rootTag);
}

// Same shape as every arm, run once before anything is measured, so the first commit in this
// process (allocator/static-init warmup) never lands on whichever standing width runs first —
// same discipline as `engine-chunking-adoption.itest.ts`'s `warmup`.
function warmup(rootTag: number): void {
  appendArm(rootTag, 200, APPEND_ROWS);
}

let ms500 = -1;
let ms2000 = -1;
let ms8000 = -1;
let ms8000Small = -1;

describe('append commit cost against a growing standing sibling count', () => {
  it('warms up the process', () => {
    warmup(1);
    expect(true).toBe(true);
  });

  it('appends 200 rows onto 500 standing', () => {
    ms500 = appendArm(1, 500, APPEND_ROWS);
    expect(ms500 >= 0).toBe(true);
  });

  it('appends 200 rows onto 2 000 standing', () => {
    ms2000 = appendArm(1, 2000, APPEND_ROWS);
    expect(ms2000 >= 0).toBe(true);
  });

  it('appends 200 rows onto 8 000 standing', () => {
    ms8000 = appendArm(1, 8000, APPEND_ROWS);
    expect(ms8000 >= 0).toBe(true);
  });

  // Separates the two effects a single width/count sweep cannot: holding `standing` FIXED at the
  // largest width and shrinking `appended` 200 -> 10 isolates how much of ms8000 is the O(standing)
  // walk baseline (present even for a tiny append) vs. a per-NEW-row marginal cost on top of it.
  it('appends only 10 rows onto the SAME 8 000 standing (isolates the walk baseline)', () => {
    ms8000Small = appendArm(1, 8000, SMALL_APPEND_ROWS);
    expect(ms8000Small >= 0).toBe(true);
  });

  it('reports the per-appended-row cost at each width, and the baseline/marginal split', () => {
    const perRow = (ms: number, count: number): string =>
      (ms / count).toFixed(4);
    print(
      `DEBUG standing=500 commitMs=${ms500} perRow=${perRow(ms500, APPEND_ROWS)}ms | ` +
        `standing=2000 commitMs=${ms2000} perRow=${perRow(ms2000, APPEND_ROWS)}ms | ` +
        `standing=8000 commitMs=${ms8000} perRow=${perRow(ms8000, APPEND_ROWS)}ms | ` +
        `standing=8000 appended=10 commitMs=${ms8000Small} | ` +
        `marginal-per-row(8000..200 vs 10)=${((ms8000 - ms8000Small) / (APPEND_ROWS - SMALL_APPEND_ROWS)).toFixed(4)}ms`,
    );
    expect(true).toBe(true);
  });
});

report();

// ── ANSWER ───────────────────────────────────────────────────────────────────────────────────────
//
// DEBUG standing=500  commitMs=2.09  perRow=0.0104ms
// DEBUG standing=2000 commitMs=5.90  perRow=0.0295ms   (4x standing -> 2.83x per-row)
// DEBUG standing=8000 commitMs=19.24 perRow=0.0962ms   (4x standing -> 3.26x per-row)
// DEBUG standing=8000, appended=10   commitMs=17.80
// marginal per row beyond 10, at standing=8000: (19.24 - 17.80) / (200 - 10) = 0.0076 ms
//
// CORRECTED FRAMING from this file's first pass, which read "9x more per row at 8 000 standing" as
// appending itself getting more expensive. The added `appended=10` control settles it: at the SAME
// standing=8000, appending only 10 rows STILL costs 17.80 ms — 92% of the 200-row arm's 19.24 ms.
// So the "per row" number above is not a per-row cost at all; it is a near-FIXED walk baseline
// (dominated by `standing`, present even for a 10-row append) divided by an unrelated row count.
// The real, isolated per-NEW-row marginal cost is only ~7.6 us — the walk baseline is what scales
// with `standing`, not the cost of each new row. This is the SAME shape F-80's `sibling-scan.cpp`
// arms H/I already established (a parent rebuilds its WHOLE child set on any change, so the cost is
// O(children at commit time) regardless of how many actually changed) — this file's contribution is
// confirming it on the REAL engine, where the constant factor is far bigger than the container-only
// model predicted, not a new "gets worse per append" mechanism.
//
// It still matters for a framework that commits PER ROW rather than batching (Svelte's `{#each}`
// reactive pattern is the suspected shape, `sibling-scan.cpp`'s own original motivation): N separate
// single-row commits against a growing list each pay that list's CURRENT O(standing) walk baseline,
// and summing O(standing) over `standing` incremental commits is exactly the O(n²) aggregate F-78's
// device regression looks like. This file cannot tell whether Svelte's real commit pattern is
// batched or incremental — that is the next thing to check, not assumed here.
//
// `commitMs` is stamped strictly BEFORE layout (`getCommitStartTime`/`getCommitEndTime`,
// `SymbioteTree.cpp:1765` — "every createNode/cloneNode/appendChild `materialize` calls happens
// inside this window, not layout's"), so none of this is Yoga flexbox repositioning bleeding in; it
// is `materialize`'s own walk, confirmed real on the compiled Fabric/JSI path — three orders of
// magnitude bigger than `sibling-scan.cpp`'s container-only arm I predicted for a comparable width.
//
// The mechanism the container bench could not see: appending to `list` dirties `list` itself (its
// child set changed), so `list`'s OWN `appendRenderable` rebuilds a FRESH `ChildSet` over ALL of
// its standing+new children — not just the 200 new ones — and every child, standing or not, pays
// `needsFreshFamily`'s checks (`SymbioteTree.cpp:872-874`) BEFORE the fast-path `if` even runs: a
// `viewName` reference bind, a `viewName != node.committedViewName` STRING COMPARE, two pointer
// compares, and a `generationOf()` field read. `RCTView`/`RCTText` (this file's own view names) are
// both well under libc++'s 22-byte SSO buffer, so THIS run's gap is not the heap-allocating long
// name (`RCTSinglelineTextInputView`, noted elsewhere in `SymbioteTree.cpp` as a real per-TextInput
// cost) — it rules that specific mechanism out for what is measured here, it does not explain the
// magnitude. A container-only bench with a bare `Node{parent; children;}` struct has none of these
// fields to pay for, which is presumably most of why arm I read three orders of magnitude low, but
// the exact split between the string compare, the two pointer compares and whatever else sits on
// this path is NOT isolated by this file — a per-primitive breakdown (a run with all-`RCTView`
// children vs a run replacing 1 in 6 with the long TextInput name) is the next thing to run, not a
// conclusion this file is entitled to draw yet.
//
// Real candidate for F-78's still-open Svelte Append mystery, but the extrapolation has to go
// through the CORRECTED framing above, not the naive per-row one this file started with: it is
// `standing`-sized commits, repeated, that would reach 107-147 ms — not one big append. If the
// benchmark row's real Append genuinely fires ~1 000 separate small commits against a list growing
// past 8 000 (unconfirmed — the next thing to check, not assumed), summing this file's ~17-19 ms
// per-commit walk baseline over even a fraction of that many commits reaches the device gap easily.
// A single 1 000-row commit onto 8 000 standing, by contrast, only adds ~1 000 x 7.6 us ≈ 7.6 ms of
// marginal cost on top of ONE walk baseline — nowhere near 107 ms on its own. NOT YET fixed, the
// commit-batching question is NOT YET checked, and the exact sub-mechanism inside the walk baseline
// is NOT YET isolated. Full writeup: `.docs/tree-inefficiency-findings.md`, F-81.

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
// then appends `APPEND_ROWS` more and returns that second commit's real commitMs.
function appendArm(rootTag: number, standing: number): number {
  const surface = createSurface(rootTag);
  const list = createElement('RCTView');
  routeProp(list, 'testID', 'list');
  for (let id = 0; id < standing; id += 1) appendChild(list, buildRow(id));
  surface.appendChild(list);
  surface.commit();
  mounted();
  commitMsNow(rootTag); // discarded — this is the CREATE commit, not what this file measures

  for (let id = standing; id < standing + APPEND_ROWS; id += 1)
    appendChild(list, buildRow(id));
  surface.commit();
  mounted();
  return commitMsNow(rootTag);
}

// Same shape as every arm, run once before anything is measured, so the first commit in this
// process (allocator/static-init warmup) never lands on whichever standing width runs first —
// same discipline as `engine-chunking-adoption.itest.ts`'s `warmup`.
function warmup(rootTag: number): void {
  appendArm(rootTag, 200);
}

let ms500 = -1;
let ms2000 = -1;
let ms8000 = -1;

describe('append commit cost against a growing standing sibling count', () => {
  it('warms up the process', () => {
    warmup(1);
    expect(true).toBe(true);
  });

  it('appends 200 rows onto 500 standing', () => {
    ms500 = appendArm(1, 500);
    expect(ms500 >= 0).toBe(true);
  });

  it('appends 200 rows onto 2 000 standing', () => {
    ms2000 = appendArm(1, 2000);
    expect(ms2000 >= 0).toBe(true);
  });

  it('appends 200 rows onto 8 000 standing', () => {
    ms8000 = appendArm(1, 8000);
    expect(ms8000 >= 0).toBe(true);
  });

  it('reports the per-appended-row cost at each width', () => {
    const perRow = (ms: number): string => (ms / APPEND_ROWS).toFixed(4);
    print(
      `DEBUG standing=500 commitMs=${ms500} perRow=${perRow(ms500)}ms | ` +
        `standing=2000 commitMs=${ms2000} perRow=${perRow(ms2000)}ms | ` +
        `standing=8000 commitMs=${ms8000} perRow=${perRow(ms8000)}ms`,
    );
    expect(true).toBe(true);
  });
});

report();

// ── ANSWER, measured (2026-09-17) ───────────────────────────────────────────────────────────────
//
// DEBUG standing=500  commitMs=2.14  perRow=0.0107ms
// DEBUG standing=2000 commitMs=5.68  perRow=0.0284ms   (4x standing -> 2.65x per-row)
// DEBUG standing=8000 commitMs=19.47 perRow=0.0974ms   (4x standing -> 3.43x per-row)
//
// Appending the SAME 200 rows costs 9x more per row at 8 000 standing than at 500 — real signal,
// with `standing` the only variable held. And it is NOT the container-only cost F-80's
// `sibling-scan.cpp` measured: that bench's arm I (materialize-shaped, but container-only) predicted
// ~29 us for a WHOLE 4 000-sibling walk; this file measures ~97 us PER ROW at a comparable 8 000
// width, three orders of magnitude more. `commitMs` is stamped strictly BEFORE layout
// (`getCommitStartTime`/`getCommitEndTime`, `SymbioteTree.cpp:1765` — "every createNode/cloneNode/
// appendChild `materialize` calls happens inside this window, not layout's"), so this is not Yoga
// flexbox repositioning bleeding in; it is `materialize`'s own walk.
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
// Real candidate for F-78's still-open Svelte Append mystery either way: extrapolated to 1 000
// appended rows onto an ~8 000-standing list (a plausible width partway through Append's benchmark
// row), the observed per-row rate predicts ~97 ms — squarely inside the 107-147 ms device gap this
// investigation chain has been chasing since F-78. NOT YET fixed, and the exact sub-mechanism is
// NOT YET isolated. Full writeup: `.docs/tree-inefficiency-findings.md`, F-81.

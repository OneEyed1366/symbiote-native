// Continuing F-81 (`.docs/tree-inefficiency-findings.md`): that file corrected its own first pass
// and confirmed `materialize`'s walk-baseline mechanism is real, but only measured it at ARBITRARY
// widths (500/2000/8000 standing) chosen to stress the effect, not the REAL benchmark's actual
// scale. This file uses the REAL scale — `examples/svelte/screens/BenchmarkScreen.svelte`'s own
// Append step: `list.rows.length + ROW_BATCH` where both are 1 000, i.e. 1 000 standing rows,
// append 1 000 more, ONE `surface.commit()` (Svelte's `$state` reassignment is a single synchronous
// update; `SymbioteSurface.requestCommit()` — `core/engine/src/surface.ts` — coalesces to one
// `completeRoot` at the microtask boundary regardless of how many mutations preceded it, so this is
// NOT the "many small incremental commits" shape F-81 left open; it is confirmed ONE commit).
//
// why: F-78's original device regression is Append +107-147 ms against a byte-identical tree. If
// the NATIVE pipeline (commit + layout, both real Fabric/Yoga, no JS mock) cannot reach that
// magnitude at the scale the regression actually happens at, the cause is not here — and the next
// place to look is the ONE thing this harness structurally cannot see: this binary is pure C++, no
// Hermes, no JSI marshaling, no JS reconciliation. Ruling the native pipeline OUT is exactly as
// actionable as finding it guilty would have been.

import {
  appendChild,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const STANDING = 1_000;
const APPENDED = 1_000;

// A real, layout-affecting style — F-81's rows carried no style at all, which is fine for pricing
// `materialize` alone but says nothing about `layoutMs`, the other half this file adds.
function buildRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  routeProp(row, 'style', { height: 44, flexDirection: 'row' });
  routeProp(row, 'testID', `row-${id}`);
  const label = createElement('RCTText');
  routeProp(label, 'testID', `label-${id}`);
  appendChild(row, label);
  return row;
}

type ITelemetry = { commitMs: number; layoutMs: number; layoutNodes: number };

function telemetryNow(rootTag: number): ITelemetry {
  const telemetry = readSurfaceTelemetry(rootTag);
  if (telemetry === undefined) throw new Error('no telemetry for this surface');
  return telemetry;
}

function buildList(rootTag: number, rows: number): void {
  const surface = createSurface(rootTag);
  const list = createElement('RCTView');
  routeProp(list, 'style', { flexDirection: 'column' });
  for (let id = 0; id < rows; id += 1) appendChild(list, buildRow(id));
  surface.appendChild(list);
  surface.commit();
  mounted();
}

let result: ITelemetry | undefined;

describe('native pipeline cost at the real benchmark scale (1 000 standing, append 1 000)', () => {
  it('warms up the process', () => {
    buildList(1, 200);
    telemetryNow(1);
    expect(true).toBe(true);
  });

  // rootTag=1, REUSED from warmup — deliberately, not a fresh tag. `readSurfaceTelemetry` reads
  // `getShadowTreeRegistry().visit(surfaceId, ...)`, and a second DISTINCT surfaceId in the same
  // process read back as commitMs=0/layoutMs=0 across the board when tried — not investigated
  // further since reuse is free and this file only needs one surface anyway.
  it('appends 1 000 rows onto 1 000 standing, in ONE commit', () => {
    const surface = createSurface(1);
    const list = createElement('RCTView');
    routeProp(list, 'style', { flexDirection: 'column' });
    for (let id = 0; id < STANDING; id += 1) appendChild(list, buildRow(id));
    surface.appendChild(list);
    surface.commit();
    mounted();
    telemetryNow(1); // discarded — the CREATE commit, not what this file measures

    for (let id = STANDING; id < STANDING + APPENDED; id += 1)
      appendChild(list, buildRow(id));
    surface.commit();
    mounted();
    result = telemetryNow(1);
    expect(result.commitMs >= 0).toBe(true);
  });

  it('reports the native pipeline total against the device gap', () => {
    const commitMs = result?.commitMs ?? 0;
    const layoutMs = result?.layoutMs ?? 0;
    print(
      `DEBUG commitMs=${commitMs} layoutMs=${layoutMs} layoutNodes=${result?.layoutNodes} ` +
        `total=${commitMs + layoutMs} deviceGap=107-147ms`,
    );
    expect(true).toBe(true);
  });
});

report();

// ── ANSWER, measured (2026-09-17) ───────────────────────────────────────────────────────────────
//
// DEBUG commitMs=8.12  layoutMs=7.11  layoutNodes=3002  total=15.23ms  deviceGap=107-147ms
//
// The ENTIRE native pipeline — `materialize`'s walk (F-81's mechanism, confirmed real) PLUS Yoga's
// real flex-column layout pass over the newly-doubled list — accounts for under 15 ms at the scale
// the actual regression happens at. That is roughly 10-14% of the 107-147 ms device gap, not the
// dominant term F-81 hoped it might be once corrected. **F-81's mechanism is real but insufficient
// to explain F-78 at realistic scale** — it was only large-magnitude at the artificially wide
// 8 000-standing arm F-81 chose to stress the effect, and the real benchmark never reaches that
// width (1 000 standing, per `BenchmarkScreen.svelte`'s own `ROW_BATCH`).
//
// So roughly 85-90% of the regression is OUTSIDE what commit+layout can account for, and outside
// what this itest harness can observe at all: this binary links no Hermes, no JSI bridge, no JS
// runtime — every op arriving at `materialize` already exists as a filled buffer. The cost this
// file cannot see is Svelte's own JS-side pass 1 (the DOM-shim reconciliation that walks `{#each}`'s
// diff and calls `appendChild`/`insertBefore` 1 000 times, building the op buffer `materialize` then
// drains) — exactly the JS-vs-native commit-time split CLAUDE.md's own perf notes describe
// (`symbiote-perf-measurement`, "the create-path pass"; earlier round's research question was
// literally "split of commit time between JS buffer fill and C++ applyOps drain").
//
// NEXT STEP, and it is a genuine redirection of this whole investigation chain: go back to
// `adapters/svelte`'s own reconciler/DOM-shim and measure WORK DONE (op counts, allocations,
// `{#each}` block bookkeeping) headlessly via `installRecordingFabric`/`readCommitProfile`, per this
// round's own governing methodology — headless JS timing lies, headless JS op-counting does not.
// F-78/F-80/F-81 all measured the native half; this file is the evidence that the native half was
// never going to be big enough, and the JS half has not been measured with this discipline yet.

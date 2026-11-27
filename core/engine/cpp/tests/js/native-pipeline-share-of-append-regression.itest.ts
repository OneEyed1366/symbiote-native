// Prices the native pipeline, commit plus Yoga layout, at the benchmark's real Append scale
// 1 000 standing rows, 1 000 appended, one `surface.commit()`, as in `BenchmarkScreen.svelte`
// This binary has no Hermes or JSI, so it rules the native half in or out and sees nothing of JS

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

// A real, layout-affecting style, as a row with no style would price `materialize` alone
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

  // Tag 1 is reused from the warmup, as `readSurfaceTelemetry` read zeros for a second surface id
  // in this process, and one surface is all this file needs
  it('appends 1 000 rows onto 1 000 standing, in ONE commit', () => {
    const surface = createSurface(1);
    const list = createElement('RCTView');
    routeProp(list, 'style', { flexDirection: 'column' });
    for (let id = 0; id < STANDING; id += 1) appendChild(list, buildRow(id));
    surface.appendChild(list);
    surface.commit();
    mounted();
    telemetryNow(1); // discarded, this is the create commit and not what the file measures

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

// Result: commitMs=8.12 layoutMs=7.11 layoutNodes=3002, total 15.23ms vs 107-147ms on device
// The whole native pipeline is 10-14% of the gap, so it cannot explain the regression

// The other 85-90% is outside this harness: no Hermes, no JSI, and every op reaching
// `materialize` is already a filled buffer, so the JS pass that fills it is unmeasured

// Next: measure the Svelte renderer's own work (op counts, allocations, `{#each}` bookkeeping)
// headlessly with `installRecordingFabric` and `readCommitProfile`, as op counts beat JS timing

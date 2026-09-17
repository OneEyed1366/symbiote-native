// What a teardown costs once the engine knows host behaviors exist — which in a real app is always.
//
// why: `removeChild` nominates a detach candidate only when `hasHostBehaviors() ||
// hasAnimatedBindings()`, and `sweepDetachedBehaviors` then walks every removed node at commit. That
// gate is a MODULE-GLOBAL flag set the first time any behavior registers, which
// `@symbiote-native/components` does at load — so in an app it is on from the first frame whether or
// not the screen holds a single Pressable.
//
// Every headless measurement in this directory imports only `@symbiote-native/engine`, so the gate
// has been OFF in all of them and the sweep has never run. `Clear` is also the one row where stock
// React Native beats every adapter on device (10.7 ms against 9.1-44.2), and the C++ quadratic fixed
// in `child-list-scaling.itest.ts` accounted for about a millisecond of it. This file measures the
// other candidate.
//
// THE TWO CASES MUST RUN IN THIS ORDER and cannot be reordered: `registerHostBehavior` sets the flag
// for the whole process and nothing turns it off, so the gate-off reading has to be taken first.
// The behavior registered is for a component name nothing in the fixture uses — the subject is the
// FLAG, not a machine, and attaching a real one would measure that instead.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  readSurfaceTelemetry,
  registerHostBehavior,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;
/** The benchmark row: ten nodes, so a clear tears down ten thousand. */
const NODES_PER_ROW = 10;

function buildRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  routeProp(row, 'style', { height: 44, flexDirection: 'row' });

  const label = (text: string): ISymbioteNode => {
    const node = createElement('RCTText');
    routeProp(node, 'ellipsizeMode', 'tail');
    appendChild(node, createRawText(text));
    return node;
  };

  appendChild(row, label(String(id)));
  for (const text of [`row ${id}`, 'x']) {
    const cell = createElement('RCTView');
    routeProp(cell, 'style', { flex: 1 });
    appendChild(cell, label(text));
    appendChild(row, cell);
  }
  const input = createElement('RCTSinglelineTextInputView');
  routeProp(input, 'style', { width: 96, height: 28 });
  appendChild(row, input);
  return row;
}

type IClear = {
  fill: number;
  apply: number;
  commit: number;
  hostReadMs: number;
  hostReadHandles: number;
};

/** Build a standing list, then time removing every row of it. */
// BEST OF N, for the reason `child-list-scaling.itest.ts` spells out: timing noise is one-sided — it
// only ever ADDS — so the smallest of several runs is the closest reading to the work itself. The
// ratio below is two ~4 ms readings divided, which makes it far more sensitive to one slow sample
// than to the regression it guards against, and it went red once in a full 71-process suite run
// while passing alone.
//
// Each sample builds and tears down its own thousand rows, so no two share a tree.
const SAMPLES = 4;

function bestClear(): IClear {
  let best: IClear | undefined;
  for (let run = 0; run < SAMPLES; run += 1) {
    const sample = timeClear();
    const total = sample.fill + sample.apply + sample.commit;
    if (best === undefined || total < best.fill + best.apply + best.commit)
      best = sample;
  }
  if (best === undefined) throw new Error('no sample was taken');
  return best;
}

function timeClear(): IClear {
  const surface = createSurface(ROOT_TAG);
  const list = createElement('RCTView');
  routeProp(list, 'style', { flex: 1 });
  const rows: ISymbioteNode[] = [];
  for (let id = 0; id < ROWS; id += 1) {
    const row = buildRow(id);
    rows.push(row);
    appendChild(list, row);
  }
  surface.appendChild(list);
  flushOps();
  surface.commit();
  mounted();
  // Drained, so the host-read counters below describe the TEARDOWN and not the build.
  readSurfaceTelemetry(ROOT_TAG);

  let startedAt = performance.now();
  for (const row of rows) removeChild(list, row);
  const fill = performance.now() - startedAt;

  startedAt = performance.now();
  flushOps();
  const apply = performance.now() - startedAt;

  startedAt = performance.now();
  surface.commit();
  const commit = performance.now() - startedAt;
  mounted();
  const telemetry = readSurfaceTelemetry(ROOT_TAG);
  return {
    fill,
    apply,
    commit,
    hostReadMs: telemetry?.hostReadMs ?? 0,
    hostReadHandles: telemetry?.hostReadHandles ?? 0,
  };
}

let withoutBehaviors: ReturnType<typeof timeClear> | undefined;

describe('tearing down a thousand rows', () => {
  // why: the baseline every other file in this directory has been measuring without saying so.
  it('costs this much while the engine believes no behavior exists', () => {
    withoutBehaviors = bestClear();
    const { fill, apply, commit } = withoutBehaviors;
    print(
      `DEBUG clear gate OFF  fill=${fill.toFixed(2)} apply=${apply.toFixed(2)} ` +
        `commit=${commit.toFixed(2)} total=${(fill + apply + commit).toFixed(2)} ms`,
    );
    expect(fill + apply + commit > 0).toBe(true);
  });

  // why: THE FIX. Registering a behavior TYPE is what `@symbiote-native/components` does at module
  // load, in every app, before a single node exists. It used to arm the sweep, and the sweep crosses
  // every removed node into JS — so an app with no Pressable anywhere paid ten thousand handles to
  // tear down a list. The gate now asks whether one has ATTACHED, which is a different question and
  // the one that matters.
  it('costs no more once a behavior TYPE has registered but attached to nothing', () => {
    // A component name nothing in this fixture builds. The subject is the flag, not a machine.
    registerHostBehavior('symbiote-nothing-uses-this', {
      attach: () => {},
      detach: () => {},
    });

    const measured = bestClear();
    if (withoutBehaviors === undefined) {
      throw new Error('the gate-off case did not run');
    }
    const before =
      withoutBehaviors.fill + withoutBehaviors.apply + withoutBehaviors.commit;
    const after = measured.fill + measured.apply + measured.commit;
    print(
      `DEBUG clear TYPE registered  total=${after.toFixed(2)} ms ` +
        `(${(after / Math.max(before, 0.001)).toFixed(2)}x the gate-off baseline), ` +
        `commit ${withoutBehaviors.commit.toFixed(2)} -> ${measured.commit.toFixed(2)}`,
    );

    // Before the gate was narrowed this read 3.2x and 4.4 ms of it was the sweep. 1.5x leaves room
    // for the run-to-run spread of a 2 ms step without leaving room for the sweep coming back.
    //
    // BOTH SIDES ARE BEST-OF-N (see `timeClear`'s caller below), which this needed and did not have:
    // it is a RATIO of two ~4 ms wall-clock readings, so a single slow sample on either side moves it
    // far more than the thing it is guarding against. It went red once in a 71-process suite run and
    // passed alone — the same shape `child-list-scaling.itest.ts` was fixed for, and the same fix:
    // timing noise is one-sided, so the MINIMUM of several runs is the closest reading to the work.
    // Widening the bound instead would have bought quiet by making the guard weaker.
    expect(after < before * 1.5).toBe(true);
  });

  // why: and this is what it costs when the sweep genuinely has to run — one behavior per row, which
  // is thinner than a real screen (the benchmark row carries two Pressables). Recorded rather than
  // asserted tightly: the sweep visits every removed node by design, and the number is here so the
  // next person attacking `Clear` knows what is left and where it is.
  it('costs this much once a behavior is attached to a node per row', () => {
    registerHostBehavior('RCTSinglelineTextInputView', {
      attach: () => {},
      detach: () => {},
    });

    const measured = bestClear();
    const total = measured.fill + measured.apply + measured.commit;
    print(
      `DEBUG clear ATTACHED  fill=${measured.fill.toFixed(2)} ` +
        `apply=${measured.apply.toFixed(2)} commit=${measured.commit.toFixed(2)} ` +
        `total=${total.toFixed(2)} ms over ${ROWS * NODES_PER_ROW} torn-down nodes`,
    );
    // THE SPLIT that decides what to do next: `subtreesOf` is the crossing, everything else in the
    // commit delta is the JS loop above it.
    print(
      `DEBUG clear ATTACHED  subtreesOf=${measured.hostReadMs.toFixed(2)} ms ` +
        `for ${measured.hostReadHandles} handles ` +
        `(${((measured.hostReadMs * 1000) / Math.max(measured.hostReadHandles, 1)).toFixed(2)} us each), ` +
        `rest of the sweep=${(measured.commit - measured.hostReadMs).toFixed(2)} ms`,
    );
    expect(total > 0).toBe(true);
  });
});

report();

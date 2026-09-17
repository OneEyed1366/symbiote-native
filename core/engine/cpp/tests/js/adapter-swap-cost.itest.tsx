// Why does swapping two rows cost React 3.68x what it costs stock React Native?
//
// why: it is the largest unexplained loss against stock in the whole device table — `Swap` reads
// react 35.3 ms against stock 9.6, and `CLAUDE.md` has carried it as "the standing React anomaly"
// across every re-measurement. It is also the CLEANEST comparison the table contains, because both
// sides run the same reconciler: stock drives React's own Fabric host config, we drive ours. The
// framework is held still and only the renderer differs, so whatever the 26 ms is, it is ours.
//
// And the engine is not it. `update-shapes-cost.itest.ts` does the same two moves by calling the
// mutation API directly and the whole step is 1.8 ms — walk 0.8, fabric 0.8, one targeted replace,
// 1 000 nodes reused. So ~33 ms of the device's 35.3 sits between React's render and those two
// `insertBefore` calls, and this file is where that gap becomes visible without a device.
//
// WHAT A SWAP IS, and why it should be nearly free: two rows exchange places in a keyed list.
// Nothing is created, nothing is destroyed, no prop changes. A reconciler that understands keys
// emits two moves; the engine turns them into two `insertBefore`s and re-commits one parent.
//
// ── WHAT THE THREE ARMS SAID ────────────────────────────────────────────────────────────────────
//
//   arm                       wall    engine   what the row hands React
//   swap (plain)              76.0     3.3     ten thousand rebuilt elements
//   hoisted                   21.0     3.4     the same element objects, by identity
//   memo                      24.5     2.4     a thousand rebuilt wrappers, every body bailing out
//
// THE ENGINE IS NOT IT, and this is asserted rather than read off the clock: all three arms report
// `created=0 cloned=2 reused=1000 targetedReplaces=1 setProps=0`, byte-identical, and identical to
// what `update-shapes-cost.itest.ts` gets by calling the mutation API with no reconciler at all. The
// engine does the minimum a swap can cost in every shape a screen can hand it.
//
// SO ~22 MS OF THE COMPARABLE ARM IS REACT MOVING TWO ROWS. The parent re-renders, and
// `reconcileChildrenArray` walks all thousand children to find the two that moved — inherent to the
// reconciler, and the same work stock's React does.
//
// ── AND THE FIRST ARM IS NOT THE DEVICE'S WORKLOAD, WHICH COST AN ARM TO FIND OUT ───────────────
//
// It was written first and read as the answer: 73% of a swap is the app rebuilding elements it then
// throws away. True, and irrelevant to the device row — BOTH benchmark screens wrap their row in
// `memo` (`examples/react/screens/BenchmarkScreen.tsx:387`,
// `examples/bare-rn/screens/BenchmarkScreen.tsx:395`), so neither pays it. Reading the OTHER side's
// screen is what turned a comparison into two different workloads wearing one name. The plain arm
// stays because the 55 ms split is a real finding about what an unmemoized list costs — it is just
// not this file's headline.
//
// ── AND THE STOCK ARM EXISTS NOW, SO THE GAP HAS A SHAPE ────────────────────────────────────────
//
// `stock-swap-cost.itest.tsx` runs the same thousand memoized rows through React's own Fabric
// renderer. Split into the render phase (a re-render with the SAME order — the parent reconciles all
// thousand children, every one bailing out of `memo`, and nothing commits) and the move:
//
//                       re-render   swap    the move itself
//   stock                  3.5       5.9         2.4
//   ours                   1.8      19.9        18.1
//
// **Our RENDER phase is FASTER than stock's.** The entire deficit is the move — 18.1 against 2.4,
// and the engine is 2.6 ms of it (`walk=0.8 apply=2.6`, `setProps=0`, `cloned=2`).
//
// AND IT DOES NOT TRACK DISTANCE: swapping rows 1 and 2 costs 20.8 ms against 19.9 for rows 1 and
// 998. Both move exactly two rows, so React's flag walk and our host-config calls are identical and
// only the travel differs. That rules out the two obvious suspects — `getHostSibling`'s search in
// React's mutation commit, and the `std::vector::insert` tail shift the engine's `kOpInsertBefore`
// still pays. What is left is a FIXED price that appears the moment any placement exists at all.
//
// The shape fits React's mutation-effect traversal: with no placement the parent's `subtreeFlags`
// carry no `MutationMask` and React skips its thousand children outright, which is the 1.8 ms idle
// arm. One placement and it walks all of them. Persistent mode has no equivalent — a move there is
// expressed during the RENDER phase, by cloning the parent and rebuilding its child set — which is
// why stock pays 2.4 ms and a heavier render.
//
// NOT CONFIRMED, and the check that would confirm it is one arm away: run the same swap at 2 000
// rows. If the fixed cost doubles it is the traversal; if it holds, it is something else that fires
// once per commit.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import { createElement as h, memo, useState } from 'react';

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount } from '@symbiote-native/react';

import {
  committedTags,
  describe,
  expect,
  flushTimers,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;

// The two the benchmark screen exchanges: near the front and near the back, so the move is a real
// one rather than two adjacent slots.
const FIRST = 1;
const SECOND = 998;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

let setOrder: ((next: readonly number[]) => void) | undefined;
let setHoistedOrder: ((next: readonly number[]) => void) | undefined;
let setMemoOrder: ((next: readonly number[]) => void) | undefined;
let swapWall: number | undefined;

/** The same ten-node row `adapter-create-cost` builds, so the two files measure one workload. */
function row(id: number): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h('text', { ellipsizeMode: 'tail' }, text);

  return h(
    'view',
    { key: id, style: ROW_STYLE, testID: `row-${id}` },
    label(String(id)),
    h('view', { style: CELL_STYLE }, label(`row ${id}`)),
    h('view', { style: CELL_STYLE }, label('x')),
    h('textinput', { style: INPUT_STYLE, text: `input ${id}` }),
  );
}

function Screen(): ReturnType<typeof h> {
  const initial: number[] = [];
  for (let id = 0; id < ROWS; id += 1) initial.push(id);
  const [order, setOrderState] = useState<readonly number[]>(initial);
  setOrder = setOrderState;

  return h('view', { style: { flex: 1 } }, ...order.map(row));
}

// The SAME screen with the row elements built once and reused by identity across renders.
//
// It exists to split the wall clock in two, because `Screen` above conflates them: a swap re-runs
// `order.map(row)`, so every render calls `row()` a thousand times and builds ten thousand
// `createElement` results that are then thrown away. That is the APP's cost and stock React Native's
// benchmark pays it too — but nothing in the number above says how much of it there is. Here React
// sees the identical element object in a new slot, which is the cheapest thing a keyed list can
// hand it, so whatever remains is reconciliation and ours to account for.
const hoisted: ReturnType<typeof h>[] = [];
for (let id = 0; id < ROWS; id += 1) hoisted.push(row(id));

// The shape BOTH benchmark screens actually use — `examples/react`'s `BenchmarkRow` and
// `examples/bare-rn`'s are each `memo()`'d — and therefore the only one of the three whose number
// may be read against the device table's `Swap` row at all.
//
// It sits between the other two: a swap rebuilds a THOUSAND row elements (one apiece, not ten), and
// `memo` then bails out of every body because the props compare equal, so the ten thousand inner
// elements are never built. Checking that stock's row carried a `memo` was what turned this file
// from a comparison into two different workloads wearing one name.
const Row = memo(function RowView({ id }: { id: number }) {
  return row(id);
});

function MemoScreen(): ReturnType<typeof h> {
  const initial: number[] = [];
  for (let id = 0; id < ROWS; id += 1) initial.push(id);
  const [order, setOrderState] = useState<readonly number[]>(initial);
  setMemoOrder = setOrderState;

  return h(
    'view',
    { style: { flex: 1 } },
    ...order.map(id => h(Row, { key: id, id })),
  );
}

function HoistedScreen(): ReturnType<typeof h> {
  const initial: number[] = [];
  for (let id = 0; id < ROWS; id += 1) initial.push(id);
  const [order, setOrderState] = useState<readonly number[]>(initial);
  setHoistedOrder = setOrderState;

  return h('view', { style: { flex: 1 } }, ...order.map(id => hoisted[id]));
}

describe('what a keyed swap costs above the engine', () => {
  it('exchanges two rows of a standing thousand', () => {
    const surface = mount(ROOT_TAG, h(Screen));
    flushTimers();
    surface.commit();
    mounted();

    const before = committedTags().length;
    // DRAINED, not read: the counters are zeroed on read, so the mount's walk and apply have to be
    // taken off the books here or the swap below reports the create as well. The Vue arm of
    // `adapter-create-cost` learned this the expensive way — it once reported a 66.6 ms walk that
    // was three arms summed, and it looked exactly like a finding.
    readSurfaceTelemetry(ROOT_TAG);

    const order: number[] = [];
    for (let id = 0; id < ROWS; id += 1) order.push(id);
    [order[FIRST], order[SECOND]] = [order[SECOND], order[FIRST]];

    if (setOrder === undefined) throw new Error('the screen never rendered');
    const startedAt = performance.now();
    setOrder(order);
    flushTimers();
    surface.commit();
    const wall = performance.now() - startedAt;
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    const after = committedTags().length;

    print(
      `DEBUG swap    wall=${wall.toFixed(1)} walk=${(telemetry?.walkMs ?? 0).toFixed(1)} ` +
        `apply=${(telemetry?.applyMs ?? 0).toFixed(1)} nodes=${after}`,
    );
    print(
      `DEBUG swap    created=${telemetry?.nodesCreated ?? 0} ` +
        `cloned=${telemetry?.nodesCloned ?? 0} reused=${telemetry?.nodesReused ?? 0} ` +
        `targetedReplaces=${telemetry?.targetedReplaces ?? 0} ` +
        `setProps=${telemetry?.setProps ?? 0} values=${telemetry?.valueEntries ?? 0}`,
    );
    print(
      `DEBUG swap    fold: lookup=${(telemetry?.foldLookupMs ?? 0).toFixed(1)} ` +
        `folds=${telemetry?.foldsFound ?? 0} ` +
        `props=${(telemetry?.propsMs ?? 0).toFixed(1)} ` +
        `diffProps=${(telemetry?.diffPropsMs ?? 0).toFixed(1)}`,
    );

    // THE ORACLE, and it comes before any millisecond means anything. A swap that quietly rebuilt
    // the list would be a different workload wearing the same name — which is the failure mode this
    // whole directory keeps re-learning — so the node count has to hold EXACTLY.
    expect(after).toBe(before);
    // And nothing may be created: two rows exchanging places is a pure move. A non-zero count here
    // says the reconciler lost the keys, and every millisecond above would be measuring that instead.
    expect(telemetry?.nodesCreated ?? 0).toBe(0);
    swapWall = wall;
  });

  // why: the other arm of the split. Same tree, same two moves, same engine — the only difference is
  // that this screen hands React the row elements it already had instead of rebuilding them. Whatever
  // the two arms differ by is element construction, which is the app's; whatever is left in THIS one
  // is what a keyed move costs above the engine, which is ours to explain against stock's 9.6 ms.
  it('exchanges the same two rows without rebuilding their elements', () => {
    const surface = mount(ROOT_TAG, h(HoistedScreen));
    flushTimers();
    surface.commit();
    mounted();

    const before = committedTags().length;
    readSurfaceTelemetry(ROOT_TAG);

    const order: number[] = [];
    for (let id = 0; id < ROWS; id += 1) order.push(id);
    [order[FIRST], order[SECOND]] = [order[SECOND], order[FIRST]];

    if (setHoistedOrder === undefined) {
      throw new Error('the hoisted screen never rendered');
    }
    const startedAt = performance.now();
    setHoistedOrder(order);
    flushTimers();
    surface.commit();
    const wall = performance.now() - startedAt;
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    const after = committedTags().length;
    print(
      `DEBUG hoisted wall=${wall.toFixed(1)} walk=${(telemetry?.walkMs ?? 0).toFixed(1)} ` +
        `apply=${(telemetry?.applyMs ?? 0).toFixed(1)} nodes=${after} ` +
        `cloned=${telemetry?.nodesCloned ?? 0} reused=${telemetry?.nodesReused ?? 0} ` +
        `targetedReplaces=${telemetry?.targetedReplaces ?? 0}`,
    );
    if (swapWall !== undefined) {
      print(
        `DEBUG element construction: ${(swapWall - wall).toFixed(1)} ms of ` +
          `${swapWall.toFixed(1)} — a keyed move costs ${wall.toFixed(1)} ms above the engine`,
      );
    }

    expect(after).toBe(before);
    expect(telemetry?.nodesCreated ?? 0).toBe(0);
  });

  // why: the arm that is actually comparable to the device's `Swap` row, and the reason the other two
  // are not. Both benchmark screens wrap their row in `memo`, so the workload on device is a thousand
  // one-element rebuilds with every body bailing out — neither the ten thousand of the first arm nor
  // the zero of the second.
  it('exchanges two rows of a memoized thousand, which is what the device measures', () => {
    const surface = mount(ROOT_TAG, h(MemoScreen));
    flushTimers();
    surface.commit();
    mounted();

    const before = committedTags().length;
    readSurfaceTelemetry(ROOT_TAG);

    if (setMemoOrder === undefined) {
      throw new Error('the memo screen never rendered');
    }

    // THE RENDER PHASE ALONE, the twin of the arm in `stock-swap-cost.itest.tsx`. A fresh array
    // holding the SAME order re-renders the parent and reconciles all thousand children — every one
    // bailing out of `memo` — and commits nothing. Subtracting it from the swap leaves the move
    // itself, and the two halves attribute differently: a deficit here is the reconciler, a deficit
    // in the difference is the host config.
    const same: number[] = [];
    for (let id = 0; id < ROWS; id += 1) same.push(id);
    const idleStartedAt = performance.now();
    setMemoOrder(same);
    flushTimers();
    surface.commit();
    const idle = performance.now() - idleStartedAt;
    mounted();
    readSurfaceTelemetry(ROOT_TAG);
    print(`DEBUG memo re-render, same order: ${idle.toFixed(1)} ms`);

    const order: number[] = [];
    for (let id = 0; id < ROWS; id += 1) order.push(id);
    [order[FIRST], order[SECOND]] = [order[SECOND], order[FIRST]];
    // SPLIT, because the engine's own telemetry accounts for only ~3 ms of this arm and the rest has
    // to be somewhere nameable. `flushTimers()` covers React's render AND its commit — which is
    // where our host config's `insertBefore` runs — while `surface.commit()` is the engine's
    // materialize. Timing them apart says which side of that line the deficit is on.
    const startedAt = performance.now();
    setMemoOrder(order);
    const setStateReturned = performance.now() - startedAt;
    flushTimers();
    const throughReact = performance.now() - startedAt;
    surface.commit();
    const wall = performance.now() - startedAt;
    mounted();
    print(
      `DEBUG memo    setState=${setStateReturned.toFixed(1)} ` +
        `drain=${(throughReact - setStateReturned).toFixed(1)} ` +
        `engineCommit=${(wall - throughReact).toFixed(1)}`,
    );

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    const after = committedTags().length;
    print(
      `DEBUG memo    wall=${wall.toFixed(1)} walk=${(telemetry?.walkMs ?? 0).toFixed(1)} ` +
        `apply=${(telemetry?.applyMs ?? 0).toFixed(1)} nodes=${after} ` +
        `cloned=${telemetry?.nodesCloned ?? 0} reused=${telemetry?.nodesReused ?? 0} ` +
        `targetedReplaces=${telemetry?.targetedReplaces ?? 0} ` +
        `setProps=${telemetry?.setProps ?? 0}`,
    );

    expect(after).toBe(before);
    expect(telemetry?.nodesCreated ?? 0).toBe(0);

    // ADJACENT vs DISTANT, on the same standing list and the same screen. Both move exactly two
    // rows, so React's flag-walking and our host-config calls are identical; the only thing that
    // differs is how far the two travel. If the cost tracks DISTANCE it is a search or a shift —
    // `getHostSibling` in React's mutation commit, or the `std::vector::insert` the engine's
    // `kOpInsertBefore` still pays. If it does not, the ~20 ms is a fixed price per moved row and
    // neither of those is the subject.
    const near: number[] = [];
    for (let id = 0; id < ROWS; id += 1) near.push(id);
    [near[1], near[2]] = [near[2], near[1]];
    const nearStartedAt = performance.now();
    setMemoOrder(near);
    flushTimers();
    surface.commit();
    const nearWall = performance.now() - nearStartedAt;
    mounted();
    readSurfaceTelemetry(ROOT_TAG);
    print(
      `DEBUG memo    adjacent swap=${nearWall.toFixed(1)} vs distant=${wall.toFixed(1)}`,
    );
  });
});

report();

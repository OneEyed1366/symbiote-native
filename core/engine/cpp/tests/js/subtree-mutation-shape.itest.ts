// When one row is removed, WHICH nodes does the engine make the differ tell the host about?
//
// why: with `countsMutations` on, the bench suite reads stock and us as identical on six of the
// eight steps and 5.0x apart on the two that move or drop a row. On `remove`, stock's differ emits
// `Update/View=996` — one per row container — and ours emits that plus `Paragraph=2988` and
// `TextInput=996`, one per node INSIDE each surviving row. React's reconciler is in mutation mode
// and Vue's is another one entirely, and the two arms agree to the instruction, so the extra work is
// the engine's. What the suite cannot say is WHY, because its row's only unflattened descendants are
// the two stateful component types — `Paragraph` and `TextInput` — and "the stateful nodes" and
// "everything below the row" are the same set there.
//
// So this file separates them, in one process, on one ruler: the same removal against a row whose
// children are plain views (nothing stateful, nothing measured) and against a row whose children are
// texts. If the plain views are updated too, the engine is re-reporting the SUBTREE and state has
// nothing to do with it; if only the texts are, it is about state and the plain-view arm is clean.
//
// The product rule under both: **removing a row moves the rows after it and nothing inside them.**
// A child's frame is relative to its parent, so no node below a row changed, and a host told to
// re-apply props to 4 000 views it does not need to touch is doing work a device pays for in
// `UIView`s. Every other instrument in this directory stops at `completeRoot` and cannot see it.
//
// A plain `View` carrying nothing but a style is FLATTENED by Fabric and never reaches the host at
// all, which would make the plain-view arm silently empty — hence the `nativeID` on every node here.
// `surface-width-cost.itest.ts` records the same trap turning one of its arms into a copy of
// another.
//
// RUN ON `build-release` (`pnpm run bench:itest`). The assert build's list append is O(N^2).

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  readSurfaceTelemetry,
  removeChild,
  routeProp,
} from '@symbiote-native/engine';

import { createElement as h, memo, useState } from 'react';

import { mount } from '@symbiote-native/react';

import { CELL_STYLE, ROW_STYLE } from './bench-suite';
import {
  countMutations,
  describe,
  expect,
  flushTimers,
  it,
  mutationSummary,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;
const CHILDREN_PER_ROW = 3;
// Near the front, so almost every row after it shifts and the step is the suite's `remove` in shape.
const REMOVE_INDEX = 3;

/**
 * `fabric-*` names a node by the Fabric view name, the way every raw-engine fixture here does;
 * `tagged-*` names it by OUR intrinsic tag, the way every adapter does. The tag is not decoration —
 * it is what the C++ rule chain keys on (`SymbioteFabricProps.cpp`), so the two are different paths
 * into the same tree and only one of them is what an app commits.
 */
type IChildKind = 'fabric-view' | 'fabric-text' | 'tagged-text';

function buildRow(
  id: number,
  kind: IChildKind,
): ReturnType<typeof createElement> {
  const isTagged = kind === 'tagged-text';
  const row = createElement('RCTView', false, 'view');
  // THE ROW HAS TO OCCUPY SPACE or the experiment is degenerate: rows of zero height all sit at
  // origin 0, removing one moves nothing, and every arm reads a clean nine mutations for the wrong
  // reason. It is the suite's own row style, so what shifts here is what shifts there.
  routeProp(row, 'style', ROW_STYLE);
  routeId(row, `row-${id}`);
  for (let at = 0; at < CHILDREN_PER_ROW; at += 1) {
    if (kind === 'fabric-view') {
      const cell = createElement('RCTView');
      routeProp(cell, 'style', CELL_STYLE);
      routeId(cell, `cell-${id}-${at}`);
      appendChild(row, cell);
      continue;
    }
    // `isText` and the intrinsic TAG are the two arguments the adapter passes and a hand-built
    // fixture forgets (`adapters/react/src/host-config.ts`, `createInstance`). Without them the node
    // is an ordinary view that happens to be called `RCTText`: the commit walk's text handling never
    // runs, the paragraph never takes a state, and the arm reads clean for a reason that has nothing
    // to do with what it was asked. The first version of this file did exactly that.
    const text = createElement('RCTText', isTagged, 'text');
    routeProp(text, 'ellipsizeMode', 'tail');
    // THE RAW TEXT CARRIES CONTENT for the same reason: an empty one gives the paragraph nothing to
    // measure.
    appendChild(text, createRawText(`cell ${at}`));
    appendChild(row, text);
  }
  return row;
}

/**
 * The prop that keeps a node CONCRETE — and, as it turns out, the whole subject of this file.
 *
 * A view carrying nothing but a style is layout-only and Fabric flattens it away, so an arm that
 * wants to watch a node has to give it one of these. They look interchangeable and are not.
 */
type IIdProp = 'nativeID' | 'testID';

let idProp: IIdProp = 'nativeID';

function routeId(node: ReturnType<typeof createElement>, id: string): void {
  routeProp(node, idProp, id);
}

function removeOneRow(
  kind: IChildKind,
  keepsConcreteWith: IIdProp = 'nativeID',
  fillsInASecondCommit = false,
): Map<string, number> {
  idProp = keepsConcreteWith;
  const surface = createSurface(ROOT_TAG);
  const list = createElement('RCTView');
  routeProp(list, 'style', CELL_STYLE);
  routeId(list, 'list');
  // The one structural difference left between these arms and the adapter's: an adapter MOUNTS an
  // empty list, commits, and fills it on a later commit, because that is what a framework's state
  // update looks like. Appending to a parent Fabric has already laid out is not the same operation
  // as building the whole tree before the first commit — `SymbioteTree.cpp` records that
  // `adoptYogaChild` clones a child still owned by its previous yoga parent and swaps the clone in
  // behind us, leaving our recorded slots stale.
  if (fillsInASecondCommit) {
    surface.appendChild(list);
    surface.commit();
  }
  const rows = [];
  for (let id = 0; id < ROWS; id += 1) {
    const row = buildRow(id, kind);
    rows.push(row);
    appendChild(list, row);
  }
  if (!fillsInASecondCommit) surface.appendChild(list);
  surface.commit();

  // DRAINED, not read: the mount's own Create/Insert lines belong to the setup, and `mountingLogs()`
  // accumulates until something reads it.
  countMutations();

  readSurfaceTelemetry(ROOT_TAG);
  removeChild(list, rows[REMOVE_INDEX]);
  surface.commit();
  printWalk(
    `raw-${kind}${fillsInASecondCommit ? '-2c' : ''}`,
    readSurfaceTelemetry(ROOT_TAG),
  );
  return countMutations();
}

function at(counts: Map<string, number>, key: string): number {
  return counts.get(key) ?? 0;
}

/**
 * The same row as the raw arms, through the adapter: one view of the same height, three texts, and
 * NOTHING else — no `TextInput`, no nested cells, no `testID`. Memoised exactly as both benchmark
 * screens memoise theirs, so a surviving row is not re-rendered and React contributes nothing.
 */
const Row = memo(function RowView({
  id,
  cellKind,
}: {
  id: number;
  cellKind: IChildKind;
}): ReturnType<typeof h> {
  const cells = [];
  for (let at = 0; at < CHILDREN_PER_ROW; at += 1) {
    cells.push(
      cellKind === 'fabric-view'
        ? h('view', {
            key: at,
            style: CELL_STYLE,
            testID: `cell-${id}-${at}`,
          })
        : h('text', { key: at, ellipsizeMode: 'tail' }, `cell ${at}`),
    );
  }
  // `testID` is not decoration here either: a view carrying only a style is layout-only and Fabric
  // FLATTENS it away, and a flattened row's children become direct children of the list — which
  // moves them for real when a row is removed and would make this arm agree with the suite for the
  // wrong reason. Every raw arm above keeps its row concrete with a `nativeID`; this is the same
  // thing through the prop an app writes.
  return h('view', { style: ROW_STYLE, testID: `row-${id}` }, ...cells);
});

let setRows: ((ids: readonly number[]) => void) | undefined;

function makeList(cellKind: IChildKind): () => ReturnType<typeof h> {
  return function ListView(): ReturnType<typeof h> {
    const [ids, setIds] = useState<readonly number[]>([]);
    setRows = setIds;
    return h(
      'view',
      { style: CELL_STYLE, testID: 'list' },
      ...ids.map(id => h(Row, { key: id, id, cellKind })),
    );
  };
}

/** The adapter arm's removal, so the two cell kinds are one function and not two copies. */
function removeOneRowThroughAdapter(cellKind: IChildKind): Map<string, number> {
  const surface = mount(ROOT_TAG, h(makeList(cellKind)));
  flushTimers();
  surface.commit();
  countMutations();

  if (setRows === undefined) throw new Error('the list never rendered');
  const ids = [];
  for (let id = 0; id < ROWS; id += 1) ids.push(id);
  setRows(ids);
  flushTimers();
  surface.commit();
  countMutations();

  readSurfaceTelemetry(ROOT_TAG);
  setRows(ids.filter((_id, index) => index !== REMOVE_INDEX));
  flushTimers();
  surface.commit();
  printWalk('adapter', readSurfaceTelemetry(ROOT_TAG));
  return countMutations();
}

/**
 * What the commit walk did, beside what the differ then said.
 *
 * The two answer different questions and the pair is the whole diagnosis: `cloned` is how many nodes
 * WE handed Fabric a new object for, and an `Update` is what the differ made of that. A node we
 * neither cloned nor wrote to cannot legitimately reach the host at all.
 */
function printWalk(
  arm: string,
  telemetry: Record<string, number> | undefined,
): void {
  if (telemetry === undefined) return;
  print(
    `DEBUG ${arm.padEnd(12)} WALK created=${telemetry.nodesCreated} ` +
      `cloned=${telemetry.nodesCloned} reused=${telemetry.nodesReused} ` +
      `setProps=${telemetry.setProps} laidOut=${telemetry.layoutNodes}`,
  );
}

describe('what a single row removal makes the host re-apply', () => {
  // why: the discriminating arm. Nothing here is stateful and nothing is measured, so an `Update` on
  // a cell can only mean the engine re-reported a node that did not change.
  it('removes one row from a list whose cells are plain views', () => {
    const counts = removeOneRow('fabric-view');
    print(`DEBUG plain-views  ${mutationSummary(counts)}`);

    // The removal itself: one row taken out of the tree, with its three cells.
    expect(at(counts, 'Delete/View')).toBe(1 + CHILDREN_PER_ROW);
    expect(at(counts, 'Remove/View')).toBe(1 + CHILDREN_PER_ROW);

    // THE CONTRACT: the rows after the removed one moved, so they are owed an `Update` each; their
    // cells did not move relative to their row, so they are owed none. One per moved row, plus the
    // list itself, whose own height changed.
    const movedRows = ROWS - 1 - REMOVE_INDEX;
    print(
      `DEBUG plain-views  rows moved=${movedRows} · Update/View=${at(counts, 'Update/View')} ` +
        `· updatesPerRow=${(at(counts, 'Update/View') / movedRows).toFixed(2)}`,
    );
    expect(at(counts, 'Update/View')).toBe(movedRows + 1);
  });

  // why: THE FINDING, and it is one prop. The arm above is the same tree, the same removal and the
  // same walk (`created=0 cloned=2 reused=999 setProps=0` in both) — the only difference is which
  // prop keeps a node concrete. With `testID` every node in every moved row is re-reported: 3 985
  // against 997, four per row instead of one. That is what the bench suite reads as 5.0x against
  // stock on `remove` and `swap`, because both benchmark screens key their rows with `testID` — and
  // through React's own renderer the identical tree stays at one per row, so the extra work is ours.
  //
  // PRINTED, NOT ASSERTED, deliberately: a bound here would be a bound on a defect. The gate below
  // is the one that must not move — the removal itself is still four nodes and no more, so the two
  // arms are the same workload and the difference is the reporting.
  it('removes one row from a list kept concrete with testID instead of nativeID', () => {
    const counts = removeOneRow('fabric-view', 'testID');
    print(`DEBUG testID-cells ${mutationSummary(counts)}`);

    const movedRows = ROWS - 1 - REMOVE_INDEX;
    print(
      `DEBUG testID-cells rows moved=${movedRows} · Update/View=${at(counts, 'Update/View')} ` +
        `· updatesPerRow=${(at(counts, 'Update/View') / movedRows).toFixed(2)}`,
    );
    expect(at(counts, 'Delete/View')).toBe(1 + CHILDREN_PER_ROW);
  });

  // why: the suite's own shape, for the contrast. `RCTText` commits as `Paragraph` and carries
  // state; if this arm is the only one that over-reports, state is the mechanism.
  it('removes one row from a list whose cells are texts', () => {
    const counts = removeOneRow('fabric-text');
    print(`DEBUG text-cells   ${mutationSummary(counts)}`);

    const movedRows = ROWS - 1 - REMOVE_INDEX;
    print(
      `DEBUG text-cells   rows moved=${movedRows} · Update/View=${at(counts, 'Update/View')} ` +
        `· Update/Paragraph=${at(counts, 'Update/Paragraph')}`,
    );
  });

  // why: the same tree AGAIN, named by our intrinsic tags rather than by Fabric's view names. Note
  // what the census then says — `Delete/text`, `Update/view` — the tag reached Fabric AS the view
  // name, because nothing mapped it: an unregistered name falls back to a plain View rather than
  // failing, the trap `symbiote-host.h` records. So this arm is not the adapter's path either, and
  // its value is exactly that: three ways of driving the engine directly, all three clean.
  // why: THE ONE CHANGE that separates a raw-engine arm from the adapter's — the list is committed
  // EMPTY first and filled on a second commit, which is what a framework's state update always
  // looks like and what no other fixture in this directory does. Everything else is held: same
  // nodes, same props, same removal, same walk.
  it('removes one row from a list that was filled on a second commit', () => {
    const counts = removeOneRow('fabric-view', 'nativeID', true);
    print(`DEBUG two-commits  ${mutationSummary(counts)}`);

    const movedRows = ROWS - 1 - REMOVE_INDEX;
    print(
      `DEBUG two-commits  rows moved=${movedRows} · Update/View=${at(counts, 'Update/View')} ` +
        `· updatesPerRow=${(at(counts, 'Update/View') / movedRows).toFixed(2)}`,
    );

    expect(at(counts, 'Delete/View')).toBe(1 + CHILDREN_PER_ROW);
  });

  it('removes one row from a list whose cells are our tagged texts', () => {
    const counts = removeOneRow('tagged-text');
    print(`DEBUG tagged-text  ${mutationSummary(counts)}`);

    const movedRows = ROWS - 1 - REMOVE_INDEX;
    print(
      `DEBUG tagged-text  rows moved=${movedRows} · Update/View=${at(counts, 'Update/View')} ` +
        `· Update/Paragraph=${at(counts, 'Update/Paragraph')}`,
    );
  });

  // why: THE ARM THAT MATTERS — the same removal through the React adapter, which is the only path
  // in this file that goes through `mount`, the host-behavior layer and the tag mapping. The suite
  // reads 4 991 mutations here against stock's 1 007; the three raw-engine arms above read a clean
  // one-per-moved-row. If this one is dirty on a row carrying nothing but views and texts, the
  // extra work is in the layer between the adapter and the engine and not in the row's contents.
  it('removes one row through the React adapter, texts in the cells', () => {
    const counts = removeOneRowThroughAdapter('fabric-text');
    print(`DEBUG adapter-text ${mutationSummary(counts)}`);

    const movedRows = ROWS - 1 - REMOVE_INDEX;
    print(
      `DEBUG adapter-text rows moved=${movedRows} · Update/View=${at(counts, 'Update/View')} ` +
        `· Update/Paragraph=${at(counts, 'Update/Paragraph')}`,
    );

    // The removal itself, as the gate that makes the Update counts mean anything: one row and its
    // three texts left the tree, and nothing else did.
    expect(at(counts, 'Delete/View')).toBe(1);
    expect(at(counts, 'Delete/Paragraph')).toBe(CHILDREN_PER_ROW);
  });

  // why: the same adapter path with the TEXTS taken out — plain views in the cells, kept concrete
  // with a `testID`. It separates "the adapter over-reports" from "text over-reports", which the
  // suite cannot do because its only unflattened descendants are the two stateful component types.
  it('removes one row through the React adapter, views in the cells', () => {
    const counts = removeOneRowThroughAdapter('fabric-view');
    print(`DEBUG adapter-view ${mutationSummary(counts)}`);

    const movedRows = ROWS - 1 - REMOVE_INDEX;
    print(
      `DEBUG adapter-view rows moved=${movedRows} · Update/View=${at(counts, 'Update/View')} ` +
        `· updatesPerRow=${(at(counts, 'Update/View') / movedRows).toFixed(2)}`,
    );

    // One row and its three cells left the tree, and nothing else did.
    expect(at(counts, 'Delete/View')).toBe(1 + CHILDREN_PER_ROW);
  });
});

report();

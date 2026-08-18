// Micro-benchmark for the commit walk (`reconcile` in ../commit.ts): it prices the dirty-marking
// that lets the walk skip untouched subtrees (node.ts's markDirty + the early exit in commit.ts).
// Without it the walk visits the whole retained tree on every commit, rebuilding each node's Fabric
// payload (`fabricProps` + `flattenStyle`) and deep-comparing it against the mirror, so one prop on
// one row costs a full-tree walk.
//
// Measured 2026-08-18, p75, without -> with dirty-marking:
//   select row (1000 rows)                    0.50ms -> 0.21ms    2.4x
//   1 prop, 10 000-node flat table            4.29ms -> 2.19ms    2.0x
//   1 prop, 10 005 nodes / 244 sections       3.22ms -> 0.063ms  51x
//   no-op commit, 9761 nodes                  3.42ms -> 0.001ms  ~3400x
// Cold mount pays ~3-6% for the extra field and the marks (read off `min`; the p75/mean on the
// create rows swing +/-40-85% from GC and cannot be compared run to run).
//
// The flat-table row barely moves, and that is not a disappointing result: with one parent and N
// leaf children, ANY change makes that parent re-clone its child set and re-append all N handles.
// That is Fabric's persistent-tree protocol, not our walk, and no dirty flag can remove it. The
// sectioned row is the one shaped like a screen, and where skipping subtrees actually pays.
//
// The fake Fabric slot (`installFabric`, the same harness the unit suite uses) keeps the native
// side out of the measurement - what is timed is our JS walk and nothing else.
//
// The operation set is js-framework-benchmark's (krausest) verbatim, so the numbers can be read
// next to the ones Vue / Svelte / Solid / Million publish. A "row" here is ONE engine node driven
// through the mutation API, not a framework component; krausest's row is ~7 DOM nodes.
//
// Run it through `pnpm bench`, not a bare `vitest bench`. The walk allocates a fresh props object
// per node per commit, so on V8's default 16MB semi-space a 10 000-node tree scavenges mid-sample:
// mean 4.7ms at +/-1.6% with `--max-semi-space-size=64`, mean 105ms at +/-91% without.
//
// Two operations cannot be timed alone, because a commit only does work when the tree actually
// differs from the last committed state:
//   - "remove row" alternates remove / re-insert. Both halves are the same commit shape (the table
//     re-clones its child set and re-appends ~1000 reused handles), so the mean is still one
//     structural change on a 1000-row table.
//   - "clear" is paired with the re-attach that puts the 10 000 rows back. The clear half is nearly
//     free - the walk never visits a detached child - so the sample is dominated by the re-attach.

import { bench, describe } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  disposeRoot,
  insertBefore,
  removeChild,
  setProp,
  type ISymbioteNode,
  type SymbioteSurface,
} from '../index';

const fabric = installFabric();

const KRAUSEST_WARMUP = { warmupIterations: 5 } as const;
// krausest reports "create" / "append" / "clear" from a cold run, so no warmup here either.
const NO_WARMUP = { warmupIterations: 0, warmupTime: 0 } as const;

// Shared by every row, the way StyleSheet.create hands out one frozen object per rule.
const ROW_STYLE = { height: 24, flexDirection: 'row', paddingHorizontal: 8 };

function makeRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  setProp(row, 'style', ROW_STYLE);
  setProp(row, 'testID', `row-${id}`);
  return row;
}

// `removeChild` finds its target with indexOf, so dropping N children through it is O(N^2) —
// at 10 000 rows the teardown would dwarf the commit we are trying to time. Clearing the
// parent pointer by hand is what the surface's own detach does, and it is O(N).
function truncateChildren(parent: ISymbioteNode, length: number): void {
  for (let index = length; index < parent.children.length; index += 1) {
    parent.children[index].parent = undefined;
  }
  parent.children.length = length;
}

interface IMountedTable {
  surface: SymbioteSurface;
  table: ISymbioteNode;
  rows: ISymbioteNode[];
}

let nextRootTag = 9000;

function mountTable(rowCount: number): IMountedTable {
  nextRootTag += 1;
  const surface = createSurface(nextRootTag);
  const table = createElement('RCTView');
  const rows: ISymbioteNode[] = [];
  for (let id = 0; id < rowCount; id += 1) {
    const row = makeRow(id);
    rows.push(row);
    appendChild(table, row);
  }
  surface.appendChild(table);
  surface.commit();
  // The recorder keeps every node it ever created; drop the mount so the per-iteration
  // measurements below are not fighting a growing array for cache.
  fabric.reset();
  return { surface, table, rows };
}

// A fresh mount needs the root container gone, otherwise the second iteration would clone
// the first one's handles instead of creating anything.
function remount(
  surface: SymbioteSurface,
  rootTag: number,
  rowCount: number,
): void {
  fabric.reset();
  disposeRoot(rootTag);
  surface.clear();
  const table = createElement('RCTView');
  for (let id = 0; id < rowCount; id += 1) appendChild(table, makeRow(id));
  surface.appendChild(table);
  surface.commit();
}

describe('krausest operations', () => {
  const CREATE_1K_ROOT = 8001;
  const create1kSurface = createSurface(CREATE_1K_ROOT);
  bench(
    'create 1000 rows',
    () => remount(create1kSurface, CREATE_1K_ROOT, 1000),
    NO_WARMUP,
  );

  const replaceTable = mountTable(1000);
  let replaceGeneration = 0;
  bench(
    'replace all 1000 rows',
    () => {
      fabric.reset();
      replaceGeneration += 1;
      truncateChildren(replaceTable.table, 0);
      for (let id = 0; id < 1000; id += 1) {
        appendChild(replaceTable.table, makeRow(replaceGeneration * 1000 + id));
      }
      replaceTable.surface.commit();
    },
    KRAUSEST_WARMUP,
  );

  // 1000 of the 10 000 rows change and the other 9000 do not. Even after dirty-marking this one
  // stays expensive: the 9000 clean rows are skipped, but their shared parent still re-clones its
  // child set and re-appends all 10 000 handles.
  const partialTable = mountTable(10_000);
  let partialTick = 0;
  bench(
    'partial update: every 10th row of 10 000',
    () => {
      partialTick += 1;
      const opacity = partialTick % 2 === 0 ? 1 : 0.5;
      for (let index = 0; index < partialTable.rows.length; index += 10) {
        setProp(partialTable.rows[index], 'opacity', opacity);
      }
      partialTable.surface.commit();
    },
    KRAUSEST_WARMUP,
  );

  // krausest's "select" moves a highlight: the previous row loses it, the next one gains it.
  const selectTable = mountTable(1000);
  let selectedIndex = 0;
  bench(
    'select row (1000 rows)',
    () => {
      setProp(selectTable.rows[selectedIndex], 'opacity', 1);
      selectedIndex = (selectedIndex + 1) % selectTable.rows.length;
      setProp(selectTable.rows[selectedIndex], 'opacity', 0.5);
      selectTable.surface.commit();
    },
    KRAUSEST_WARMUP,
  );

  // krausest swaps rows 1 and 998. Swapping by index keeps the operation self-inverse, so
  // the table is back to its starting order every second iteration.
  const swapTable = mountTable(1000);
  const SWAP_FIRST = 1;
  const SWAP_SECOND = 998;
  bench(
    'swap 2 rows of 1000',
    () => {
      const kids = swapTable.table.children;
      const first = kids[SWAP_FIRST];
      const second = kids[SWAP_SECOND];
      const after = kids[SWAP_SECOND + 1];
      insertBefore(swapTable.table, second, first);
      insertBefore(swapTable.table, first, after);
      swapTable.surface.commit();
    },
    KRAUSEST_WARMUP,
  );

  // See the header: remove and re-insert are the same commit shape, so alternating them
  // keeps the table at 1000 rows without distorting the sample.
  const removeTable = mountTable(1000);
  const REMOVE_INDEX = 500;
  let detachedRow: ISymbioteNode | undefined;
  bench(
    'remove row from 1000',
    () => {
      if (detachedRow === undefined) {
        detachedRow = removeTable.table.children[REMOVE_INDEX];
        removeChild(removeTable.table, detachedRow);
      } else {
        insertBefore(
          removeTable.table,
          detachedRow,
          removeTable.table.children[REMOVE_INDEX],
        );
        detachedRow = undefined;
      }
      removeTable.surface.commit();
    },
    KRAUSEST_WARMUP,
  );

  const CREATE_10K_ROOT = 8002;
  const create10kSurface = createSurface(CREATE_10K_ROOT);
  bench(
    'create 10 000 rows',
    () => remount(create10kSurface, CREATE_10K_ROOT, 10_000),
    NO_WARMUP,
  );

  const APPEND_BASE = 10_000;
  const appendTable = mountTable(APPEND_BASE);
  let appendGeneration = 0;
  bench(
    'append 1000 rows to a table of 10 000',
    () => {
      fabric.reset();
      appendGeneration += 1;
      truncateChildren(appendTable.table, APPEND_BASE);
      for (let id = 0; id < 1000; id += 1) {
        appendChild(appendTable.table, makeRow(appendGeneration * 1000 + id));
      }
      appendTable.surface.commit();
    },
    NO_WARMUP,
  );

  // The very first sample's re-attach is a no-op (the mount already committed these rows in
  // this order), so it costs one clear instead of clear + re-attach. One sample in ~100.
  const clearTable = mountTable(10_000);
  bench(
    'clear 10 000 rows (+ the re-attach commit that restores them)',
    () => {
      for (const row of clearTable.rows) appendChild(clearTable.table, row);
      clearTable.surface.commit();
      truncateChildren(clearTable.table, 0);
      clearTable.surface.commit();
    },
    NO_WARMUP,
  );
});

// The diagnostic series: identical work per sample (one prop on one row), only the tree size
// changes. Still linear, and legitimately so - see the note above the flat-vs-sectioned split in
// the header. The sectioned series below is the one that isolates the walk itself.
describe('one prop changed, tree size varies', () => {
  for (const nodeCount of [100, 500, 2000, 10_000]) {
    const table = mountTable(nodeCount);
    const target = table.rows[Math.floor(nodeCount / 2)];
    let tick = 0;
    bench(
      `partial update: 1 prop on a tree of ${nodeCount} nodes`,
      () => {
        tick += 1;
        setProp(target, 'opacity', tick % 2 === 0 ? 1 : 0.5);
        table.surface.commit();
      },
      KRAUSEST_WARMUP,
    );
  }
});

// The series above is a FLAT table — one parent, N leaf children — which is krausest's shape, not
// a screen's. It flatters nothing and hides the thing that matters: with a flat parent, any change
// at all forces that parent to re-clone its child set and re-append all N handles, and that cost
// is Fabric's persistent-tree protocol, not our walk. No amount of dirty-marking can remove it.
//
// A real screen is deep and bushy — a list of sections, each with rows, each row a few nodes — so
// a change in one row leaves every OTHER section entirely untouched. That is the case dirty
// marking exists for and the flat series cannot express it. Same node budget, ~5 levels deep.
const SECTION_ROWS = 10;
// header + per row: row wrapper, icon, label, and the label's raw text.
const NODES_PER_SECTION = 1 + SECTION_ROWS * 4;

interface IMountedScreen {
  surface: SymbioteSurface;
  // One leaf deep inside ONE section — everything else must stay untouched.
  target: ISymbioteNode;
}

function mountSectionedScreen(sectionCount: number): IMountedScreen {
  nextRootTag += 1;
  const surface = createSurface(nextRootTag);
  const list = createElement('RCTScrollView');
  let target: ISymbioteNode | undefined;
  const targetSection = Math.floor(sectionCount / 2);

  for (let sectionId = 0; sectionId < sectionCount; sectionId += 1) {
    const section = createElement('RCTView');
    setProp(section, 'style', ROW_STYLE);
    appendChild(section, makeRow(sectionId));

    for (let rowId = 0; rowId < SECTION_ROWS; rowId += 1) {
      const row = makeRow(rowId);
      const icon = createElement('RCTImageView');
      setProp(icon, 'style', ROW_STYLE);
      const label = createElement('RCTText', true);
      const text = createElement('RCTRawText');
      setProp(text, 'text', `section ${sectionId} row ${rowId}`);
      appendChild(label, text);
      appendChild(row, icon);
      appendChild(row, label);
      appendChild(section, row);
      if (sectionId === targetSection && rowId === 0) target = icon;
    }
    appendChild(list, section);
  }

  surface.appendChild(list);
  surface.commit();
  fabric.reset();
  if (target === undefined) throw new Error('sectioned screen built no target');
  return { surface, target };
}

describe('one prop changed deep in a sectioned screen', () => {
  for (const sectionCount of [3, 12, 49, 244]) {
    const screen = mountSectionedScreen(sectionCount);
    let tick = 0;
    bench(
      `1 prop, ${sectionCount * NODES_PER_SECTION + 1} nodes across ${sectionCount} sections`,
      () => {
        tick += 1;
        setProp(screen.target, 'opacity', tick % 2 === 0 ? 1 : 0.5);
        screen.surface.commit();
      },
      KRAUSEST_WARMUP,
    );
  }
});

// The cheapest commit there is, and the most common one on a scrolling screen: something upstream
// re-rendered and produced an identical tree. Nothing is mutated between commits here, so this
// times the floor cost of asking "did anything change?" on a full-size screen.
describe('commit with nothing mutated', () => {
  const idleScreen = mountSectionedScreen(244);
  bench(
    'no-op commit, 9761 nodes',
    () => idleScreen.surface.commit(),
    KRAUSEST_WARMUP,
  );
});

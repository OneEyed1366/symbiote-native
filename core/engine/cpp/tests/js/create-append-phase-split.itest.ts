// Where a create and an append actually spend themselves, measured through the WHOLE pipeline in
// one process: JS fill -> JSI `applyOps` -> `materialize` -> Fabric commit -> Yoga layout.
//
// why: F-78/F-80/F-81/F-82 each measured the NATIVE half and each found it too small — F-82 put
// `commitMs + layoutMs` at 15 ms against a 107-147 ms device gap and concluded the rest was "outside
// what this itest harness can observe at all: this binary links no Hermes, no JSI bridge, no JS
// runtime". **That premise is wrong about this harness.** `symbiote_tester` builds a real
// JavaScriptCore runtime (`symbiote-host.h`, `makeJSCRuntime()`) and evaluates the bundle against it,
// so every op here is recorded by real JS, crosses a real JSI boundary and is decoded by the real
// `Tree::applyOps`. The term nobody has priced is the one between F-82's two measurements: the
// DECODE, which is a per-node run of `handles.getValueAtIndex` + `asObject` + `setNativeState` +
// two `make_shared`s, and which no headless run can reach because it needs a JSI runtime to exist.
//
// The three phases are cut where the architecture already cuts them, not by a profiler:
//
//   FILL     adapter mutations -> opcodes. Pure JS; `appendChild` takes no structural read on the
//            ordinary path (`wrapsOwner` returns on `childHost === undefined`), so the buffer
//            accumulates and nothing drains until asked.
//   APPLY    `flushOps()` -> ONE `applyOps` across JSI -> the C++ node store. No Fabric.
//   COMMIT   `surface.commit()` -> materialize, child sets, payloads, `completeRoot`, layout, and
//            the post-commit hooks. `readSurfaceTelemetry` names the Fabric/Yoga share inside it.
//
// READ THE CURVE, NOT THE MILLISECONDS. JSC is not Hermes and a Mac is not a phone, so the absolute
// figures do not transfer — the split between phases and how each scales with width do, which is the
// same contract F-80/F-81/F-82 measured under. `performance.now()` here is `Date.now()` (the
// runner's prelude installs it), so a single phase is only good to ~1 ms; the widths are sized so
// every phase clears that by an order of magnitude.

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const WIDTHS = [250, 500, 1_000] as const;
/** The select sweep varies only the STANDING tree; the change stays one prop on one row. */
const SELECT_WIDTHS = [250, 500, 1_000, 2_000] as const;
/** The ten-node benchmark row CLAUDE.md's cross-adapter table is measured on. */
const NODES_PER_ROW = 10;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

/**
 * `<view>` + three `<text>`/rawtext pairs + two pressable views + one text input = 10 nodes.
 *
 * Built out of engine primitives rather than through an adapter deliberately: the question is what
 * the ENGINE's own pipeline costs per node, and an adapter would add its own reconciler to every
 * phase — which is the half already measured per-adapter headlessly (`.docs/read-fragmentation-*`).
 */
function buildRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  routeProp(row, 'style', ROW_STYLE);
  routeProp(row, 'testID', `row-${id}`);

  const label = (text: string): ISymbioteNode => {
    const node = createElement('RCTText');
    routeProp(node, 'ellipsizeMode', 'tail');
    routeProp(node, 'allowFontScaling', true);
    appendChild(node, createRawText(text));
    return node;
  };

  appendChild(row, label(String(id)));

  for (const text of [`row ${id}`, 'x']) {
    const pressable = createElement('RCTView');
    routeProp(pressable, 'style', CELL_STYLE);
    appendChild(pressable, label(text));
    appendChild(row, pressable);
  }

  const input = createElement('RCTSinglelineTextInputView');
  routeProp(input, 'style', INPUT_STYLE);
  routeProp(input, 'text', `input ${id}`);
  appendChild(row, input);

  return row;
}

type IPhases = {
  rows: number;
  fill: number;
  apply: number;
  commit: number;
  commitMs: number;
  layoutMs: number;
  /**
   * A SECOND `surface.commit()` right after, with nothing pending.
   *
   * `commitSurfaceOps` returns on `hasChangedSinceCommit()` before touching the host, so no op, no
   * `materialize`, no `completeRoot`, no layout — but `notifyCommitted`, `runPostCommitHooks`,
   * `runDeferredAttaches` and `runCommittedHooks` all still run, deliberately (`surface.ts` says
   * why). So this is our own post-commit sweep, priced alone against the standing tree.
   */
  idle: number;
};

function since(startedAt: number): number {
  return performance.now() - startedAt;
}

/** Fill, drain, commit — each timed on its own, in the order the architecture runs them. */
function timedStep(rows: number, fillWith: () => void): Omit<IPhases, 'rows'> {
  let startedAt = performance.now();
  fillWith();
  const fill = since(startedAt);

  startedAt = performance.now();
  flushOps();
  const apply = since(startedAt);

  startedAt = performance.now();
  surfaceOf().commit();
  const commit = since(startedAt);
  mounted();

  startedAt = performance.now();
  surfaceOf().commit();
  const idle = since(startedAt);

  const telemetry = readSurfaceTelemetry(ROOT_TAG);
  if (telemetry === undefined) throw new Error('no telemetry for this surface');
  void rows;
  return {
    fill,
    apply,
    commit,
    commitMs: telemetry.commitMs,
    layoutMs: telemetry.layoutMs,
    idle,
  };
}

// ONE rootTag for every arm in the file. A second, distinct surfaceId in the same process reads
// back `commitMs=0`/`layoutMs=0` from `readSurfaceTelemetry` — recorded by F-82 as a harness
// property, not root-caused, and free to avoid.
let surface: ReturnType<typeof createSurface> | undefined;
let list: ISymbioteNode | undefined;

function surfaceOf(): ReturnType<typeof createSurface> {
  if (surface === undefined) throw new Error('no surface open');
  return surface;
}

function openList(): ISymbioteNode {
  surface = createSurface(ROOT_TAG);
  const next = createElement('RCTView');
  routeProp(next, 'style', { flexDirection: 'column' });
  surface.appendChild(next);
  list = next;
  return next;
}

function listOf(): ISymbioteNode {
  if (list === undefined) throw new Error('no list open');
  return list;
}

const created: IPhases[] = [];
const appended: IPhases[] = [];

type ISelect = {
  standing: number;
  wall: number;
  commitMs: number;
  layoutMs: number;
};

const selected: ISelect[] = [];
const repeated: number[] = [];

/** `[rows, nodesPerRow]` — every pair is 20 000 nodes, and only the list's width changes. */
const SHAPES = [
  [500, 40],
  [1_000, 20],
  [2_000, 10],
  [4_000, 5],
] as const;

const shapes: {
  rows: number;
  perRow: number;
  wall: number;
  commitMs: number;
  layoutMs: number;
}[] = [];

const onParent: { width: number; wall: number }[] = [];

function pad(text: string, width: number): string {
  return text.padStart(width);
}

function table(label: string, measured: readonly IPhases[]): string[] {
  const lines = [
    '',
    `${label} — ms, real JSC + real Fabric, ${NODES_PER_ROW} nodes/row`,
    pad('rows', 6) +
      pad('FILL', 8) +
      pad('APPLY', 8) +
      pad('COMMIT', 8) +
      pad('commitMs', 10) +
      pad('layoutMs', 10) +
      pad('postCommit', 12) +
      pad('unaccounted', 13),
  ];
  for (const one of measured) {
    // What is left of the COMMIT wall once Fabric's own two phases and our post-commit sweep are
    // taken out: the differ, the mounting layer, and the JSI call that carries the commit op.
    const unaccounted = one.commit - one.commitMs - one.layoutMs - one.idle;
    lines.push(
      pad(String(one.rows), 6) +
        pad(one.fill.toFixed(1), 8) +
        pad(one.apply.toFixed(1), 8) +
        pad(one.commit.toFixed(1), 8) +
        pad(one.commitMs.toFixed(1), 10) +
        pad(one.layoutMs.toFixed(1), 10) +
        pad(one.idle.toFixed(1), 12) +
        pad(unaccounted.toFixed(1), 13),
    );
  }
  return lines;
}

/** Per-node cost at the widest against the narrowest. 1.0 is linear; above it is a curve. */
function curveOf(
  measured: readonly IPhases[],
  phase: 'fill' | 'apply' | 'commit',
): number {
  const first = measured[0];
  const last = measured[measured.length - 1];
  return last[phase] / last.rows / (first[phase] / first.rows);
}

describe('where a create and an append spend themselves, end to end', () => {
  it('warms the process so the first arm is not measuring a cold runtime', () => {
    openList();
    for (let id = 0; id < 100; id += 1) appendChild(listOf(), buildRow(id));
    flushOps();
    surfaceOf().commit();
    mounted();
    expect(readSurfaceTelemetry(ROOT_TAG) !== undefined).toBe(true);
  });

  it('splits a create by width', () => {
    for (const rows of WIDTHS) {
      openList();
      created.push({
        rows,
        ...timedStep(rows, () => {
          for (let id = 0; id < rows; id += 1)
            appendChild(listOf(), buildRow(id));
        }),
      });
    }
    // why: a phase reading zero would mean the split measured an empty pipeline rather than a cheap
    // one — the same guard `host-work-split.probe.test.ts` carries for the headless half.
    for (const one of created) expect(one.fill > 0 && one.apply > 0).toBe(true);
  });

  it('splits an append onto a standing list of the same width', () => {
    for (const rows of WIDTHS) {
      openList();
      for (let id = 0; id < rows; id += 1) appendChild(listOf(), buildRow(id));
      flushOps();
      surfaceOf().commit();
      mounted();
      appended.push({
        rows,
        ...timedStep(rows, () => {
          for (let id = rows; id < rows * 2; id += 1)
            appendChild(listOf(), buildRow(id));
        }),
      });
    }
    for (const one of appended)
      expect(one.fill > 0 && one.apply > 0).toBe(true);
  });

  // why: a create's COMMIT wall is dominated by a term that is neither `materialize` nor Yoga nor
  // our post-commit sweep — the differ and the mounting layer. The question that decides whether it
  // is OUR problem is what it is proportional to. One prop on one row of a standing thousand changes
  // 1 node out of 10 000; if the residual follows the CHANGE it is Fabric doing its job, and if it
  // follows the TREE the commit re-slices work nothing asked for.
  it('prices a one-prop change against standing trees of four widths', () => {
    for (const standing of SELECT_WIDTHS) {
      openList();
      const rows: ISymbioteNode[] = [];
      for (let id = 0; id < standing; id += 1) {
        const row = buildRow(id);
        rows.push(row);
        appendChild(listOf(), row);
      }
      flushOps();
      surfaceOf().commit();
      mounted();

      const startedAt = performance.now();
      routeProp(rows[standing >> 1], 'style', {
        ...ROW_STYLE,
        backgroundColor: '#f5a524',
      });
      flushOps();
      surfaceOf().commit();
      const wall = since(startedAt);
      mounted();

      const telemetry = readSurfaceTelemetry(ROOT_TAG);
      selected.push({
        standing,
        wall,
        commitMs: telemetry?.commitMs ?? 0,
        layoutMs: telemetry?.layoutMs ?? 0,
      });
    }
    expect(selected.length).toBe(SELECT_WIDTHS.length);
  });

  // why: the sweep above could be a ONE-OFF — the first commit after a mount re-points the retained
  // tree at whatever Fabric substituted during it (`adoptCommitted`'s own reason for existing), and a
  // cost paid once on settling is not the same finding as a cost paid on every frame. Five identical
  // selects in a row on one standing tree tell the two apart.
  it('repeats the same one-prop change five times on one standing tree', () => {
    openList();
    const rows: ISymbioteNode[] = [];
    for (let id = 0; id < 1_000; id += 1) {
      const row = buildRow(id);
      rows.push(row);
      appendChild(listOf(), row);
    }
    flushOps();
    surfaceOf().commit();
    mounted();

    for (let round = 0; round < 5; round += 1) {
      const startedAt = performance.now();
      routeProp(rows[500], 'style', {
        ...ROW_STYLE,
        backgroundColor: round % 2 === 0 ? '#f5a524' : '#3a2c10',
      });
      flushOps();
      surfaceOf().commit();
      repeated.push(since(startedAt));
      mounted();
    }
    expect(repeated.length).toBe(5);
  });

  // why: two suspects sit inside the unaccounted term and the sweep above cannot tell them apart,
  // because it grew the list's WIDTH and the tree's SIZE together. `materialize` walks the changed
  // parent's own child list (F-81's mechanism) and is therefore O(list width); `adoptCommitted`
  // descends the committed tree and is O(total nodes) whenever its identity stop fails. Holding the
  // NODE COUNT fixed at 20 000 and varying only the width separates them: a cost that tracks width
  // is the sibling walk, a cost that stays flat is the whole-tree descent.
  it('holds the node count at 20 000 and varies only the list width', () => {
    for (const [rows, perRow] of SHAPES) {
      openList();
      const built: ISymbioteNode[] = [];
      for (let id = 0; id < rows; id += 1) {
        const row = createElement('RCTView');
        routeProp(row, 'style', ROW_STYLE);
        for (let at = 1; at < perRow; at += 1) {
          const cell = createElement('RCTView');
          routeProp(cell, 'style', CELL_STYLE);
          appendChild(row, cell);
        }
        built.push(row);
        appendChild(listOf(), row);
      }
      flushOps();
      surfaceOf().commit();
      mounted();

      const startedAt = performance.now();
      routeProp(built[rows >> 1], 'style', {
        ...ROW_STYLE,
        backgroundColor: '#f5a524',
      });
      flushOps();
      surfaceOf().commit();
      const wall = since(startedAt);
      mounted();
      const telemetry = readSurfaceTelemetry(ROOT_TAG);
      shapes.push({
        rows,
        perRow,
        wall,
        commitMs: telemetry?.commitMs ?? 0,
        layoutMs: telemetry?.layoutMs ?? 0,
      });
    }
    expect(shapes.length).toBe(SHAPES.length);
  });

  // why: `materialize`'s update branch has two exits and the child list decides which. A change that
  // clones a CHILD leaves `childrenHeld` false, so the parent is cloned WITH its whole child list —
  // and that file's own comment says what Fabric then does with it: "`fragment.children` is read as a
  // flag three times inside the clone... it forces `updateYogaChildren()`, which calls
  // `adoptYogaChild` per child, and a child already owned by its previous parent's yoga node is
  // CLONED and swapped in by `replaceChild`... So a props-only change on a parent of a thousand rows
  // re-clones all thousand, every commit, forever." A change to the PARENT'S OWN props leaves
  // `childrenHeld` true and hands `childrenPlaceholder()` instead, so `updateYogaChildren` never
  // runs. Same tree, same width, same one prop — only which node it lands on differs. If the parent
  // arm is flat in width and the child arm is not, the comment's mechanism is the measured one.
  it('changes one prop on the LIST itself instead of on a row', () => {
    for (const width of SELECT_WIDTHS) {
      openList();
      for (let id = 0; id < width; id += 1) appendChild(listOf(), buildRow(id));
      flushOps();
      surfaceOf().commit();
      mounted();

      const startedAt = performance.now();
      routeProp(listOf(), 'style', {
        flexDirection: 'column',
        backgroundColor: '#101010',
      });
      flushOps();
      surfaceOf().commit();
      onParent.push({ width, wall: since(startedAt) });
      mounted();
    }
    expect(onParent.length).toBe(SELECT_WIDTHS.length);
  });

  it('reports the split and the per-phase curve', () => {
    for (const line of [
      ...table('CREATE', created),
      ...table('APPEND onto a standing list of the same width', appended),
      '',
      'ONE prop on ONE row — the CHANGE is constant, only the standing tree grows',
      pad('standing', 10) +
        pad('nodes', 8) +
        pad('wall', 8) +
        pad('commitMs', 10) +
        pad('layoutMs', 10) +
        pad('unaccounted', 13) +
        pad('us/standing node', 18),
      ...selected.map(one => {
        const nodes = one.standing * NODES_PER_ROW;
        const unaccounted = one.wall - one.commitMs - one.layoutMs;
        return (
          pad(String(one.standing), 10) +
          pad(String(nodes), 8) +
          pad(one.wall.toFixed(1), 8) +
          pad(one.commitMs.toFixed(1), 10) +
          pad(one.layoutMs.toFixed(1), 10) +
          pad(unaccounted.toFixed(1), 13) +
          pad(((unaccounted / nodes) * 1_000).toFixed(2), 18)
        );
      }),
      '',
      `five identical selects on one standing 1 000: ${repeated.map(one => one.toFixed(1)).join('  ')} ms`,
      '',
      'THE SAME ONE PROP, on the LIST itself — children held, no re-adoption',
      pad('width', 8) + pad('wall', 8) + pad('vs on a row', 14),
      ...onParent.map((one, at) => {
        const onRow = selected[at]?.wall ?? 0;
        return (
          pad(String(one.width), 8) +
          pad(one.wall.toFixed(1), 8) +
          pad(`${(onRow / Math.max(one.wall, 0.5)).toFixed(0)}x`, 14)
        );
      }),
      '',
      'ONE prop on ONE row, 20 000 nodes throughout — only the LIST WIDTH changes',
      pad('rows', 8) +
        pad('nodes/row', 12) +
        pad('wall', 8) +
        pad('commitMs', 10) +
        pad('layoutMs', 10) +
        pad('unaccounted', 13),
      ...shapes.map(
        one =>
          pad(String(one.rows), 8) +
          pad(String(one.perRow), 12) +
          pad(one.wall.toFixed(1), 8) +
          pad(one.commitMs.toFixed(1), 10) +
          pad(one.layoutMs.toFixed(1), 10) +
          pad((one.wall - one.commitMs - one.layoutMs).toFixed(1), 13),
      ),
      '',
      `per-node cost, ${WIDTHS[WIDTHS.length - 1]} rows vs ${WIDTHS[0]}:`,
      `  create   fill ${curveOf(created, 'fill').toFixed(2)}x   ` +
        `apply ${curveOf(created, 'apply').toFixed(2)}x   ` +
        `commit ${curveOf(created, 'commit').toFixed(2)}x`,
      `  append   fill ${curveOf(appended, 'fill').toFixed(2)}x   ` +
        `apply ${curveOf(appended, 'apply').toFixed(2)}x   ` +
        `commit ${curveOf(appended, 'commit').toFixed(2)}x`,
    ]) {
      print(`DEBUG ${line}`);
    }
    expect(created.length).toBe(WIDTHS.length);
  });
});

report();

// ── ANSWER ───────────────────────────────────────────────────────────────────────────────────────
//
//   CREATE                          APPEND onto a standing list of the same width
//   rows  FILL APPLY COMMIT         rows  FILL APPLY COMMIT
//    250   6.0  14.0   48.0          250   6.0  14.0   54.0
//    500  11.0  28.0  102.0          500  12.0  27.0  116.0
//   1000  23.0  55.0  225.0         1000  25.0  59.0  274.0
//
//   of the 1 000-row COMMIT:  commitMs 26.6   layoutMs 22.4   postCommit 0.0   UNACCOUNTED 176.1
//
// **The commit is three quarters of a create, and Fabric is not in it.** RN's own commit window and
// Yoga's layout together are 49 ms of the 225; our post-commit sweep (`notifyCommitted`,
// `runPostCommitHooks`, `runDeferredAttaches`, `runCommittedHooks`, priced by a second commit with
// nothing pending) is 0.0 — F-66/F-67/F-68's fixes hold. The 176 ms is the code between `applyOps`
// entering `kOpCommit` and `completeSurface` returning: `appendRenderable`/`materialize` and
// `adoptCommitted`. `commitMs` cannot contain it — it is `TransactionTelemetry`'s
// `getCommitStartTime()..getCommitEndTime()`, stamped by `ShadowTree::commit`, and `materialize`
// runs BEFORE `uiManager.completeSurface` is called at all (see `kOpCommit`, SymbioteTree.cpp).
//
// **The control isolates it, and the shape is the finding.** One prop on one row — a change that
// does not grow — against standing trees that do:
//
//   standing   nodes   wall  commitMs  layoutMs  unaccounted  us/standing node
//        250    2500    2.0       0.0       0.0          2.0              0.78
//        500    5000    8.0       0.1       0.0          7.9              1.58
//       1000   10000   29.0       0.2       0.0         28.8              2.88
//       2000   20000  105.0       0.5       0.0        104.5              5.22
//
// Fabric commits in under a millisecond and Yoga does nothing, because nothing about the layout
// changed. Ours costs 105 ms. The per-node figure RISES 6.7x across an 8x width, so this is not
// O(tree) either — each doubling multiplies the cost by ~3.6, i.e. roughly O(n^1.85).
//
// **And it is paid on every commit, not once on settling.** Five identical selects on one standing
// 1 000: 29.0 29.0 30.0 29.0 28.0 ms. A cost that repeats is a frame cost.
//
// So the unaccounted term in CREATE and APPEND is the same term: 176 ms of a 225 ms create commit and
// 214 ms of a 274 ms append commit, in a walk whose size is the STANDING tree and not the change.
//
// **IT IS NOT THE TREE — IT IS THE WIDTH OF ONE CHILD LIST.** The sweep above grew the list's width
// and the tree's size together, which cannot separate the two suspects: `materialize` walks the
// changed parent's own child list (F-81's mechanism, O(width)) while `adoptCommitted` descends the
// committed tree (O(total nodes)). Holding the node count at 20 000 and varying ONLY the width:
//
//   rows  nodes/row   wall  commitMs  layoutMs  unaccounted
//    500         40   12.0       0.2       0.0         11.8
//   1000         20   33.0       0.4       0.0         32.6
//   2000         10  110.0       0.7       0.0        109.3
//   4000          5  416.0       1.1       0.0        414.9
//
// Same twenty thousand nodes in every row. Widening the changed parent's child list 8x multiplies
// the commit 35x, and Fabric's own share goes 0.2 -> 1.1 ms, i.e. linear and negligible. So the term
// is driven by the SIBLING COUNT of the node that changed and not by tree size, and
// `adoptCommitted`'s whole-tree descent is ruled out by these four arms — a cost proportional to
// total nodes would have been flat across them. That refutes this file's own first hypothesis, which
// named `adoptCommitted`.
//
// **DO NOT QUOTE AN EXPONENT OFF THESE FOUR ROWS.** 35x for 8x looks like O(W^1.75), and this build
// cannot support that reading: `core/engine/cpp/tests` configures `CMAKE_BUILD_TYPE Debug` with
// asserts deliberately on, and the compile line for RN's own translation units carries no `-O` flag
// at all. At `-O0`, allocator and refcount traffic that a release build folds away is paid in full,
// and a superlinear-looking curve can come from allocation pressure rather than from an algorithm.
// What survives that objection is everything measured as an A/B INSIDE one binary, where the
// constant factor cancels: the 35x at constant node count above, and the parent-vs-child contrast
// below. The exponent itself needs an optimised build to claim, and this file does not make one.
// (`REACT_NATIVE_DEBUG` is NOT defined here, so `ensureYogaChildrenLookFine()` — an O(W) assert walk
// called twice per `adoptYogaChild` — compiles away and is NOT the cause. It was the first suspect
// and it is ruled out by the compile line, not by argument.)
//
// This is the shape a real list has: `BenchmarkScreen`'s own step is 1 000-2 000 flat rows under one
// parent, and every commit that touches any one of them pays it again.
//
// **AND THE MECHANISM IS THE ONE `materialize` ALREADY DOCUMENTS.** Its update branch has two exits
// and the child list picks one. A change that clones a CHILD leaves `childrenHeld` false and the
// parent is cloned WITH its whole child list; a change to the PARENT'S OWN props leaves it true and
// hands `ShadowNodeFragment::childrenPlaceholder()` instead. Same tree, same width, same single prop
// — only which node it lands on differs:
//
//   width   on a ROW   on the LIST itself
//     250        3.0                  1.0
//     500        9.0                  1.0
//    1000       30.0                  0.0
//    2000      106.0                  2.0
//
// The parent arm is FLAT in width and the child arm is not. That is the comment's own claim,
// measured: "`fragment.children` is read as a flag three times inside the clone... it forces
// `updateYogaChildren()`, which calls `adoptYogaChild` per child, and a child already owned by its
// previous parent's yoga node is CLONED and swapped in by `replaceChild`... So a props-only change on
// a parent of a thousand rows re-clones all thousand, every commit, forever."
//
// Read in the vendor, `updateYogaChildren` is W clones plus W `replaceChild` calls per commit, and
// BOTH `replaceChild`s take an accurate `suggestedIndex` on this path — `yogaLayoutableChildren_` is
// rebuilt incrementally, so index `i` is always the entry just appended. The linear scan their
// fallback would do is therefore NOT reached, and the per-child re-cloning is linear. What makes the
// measured curve steeper than linear is not identified here; see the build caveat above before
// reading a complexity class into it.
//
// **The path built to avoid exactly this is `canReplaceInPlace`, and it returns false
// unconditionally** (SymbioteTree.cpp, disabled for a fuzzer-confirmed correctness reason). So
// this is not a missing optimisation on a fast path — it is the standing cost of that
// path being off, and F-65's "500x" was measuring its absence from the other side.
//
// WHAT THIS DOES NOT ESTABLISH. JSC is not Hermes and a Mac is not a phone, so no millisecond here
// transfers to a device — the CURVE and the SPLIT are what carry. The two arms locate the cost at
// "handing a whole child list to `cloneNode`" and no finer; splitting `updateYogaChildren`'s
// re-adoption from `replaceChild`'s scan needs a C++ timer. Note F-80 exonerated that scan in
// `bench/sibling-scan.cpp`, a container-only bench that never built a real committed tree — the same
// gap F-78 records for F-17's Yoga-only chunking benchmark, and an exoneration from a harness that
// cannot reach the path is not an exoneration.

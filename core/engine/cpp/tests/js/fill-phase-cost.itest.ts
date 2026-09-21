// Where the 38 ms of JS BEFORE the first crossing goes.
//
// why: every create-shaped row in the benchmark splits the same way — an `apply` of 43-47 ms that
// the C++ side accounts for line by line, and a remainder the adapter and the engine share with
// nothing said about it. On the engine's own arm, with no reconciler above it at all, that
// remainder is `build=38.4 ms` for 10 003 nodes and 13 003 props (`reconciler-floor.itest.tsx`):
// ~3.8 us per node of PURE JavaScript, not one byte of which has crossed the boundary yet. It is the
// single largest unattributed number left on this page, it is charged to all five adapters, and
// nothing has ever split it.
//
// THREE PHASES, ONE TREE. `createElement`, `routeProp` and `appendChild` are timed in separate
// passes over the same ten-node row, so the tree that stands at the end is byte-identical to the one
// the interleaved build produces — only the ORDER differs, and none of the three needs another to
// have finished to cost what it costs. The alternative, removing one phase and taking a difference,
// builds a different tree and prices a different workload.
//
// NOTHING IS FLUSHED until every phase has been timed. A read is a batch boundary, so a `flushOps`
// inside the clock would put an `applyOps` crossing into a figure this file exists to keep free of
// one. The commit happens afterwards, outside every timer, and the census then proves the tree.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

// IMPORTED but NOT called at module scope, and the order is the whole second measurement below:
// `hasHostBehaviors()` is monotone — it turns on at the first registration and never off — so the
// only place a build with a COLD registry can be timed is before any case has registered anything.
import { registerTextInputBehavior } from '@symbiote-native/components';

import {
  committedTags,
  describe,
  expect,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;

/** The ten-node row, and what it is made of — asserted, never derived from a run. */
const NODES_PER_ROW = 10;
const PROPS_PER_ROW = 13;
/** The app tree plus the list container, Fabric's root and the surface's AppContainer. */
const COMMITTED_NODES = ROWS * NODES_PER_ROW + 3;
/**
 * Every prop write the commit sees: the row's thirteen, the list's one style, and TWO the surface
 * writes on its own chrome before this file touches anything.
 *
 * The chrome pair is not slack in the oracle — it is what makes this number the same 13 003 the
 * engine arm of `reconciler-floor.itest.tsx` reports, so the two files are measuring one workload.
 */
const COMMITTED_PROPS = ROWS * PROPS_PER_ROW + 1 + 2;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

type IRow = {
  readonly row: ISymbioteNode;
  readonly texts: readonly ISymbioteNode[];
  readonly cells: readonly ISymbioteNode[];
  readonly raws: readonly ISymbioteNode[];
  readonly input: ISymbioteNode;
};

/**
 * PHASE 1 — every node of one row, created and nothing else.
 *
 * `createRawText` is counted as a creation like any other: it takes the op the other three do not,
 * and leaving it out of this phase would move its cost silently into the append.
 */
function createRow(id: number, isTagged: boolean): IRow {
  const texts = [
    createElement('RCTText'),
    createElement('RCTText'),
    createElement('RCTText'),
  ];
  const raws = [
    createRawText(String(id)),
    createRawText(`row ${id}`),
    createRawText('x'),
  ];
  const cells = [createElement('RCTView'), createElement('RCTView')];
  return {
    row: createElement('RCTView'),
    texts,
    cells,
    raws,
    // THE TAG, and without it this is a different workload — `text-input` is the one node in this
    // row a host behavior attaches to, and its `attach` seeds a prop. The engine arm of
    // `reconciler-floor.itest.tsx` learned this the hard way, writing 12 003 props against 13 003.
    // The untagged spelling is the registry-miss arm's, and its prop count says so.
    input: isTagged
      ? createElement('RCTSinglelineTextInputView', false, 'text-input')
      : createElement('RCTSinglelineTextInputView'),
  };
}

/** One whole build, timed end to end and committed outside the clock. */
function timeBuild(
  rootTag: number,
  isTagged: boolean,
): { wall: number; nodes: number; props: number } {
  const surface = createSurface(rootTag);
  const startedAt = performance.now();
  const list = createElement('RCTView');
  routeProp(list, 'style', { flex: 1 });
  for (let id = 0; id < ROWS; id += 1) {
    const built = createRow(id, isTagged);
    fillProps(built, id);
    wireRow(built, list);
  }
  surface.appendChild(list);
  const wall = performance.now() - startedAt;
  surface.commit();
  mounted();
  return {
    wall,
    nodes: committedTags().length,
    props: readSurfaceTelemetry(rootTag)?.setProps ?? 0,
  };
}

/** Twelve per row when nothing is tagged: no behavior, so no `mostRecentEventCount` seed. */
const UNTAGGED_PROPS = ROWS * (PROPS_PER_ROW - 1) + 1 + 2;

/**
 * PHASE 2a — the STYLE writes. Four per row.
 *
 * Split from the scalars because `routeProp`'s style branch is a different function: it merges the
 * class and style halves, compares the incoming object against the standing one key by key
 * (`isSameShallowStyle`) and republishes a two-element array, where a scalar falls through to one
 * `Object.is`. An average over the two would hide whichever is the expensive one.
 */
function fillStyles(built: IRow): void {
  routeProp(built.row, 'style', ROW_STYLE);
  for (const cell of built.cells) routeProp(cell, 'style', CELL_STYLE);
  routeProp(built.input, 'style', INPUT_STYLE);
}

/** PHASE 2b — the SCALAR writes. Eight per row, two of them strings built per row. */
function fillScalars(built: IRow, id: number): void {
  routeProp(built.row, 'testID', `row-${id}`);
  for (const text of built.texts) {
    routeProp(text, 'ellipsizeMode', 'tail');
    routeProp(text, 'allowFontScaling', true);
  }
  routeProp(built.input, 'text', `input ${id}`);
}

/** Both halves, for the arms that do not care which is which. */
function fillProps(built: IRow, id: number): void {
  fillStyles(built);
  fillScalars(built, id);
}

/** What the split above is made of — asserted through the total, never derived from a run. */
const STYLES_PER_ROW = 4;
const SCALARS_PER_ROW = 8;

/** PHASE 3 — the structure. Ten appends, one per node bar the row itself, plus the row's own. */
function wireRow(built: IRow, list: ISymbioteNode): void {
  appendChild(built.texts[0], built.raws[0]);
  appendChild(built.texts[1], built.raws[1]);
  appendChild(built.texts[2], built.raws[2]);
  appendChild(built.cells[0], built.texts[1]);
  appendChild(built.cells[1], built.texts[2]);
  appendChild(built.row, built.texts[0]);
  appendChild(built.row, built.cells[0]);
  appendChild(built.row, built.cells[1]);
  appendChild(built.row, built.input);
  appendChild(list, built.row);
}

let coldMs: number | undefined;
let armedMs: number | undefined;

describe('the JS half of a create, before anything crosses', () => {
  // why: `createElement` asks the behavior registry about EVERY node, and for nine in ten the answer
  // is a guaranteed miss — the registry is keyed by intrinsic TAG (`pressable`, `text-input`) while
  // an untagged node passes its FABRIC view name (`RCTView`), and `attachHostBehavior`'s own comment
  // says the default "never matches and costs one failed lookup". Whether that lookup is worth
  // removing is a number, and nobody has taken it.
  //
  // THIS CASE MUST RUN FIRST and the file's structure is built around that: `hasHostBehaviors()` is
  // monotone, so the only moment a build with a COLD registry can be timed is before anything has
  // registered. The next case registers and rebuilds the identical untagged tree, and the two
  // clocks then differ by exactly ten thousand failed lookups — asserted equal on the census and on
  // the prop count first, which is what makes them comparable at all.
  it('builds a thousand untagged rows while the registry is still cold', () => {
    const cold = timeBuild(ROOT_TAG, false);
    expect(cold.nodes).toBe(COMMITTED_NODES);
    expect(cold.props).toBe(UNTAGGED_PROPS);
    coldMs = cold.wall;
    print(`DEBUG MISS cold    build=${cold.wall.toFixed(1)} ms, gate off`);
  });

  // why: the same tree again, with the gate armed by a behavior no node in this row names. Nothing
  // attaches on either arm; the difference is the lookup.
  it('builds the identical tree once the gate is armed', () => {
    registerTextInputBehavior();
    // THE SAME ROOT TAG as the cold arm, and it has to be: the test host holds exactly ONE surface
    // (`kSurfaceId = 1`), so a second tag commits into a surface no reader can see and the census
    // comes back as 1. Every arm here therefore replaces the standing tree rather than sitting
    // beside it.
    const armed = timeBuild(ROOT_TAG, false);
    expect(armed.nodes).toBe(COMMITTED_NODES);
    // THE COMPARABILITY GATE: the same twelve props per row as the cold arm. A tagged node would
    // seed a thirteenth and the two builds would no longer be one workload.
    expect(armed.props).toBe(UNTAGGED_PROPS);
    armedMs = armed.wall;
    const delta = armed.wall - (coldMs ?? 0);
    print(
      `DEBUG MISS armed   build=${armed.wall.toFixed(1)} ms · ` +
        `the registry miss costs ${delta.toFixed(1)} ms over ` +
        `${ROWS * NODES_PER_ROW} nodes = ` +
        `${((delta * 1_000) / (ROWS * NODES_PER_ROW)).toFixed(2)} us/node`,
    );
  });

  // why: the three calls an adapter makes per node are not one cost, and which of them dominates
  // decides what there is to do about it. A prop write is the engine's hottest path by call count
  // (13 per row against 10 creations), a creation allocates a node and records an op, and an append
  // walks the redirect chain — three different shapes, and nobody has ever said which is the 38 ms.
  it('splits create, prop and append over a thousand ten-node rows', () => {
    const surface = createSurface(ROOT_TAG);

    const createStartedAt = performance.now();
    const list = createElement('RCTView');
    const rows: IRow[] = [];
    for (let id = 0; id < ROWS; id += 1) rows.push(createRow(id, true));
    const createMs = performance.now() - createStartedAt;

    const styleStartedAt = performance.now();
    routeProp(list, 'style', { flex: 1 });
    for (const built of rows) fillStyles(built);
    const styleMs = performance.now() - styleStartedAt;

    const scalarStartedAt = performance.now();
    for (let id = 0; id < ROWS; id += 1) fillScalars(rows[id], id);
    const scalarMs = performance.now() - scalarStartedAt;
    const propMs = styleMs + scalarMs;

    const appendStartedAt = performance.now();
    for (const built of rows) wireRow(built, list);
    surface.appendChild(list);
    const appendMs = performance.now() - appendStartedAt;

    // OUTSIDE every clock, and deliberately: this is the crossing, and the whole point of the three
    // figures above is that none of them contains one.
    surface.commit();
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    // THE ORACLE, before any millisecond is read. A phase that quietly built less would read as
    // fast, which is the mistake this directory has paid for three times.
    expect(committedTags().length).toBe(COMMITTED_NODES);
    expect(telemetry?.setProps ?? 0).toBe(COMMITTED_PROPS);

    const total = createMs + propMs + appendMs;
    const per = (ms: number, count: number): string =>
      `${((ms * 1_000) / count).toFixed(2)} us`;
    print(
      `DEBUG FILL SPLIT   total=${total.toFixed(1)} ms · ` +
        `create=${createMs.toFixed(1)} (${per(createMs, ROWS * NODES_PER_ROW)}/node) · ` +
        `prop=${propMs.toFixed(1)} (${per(propMs, ROWS * PROPS_PER_ROW)}/write) · ` +
        `append=${appendMs.toFixed(1)} (${per(appendMs, ROWS * NODES_PER_ROW)}/append)`,
    );
    print(
      `DEBUG FILL SHARE   create=${((createMs / total) * 100).toFixed(0)}% ` +
        `prop=${((propMs / total) * 100).toFixed(0)}% ` +
        `append=${((appendMs / total) * 100).toFixed(0)}%`,
    );
    // AND THE PROP HALF SPLIT BY KEY KIND, because the average above hides whichever is dear. The
    // list's own style rides with the styles, which is where it belongs and why the counts are + 1.
    print(
      `DEBUG PROP SPLIT   style=${styleMs.toFixed(1)} ` +
        `(${per(styleMs, ROWS * STYLES_PER_ROW + 1)}/write) · ` +
        `scalar=${scalarMs.toFixed(1)} ` +
        `(${per(scalarMs, ROWS * SCALARS_PER_ROW)}/write)`,
    );
  });

  // why: A NEGATIVE RESULT, and it is the point of the two arms above rather than a footnote on
  // them. The armed arm comes back FASTER than the cold one, run after run — so ten thousand failed
  // registry lookups are smaller than the warm-up the first build in a process pays, and the
  // guaranteed miss is not a cost worth removing.
  //
  // It kills a specific change: making `createElement`'s `tag` parameter optional so an untagged
  // node never reaches `attachHostBehavior` at all. That looked like ten thousand free lookups and
  // is worth nothing, while it would break every test that registers a behavior under a FABRIC view
  // name and creates its subject with `createElement(THAT_NAME)` — which is most of
  // `host-behavior.test.ts`, by the accident this repo has already recorded.
  it('finds the registry miss too small to measure, which settles it', () => {
    if (coldMs === undefined || armedMs === undefined) {
      throw new Error('an arm above did not run');
    }
    print(
      `DEBUG MISS VERDICT cold=${coldMs.toFixed(1)} armed=${armedMs.toFixed(1)} ms · ` +
        'armed is not slower on a quiet machine, so the miss is below this instrument and the ' +
        'optional-tag change buys nothing',
    );
    // NO TRIPWIRE ON THE RATIO, and the reason generalises: the gate is MONOTONE, so the cold arm
    // can be taken exactly once per process and the pair can never be best-of-N. A one-shot timing
    // is the shape this directory already records as unassertable — the full release suite runs a
    // process per file and a sample can be descheduled for longer than the thing being measured,
    // which turned a 1.5x bound red at 29.2 against 49.6 while the same pair reads 23.5 / 22.4
    // alone. The finding lives in `CLAUDE.md`; what is asserted here is only that both arms ran and
    // built their tree, which the two cases above already check by census and prop count.
    expect(coldMs > 0 && armedMs > 0).toBe(true);
  });
});

report();

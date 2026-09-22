// The benchmark SCREEN, headless — the same eight steps `examples/*/screens/BenchmarkScreen.tsx`
// runs on a device, driven by whichever adapter the calling file mounts.
//
// why: every headless arm in this directory so far measures ONE operation. The device table in
// `CLAUDE.md` has eight per adapter, and it predates the buffer architecture, so on this branch
// there is no row anyone can quote. This module is the ruler: one state machine, one row shape, one
// oracle, eight steps, six arms.
//
// THE STEPS ARE THE DEVICE'S, in the device's order and with the device's constants
// (`examples/bare-rn/screens/BenchmarkScreen.tsx` — `SUITE_STEPS`, `ROW_BATCH`, `UPDATE_STRIDE`,
// `SELECT_INDEX`, `REMOVE_INDEX`, `SWAP_LOW_INDEX`, `SWAP_HIGH_INDEX`). A step that differs from the
// screen's would produce a number nobody can compare to the published table, which is the whole
// point of taking it.
//
// ONE FILE PER ARM: the runner spawns a process per file, so arms share a machine and a build but
// not a heap. That removes the ~3%-per-arm contamination this directory has measured, and the
// question of who owns the harness's single surface (`kSurfaceId = 1`).
//
// THE ORACLE RUNS BEFORE THE CLOCK IS READ, on every step: the committed node count minus ten per
// row must equal the arm's own chrome, and that is a CONSTANT the arm declares. This repo has twice
// published a ratio off two columns that turned out to be different workloads — a missing
// `TextInput` read as 1.31x, and Angular's flat row agreed on every structural counter while 19% of
// the prop keys were absent. A step that silently built nothing reads as fast, not as broken.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import {
  committedShape,
  committedTags,
  countMutations,
  dispatchEvent,
  expect,
  heapInfo,
  mounted,
  mutationSummary,
  type IMountedView,
  print,
  commitNumber,
  startProfiling,
  stopProfiling,
} from './harness';

// Set by the runner from `SYMBIOTE_PROFILE_DIR`. Non-empty -> every step is sampled into
// `<dir>/<arm>-<step>.json`. Sampling perturbs the clock, so never read a RESULT from such a run.
declare const __SYMBIOTE_PROFILE_DIR__: string;
const PROFILE_HZ = 10_000;

type IHeapReading = {
  readonly allocated: number;
  readonly collections: number;
};

/**
 * Cumulative JS allocation and collection count, or undefined on JavaScriptCore (empty heap map).
 *
 * Cumulative on purpose: the DELTA across a step is exact without forcing a collection, so reading
 * it outside the stopwatch leaves the wall clock untouched. Bytes are the device-side cost a wall
 * clock here cannot see (§18j) — a phone's heap collects far more often than this host's.
 */
function readHeap(): IHeapReading | undefined {
  const info = heapInfo();
  const allocated = info.hermes_totalAllocatedBytes;
  const collections = info.hermes_numCollections;
  if (allocated === undefined || collections === undefined) return undefined;
  return { allocated, collections };
}

export const ROOT_TAG = 1;

/** The device screen's constants, verbatim. */
export const ROW_BATCH = 1_000;
const UPDATE_STRIDE = 10;
const UPDATE_SUFFIX = ' !!!';
const SELECT_INDEX = 1;
const REMOVE_INDEX = 3;
const SWAP_LOW_INDEX = 1;
const SWAP_HIGH_INDEX = 998;

/** Ten nodes per row: three views, three texts with a string child each, one text input. */
export const NODES_PER_ROW = 10;

// THE BACKGROUND IS WHAT KEEPS THE ROW CONCRETE, and it is the device's own colour rather than a
// decoration. A view carrying nothing but layout props is flattened away by Fabric and never reaches
// the host, so every arm needs SOMETHING here — and which something is not a free choice:
// `ViewShadowNode::initialize` gives `nativeId` a stacking context and a background only a VIEW, and
// a row that is not a stacking context has its whole subtree re-reported when its siblings shift
// (§16a of the measurement skill, `subtree-mutation-shape.itest.ts`). `examples/*/BenchmarkScreen`'s
// row carries a background and no id prop at all, so THAT is the trait the ruler has to reproduce —
// a `nativeID` here would make the headless arms cheaper than the screen they stand for.
//
// AS AN INTEGER, AND EVERY COLOUR BELOW WITH IT. RN turns a colour string into one with
// `processColor` before Fabric ever sees it, and that step does not happen in this host: written as
// `'#13243a'` the background reached our engine, which parses strings itself, and was DROPPED on the
// stock arm — so stock's rows were flattened while ours were not, and the two columns stopped being
// one workload. `stock-row-traits.itest.tsx` pins both halves, the integer landing and the string
// vanishing, because an absent key on its own proves nothing (`describeShadow`).
export const ROW_STYLE = {
  height: 44,
  flexDirection: 'row',
  paddingLeft: 10,
  backgroundColor: 0xff13243a,
} as const;
export const CELL_STYLE = { flex: 1 } as const;
export const INPUT_STYLE = { width: 96, height: 28 } as const;

// The device row spells its selected look as `[styles.benchRow, styles.benchRowSelected]`, which
// merges to exactly this. Module-level so a selected row allocates nothing per render — and note
// that it adds `borderLeftWidth`, a LAYOUT property, so a select here is deliberately the expensive
// spelling `CLAUDE.md` prices at 6.5x the paint-only one. The screen's number is the one worth
// reproducing, not the one that flatters us.
export const SELECTED_ROW_STYLE = {
  ...ROW_STYLE,
  backgroundColor: 0xff3a2c10,
  borderLeftWidth: 3,
  borderLeftColor: 0xfff5a623,
} as const;

/**
 * What ONE row commits, prop for prop — the oracle the mutation counter cannot be.
 *
 * `StubViewTree::recordMutation` writes `type`, `nativeID` and `index` and no props, so every
 * "byte-identical mutations" claim this suite has ever made was about the SHAPE of the payload and
 * never its contents. This constant is the contents, and it is asserted from both sides:
 * `stock-row-traits.itest.tsx` proves it is what React Native's own renderer commits, and
 * `row-payload-parity.itest.tsx` proves ours matches. Either one drifting turns one of them red.
 *
 * TWO FILES BECAUSE ONE BUNDLE CANNOT HOLD BOTH — the stock arm needs the platform-extensions
 * directive and an engine import dies under it. That is also why this lives here rather than in
 * either of them: a constant each side copied would agree with itself forever.
 *
 * It was written down after the two sides DISAGREED: stock carried `accessible` and `overflow` on
 * every Paragraph and `accessible` on the TextInput, and we carried none of the three. Seven props
 * a row, in the direction that flattered us.
 */
export const ROW_PAYLOAD =
  'View{backgroundColor=rgba(19, 36, 58, 1),flexDirection=row,height=44,paddingLeft=10}(' +
  `${textPayload('1')}` +
  `View{flex=1}(${textPayload('row one')})` +
  `View{flex=1}(${textPayload('x')})` +
  'TextInput{accessible=true,height=28,width=96}())';

/** One `<Text>` of the row, whose only variable is the string inside it. */
function textPayload(text: string): string {
  return (
    'Paragraph{accessible=true,allowFontScaling=true,ellipsizeMode=tail,' +
    'fontSize=NaN,fontSizeMultiplier=NaN,foregroundColor=rgba(0, 0, 0, 0),' +
    `overflow=hidden}(RawText{text=${text}}())`
  );
}

export type IBenchRow = { readonly id: number; readonly label: string };

export type IBenchState = {
  readonly rows: readonly IBenchRow[];
  readonly selectedId: number | undefined;
};

/**
 * The engine counters worth printing beside every step, named structurally.
 *
 * Structurally, and that is not a style choice: this module must not import `@symbiote-native/engine`
 * at all. The stock arm carries `@symbiote-platform-extensions`, and under that directive the
 * engine's own `processColor` import resolves RN's `Platform.ios.js`, which reaches for a native
 * module and kills the bundle at import — the trap `CLAUDE.md` records under "Platform extensions
 * are OPT-IN per file". So the adapter arms pass `readSurfaceTelemetry` in, and stock passes
 * nothing.
 */
export type IBenchTelemetry = {
  readonly walkMs: number;
  readonly applyMs: number;
  readonly commitMs: number;
  readonly layoutMs: number;
  /**
   * RN's OWN commit telemetry for the step — how many Yoga nodes it re-laid out and how many text
   * measurements it took.
   *
   * They answer a question no counter on this line could: `select` changes ONE row's style and
   * spends 8-9 ms of its 12-15 in `layout`, on a tree of ten thousand nodes. Whether that is Yoga
   * doing the least it can or us handing Fabric more than changed is the difference between a fact
   * about the platform and a bug in the commit, and only these two numbers tell them apart.
   */
  readonly layoutNodes: number;
  readonly textMeasures: number;
  readonly nodesCreated: number;
  readonly nodesCloned: number;
  readonly nodesReused: number;
  readonly setProps: number;
  readonly writesOfUnchanged: number;
  readonly foldsFound: number;
  /** `applyOps`' own split — see `APPLY SPLIT` below for why it is read on create-shaped steps. */
  readonly decodeMs: number;
  readonly setPropMs: number;
  readonly propConvertMs: number;
  readonly stringDecodeMs: number;
  readonly structureMs: number;
  readonly publishMs: number;
  readonly nodesDecoded: number;
  readonly valueEntries: number;
  readonly valueConversions: number;
  readonly applyCalls: number;
};

declare const __symbioteEngineNative: {
  readSurfaceTelemetry?: (surfaceId: number) => Record<string, number>;
};

/**
 * Fabric's OWN commit telemetry for the surface, with every engine counter zero.
 *
 * FOR THE STOCK ARM, and it is what makes `laidOut` comparable at all: React's own renderer drives
 * that tree, so this says what the PLATFORM costs for the workload with our engine nowhere in the
 * path. An adapter's `select` laying out seven thousand Yoga nodes is a fact about Fabric if stock
 * lays out seven thousand too, and a bug in our commit if it does not — and nothing short of this
 * column can tell the two apart.
 *
 * Read off the native bindings rather than through `@symbiote-native/engine`, because this module
 * and the stock arm both refuse that import for the `Platform.ios.js` reason above.
 */
export function readFabricTelemetry(): IBenchTelemetry | undefined {
  const read = __symbioteEngineNative?.readSurfaceTelemetry;
  if (read === undefined) return undefined;
  const raw = read(ROOT_TAG);
  const at = (key: string): number => raw[key] ?? 0;
  return {
    // THE ENGINE'S HALVES ARE ZERO HERE BY CONSTRUCTION, not by omission: no op of ours reached this
    // surface, so a non-zero in any of them would mean the arms had contaminated each other.
    walkMs: 0,
    applyMs: 0,
    nodesCreated: 0,
    nodesCloned: 0,
    nodesReused: 0,
    setProps: 0,
    writesOfUnchanged: 0,
    foldsFound: 0,
    decodeMs: 0,
    setPropMs: 0,
    propConvertMs: 0,
    stringDecodeMs: 0,
    structureMs: 0,
    publishMs: 0,
    nodesDecoded: 0,
    valueEntries: 0,
    valueConversions: 0,
    applyCalls: 0,
    commitMs: at('commitMs'),
    layoutMs: at('layoutMs'),
    layoutNodes: at('layoutNodes'),
    textMeasures: at('textMeasures'),
  };
}

export type IBenchDriver = {
  /** The column name in the results table. */
  readonly name: string;
  /** The engine's per-step counters, zeroed on read. Absent for an arm that reads nothing. */
  readonly readTelemetry?: () => IBenchTelemetry | undefined;
  /**
   * False for an arm whose telemetry carries FABRIC's half and none of the engine's — the stock
   * arm, which drives the platform itself.
   *
   * It has to be said rather than inferred from a zero: `setProps=0` is also what a step that
   * silently failed to apply reports, and telling those two apart is the entire job of the write
   * oracle below. Stock used to be exempt by passing no telemetry at all; it passes Fabric's now,
   * because `laidOut` is the only column that can say whether an adapter's layout cost is the
   * platform's or ours.
   */
  readonly drivesEngine?: boolean;
  /**
   * Committed nodes the arm holds that are not rows — its root, the container `createSurface` puts
   * under it, the screen's own wrapper, and for Svelte the DOM shim's root element. Declared rather
   * than derived, so a step that stops building rows fails instead of recalibrating.
   */
  readonly chrome: number;
  /**
   * Apply the state and SETTLE it: flush the framework's scheduler, then commit.
   *
   * May be async, because settling is the framework's own business and three of the six arms batch
   * on a microtask (Vue's `nextTick`, Svelte's `tick`, Angular's zoneless scheduler). The await is
   * inside the stopwatch on purpose — on a device that scheduler turn is part of what the step
   * costs, and an arm that reported only its synchronous half would be measuring less than the
   * others.
   */
  apply(state: IBenchState): void | Promise<void>;
  /**
   * Steps this arm is KNOWN not to apply, each one a defect with a reproduction behind it.
   *
   * An exemption, never a convenience. It exists so the work oracle below can protect the other arms
   * instead of being deleted, and so a column nobody may quote says so out loud in the output rather
   * than by its absence. An entry with no named reproduction is a bug being hidden.
   */
  readonly unappliedSteps?: readonly IStep[];
  /**
   * Also print what the DIFFER told the platform to do, per step, by mutation kind.
   *
   * Opt-in because it costs a full `mounted()` per step, and because only two arms need it: the
   * question it answers is whether stock and we hand the host the same amount of UI-thread work for
   * the same tree. Every other instrument in this directory stops at `completeRoot`; this is the
   * only one that speaks about the half of a commit that a real device pays in `UIView`s and a stub
   * platform pays in a struct swap. If the counts match, mutation volume is not where a
   * headless-versus-device divergence lives — and that is worth pinning either way.
   */
  readonly countsMutations?: boolean;
  /**
   * The rows sit in a `FlatList` (the device screen's VIRTUALIZED mode), so a step mounts only the
   * window, not every row. The node census and the write oracle assume every row is mounted and are
   * replaced by a ROW census: one `TextInput` per mounted row, whatever cell wrapper each list adds.
   * Stock's count is the reference an adapter must match (`VIRTUALIZED_ROWS`).
   */
  readonly virtualized?: boolean;
};

/** The device screen's list viewport (`examples/bare-rn` `benchRowsViewport`). */
export const VIEWPORT_HEIGHT = 420;
export const ROW_HEIGHT = ROW_STYLE.height;
export const VIEWPORT_WIDTH = 390;

/**
 * Rows React Native's own `FlatList` holds once its window has filled (stock arm, 2026-09-22) —
 * `announceListLayout` delivers the layout events, and the batches run inside the step. An adapter
 * mounting a different number is running a different window, not a faster list.
 */
export const VIRTUALIZED_ROWS: Partial<Record<IStep, number>> = {
  create: 125,
  replace: 125,
  partial: 125,
  select: 125,
  swap: 125,
  remove: 125,
  append: 125,
  clear: 0,
};

const MOUNTED_ROW_MARKER = /TextInput\(/g;

function mountedRowCount(): number {
  return committedShape().match(MOUNTED_ROW_MARKER)?.length ?? 0;
}

/**
 * Deliver the layout events a device's next frame would, for the list and its content container.
 *
 * The harness dispatches no layout events of its own, and a virtualized list sizes its window from
 * two of them: the scroll view's `onLayout` (viewport) and the content container's, which RN's
 * ScrollView turns into `onContentSizeChange`. RN's list will not grow past `initialNumToRender`
 * until it has both; ours reads content length off `getItemLayout` and grows regardless. Sending
 * both, after every commit, lets EVERY arm fill its window, so the row census compares one workload.
 * The frames are the ones Yoga already computed, so a list is told nothing the platform does not hold.
 */
export function announceListLayout(): void {
  const find = (view: IMountedView): IMountedView | undefined => {
    if (/ScrollView/.test(view.viewName)) return view;
    for (const child of view.children) {
      const hit = find(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const list = find(mounted());
  if (list === undefined)
    throw new Error('no scroll view is mounted to lay out');
  dispatchEvent(list.tag, 'topLayout', { layout: list.layout });
  const content = list.children[0];
  if (content !== undefined)
    dispatchEvent(content.tag, 'topLayout', { layout: content.layout });
}

/** A `ListRenderItem`-shaped key for an item layout of fixed-height rows. */
export function rowItemLayout(
  _data: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  return { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index };
}

let nextId = 1;

/**
 * Fresh rows with fresh ids, exactly as the screen's `buildRows` does.
 *
 * The ids are what make `Replace` a different operation from `Create`: a keyed list handed a
 * thousand unseen keys tears every row down and rebuilds it, where re-using the ids would be a
 * thousand no-op updates.
 */
export function buildRows(count: number): IBenchRow[] {
  const rows: IBenchRow[] = [];
  for (let index = 0; index < count; index += 1) {
    rows.push({ id: nextId, label: `row ${nextId}` });
    nextId += 1;
  }
  return rows;
}

const STEP_ORDER = [
  'create',
  'replace',
  'partial',
  'select',
  'swap',
  'remove',
  'append',
  'clear',
] as const;

type IStep = (typeof STEP_ORDER)[number];

/**
 * How many props each step writes — the SECOND oracle, beside the node census.
 *
 * WHY A CENSUS IS NOT ENOUGH, and this suite has now been caught twice by the same shape: the node
 * count cannot see work that changes no node. A selection repaints one row and adds nothing, so a
 * step that silently failed to apply it committed the right tree and read as the fastest column.
 *
 * Angular did exactly that. Its zoneless scheduler did not settle inside the arm's turn, so `select`
 * reported `setProps=0 batches=0` while `remove` reported `setProps=1` — one write, two steps late,
 * and three wall clocks mis-attributed. Every other adapter reports the numbers below, which is what
 * makes them an invariant of the WORKLOAD rather than of any renderer.
 *
 * An arm with no engine telemetry (stock drives Fabric itself) is exempt: there is nothing to count.
 */
const PROPS_PER_STEP: Readonly<Record<IStep, number>> = {
  // NINE per row, not ten: the row's style, three `ellipsizeMode`s, two cell styles, the input's
  // style and its text, and the row's own label. It was ten while every arm also wrote an id prop
  // on the row; dropping that (see `ROW_STYLE`) took exactly one write per row with it, which is the
  // shape this oracle exists to catch — it went red on both adapter arms the moment the prop left.
  create: ROW_BATCH * 9,
  replace: ROW_BATCH * 9,
  partial: ROW_BATCH / UPDATE_STRIDE,
  select: 1,
  swap: 0,
  remove: 0,
  append: ROW_BATCH * 9,
  clear: 0,
};

/**
 * `applyOps`' own split, on the two steps that build ten thousand nodes.
 *
 * WHY IT IS HERE and not left to a one-off probe: the first full run of this suite put `apply` at
 * 45 ms for React and 106 ms for Angular on a byte-identical tree — same `created`, same
 * `nodesDecoded`, and Angular writing 13 000 props against Svelte's 13 000 for 60 ms. A phase that
 * doubles between two adapters driving one buffer is the buffer's cost to explain, so the split has
 * to be on the standing instrument rather than reconstructed later.
 *
 * `applyCalls` is the field that separates the two candidate stories — more VALUES against the same
 * values in more BATCHES, since the string and value tables intern per batch.
 */
function applySplitLine(arm: string, telemetry: IBenchTelemetry): string {
  const ms = (value: number): string => value.toFixed(1);
  return (
    `DEBUG ${arm.padEnd(7)} APPLY SPLIT decode=${ms(telemetry.decodeMs)} ` +
    `setProp=${ms(telemetry.setPropMs)} convert=${ms(telemetry.propConvertMs)} ` +
    `strings=${ms(telemetry.stringDecodeMs)} structure=${ms(telemetry.structureMs)} ` +
    `publish=${ms(telemetry.publishMs)} :: decoded=${telemetry.nodesDecoded} ` +
    `values=${telemetry.valueEntries} converted=${telemetry.valueConversions} ` +
    `batches=${telemetry.applyCalls}`
  );
}

function telemetryLine(
  driver: IBenchDriver,
  step: IStep,
  wall: number,
  telemetry: IBenchTelemetry | undefined,
): string {
  const arm = driver.name;
  if (telemetry !== undefined && (step === 'create' || step === 'append')) {
    print(applySplitLine(arm, telemetry));
  }
  const ms = (value: number | undefined): string => (value ?? 0).toFixed(1);
  return (
    `DEBUG ${arm.padEnd(7)} ${step.padEnd(7)} wall=${wall.toFixed(1).padStart(6)} ` +
    `walk=${ms(telemetry?.walkMs)} apply=${ms(telemetry?.applyMs)} ` +
    `fabric=${ms(telemetry?.commitMs)} layout=${ms(telemetry?.layoutMs)} ` +
    // WHAT FABRIC ACTUALLY RE-MEASURED, beside how long it took. A `layout` figure with no node
    // count behind it cannot say whether the platform is doing the least it can.
    `laidOut=${telemetry?.layoutNodes ?? 0} texts=${telemetry?.textMeasures ?? 0} ` +
    `created=${telemetry?.nodesCreated ?? 0} cloned=${telemetry?.nodesCloned ?? 0} ` +
    `reused=${telemetry?.nodesReused ?? 0} setProps=${telemetry?.setProps ?? 0} ` +
    `unchanged=${telemetry?.writesOfUnchanged ?? 0} folds=${telemetry?.foldsFound ?? 0} ` +
    // HOW MANY TIMES THE STEP CROSSED, on every row rather than only on the two create-shaped ones.
    //
    // A read is a batch boundary, so this counts how often the adapter asked the host a question
    // mid-step as much as it counts commits. It is not a curiosity: an empty `applyOps` costs
    // 4.5-4.8 us of fixed prologue (`small-batch-crossing-cost.itest.ts`), so an adapter navigating
    // per mutation pays that per mutation. Solid's `Clear` read 1 001 here against React's and
    // Svelte's 2 on the identical tree, and that was the whole of its `apply=13.1` against their 2.6.
    `batches=${telemetry?.applyCalls ?? 0}`
  );
}

/**
 * What the committed tree holds, by view name — printed only when the oracle is about to fail.
 *
 * A node count that is off by a thousand says a step built the wrong row and nothing more; the
 * breakdown says WHICH element is extra, which is the difference between a five-minute fix and an
 * afternoon. It is not printed on the happy path because the shape string is megabytes wide on a
 * twenty-thousand-node tree.
 */
function censusLine(arm: string, step: IStep): string {
  const counts = new Map<string, number>();
  for (const match of committedShape().matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)\(/g,
  )) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return (
    `DEBUG ${arm} ${step} CENSUS :: ` +
    [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => `${name}=${count}`)
      .join(' ')
  );
}

/**
 * What the platform was told to do for this step.
 *
 * It sits AFTER the stopwatch: this is the host's half of the commit, not the adapter's, and billing
 * it to the step would make the column incomparable with the arms that do not count.
 */
function mutationLine(arm: string, step: IStep): string {
  const commits = commitNumber() - lastCommitNumber;
  lastCommitNumber += commits;
  return (
    `DEBUG ${arm.padEnd(7)} ${step.padEnd(7)} MUTATIONS ` +
    `${mutationSummary(countMutations())} commits=${commits}`
  );
}

// The commit number is CUMULATIVE for the surface, so a step's own count is the delta — and the
// baseline has to be taken by the same call that prints, or the empty mount lands on `create`.
let lastCommitNumber = 0;

/**
 * Run the device suite through `driver` and print one `RESULT` line naming every step's wall clock.
 *
 * `RESULT` is a grep target on purpose: six processes print one each, and the table in `CLAUDE.md`
 * is assembled from them rather than re-typed.
 */
export async function runBenchSuite(driver: IBenchDriver): Promise<void> {
  const timings = new Map<IStep, number>();
  const allocations = new Map<IStep, IHeapReading>();
  let state: IBenchState = { rows: [], selectedId: undefined };

  // DRAINED, not read: the counters zero on read, so the empty mount's walk and apply have to come
  // off the books here or `create` reports the mount as well.
  driver.readTelemetry?.();
  // The same drain for the other instrument: the empty mount's own Create/Insert lines belong to
  // nobody's step, and `mountingLogs()` accumulates until it is read.
  if (driver.countsMutations === true) mutationLine(driver.name, 'create');

  const step = async (name: IStep, next: IBenchState): Promise<void> => {
    state = next;

    const isProfiling =
      __SYMBIOTE_PROFILE_DIR__ !== '' && startProfiling(PROFILE_HZ);
    const heapBefore = readHeap();
    const startedAt = performance.now();
    await driver.apply(state);
    const wall = performance.now() - startedAt;
    const heapAfter = readHeap();
    if (isProfiling)
      stopProfiling(`${__SYMBIOTE_PROFILE_DIR__}/${driver.name}-${name}.json`);
    timings.set(name, wall);
    if (heapBefore !== undefined && heapAfter !== undefined)
      allocations.set(name, {
        allocated: heapAfter.allocated - heapBefore.allocated,
        collections: heapAfter.collections - heapBefore.collections,
      });

    // READ ONCE: the counters zero on read, so asking twice gives the second caller zeroes.
    const telemetry = driver.readTelemetry?.();
    const nodes = committedTags().length;
    print(`${telemetryLine(driver, name, wall, telemetry)} nodes=${nodes}`);
    if (driver.countsMutations === true) print(mutationLine(driver.name, name));

    if (driver.virtualized === true) {
      // THE ROW CENSUS: how many rows the list actually mounted. Stock's reading is the reference.
      const rows = mountedRowCount();
      print(`VROWS ${driver.name} ${name}=${rows}`);
      const expected = VIRTUALIZED_ROWS[name];
      if (expected !== undefined) expect(rows).toBe(expected);
      else if (state.rows.length > 0) expect(rows).toBeGreaterThan(0);
      return;
    }

    // THE ORACLE, and it is read before any millisecond is quoted: a step that built no rows commits
    // nothing and reads as instant.
    const surplus = nodes - NODES_PER_ROW * state.rows.length;
    if (surplus !== driver.chrome) print(censusLine(driver.name, name));
    expect(surplus).toBe(driver.chrome);

    // THE SECOND ORACLE — what the step WROTE, which the census cannot see. See `PROPS_PER_STEP`.
    if (telemetry === undefined || driver.drivesEngine === false) return;
    if (driver.unappliedSteps?.includes(name) === true) {
      print(
        `DEBUG ${driver.name} ${name} NOT APPLIED — this arm is known not to perform this step ` +
          `(wrote ${telemetry.setProps}, the workload is ${PROPS_PER_STEP[name]}). Its wall clock ` +
          `is not comparable with the other columns'.`,
      );
      return;
    }
    expect(telemetry.setProps).toBe(PROPS_PER_STEP[name]);
  };

  await step('create', { rows: buildRows(ROW_BATCH), selectedId: undefined });
  await step('replace', { rows: buildRows(ROW_BATCH), selectedId: undefined });
  await step('partial', {
    ...state,
    rows: state.rows.map((row, index) =>
      index % UPDATE_STRIDE === 0
        ? { ...row, label: row.label + UPDATE_SUFFIX }
        : row,
    ),
  });
  await step('select', { ...state, selectedId: state.rows[SELECT_INDEX].id });
  await step('swap', {
    ...state,
    rows: (() => {
      const next = state.rows.slice();
      const low = next[SWAP_LOW_INDEX];
      next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
      next[SWAP_HIGH_INDEX] = low;
      return next;
    })(),
  });
  await step('remove', {
    ...state,
    rows: state.rows.filter(row => row.id !== state.rows[REMOVE_INDEX].id),
  });
  await step('append', {
    ...state,
    rows: state.rows.concat(buildRows(ROW_BATCH)),
  });
  await step('clear', { rows: [], selectedId: undefined });

  print(
    `RESULT ${driver.name} ` +
      STEP_ORDER.map(
        name => `${name}=${(timings.get(name) ?? 0).toFixed(1)}`,
      ).join(' '),
  );
  // KB allocated per step and the collections it triggered. Deterministic where the wall clock is
  // not, so two arms compare here to the kilobyte in one run.
  if (allocations.size > 0)
    print(
      `ALLOC ${driver.name} ` +
        STEP_ORDER.map(name => {
          const reading = allocations.get(name);
          return reading === undefined
            ? `${name}=?`
            : `${name}=${(reading.allocated / 1_024).toFixed(0)}KB/${reading.collections}gc`;
        }).join(' '),
    );
}

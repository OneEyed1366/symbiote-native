// The benchmark screen, headless: the device's eight steps, in its order, with its constants
// One state machine, one row shape and one oracle serve all six arms (`pnpm run bench:itest`)
// The oracle and the one-file-per-arm rule are explained in the `symbiote-perf-measurement` skill

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

// Set by the runner from `SYMBIOTE_PROFILE_DIR`, and a non-empty value samples every step to disk
// Sampling perturbs the clock, so never read a result from such a run
declare const __SYMBIOTE_PROFILE_DIR__: string;
const PROFILE_HZ = 10_000;

type IHeapReading = {
  readonly allocated: number;
  readonly collections: number;
};

// Cumulative JS allocation and collections, or undefined on JavaScriptCore (empty heap map)
// The delta across a step is exact without forcing a collection, so the wall clock stays untouched
function readHeap(): IHeapReading | undefined {
  const info = heapInfo();
  const allocated = info.hermes_totalAllocatedBytes;
  const collections = info.hermes_numCollections;
  if (allocated === undefined || collections === undefined) return undefined;
  return { allocated, collections };
}

export const ROOT_TAG = 1;

// The device screen's constants, verbatim
export const ROW_BATCH = 1_000;
const UPDATE_STRIDE = 10;
const UPDATE_SUFFIX = ' !!!';
const SELECT_INDEX = 1;
const REMOVE_INDEX = 3;
const SWAP_LOW_INDEX = 1;
const SWAP_HIGH_INDEX = 998;

// Ten nodes per row: three views, three texts with a string child each, one text input
export const NODES_PER_ROW = 10;

// The background keeps the row concrete, as a view with only layout props is flattened by Fabric
// It is an integer color because `processColor` does not run in this host, and a string was dropped
// on the stock arm alone (`stock-row-traits.itest.tsx`), while the device row sets no `nativeID`
export const ROW_STYLE = {
  height: 44,
  flexDirection: 'row',
  paddingLeft: 10,
  backgroundColor: 0xff13243a,
} as const;
export const CELL_STYLE = { flex: 1 } as const;
export const INPUT_STYLE = { width: 96, height: 28 } as const;

// The device row's selected look merges to exactly this, and `borderLeftWidth` is a layout property
// So a select here is the expensive spelling, which is the number worth reproducing
export const SELECTED_ROW_STYLE = {
  ...ROW_STYLE,
  backgroundColor: 0xff3a2c10,
  borderLeftWidth: 3,
  borderLeftColor: 0xfff5a623,
} as const;

// What one row commits, prop for prop, which the mutation counter cannot see
// Pinned for stock by `stock-row-traits.itest.tsx` and for ours by `row-payload-parity.itest.tsx`
// Lives here as one bundle cannot hold both arms, and a copy per side would agree with itself
export const ROW_PAYLOAD =
  'View{backgroundColor=rgba(19, 36, 58, 1),flexDirection=row,height=44,paddingLeft=10}(' +
  `${textPayload('1')}` +
  `View{flex=1}(${textPayload('row one')})` +
  `View{flex=1}(${textPayload('x')})` +
  'TextInput{accessible=true,height=28,width=96}())';

// One text of the row, whose only variable is the string inside it
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

// The engine counters printed beside every step, named structurally
// This module must not import `@symbiote-native/engine`, as under the stock arm's platform
// extensions directive that import reaches a native module and kills the bundle
export type IBenchTelemetry = {
  readonly walkMs: number;
  readonly applyMs: number;
  readonly commitMs: number;
  readonly layoutMs: number;
  // RN's own commit telemetry: Yoga nodes re-laid out and text measurements taken in the step
  // They tell Yoga doing the least it can apart from us handing Fabric more than changed
  readonly layoutNodes: number;
  readonly textMeasures: number;
  readonly nodesCreated: number;
  readonly nodesCloned: number;
  readonly nodesReused: number;
  readonly setProps: number;
  readonly writesOfUnchanged: number;
  readonly foldsFound: number;
  // The split of `applyOps`, read on create-shaped steps (see `applySplitLine`)
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

// Zero everywhere, for an arm with no engine telemetry and for the engine halves of the stock arm
const EMPTY_TELEMETRY: IBenchTelemetry = {
  walkMs: 0,
  applyMs: 0,
  commitMs: 0,
  layoutMs: 0,
  layoutNodes: 0,
  textMeasures: 0,
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
};

// Fabric's own commit telemetry for the surface, with every engine counter zero, for the stock arm
// It makes `laidOut` comparable, as stock shows the platform cost with our engine off the path
// Read off the native bindings, as this module and the stock arm both refuse the engine import
export function readFabricTelemetry(): IBenchTelemetry | undefined {
  const read = __symbioteEngineNative?.readSurfaceTelemetry;
  if (read === undefined) return undefined;
  const raw = read(ROOT_TAG);
  const at = (key: string): number => raw[key] ?? 0;
  return {
    ...EMPTY_TELEMETRY,
    commitMs: at('commitMs'),
    layoutMs: at('layoutMs'),
    layoutNodes: at('layoutNodes'),
    textMeasures: at('textMeasures'),
  };
}

export type IBenchDriver = {
  // The column name in the results table
  readonly name: string;
  // The engine's per-step counters, zeroed on read, absent for an arm that reads nothing
  readonly readTelemetry?: () => IBenchTelemetry | undefined;
  // False for an arm whose telemetry has Fabric's half and none of the engine's, as stock does
  // It is said, not inferred from a zero, as `setProps=0` is also what a step that failed reports
  readonly drivesEngine?: boolean;
  // Committed nodes the arm holds that are not rows: root, the `createSurface` container, the
  // screen's wrapper, and for Svelte its mount-target root view
  // Declared, not derived, so a step that stops building rows fails instead of recalibrating
  readonly chrome: number;
  // Applies the state and settles it by flushing the framework's scheduler, then commits
  // The await is inside the stopwatch, as on a device that scheduler turn is part of the step cost
  apply(state: IBenchState): void | Promise<void>;
  // Steps this arm is known not to apply, each a defect with a reproduction behind it
  // An exemption keeps the write oracle protecting the other arms, and an entry with no named
  // reproduction is a bug being hidden
  readonly unappliedSteps?: readonly IStep[];
  // Also prints what the differ told the platform to do, per step and by mutation kind
  // Opt-in, as it costs a full `mounted()` per step and only stock against ours needs it
  // It covers the half of a commit that a device pays in `UIView`s and a stub pays in a swap
  readonly countsMutations?: boolean;
  // The rows sit in a `FlatList` (the screen's virtualized mode), so a step mounts only the window
  // The node census and write oracle become a row census of one `TextInput` per mounted row
  // Stock's count is the reference an adapter must match (`VIRTUALIZED_ROWS`)
  readonly virtualized?: boolean;
};

// The device screen's list viewport (`benchRowsViewport` in `examples/bare-rn`)
export const VIEWPORT_HEIGHT = 420;
export const ROW_HEIGHT = ROW_STYLE.height;
export const VIEWPORT_WIDTH = 390;

// Rows React Native's own `FlatList` holds once its window has filled, which is the stock arm
// `announceListLayout` delivers the layout events, and a different count is a different window
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

// Delivers the layout events a device's next frame would, for the list and its content container
// RN's list grows past `initialNumToRender` only after both, and ours grows regardless
// Sending both after every commit lets each arm fill its window, so one workload is compared
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

// The item layout of fixed-height rows, in the shape `getItemLayout` expects
export function rowItemLayout(
  _data: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  return { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index };
}

let nextId = 1;

// Fresh rows with fresh ids, as the screen's `buildRows` does
// The ids make Replace differ from Create, as a keyed list handed unseen keys rebuilds every row
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

// How many props each step writes, the second oracle beside the node census
// A census cannot see work that changes no node: Angular's unsettled `select` committed the right
// tree with `setProps=0` and read as the fastest column. Arms without engine telemetry are exempt
const PROPS_PER_STEP: Readonly<Record<IStep, number>> = {
  // Nine per row: row style, three `ellipsizeMode`s, two cell styles, input style and text, label
  // It was ten while every arm wrote an id prop, and dropping it (see `ROW_STYLE`) turned this red
  create: ROW_BATCH * 9,
  replace: ROW_BATCH * 9,
  partial: ROW_BATCH / UPDATE_STRIDE,
  select: 1,
  swap: 0,
  remove: 0,
  append: ROW_BATCH * 9,
  clear: 0,
};

// The split of `applyOps` on the two steps that build ten thousand nodes
// A phase that doubles across adapters on one buffer is the buffer's cost to explain
// `applyCalls` tells more values from the same values in more batches, as tables intern per batch
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
  const read = telemetry ?? EMPTY_TELEMETRY;
  const ms = (value: number): string => value.toFixed(1);
  return (
    `DEBUG ${arm.padEnd(7)} ${step.padEnd(7)} wall=${wall.toFixed(1).padStart(6)} ` +
    `walk=${ms(read.walkMs)} apply=${ms(read.applyMs)} ` +
    `fabric=${ms(read.commitMs)} layout=${ms(read.layoutMs)} ` +
    // What Fabric re-measured beside how long it took, as a time with no node count says nothing
    `laidOut=${read.layoutNodes} texts=${read.textMeasures} ` +
    `created=${read.nodesCreated} cloned=${read.nodesCloned} ` +
    `reused=${read.nodesReused} setProps=${read.setProps} ` +
    `unchanged=${read.writesOfUnchanged} folds=${read.foldsFound} ` +
    // Crossings per step: a read is a batch boundary, and an empty `applyOps` costs 4.5-4.8 us of
    // fixed prologue (`small-batch-crossing-cost.itest.ts`), paid on every mutation that navigates
    // Solid's Clear read 1 001 here against 2 for React and Svelte, all of its `apply` gap
    `batches=${read.applyCalls}`
  );
}

// What the committed tree holds by view name, printed only when the oracle is about to fail
// It names the extra element, and stays off the happy path as the shape string is megabytes wide
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

// What the platform was told to do for this step, read after the stopwatch
// It is the host's half of the commit, so billing it to the step would make the column incomparable
function mutationLine(arm: string, step: IStep): string {
  const commits = commitNumber() - lastCommitNumber;
  lastCommitNumber += commits;
  return (
    `DEBUG ${arm.padEnd(7)} ${step.padEnd(7)} MUTATIONS ` +
    `${mutationSummary(countMutations())} commits=${commits}`
  );
}

// The commit number is cumulative for the surface, so a step's count is the delta
// The baseline is taken by the same call that prints, or the empty mount lands on `create`
let lastCommitNumber = 0;

// Runs the device suite through `driver` and prints one `RESULT` line with every step's wall clock
// `RESULT` is a grep target, as six processes print one each and the table is assembled from them
export async function runBenchSuite(driver: IBenchDriver): Promise<void> {
  // Drained, not read: counters zero on read, so the empty mount's cost comes off the books
  driver.readTelemetry?.();
  // The same drain for mutation logs, as the empty mount's Create/Insert lines belong to no step
  if (driver.countsMutations === true) mutationLine(driver.name, 'create');

  const timings = new Map<IStep, number>();
  const allocations = new Map<IStep, IHeapReading>();
  let state: IBenchState = { rows: [], selectedId: undefined };

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

    // Read once, as the counters zero on read and a second caller would get zeroes
    const telemetry = driver.readTelemetry?.();
    const nodes = committedTags().length;
    print(`${telemetryLine(driver, name, wall, telemetry)} nodes=${nodes}`);
    if (driver.countsMutations === true) print(mutationLine(driver.name, name));

    if (driver.virtualized === true) {
      // The row census: how many rows the list mounted, with stock's reading as the reference
      const rows = mountedRowCount();
      print(`VROWS ${driver.name} ${name}=${rows}`);
      const expected = VIRTUALIZED_ROWS[name];
      if (expected !== undefined) expect(rows).toBe(expected);
      else if (state.rows.length > 0) expect(rows).toBeGreaterThan(0);
      return;
    }

    // The oracle runs before any millisecond is quoted, as a step that built no rows reads instant
    const surplus = nodes - NODES_PER_ROW * state.rows.length;
    if (surplus !== driver.chrome) print(censusLine(driver.name, name));
    expect(surplus).toBe(driver.chrome);

    // The second oracle checks what the step wrote, which the census cannot see (`PROPS_PER_STEP`)
    if (telemetry === undefined || driver.drivesEngine === false) return;
    if (driver.unappliedSteps?.includes(name) === true) {
      print(
        `DEBUG ${driver.name} ${name} NOT APPLIED - this arm is known not to perform this step ` +
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
  // KB allocated per step and the collections it triggered, exact where the wall clock is noisy
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

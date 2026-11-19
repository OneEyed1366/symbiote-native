// js-framework-benchmark, one primitive at a time

// `bench-suite.ts` prices one row shape (view/text/text-input), not the other sixteen tags
// This suite runs the same steps over a flat list of one primitive, for every app-facing intrinsic

// A regression or a framework tax on one tag shows up under its name instead of averaged into a row
// Such as a behavior's attach cost, a directive still matching on it, or a wrapper node it commits

// The specs are the workload and the arms only render them, so two arms build the same tree
// The census is the first oracle: `nodesPerItem` is pinned per tag and asserted on every step

// Steps per tag: create N, update every 10th (a new style object), swap two, remove one, clear

import {
  committedShape,
  committedTags,
  expect,
  heapInfo,
  print,
  startProfiling,
  stopProfiling,
} from './harness';

// Set by the runner from `SYMBIOTE_PROFILE_DIR`: non-empty samples each tag's CREATE into
// `<dir>/<arm>-<tag>-create.json`. Never read a PRIM line from such a run.
declare const __SYMBIOTE_PROFILE_DIR__: string;
declare const __DEV__: boolean;
const PROFILE_HZ = 10_000;

export const PRIMITIVE_COUNT = 1_000;
const UPDATE_STRIDE = 10;
const SWAP_LOW = 1;
const REMOVE_AT = 1;

export const ITEM_STYLE = { width: 40, height: 20 } as const;
export const UPDATED_STYLE = { width: 40, height: 20, opacity: 0.5 } as const;
export const CHILD_STYLE = { width: 10, height: 10 } as const;

/** What an arm renders inside the tag. `label` is the item's text; `view` a styled child view. */
export type IPrimitiveChild = 'none' | 'label' | 'view';

export type IPrimitiveSpec = {
  readonly tag: string;
  /** Bound on every item; `style` is added by the suite and is what `update` rewrites. */
  readonly props: Readonly<Record<string, unknown>>;
  readonly child: IPrimitiveChild;
  /** A tag the item must sit inside (`refresh-control` is only meaningful under a scroll view). */
  readonly parent?: string;
  /** Committed nodes per item, pinned. Undefined prints the census and fails. */
  readonly nodesPerItem: number | undefined;
  /** Items per step when a thousand is not a real workload (a hidden modal each). */
  readonly count?: number;
};

const SOURCE = { uri: 'https://example.invalid/a.png', width: 20, height: 20 };

// `nodesPerItem` is what RN's own components commit for the same props
// Text is Paragraph+RawText, ImageBackground a View around an Image, a ScrollView its content View

// A touchable with a child is its View plus the child, the anchor-backed two commit only the child
// Button is TouchableOpacity>View>Text and ActivityIndicator a View around the spinner
export const PRIMITIVE_SPECS: readonly IPrimitiveSpec[] = [
  { tag: 'view', props: {}, child: 'none', nodesPerItem: 1 },
  { tag: 'text', props: { numberOfLines: 1 }, child: 'label', nodesPerItem: 2 },
  { tag: 'image', props: { source: SOURCE }, child: 'none', nodesPerItem: 1 },
  {
    tag: 'image-background',
    props: { source: SOURCE },
    child: 'none',
    nodesPerItem: 2,
  },
  { tag: 'pressable', props: {}, child: 'none', nodesPerItem: 1 },
  {
    tag: 'touchable-opacity',
    props: { activeOpacity: 0.5 },
    child: 'view',
    nodesPerItem: 2,
  },
  {
    tag: 'touchable-highlight',
    props: { underlayColor: 'red' },
    child: 'view',
    nodesPerItem: 2,
  },
  {
    tag: 'touchable-native-feedback',
    props: {},
    child: 'view',
    nodesPerItem: 1,
  },
  {
    tag: 'touchable-without-feedback',
    props: {},
    child: 'view',
    nodesPerItem: 1,
  },
  { tag: 'button', props: { title: 'Go' }, child: 'none', nodesPerItem: 4 },
  {
    tag: 'text-input',
    props: { value: 'abc' },
    child: 'none',
    nodesPerItem: 1,
  },
  {
    tag: 'text-input-multiline',
    props: { value: 'abc' },
    child: 'none',
    nodesPerItem: 1,
  },
  { tag: 'switch', props: { value: true }, child: 'none', nodesPerItem: 1 },
  {
    tag: 'activity-indicator',
    props: { animating: true },
    child: 'none',
    nodesPerItem: 2,
  },
  { tag: 'scroll-view', props: {}, child: 'none', nodesPerItem: 2 },
  { tag: 'horizontal-scroll-view', props: {}, child: 'none', nodesPerItem: 2 },
  { tag: 'safe-area-view', props: {}, child: 'none', nodesPerItem: 1 },
  // [characterization — behavior not confirmed] QUESTION: RN's Modal.js returns null while not
  // visible (`Modal.js:280-288`), so stock commits ZERO nodes here; we commit a ModalHostView each.
  {
    tag: 'modal',
    props: { visible: false },
    child: 'none',
    nodesPerItem: 1,
    count: 100,
  },
  {
    tag: 'refresh-control',
    props: { refreshing: false },
    child: 'none',
    parent: 'scroll-view',
    nodesPerItem: 3,
  },
];

export type IPrimitiveItem = {
  readonly id: number;
  readonly label: string;
  readonly props: Readonly<Record<string, unknown>>;
};

export type IPrimitiveState = { readonly items: readonly IPrimitiveItem[] };

export type IPrimitiveDriver = {
  readonly name: string;
  /** Committed nodes that are not items: root, surface container, the screen's own wrapper. */
  readonly chrome: number;
  // Ceiling on each tag's `createKB`, per TAG and per ARM т.к. an adapter allocates its own way.
  // A tag missing from here fails the file the way an unpinned census does
  readonly createBudgetKB: ReadonlyMap<string, number>;
  /** Render `spec` with `state` and settle it (framework flush + commit). */
  apply(spec: IPrimitiveSpec, state: IPrimitiveState): void | Promise<void>;
};

const STEPS = ['create', 'update', 'swap', 'remove', 'clear'] as const;
type IStep = (typeof STEPS)[number];

let nextId = 1;

function buildItems(spec: IPrimitiveSpec, count: number): IPrimitiveItem[] {
  const items: IPrimitiveItem[] = [];
  for (let at = 0; at < count; at += 1) {
    const id = nextId;
    nextId += 1;
    items.push({
      id,
      label: `item ${id}`,
      props: { ...spec.props, style: ITEM_STYLE },
    });
  }
  return items;
}

function allocatedBytes(): number | undefined {
  return heapInfo().hermes_totalAllocatedBytes;
}

function censusOf(): string {
  const counts = new Map<string, number>();
  for (const match of committedShape().matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(/g))
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}=${count}`)
    .join(' ');
}

// What one spec's run carries between its steps: the driver, the spec and what the steps measured
type IPrimitiveRun = {
  readonly driver: IPrimitiveDriver;
  readonly spec: IPrimitiveSpec;
  state: IPrimitiveState;
  readonly timings: Map<IStep, number>;
  createBytes: number | undefined;
};

// Pinned nodes per item times the items on screen, or a printed census when they disagree
function checkCensus(run: IPrimitiveRun, name: IStep): void {
  const { driver, spec, state } = run;
  const nodes = committedTags().length - driver.chrome;
  if (spec.nodesPerItem === undefined) {
    if (name === 'create')
      print(
        `DEBUG ${driver.name} ${spec.tag} UNPINNED nodes=${nodes} per item=` +
          `${(nodes / Math.max(1, state.items.length)).toFixed(2)} :: ${censusOf()}`,
      );
    return;
  }
  if (nodes !== spec.nodesPerItem * state.items.length)
    print(`DEBUG ${driver.name} ${spec.tag} ${name} CENSUS :: ${censusOf()}`);
  expect(nodes).toBe(spec.nodesPerItem * state.items.length);
}

async function timedStep(
  run: IPrimitiveRun,
  name: IStep,
  next: IPrimitiveState,
): Promise<void> {
  const { driver, spec } = run;
  run.state = next;
  const isProfiling =
    name === 'create' &&
    __SYMBIOTE_PROFILE_DIR__ !== '' &&
    startProfiling(PROFILE_HZ);
  const bytesBefore = allocatedBytes();
  const startedAt = performance.now();
  await driver.apply(spec, run.state);
  run.timings.set(name, performance.now() - startedAt);
  const bytesAfter = allocatedBytes();
  if (isProfiling)
    stopProfiling(
      `${__SYMBIOTE_PROFILE_DIR__}/${driver.name}-${spec.tag}-create.json`,
    );
  if (
    name === 'create' &&
    bytesBefore !== undefined &&
    bytesAfter !== undefined
  )
    run.createBytes = bytesAfter - bytesBefore;
  checkCensus(run, name);
}

function withUpdatedStyles(items: readonly IPrimitiveItem[]): IPrimitiveItem[] {
  return items.map((item, index) =>
    index % UPDATE_STRIDE === 0
      ? { ...item, props: { ...item.props, style: UPDATED_STYLE } }
      : item,
  );
}

function withSwappedPair(items: readonly IPrimitiveItem[]): IPrimitiveItem[] {
  const next = items.slice();
  const high = next.length - 1 - SWAP_LOW;
  const low = next[SWAP_LOW];
  next[SWAP_LOW] = next[high];
  next[high] = low;
  return next;
}

// Kept apart from the spec loop so each concern reads alone: the steps, the line, the gates
async function runSteps(run: IPrimitiveRun): Promise<void> {
  const count = run.spec.count ?? PRIMITIVE_COUNT;
  await timedStep(run, 'create', { items: buildItems(run.spec, count) });
  await timedStep(run, 'update', { items: withUpdatedStyles(run.state.items) });
  await timedStep(run, 'swap', { items: withSwappedPair(run.state.items) });
  await timedStep(run, 'remove', {
    items: run.state.items.filter((_, index) => index !== REMOVE_AT),
  });
  await timedStep(run, 'clear', { items: [] });
}

function printRun(run: IPrimitiveRun): void {
  const { driver, spec, timings, createBytes } = run;
  print(
    `PRIM ${driver.name} ${spec.tag.padEnd(26)} ` +
      STEPS.map(name => `${name}=${(timings.get(name) ?? 0).toFixed(1)}`).join(
        ' ',
      ) +
      (createBytes === undefined
        ? ''
        : ` createKB=${(createBytes / 1_024).toFixed(0)}`),
  );
}

// Runs the five steps for every spec and prints one line per tag. The grep target is
// `PRIM <arm> <tag> create=.. update=.. swap=.. remove=.. clear=.. createKB=..`, where each wall
// clock is a SINGLE run, so a reader takes the minimum across runs
export async function runPrimitiveSuite(
  driver: IPrimitiveDriver,
  specs: readonly IPrimitiveSpec[] = PRIMITIVE_SPECS,
): Promise<void> {
  const unpinned: string[] = [];
  const unbudgeted: string[] = [];
  for (const spec of specs) {
    const run: IPrimitiveRun = {
      driver,
      spec,
      state: { items: [] },
      timings: new Map(),
      createBytes: undefined,
    };
    await driver.apply(spec, run.state);
    await runSteps(run);
    printRun(run);
    if (spec.nodesPerItem === undefined) unpinned.push(spec.tag);
    if (!gateCreateBytes(driver, spec.tag, run.createBytes))
      unbudgeted.push(spec.tag);
  }
  // Pinning is a gate, not a note: an unpinned tag fails the file after printing its census.
  expect(unpinned).toEqual([]);
  expect(unbudgeted).toEqual([]);
}

// The anomaly this file exists to catch used to live in a PRINTED number a reader had to notice.
// Release only, т.к. the assert build allocates a different shape and its budget is another table
function gateCreateBytes(
  driver: IPrimitiveDriver,
  tag: string,
  createBytes: number | undefined,
): boolean {
  const budget = driver.createBudgetKB.get(tag);
  if (budget === undefined) return false;
  if (createBytes === undefined) return true;
  if (__DEV__) {
    print(
      `DEBUG ${driver.name} ${tag} assert build: the budget is release-only`,
    );
    return true;
  }
  expect(createBytes / 1_024).toBeLessThan(budget);
  return true;
}

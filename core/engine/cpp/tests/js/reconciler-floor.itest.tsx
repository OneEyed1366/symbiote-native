// How much of the React adapter's create is REACT, and how much is ours?
//
// why: `adapter-create-cost.itest.tsx` puts our React adapter 38 ms over the engine's own mutation
// API on one identical ten-node row, and calls that the "reconciler delta". Nothing has ever checked
// that the reconciler is where it goes. The two candidates are opposite in what they imply: if
// React's own fiber work is ~38 ms then our seam adds nothing and the deficit against stock is
// React's to pay; if it is ~10 ms then the rest is OUR per-node JS being dearer under a reconciler
// than under a direct loop, and that is ours to fix.
//
// Angular has had exactly this measurement since its renderer-split arm (`host-does-nothing`,
// 24.8 ms); React has not, because its host config is a closed object literal with no prototype to
// patch. So this file builds a SECOND reconciler whose host methods are empty — same flags, same
// container plumbing, same element tree — and times React driving nothing.
//
// THE ORACLE IS A CALL COUNT, and it has to be, because an arm that builds no tree commits nothing
// for a census to read. The null arm asserts it was asked for exactly the instances the real tree
// holds: 7 001 elements and 3 000 text instances, which is the same 10 001 app nodes the committed
// census reports around its two chrome nodes. An arm that quietly rendered less would otherwise
// read as fast rather than as broken — the mistake this directory has already paid for twice.
//
// RUN ON `build-release` (`pnpm run bench:itest`). A development React cannot be compared with a
// production one, and the arms here are all production.

import { createElement as h, type ReactNode } from 'react';
import createReconciler from 'react-reconciler';

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  isSymbioteNode,
  readSurfaceTelemetry,
  removeChild,
  routeProp,
  treeHost,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';
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

/** What the app tree holds, by React's own two kinds. Asserted, never derived from a run. */
const ELEMENTS = 7_001;
const TEXT_INSTANCES = 3_000;
/** The committed census: the app tree plus Fabric's root and the surface's AppContainer. */
const COMMITTED_NODES = 10_003;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

/** The ten-node row `adapter-create-cost.itest.tsx` builds, verbatim — a different row is a different workload. */
function reactRow(id: number): ReactNode {
  const label = (text: string): ReactNode =>
    h('text', { ellipsizeMode: 'tail', allowFontScaling: true }, text);

  return h(
    'view',
    { key: id, style: ROW_STYLE, testID: `row-${id}` },
    label(String(id)),
    h('view', { style: CELL_STYLE }, label(`row ${id}`)),
    h('view', { style: CELL_STYLE }, label('x')),
    h('text-input', { style: INPUT_STYLE, text: `input ${id}` }),
  );
}

/**
 * The same row through the engine's own mutation API — the floor both React arms are read against.
 *
 * `tagged` decides whether the text input is created under its intrinsic TAG or only under its
 * Fabric view name. Both build the identical tree; only the tagged one reaches a host behavior.
 */
function engineRow(id: number, tagged: boolean): ISymbioteNode {
  const text = (value: string): ISymbioteNode => {
    const node = createElement('RCTText');
    routeProp(node, 'ellipsizeMode', 'tail');
    routeProp(node, 'allowFontScaling', true);
    appendChild(node, createRawText(value));
    return node;
  };
  const cell = (value: string): ISymbioteNode => {
    const node = createElement('RCTView');
    routeProp(node, 'style', CELL_STYLE);
    appendChild(node, text(value));
    return node;
  };

  const row = createElement('RCTView');
  routeProp(row, 'style', ROW_STYLE);
  routeProp(row, 'testID', `row-${id}`);
  appendChild(row, text(String(id)));
  appendChild(row, cell(`row ${id}`));
  appendChild(row, cell('x'));
  // THE TAG, and without it this arm is a different workload. `text-input` is the one tag in this
  // row a host behavior is registered for, and its `attach` seeds `mostRecentEventCount` — so an
  // engine arm that names only the Fabric view writes 12 003 props against React's 13 003 and
  // interns a thousand fewer values. Measured here before any millisecond was read; the same
  // asymmetry sits in `adapter-create-cost.itest.tsx`'s `engineRow` and is carried by the 38 ms
  // delta that file publishes.
  const input = createElement(
    'RCTSinglelineTextInputView',
    false,
    tagged ? 'text-input' : undefined,
  );
  routeProp(input, 'style', INPUT_STYLE);
  routeProp(input, 'text', `input ${id}`);
  appendChild(row, input);
  return row;
}

// ── THE NULL HOST ────────────────────────────────────────────────────────────────────────────────
//
// Every method empty; instances are bare `{}`. The FLAGS are copied from
// `adapters/react/src/host-config.ts` and must stay copied — `supportsMutation`, `shouldSetTextContent`
// and `finalizeInitialChildren` each steer React down a different path, so an arm that guessed them
// would be measuring a reconciler doing different work rather than the same work over nothing.
//
// `getChildHostContext` returns the parent's context unchanged, where ours resolves a descriptor to
// decide `isInsideText`. That difference is the point: this arm charges React and nothing else.

let elementsAsked = 0;
let textInstancesAsked = 0;

const NO_PRIORITY = 0;
let nullPriority = NO_PRIORITY;

const nullReconciler = createReconciler({
  isPrimaryRenderer: false,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  noTimeout: -1,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,

  getRootHostContext: () => ({}),
  getChildHostContext: (parentHostContext: object) => parentHostContext,
  getPublicInstance: (instance: object) => instance,

  prepareForCommit: () => null,
  resetAfterCommit: () => {},
  preparePortalMount: () => {},
  clearContainer: () => {},

  shouldSetTextContent: () => false,

  createInstance: (): object => {
    elementsAsked += 1;
    return {};
  },
  createTextInstance: (): object => {
    textInstancesAsked += 1;
    return {};
  },

  appendInitialChild: () => {},
  appendChild: () => {},
  appendChildToContainer: () => {},
  insertBefore: () => {},
  insertInContainerBefore: () => {},
  removeChild: () => {},
  removeChildFromContainer: () => {},

  finalizeInitialChildren: () => false,
  commitUpdate: () => {},
  commitTextUpdate: () => {},

  resetTextContent: () => {},
  hideTextInstance: () => {},
  unhideTextInstance: () => {},
  hideInstance: () => {},
  unhideInstance: () => {},

  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  detachDeletedInstance: () => {},
  getInstanceFromNode: () => null,
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,

  setCurrentUpdatePriority: (priority: number) => {
    nullPriority = priority;
  },
  getCurrentUpdatePriority: () => nullPriority,
  // 32 is `DefaultEventPriority` in react-reconciler 0.33 — spelled out rather than imported
  // because `adapters/react/src/reconciler-constants` is not a package subpath.
  resolveUpdatePriority: () =>
    nullPriority !== NO_PRIORITY ? nullPriority : 32,

  maySuspendCommit: () => false,
  NotPendingTransition: null,
  HostTransitionContext: { _currentValue: null, _currentValue2: null },
  resetFormInstance: () => {},
  requestPostPaintCallback: () => {},
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
});

type IArm = {
  wall: number;
  nodes: number;
  setProps: number;
  buildMs: number;
  commitMs: number;
  clearMs: number;
};

type ITelemetry = ReturnType<typeof readSurfaceTelemetry>;

/**
 * One line per arm, counters BEFORE the clock.
 *
 * `setProps` and `created` are the comparability check this directory insists on: two arms that
 * disagree on how many props they write are not two timings of one workload, and reading their
 * milliseconds against each other is the mistake already paid for twice here.
 */
function engineLine(
  label: string,
  wall: number,
  nodes: number,
  telemetry: ITelemetry,
): string {
  const at = (value: number | undefined): string => (value ?? 0).toFixed(1);
  return (
    `DEBUG ${label.padEnd(10)} wall=${wall.toFixed(1).padStart(6)} ` +
    `walk=${at(telemetry?.walkMs)} apply=${at(telemetry?.applyMs)} ` +
    `nodes=${nodes} created=${telemetry?.nodesCreated ?? 0} ` +
    `setProps=${telemetry?.setProps ?? 0} values=${telemetry?.valueEntries ?? 0} ` +
    `unchanged=${telemetry?.writesOfUnchanged ?? 0}`
  );
}

/**
 * The node's children as the HOST holds them, read OUTSIDE any clock.
 *
 * A caller that navigated inside the timed region would be measuring navigation, which is a
 * different question and one `small-batch-crossing-cost.itest.ts` already answers.
 */
function childHandles(node: ISymbioteNode): readonly ISymbioteNode[] {
  const host = treeHost();
  if (host === undefined) throw new Error('no host installed');
  const out: ISymbioteNode[] = [];
  for (const handle of host.childrenOf(node)) {
    // A runtime narrowing, not a cast: the host stores handles as bare objects and these are ours.
    if (isSymbioteNode(handle)) out.push(handle);
  }
  return out;
}

/** Build the whole list through the engine's own API and time it, counters printed first. */
function timeEngineArm(
  label: string,
  tagged: boolean,
  // OPT-IN, because tearing the tree down leaves state behind — a teardown nomination the next
  // commit sweeps, and a behavior released. The first spelling cleared on every arm and the
  // behavior case's own oracle went from 1 000 to 997, which is the arms reading each other rather
  // than a finding.
  clearAfter = false,
): IArm {
  const surface = createSurface(ROOT_TAG);
  const startedAt = performance.now();
  const list = createElement('RCTView');
  routeProp(list, 'style', { flex: 1 });
  for (let id = 0; id < ROWS; id += 1) appendChild(list, engineRow(id, tagged));
  surface.appendChild(list);
  flushOps();
  // SPLIT HERE, and the split is what separates the two halves of a host behavior: `attach` runs
  // above this line, at `createElement`; `runDeferredAttaches` and `runCommittedHooks` run below it,
  // inside the commit, and each asks the HOST whether a node landed.
  const built = performance.now();
  surface.commit();
  const wall = performance.now() - startedAt;
  mounted();

  const telemetry = readSurfaceTelemetry(ROOT_TAG);
  const nodes = committedTags().length;
  const buildMs = built - startedAt;

  // AND THE TEARDOWN, on the same standing tree. `clear` is the one row of the benchmark suite where
  // all five adapters lose to stock, and the engine's own halves are 2-3 ms of a 21-33 ms step — so
  // the rest is JS, and the first thing to rule in or out is what a behavior costs to release.
  //
  // ROW BY ROW, not `surface.clear()`, and the difference is the measurement. Emptying the surface
  // removes ONE child and takes the whole subtree with it — one op for ten thousand nodes, which no
  // framework ever emits. A keyed list being emptied issues a removal PER ROW, so that is the shape
  // an adapter's `clear` has to be read against.
  let clearMs = 0;
  if (clearAfter) {
    const rows = childHandles(list);
    const clearStartedAt = performance.now();
    for (const row of rows) removeChild(list, row);
    flushOps();
    surface.commit();
    clearMs = performance.now() - clearStartedAt;
    mounted();
  }

  print(
    `${engineLine(label, wall, nodes, telemetry)} ` +
      `build=${buildMs.toFixed(1)} commit=${(wall - buildMs).toFixed(1)} ` +
      `clear=${clearMs.toFixed(1)}`,
  );
  return {
    wall,
    nodes,
    setProps: telemetry?.setProps ?? 0,
    buildMs,
    commitMs: wall - buildMs,
    clearMs,
  };
}

let engineArm: IArm | undefined;
let nullArm: number | undefined;
let nullClearMs: number | undefined;

describe('how much of a react create is react', () => {
  // why: the floor. Same tree, same props, no reconciler — what the engine costs when the caller
  // already knows what to build.
  it('builds 1 000 rows straight through the engine', () => {
    engineArm = timeEngineArm('engine', true, true);
    expect(engineArm.nodes).toBe(COMMITTED_NODES);
  });

  // why: React asked to build the identical element tree against a host that does nothing. What is
  // left is fibers, elements, the work loop and the commit walk — React's own half, with no engine
  // under it at all.
  it('renders the same tree through a reconciler whose host does nothing', () => {
    const rows = [];
    for (let id = 0; id < ROWS; id += 1) rows.push(reactRow(id));

    elementsAsked = 0;
    textInstancesAsked = 0;

    const startedAt = performance.now();
    const container = nullReconciler.createContainer(
      {},
      0,
      null,
      false,
      null,
      'null',
      () => {},
      () => {},
      () => {},
      () => {},
      null,
    );
    // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
    nullReconciler.updateContainerSync(
      h('view', { style: { flex: 1 } }, ...rows),
      container,
      null,
      () => {},
    );
    // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
    nullReconciler.flushSyncWork();
    const wall = performance.now() - startedAt;
    nullArm = wall;

    print(
      `DEBUG react/null wall=${wall.toFixed(1)} elements=${elementsAsked} ` +
        `textInstances=${textInstancesAsked}`,
    );

    // THE ORACLE, before any millisecond is read: an arm that rendered less would read as fast.
    expect(elementsAsked).toBe(ELEMENTS);
    expect(textInstancesAsked).toBe(TEXT_INSTANCES);

    // AND THE UNMOUNT, on the same container. `clear` is the one suite row where all five adapters
    // lose to stock, and both sides run this same reconciler over this same tree — so what React
    // spends tearing it down is the part neither of us can remove, and everything above it is ours.
    const clearStartedAt = performance.now();
    // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
    nullReconciler.updateContainerSync(null, container, null, () => {});
    // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
    nullReconciler.flushSyncWork();
    nullClearMs = performance.now() - clearStartedAt;
    print(`DEBUG react/null clear=${nullClearMs.toFixed(1)} ms`);
  });

  // why: the real adapter, the number `adapter-create-cost` publishes. Read against the two above it
  // says which side of the seam the 38 ms is on.
  it('splits the react delta between react and our seam', () => {
    const rows = [];
    for (let id = 0; id < ROWS; id += 1) rows.push(reactRow(id));

    const startedAt = performance.now();
    const surface = mount(ROOT_TAG, h('view', { style: { flex: 1 } }, ...rows));
    flushTimers();
    surface.commit();
    const wall = performance.now() - startedAt;
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    const nodes = committedTags().length;
    print(engineLine('react', wall, nodes, telemetry));
    expect(nodes).toBe(COMMITTED_NODES);

    if (engineArm === undefined || nullArm === undefined) {
      throw new Error('an arm above did not run');
    }
    // THE COMPARABILITY GATE. Two arms that write a different number of props are two workloads,
    // and their milliseconds cannot be read against each other — this file found exactly that on its
    // first run (12 003 against 13 003) and the engine arm gained its `text-input` tag because of it.
    expect(telemetry?.setProps ?? 0).toBe(engineArm.setProps);
    const delta = wall - engineArm.wall;
    print(
      `DEBUG SPLIT      react-over-engine=${delta.toFixed(1)} ms · ` +
        `react's own (null host)=${nullArm.toFixed(1)} ms · ` +
        `unattributed=${(delta - nullArm).toFixed(1)} ms`,
    );

    // THE SAME SPLIT FOR THE TEARDOWN. The benchmark's `clear` step re-renders the screen with an
    // empty list, which is what this is — not an unmount, so the comparison stays the suite's.
    const clearStartedAt = performance.now();
    const cleared = mount(ROOT_TAG, h('view', { style: { flex: 1 } }));
    flushTimers();
    cleared.commit();
    const clearMs = performance.now() - clearStartedAt;
    mounted();

    // DRAINED, and the case below is why: the counters ZERO ON READ, so a commit nobody reads is
    // charged to whoever reads next. This clear creates the replacement container and writes its
    // three props, and the behavior case's first `bare` arm was reporting 12 006 against a true
    // 12 003 — an arm reading another case's commit, which its own oracle then called a finding.
    readSurfaceTelemetry(ROOT_TAG);

    expect(committedTags().length).toBe(3);
    print(
      `DEBUG CLEAR      react=${clearMs.toFixed(1)} ms · ` +
        `react's own (null host)=${(nullClearMs ?? 0).toFixed(1)} ms · ` +
        `engine floor=${engineArm.clearMs.toFixed(1)} ms · ` +
        `unattributed=${(clearMs - (nullClearMs ?? 0) - engineArm.clearMs).toFixed(1)} ms`,
    );
  });

  // why: the same tree twice, and the only difference is whether ONE node per row is created under
  // its intrinsic tag. A tag is how a node reaches its host behavior, so this prices what attaching
  // one costs — and that price is paid by every adapter, on every Pressable, Switch, Image, Button
  // and ScrollView a real screen holds, not just by the text input this row happens to carry.
  //
  // The UNTAGGED arm runs on BOTH sides of the tagged one. A gap between the two readings is drift
  // this case cannot see past, and saying so is cheaper than trusting a single pair.
  it('prices the host behavior a tagged primitive attaches', () => {
    const before = timeEngineArm('bare', false);
    const tagged = timeEngineArm('tagged', true);
    const after = timeEngineArm('bare', false);

    // The tagged arm writes one more prop per row — the behavior's `attach` seeds
    // `mostRecentEventCount` — and that seed is PART of what a behavior costs, not a confound. What
    // must match is the tree.
    expect(tagged.nodes).toBe(before.nodes);
    expect(tagged.setProps - before.setProps).toBe(ROWS);

    const perInstance = (ms: number): string =>
      `${((ms * 1_000) / ROWS).toFixed(1)} us`;
    const cost = tagged.wall - Math.min(before.wall, after.wall);
    const build = tagged.buildMs - Math.min(before.buildMs, after.buildMs);
    const commit = tagged.commitMs - Math.min(before.commitMs, after.commitMs);
    print(
      `DEBUG BEHAVIOR   bare=${before.wall.toFixed(1)}/${after.wall.toFixed(1)} ` +
        `tagged=${tagged.wall.toFixed(1)} · ${perInstance(cost)} per instance ` +
        `= attach ${perInstance(build)} + post-commit ${perInstance(commit)}`,
    );
  });
});

report();

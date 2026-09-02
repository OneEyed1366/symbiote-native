<!--
  On-device twin of the js-framework-benchmark (krausest) suite: the same nine list operations
  every framework there is scored on, run against @symbiote-native/engine's commit path on a real
  device instead of in isolation. A micro-benchmark times pure JS; this screen times the whole
  round trip — Vue's render, the engine's mutation → clone-on-write translation, and completeRoot
  — and puts a JS-thread frame counter next to it so a saved millisecond can be checked against
  frames the user actually sees.

  Vue SFC twin of .examples/react/screens/BenchmarkScreen.tsx. This screen is a RULER: every
  constant, operation label, testID and row shape is copied across the four canaries so a
  difference between the numbers can be read as a difference in the ADAPTER. Nothing here is a
  judgement call — see .claude/skills/symbiote-perf-measurement/benchmark-screen-spec.md.
-->
<script lang="ts">
// Module scope, deliberately - the React twin keeps these at module level too, so an id sequence
// and a random stream survive a remount of the screen instead of restarting mid-session.
//
// Word lists and row shape are taken verbatim from js-framework-benchmark (krausest) so the
// numbers here can be read next to the published Vue/Svelte/Solid ones. Its rules forbid
// hand-tuning the implementation for the benchmark, so everything below is the plain keyed-list
// Vue anyone would write: one shallow ref for the list, one row component, stable handlers.
const ADJECTIVES = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
];
const COLOURS = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'white',
  'black',
  'orange',
];
const NOUNS = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
];

type IBenchmarkRow = {
  id: number;
  label: string;
};

// Row ids are globally unique and never reused, exactly as in the reference implementation -
// a reused key would let the patcher match an old row to a new one and hide real reconciliation
// work.
let nextRowId = 1;

// Deterministic, not Math.random(), and that is a cross-adapter requirement rather than a
// stylistic one: this screen is a RULER, and the same ruler has to exist in every example so a
// difference between React and Vue and Svelte and Angular can be read as a difference in the
// adapter. Random labels vary in length, length changes text measurement, and the noise lands in
// exactly the numbers being compared. A tiny LCG with a fixed seed makes every adapter build the
// byte-identical row list. (krausest forbids tuning the IMPLEMENTATION for the benchmark; pinning
// the data generator's seed is not that.)
const RANDOM_SEED = 1;
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
const LCG_MODULUS = 2 ** 32;
let randomState = RANDOM_SEED;

// Both generators are module state, so they drift with every button pressed before a run. Two
// suite runs are only byte-identical - to each other and across adapters - if both are rewound
// first, which is the whole point of pinning the seed.
function resetRowData(): void {
  randomState = RANDOM_SEED;
  nextRowId = 1;
}

function nextRandom(): number {
  randomState = (randomState * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
  return randomState / LCG_MODULUS;
}

function pick<T>(from: readonly T[]): T {
  return from[Math.floor(nextRandom() * from.length)];
}

function buildRows(count: number): IBenchmarkRow[] {
  const rows: IBenchmarkRow[] = new Array(count);
  for (let index = 0; index < count; index += 1) {
    rows[index] = {
      id: nextRowId,
      label: `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`,
    };
    nextRowId += 1;
  }
  return rows;
}
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/vue';
import {
  readCommitProfile,
  registerPostCommit,
  unregisterPostCommit,
} from '@symbiote-native/engine';
import {
  readFabricCallProfile,
  type IFabricCallProfile,
} from '../fabric-call-counter';
import ActionButton from '../components/ActionButton.vue';
import BenchmarkRow from '../components/BenchmarkRow.vue';
import BenchmarkStickyScroll from '../components/BenchmarkStickyScroll.vue';
import BenchmarkStickySectionList from '../components/BenchmarkStickySectionList.vue';
import JsFrameRateMeter, {
  commitProfileGate,
} from '../components/JsFrameRateMeter.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const ROW_BATCH = 1000;
const ROW_BATCH_LARGE = 10000;

// The number that decides whether a row COUNT is even feasible here, and the one krausest cannot
// tell us: its counts are DOM-node counts. BenchmarkRow.vue expands to TEN native views
// (1 View + 3x[Text + RawText] + 2 Pressable Views + 1 TextInput — renderTextInput emits one
// element with no children), so 10 000 rows mounted at once is 100 000 UIViews. Measured
// 2026-08-18 on the iOS 26.5 simulator against the nine-view row this screen carried then, that
// never completed: RAM climbed 2.1 -> 2.8 GB and the JS thread sat at 0 fps; 1 000 rows completes
// in ~880 ms. That ceiling is the native host's, not the engine's - which is exactly why the two
// mount modes below exist, so the claim can be measured instead of asserted.
const NATIVE_VIEWS_PER_ROW = 10;
// Fixed so getItemLayout is exact in virtualized mode and both modes lay rows out identically.
const BENCH_ROW_HEIGHT = 44;

// How the row list reaches the screen. Same rows, same operations, same measurement - only the
// number of rows SIMULTANEOUSLY MOUNTED differs, which isolates "our commit path is slow" from
// "no host can hold this many native views".
const MOUNT_MODE = {
  // krausest's own shape: every row mounted, no windowing. Measures the engine's commit path
  // directly, and is the only mode whose numbers are comparable to the published web ones.
  All: 'all',
  // What an actual app ships. The list mounts a window of ~10 rows regardless of row count, so
  // the measurement covers the window plus the list's own bookkeeping, NOT 10 000 rows of commit.
  Virtualized: 'virtualized',
} as const;
type IMountMode = (typeof MOUNT_MODE)[keyof typeof MOUNT_MODE];

// krausest's "partial update" touches every 10th row of 10,000 and appends " !!!" to its label.
const UPDATE_STRIDE = 10;
const UPDATE_SUFFIX = ' !!!';
// The exact indices krausest's driver clicks: select row 2, remove row 4, swap rows 2 and 999.
const SELECT_INDEX = 1;
const REMOVE_INDEX = 3;
const SWAP_LOW_INDEX = 1;
const SWAP_HIGH_INDEX = 998;
const HISTORY_LIMIT = 20;

// Every timed step of the suite below starts from exactly this many rows.
const SUITE_ROWS = ROW_BATCH;
// A step that never commits would leave the suite awaiting forever and the screen frozen mid-run.
// Timing out into a reported `timeout` row instead keeps the rest of the suite measurable and
// names the broken operation - which is worth more than a hung screen.
const SUITE_STEP_TIMEOUT_MS = 30_000;
const SUITE_TIMED_OUT = Number.NaN;

const BENCH_OP = {
  Create: 'create',
  Replace: 'replace',
  Update: 'update',
  Select: 'select',
  Swap: 'swap',
  Remove: 'remove',
  CreateLots: 'createLots',
  Append: 'append',
  Clear: 'clear',
} as const;

type IBenchOpId = (typeof BENCH_OP)[keyof typeof BENCH_OP];

type IBenchOperation = {
  id: IBenchOpId;
  label: string;
  onPress: () => void;
};

type IBenchResult = {
  seq: number;
  op: IBenchOpId;
  label: string;
  durationMs: number;
  rowCount: number;
};

// What the ENGINE did inside one timed step, captured from readCommitProfile() around the step
// rather than sampled on a timer. This is the number that separates "our commit is expensive" from
// "the framework above it is expensive": every adapter builds the same 9 001-node tree for
// Create 1 000, so a nodesVisited or propWrites that differs between adapters on the SAME step is
// work the screen is generating, not a cost of the platform.
//
// `walkMs` is NOT the engine's JS cost — the window around reconcile() contains the createNode and
// appendChild JSI crossings it makes. Read it only as a DELTA between adapters, where the native
// part is a shared constant (measured: identical Fabric call counts across react/vue/solid/svelte).
type IStepProfile = {
  nodesVisited: number;
  propWrites: number;
  propNoops: number;
  commits: number;
  walkMs: number;
};

const EMPTY_STEP_PROFILE: IStepProfile = {
  nodesVisited: 0,
  propWrites: 0,
  propNoops: 0,
  commits: 0,
  walkMs: 0,
};

const EMPTY_FABRIC_PROFILE: IFabricCallProfile = {
  calls: {},
  propKeys: {},
  totalCalls: 0,
  totalPropKeys: 0,
};

// The one quantity this canary and `examples/bare-rn` (stock React Native on React's own Fabric
// renderer) can both report. IStepProfile above counts the ENGINE's reconcile walk, which stock
// has no equivalent of; `global.nativeFabricUIManager` is what both stacks actually drive, so
// counting calls there is the only like-for-like number between them.
function formatFabric(profile: IFabricCallProfile | undefined): string {
  if (profile === undefined) return '—';
  const create = profile.calls.createNode ?? 0;
  const append = profile.calls.appendChild ?? 0;
  const clones =
    (profile.calls.cloneNode ?? 0) +
    (profile.calls.cloneNodeWithNewChildren ?? 0) +
    (profile.calls.cloneNodeWithNewProps ?? 0) +
    (profile.calls.cloneNodeWithNewChildrenAndProps ?? 0);
  return `${create}/${append}/${clones}`;
}

// One row of the fixed-order suite. `startRows` is recorded rather than derived because it is the
// number the whole suite exists to pin down - a duration is meaningless without it.
type ISuiteEntry = {
  op: IBenchOpId;
  label: string;
  durationMs: number;
  startRows: number;
  profile: IStepProfile;
  fabric: IFabricCallProfile;
};

// The suite's fixed order, shared by the runner and the comparison table below, so a step can
// never run without a row to land in (or a row exist for a step that never runs).
const SUITE_STEPS: readonly { op: IBenchOpId; label: string }[] = [
  { op: BENCH_OP.Create, label: 'Create 1,000 rows' },
  { op: BENCH_OP.Replace, label: 'Replace all 1,000 rows' },
  { op: BENCH_OP.Update, label: 'Partial update · every 10th row' },
  { op: BENCH_OP.Select, label: 'Select row' },
  { op: BENCH_OP.Swap, label: 'Swap 2 rows' },
  { op: BENCH_OP.Remove, label: 'Remove row' },
  { op: BENCH_OP.Append, label: 'Append 1,000 rows' },
  { op: BENCH_OP.Clear, label: 'Clear' },
];

function suiteLabel(op: IBenchOpId): string {
  return SUITE_STEPS.find(step => step.op === op)?.label ?? op;
}

// Which mode is mid-run and how far along. Rendered as its own block rather than folded into the
// button title, because a suite step can hold the JS thread for hundreds of milliseconds and the
// operator otherwise has no way to tell a running suite from a dead screen.
type ISuiteProgress = {
  mode: IMountMode;
  label: string;
  done: number;
};

// Both modes' last results, side by side. The comparison IS the output - all-mounted prices the
// commit path itself, virtualized prices what an app actually ships, and reading one without the
// other is how "the engine is slow" gets claimed off a number that measured 9,000 native views.
type ISuiteResults = Record<IMountMode, readonly ISuiteEntry[]>;

const EMPTY_SUITE_RESULTS: ISuiteResults = {
  [MOUNT_MODE.All]: [],
  [MOUNT_MODE.Virtualized]: [],
};

// Rows and selection are ONE state object, the way the reference implementation keeps them: every
// operation then produces exactly one new object. shallowRef, not ref: a deep ref would wrap all
// 10 000 row objects in reactive proxies, and that proxy cost would land inside the very
// measurement this screen exists to take.
type IListState = {
  rows: readonly IBenchmarkRow[];
  selectedId: number | undefined;
};

const list = shallowRef<IListState>({ rows: [], selectedId: undefined });
const mountMode = ref<IMountMode>(MOUNT_MODE.All);
const history = shallowRef<readonly IBenchResult[]>([]);
const suiteResults = shallowRef<ISuiteResults>(EMPTY_SUITE_RESULTS);
// Drives the progress block AND the guard in `measure`. One holder is enough here, unlike React's
// screen, which needs a separate ref because `measure` is a useCallback whose closure would go
// stale; a Vue ref read inside the timing callback is a live read.
const progress = shallowRef<ISuiteProgress | undefined>(undefined);
const rows = computed(() => list.value.rows);
const selectedId = computed(() => list.value.selectedId);

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Benchmark];
const accent = LINE_COLOR.performance;

type IPendingStep = {
  startedAt: number;
  settle: (durationMs: number) => void;
};

// Plain locals, not refs: nothing renders them, and setup() runs once per mount.
let pending: IPendingStep | null = null;
let seq = 0;
// Filled by the post-commit hook, read by `timed` right after its own `await runStep(mutate)`.
// A local rather than a ref for the same reason as the two above, and because a reactive write
// here would commit the screen inside the window the profile describes. Steps are serialized, and
// `timed` awaits the progress step BEFORE the measured one, so the value standing here when it
// reads is always the measured step's.
let lastStepProfile: IStepProfile = EMPTY_STEP_PROFILE;
let lastFabricProfile: IFabricCallProfile = EMPTY_FABRIC_PROFILE;

// THE timing primitive - every number on this screen, button or suite, comes through here. The
// clock starts here (Vue flushes its render job on a microtask, so a performance.now() pair
// wrapped around the mutation would time the scheduling call and nothing else) and stops in the
// post-commit hook below, which resolves this promise. Awaiting it is what lets the suite drive
// one operation at a time from a known state instead of racing its own steps.
function runStep(mutate: () => void): Promise<number> {
  return new Promise<number>(resolve => {
    let isSettled = false;
    const settle = (durationMs: number): void => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      // Release before resolving, so the meter is live again the moment the step is over even if
      // a caller does more work synchronously off this promise.
      commitProfileGate.isHeldByBenchmark = false;
      resolve(durationMs);
    };
    const timer = setTimeout(() => {
      // Drop the pending record too: leaving it would make the NEXT step's commit stop this
      // step's stopwatch and report a duration against the wrong operation.
      pending = null;
      lastStepProfile = EMPTY_STEP_PROFILE;
      lastFabricProfile = EMPTY_FABRIC_PROFILE;
      settle(SUITE_TIMED_OUT);
    }, SUITE_STEP_TIMEOUT_MS);

    // Stop the meter and zero both sets of counters LAST, immediately before the mutation, so
    // nothing between here and the commit lands in the step's profile. No install retry for the
    // Fabric counter: its wrapper has to be in place while the engine binds the slot, which
    // index.js already did and nothing can redo — an all-zero FABRIC CALLS table means that
    // install did not land.
    commitProfileGate.isHeldByBenchmark = true;
    readCommitProfile();
    readFabricCallProfile();
    pending = { startedAt: performance.now(), settle };
    mutate();
  });
}

// `rowCount` is passed in rather than read back from state afterwards: this closes over the list
// as it was when the button was pressed, and reading it later would report the post-mutation one.
function measure(
  op: IBenchOpId,
  label: string,
  rowCount: number,
  mutate: () => void,
): void {
  if (progress.value !== undefined) return;
  runStep(mutate).then(durationMs => {
    seq += 1;
    history.value = [
      { seq, op, label, durationMs, rowCount },
      ...history.value,
    ].slice(0, HISTORY_LIMIT);
  });
}

// Stopped by the ENGINE's post-commit hook, not by nextTick, and that choice is what makes this
// screen comparable across adapters at all. Vue, Svelte and Angular all commit on a microtask,
// React inside its own commit phase - so each framework's own after-render hook fires at a
// different point relative to the native commit. Four different hooks would silently measure four
// different quantities and the comparison would be void. registerPostCommit means one definition
// of "done" everywhere: completeRoot has returned. Native layout and paint happen after that and
// are not in the number; the frame counter above is what shows those.
function onCommitted(): void {
  const finished = pending;
  if (finished === null) return;
  pending = null;
  const durationMs = performance.now() - finished.startedAt;
  // Safe to read here: commitContainer increments walkMs and commits BEFORE completeRoot, and
  // runPostCommitHooks() fires after it, so the profile for this commit is already complete.
  const profile = readCommitProfile();
  lastStepProfile = {
    nodesVisited: profile.nodesVisited,
    propWrites: profile.propWrites,
    propNoops: profile.propNoops,
    commits: profile.commits,
    walkMs: profile.walkMs,
  };
  lastFabricProfile = readFabricCallProfile();
  finished.settle(durationMs);
}

onMounted(() => registerPostCommit(onCommitted));
onUnmounted(() => unregisterPostCommit(onCommitted));

// The guards below keep an operation from recording a measurement of nothing - an empty list, or
// an index krausest's fixed row numbers put past the end of a short one.
const onSelect = (id: number): void => {
  measure(BENCH_OP.Select, 'Select row', rows.value.length, () => {
    const current = list.value;
    list.value = {
      ...current,
      selectedId: current.selectedId === id ? undefined : id,
    };
  });
};

const onRemove = (id: number): void => {
  measure(BENCH_OP.Remove, 'Remove row', rows.value.length - 1, () => {
    const current = list.value;
    list.value = {
      ...current,
      rows: current.rows.filter(row => row.id !== id),
    };
  });
};

const onCreate = (): void => {
  measure(BENCH_OP.Create, 'Create 1,000 rows', ROW_BATCH, () => {
    list.value = { rows: buildRows(ROW_BATCH), selectedId: undefined };
  });
};

// Same call as Create - krausest scores them apart because the starting state differs: this one
// swaps a full keyed list for another, the other one mounts into an empty container.
const onReplace = (): void => {
  measure(BENCH_OP.Replace, 'Replace all 1,000 rows', ROW_BATCH, () => {
    list.value = { rows: buildRows(ROW_BATCH), selectedId: undefined };
  });
};

const onCreateLots = (): void => {
  measure(BENCH_OP.CreateLots, 'Create 10,000 rows', ROW_BATCH_LARGE, () => {
    list.value = { rows: buildRows(ROW_BATCH_LARGE), selectedId: undefined };
  });
};

const onAppend = (): void => {
  measure(
    BENCH_OP.Append,
    'Append 1,000 rows',
    rows.value.length + ROW_BATCH,
    () => {
      const current = list.value;
      list.value = {
        ...current,
        rows: current.rows.concat(buildRows(ROW_BATCH)),
      };
    },
  );
};

const onUpdate = (): void => {
  if (rows.value.length === 0) return;
  measure(
    BENCH_OP.Update,
    'Partial update (every 10th)',
    rows.value.length,
    () => {
      const current = list.value;
      list.value = {
        ...current,
        rows: current.rows.map((row, index) =>
          index % UPDATE_STRIDE === 0
            ? { ...row, label: row.label + UPDATE_SUFFIX }
            : row,
        ),
      };
    },
  );
};

const onSelectSample = (): void => {
  if (rows.value.length <= SELECT_INDEX) return;
  onSelect(rows.value[SELECT_INDEX].id);
};

const onRemoveSample = (): void => {
  if (rows.value.length <= REMOVE_INDEX) return;
  onRemove(rows.value[REMOVE_INDEX].id);
};

const onSwap = (): void => {
  if (rows.value.length <= SWAP_HIGH_INDEX) return;
  measure(BENCH_OP.Swap, 'Swap 2 rows', rows.value.length, () => {
    const current = list.value;
    const next = current.rows.slice();
    const low = next[SWAP_LOW_INDEX];
    next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
    next[SWAP_HIGH_INDEX] = low;
    list.value = { ...current, rows: next };
  });
};

// Clear wipes the recorded measurements too, not just the rows. A duration stays pinned next to
// its button until that operation runs again, so a number measured under one set of conditions
// reads as current under another - a Create 10,000 timed in virtualized mode sat next to the
// button in all-mounted mode and looked like an all-mounted result. Resetting the run alongside
// the list keeps a stale figure from ever being read as a fresh one. Clear's OWN measurement
// still lands (the post-commit hook runs after this commit and appends to the emptied history),
// so the button that was just pressed does not read as "did nothing".
const onClear = (): void => {
  if (rows.value.length === 0) return;
  measure(BENCH_OP.Clear, 'Clear', 0, () => {
    list.value = { rows: [], selectedId: undefined };
    history.value = [];
  });
};

const operations: readonly IBenchOperation[] = [
  { id: BENCH_OP.Create, label: 'Create 1,000 rows', onPress: onCreate },
  { id: BENCH_OP.Replace, label: 'Replace all 1,000 rows', onPress: onReplace },
  {
    id: BENCH_OP.Update,
    label: 'Partial update · every 10th row',
    onPress: onUpdate,
  },
  { id: BENCH_OP.Select, label: 'Select row', onPress: onSelectSample },
  { id: BENCH_OP.Swap, label: 'Swap 2 rows', onPress: onSwap },
  { id: BENCH_OP.Remove, label: 'Remove row', onPress: onRemoveSample },
  {
    id: BENCH_OP.CreateLots,
    label: 'Create 10,000 rows',
    onPress: onCreateLots,
  },
  { id: BENCH_OP.Append, label: 'Append 1,000 rows', onPress: onAppend },
  { id: BENCH_OP.Clear, label: 'Clear', onPress: onClear },
];

const isAllMounted = computed(() => mountMode.value === MOUNT_MODE.All);

/**
 * The whole ruler in one press, in a FIXED order, each timed operation starting from exactly
 * SUITE_ROWS rows.
 *
 * Pressing the buttons by hand does not measure what it looks like it measures. `Remove` and
 * `Append` cost scale with the rows currently on screen (a flat parent re-appends every child
 * handle on any structural change), so their numbers depend on which buttons were pressed before
 * them. Measured 2026-08-18, React Debug, same build twice: Remove 87-107 ms against 418.6 ms,
 * Append 953 against 1678 ms, while Create / Replace / Partial / Select / Swap reproduced inside
 * 1-3%. Two runs of the SAME adapter disagreed 4x - so a cross-ADAPTER comparison off those rows
 * was measuring press order, not the adapter.
 *
 * Hence: untimed setup steps in between, awaited through the same engine post-commit seam as the
 * timed ones, so each measurement begins from a state this function chose rather than one the
 * operator happened to leave behind.
 *
 * Runs in EITHER mount mode - the pressed button picks it. No 10,000-row step in either: 10,000
 * rows is 90,000 native views, which the host does not survive in all-mounted (see
 * NATIVE_VIEWS_PER_ROW), and a suite that hangs the screen measures nothing.
 */
const runSuite = async (mode: IMountMode): Promise<void> => {
  resetRowData();

  const entries: ISuiteEntry[] = [];
  const clearRows = (): void => {
    list.value = { rows: [], selectedId: undefined };
  };
  const fillRows = (): void => {
    list.value = { rows: buildRows(SUITE_ROWS), selectedId: undefined };
  };

  // The suite's own UI is committed and PAINTED before any measured step starts. Vue batches onto
  // a microtask, so setting a running flag and then immediately mutating the list puts the spinner
  // and the first (heaviest) step in one commit: the operator presses the button and gets several
  // hundred milliseconds of frozen screen with the button still reading "Run". Awaiting a commit
  // that carries only the progress block splits the two.
  const showProgress = (label: string): Promise<number> =>
    runStep(() => {
      progress.value = { mode, label, done: entries.length };
    });

  const timed = async (
    op: IBenchOpId,
    startRows: number,
    mutate: () => void,
  ): Promise<void> => {
    const label = suiteLabel(op);
    await showProgress(label);
    const durationMs = await runStep(mutate);
    // Read AFTER the measured step, never after showProgress: the local holds whichever step
    // committed last, and the progress step commits first by construction.
    entries.push({
      op,
      label,
      durationMs,
      startRows,
      profile: lastStepProfile,
      fabric: lastFabricProfile,
    });
  };

  // One commit for the whole prologue: the mode this run measures, an emptied list, and the
  // progress block appearing. It always changes the tree (the block goes from absent to present) -
  // which matters, because `commitContainer` returns early on a commit that produced no native
  // change (`if (!result.changed) return` sits ABOVE `runPostCommitHooks()` in
  // core/engine/src/commit.ts), so a no-op mutation never resolves its step and would stall the
  // suite until the timeout. Every step after this one changes the tree by construction.
  await runStep(() => {
    mountMode.value = mode;
    suiteResults.value = { ...suiteResults.value, [mode]: [] };
    history.value = [];
    progress.value = { mode, label: 'Preparing', done: 0 };
    clearRows();
  });

  await timed(BENCH_OP.Create, 0, fillRows);
  await timed(BENCH_OP.Replace, SUITE_ROWS, fillRows);
  await timed(BENCH_OP.Update, SUITE_ROWS, () => {
    const current = list.value;
    list.value = {
      ...current,
      rows: current.rows.map((row, index) =>
        index % UPDATE_STRIDE === 0
          ? { ...row, label: row.label + UPDATE_SUFFIX }
          : row,
      ),
    };
  });
  await timed(BENCH_OP.Select, SUITE_ROWS, () => {
    const current = list.value;
    list.value = { ...current, selectedId: current.rows[SELECT_INDEX].id };
  });
  await timed(BENCH_OP.Swap, SUITE_ROWS, () => {
    const current = list.value;
    const next = current.rows.slice();
    const low = next[SWAP_LOW_INDEX];
    next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
    next[SWAP_HIGH_INDEX] = low;
    list.value = { ...current, rows: next };
  });
  await timed(BENCH_OP.Remove, SUITE_ROWS, () => {
    const current = list.value;
    list.value = {
      ...current,
      rows: current.rows.filter((_row, index) => index !== REMOVE_INDEX),
    };
  });

  await runStep(clearRows);
  await runStep(fillRows);
  await timed(BENCH_OP.Append, SUITE_ROWS, () => {
    const current = list.value;
    list.value = {
      ...current,
      rows: current.rows.concat(buildRows(SUITE_ROWS)),
    };
  });

  await runStep(clearRows);
  await runStep(fillRows);
  await timed(BENCH_OP.Clear, SUITE_ROWS, clearRows);

  suiteResults.value = { ...suiteResults.value, [mode]: entries };
  progress.value = undefined;
};

const onRunSuite = (mode: IMountMode): void => {
  if (progress.value !== undefined) return;
  runSuite(mode).catch(() => {
    // A rejected step would otherwise leave the progress block up with no way back; whatever
    // entries were collected are dropped, because a partial suite is not a ruler.
    progress.value = undefined;
  });
};

// One handler per button rather than an inline arrow in the template: an arrow would be a fresh
// prop identity on every render, and ActionButton is memoized on exactly that.
const onRunAllMounted = (): void => onRunSuite(MOUNT_MODE.All);
const onRunVirtualized = (): void => onRunSuite(MOUNT_MODE.Virtualized);

const isBatchingCreate = ref(false);

// The engine reads `__SYMBIOTE_BATCH_CREATE__` once per commit, not per node, so it has to be set
// BEFORE the mutation that starts a step — which a press between runs always is. Deliberately a
// global rather than a prop: nothing on the commit path should have to be threaded a flag.
const onToggleBatchCreate = (): void => {
  isBatchingCreate.value = !isBatchingCreate.value;
  Reflect.set(globalThis, '__SYMBIOTE_BATCH_CREATE__', isBatchingCreate.value);
};

const allDurations = computed(
  () =>
    new Map(
      suiteResults.value[MOUNT_MODE.All].map(entry => [
        entry.op,
        entry.durationMs,
      ]),
    ),
);
const virtualizedDurations = computed(
  () =>
    new Map(
      suiteResults.value[MOUNT_MODE.Virtualized].map(entry => [
        entry.op,
        entry.durationMs,
      ]),
    ),
);
const hasSuiteResults = computed(
  () => allDurations.value.size > 0 || virtualizedDurations.value.size > 0,
);

// All-mounted only: it is the cross-renderer column, and the virtualized one prices two different
// list implementations rather than two renderers.
const allProfiles = computed(
  () =>
    new Map(
      suiteResults.value[MOUNT_MODE.All].map(entry => [
        entry.op,
        entry.profile,
      ]),
    ),
);
const allFabricProfiles = computed(
  () =>
    new Map(
      suiteResults.value[MOUNT_MODE.All].map(entry => [entry.op, entry.fabric]),
    ),
);

// Pre-formatted here rather than looked up three times per row in the template: a template has
// nowhere to bind the profile a row resolves to, so the alternative is three Map reads and three
// undefined checks per cell.
const engineRows = computed(() =>
  SUITE_STEPS.map(step => {
    const profile = allProfiles.value.get(step.op);
    return {
      op: step.op,
      label: step.label,
      visited: profile === undefined ? '—' : String(profile.nodesVisited),
      writes:
        profile === undefined
          ? '—'
          : `${profile.propWrites}/${profile.propNoops}`,
      commits:
        profile === undefined
          ? '—'
          : `${profile.commits} · ${profile.walkMs.toFixed(1)}ms`,
    };
  }),
);

// Same reason as engineRows: pre-formatted so each cell is a plain binding.
const fabricRows = computed(() =>
  SUITE_STEPS.map(step => {
    const fabric = allFabricProfiles.value.get(step.op);
    return {
      op: step.op,
      label: step.label,
      calls: formatFabric(fabric),
      propKeys: fabric === undefined ? '—' : String(fabric.totalPropKeys),
    };
  }),
);

// What the host is actually holding. In virtualized mode the list decides, so it is reported as
// an approximation of the window rather than a count derived from rows.length.
const mountedViews = computed(() =>
  isAllMounted.value
    ? String(rows.value.length * NATIVE_VIEWS_PER_ROW)
    : `~1 window x ${NATIVE_VIEWS_PER_ROW}`,
);

// History is newest-first, so the first entry found for an operation is its latest run.
const lastDurations = computed(() => {
  const durations = new Map<IBenchOpId, number>();
  for (const entry of history.value) {
    if (!durations.has(entry.op)) durations.set(entry.op, entry.durationMs);
  }
  return durations;
});

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '—';
  if (!Number.isFinite(durationMs)) return 'timeout';
  return `${durationMs.toFixed(1)} ms`;
}

const rowKeyExtractor = (row: IBenchmarkRow): string => String(row.id);
const rowItemLayout = (
  _data: unknown,
  index: number,
): { length: number; offset: number; index: number } => ({
  length: BENCH_ROW_HEIGHT,
  offset: BENCH_ROW_HEIGHT * index,
  index,
});
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView
      testID="benchmark-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: accent }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Benchmark</Text>
          <Text class="hero-body"
            >The js-framework-benchmark operations, run on device against the
            engine's commit path — with the JS-thread frame rate beside
            them.</Text
          >
        </View>
      </View>

      <Text class="section-label">MEASUREMENTS</Text>
      <JsFrameRateMeter :accent="accent" />

      <!-- Buttons and results sit DIRECTLY under the meter, and everything they stress sits below:
        a suite step holds the JS thread, so the dip has to be readable in the same screenful as
        the press that caused it. -->
      <View class="bench-run-row">
        <View class="flex1">
          <ActionButton
            testID="bench-run-suite-all"
            :title="
              progress?.mode === MOUNT_MODE.All
                ? 'Running…'
                : 'Run · all mounted'
            "
            :onPress="onRunAllMounted"
            :color="accent"
          />
        </View>
        <View class="flex1">
          <ActionButton
            testID="bench-run-suite-virtualized"
            :title="
              progress?.mode === MOUNT_MODE.Virtualized
                ? 'Running…'
                : 'Run · virtualized'
            "
            :onPress="onRunVirtualized"
            :color="accent"
          />
        </View>
      </View>

      <View class="bench-run-row">
        <View class="flex1">
          <ActionButton
            testID="bench-toggle-batch-create"
            :title="
              isBatchingCreate ? 'Batch create · on ✓' : 'Batch create · off'
            "
            :onPress="onToggleBatchCreate"
            :color="accent"
          />
        </View>
      </View>
      <Text class="note-text">{{
        `Temporary experiment switch. On, the engine hands a parent's children to cloneNodeWithChildren in one call instead of appending them one at a time — about a third fewer JSI calls on Create, paid for with one extra ShadowNode per batched parent. The sign is not predicted, which is why it is a runtime toggle: two builds a day apart drifted 4% on Create and 6x on Clear with no code change, so the only trustworthy comparison is back-to-back on one binary. Flip it, re-run the suite, compare.`
      }}</Text>

      <View
        v-if="progress !== undefined"
        testID="bench-suite-progress"
        class="bench-progress"
      >
        <ActivityIndicator :color="accent" />
        <Text class="bench-progress-text">{{
          `${progress.mode === MOUNT_MODE.All ? 'All mounted' : 'Virtualized'} · ${progress.label}`
        }}</Text>
        <Text class="bench-progress-count">{{
          `${progress.done}/${SUITE_STEPS.length}`
        }}</Text>
      </View>

      <template v-if="hasSuiteResults">
        <View class="bench-compare-row">
          <Text class="bench-compare-label" />
          <Text class="bench-compare-head-cell">ALL MOUNTED</Text>
          <Text class="bench-compare-head-cell">VIRTUALIZED</Text>
        </View>
        <View
          v-for="step in SUITE_STEPS"
          :key="step.op"
          :testID="`bench-suite-${step.op}`"
          class="bench-compare-row"
        >
          <Text class="bench-compare-label">{{ step.label }}</Text>
          <Text class="bench-compare-cell">{{
            formatDuration(allDurations.get(step.op))
          }}</Text>
          <Text class="bench-compare-cell">{{
            formatDuration(virtualizedDurations.get(step.op))
          }}</Text>
        </View>
      </template>
      <Text v-else testID="bench-suite-empty" class="note-text"
        >No suite run yet.</Text
      >

      <template v-if="hasSuiteResults">
        <Text class="section-label">ENGINE PER STEP · ALL MOUNTED</Text>
        <View class="bench-compare-row">
          <Text class="bench-compare-label" />
          <Text class="bench-compare-head-cell">VISITED</Text>
          <Text class="bench-compare-head-cell">WRITES/NOOP</Text>
          <Text class="bench-compare-head-cell">COMMITS</Text>
        </View>
        <View
          v-for="row in engineRows"
          :key="`engine-${row.op}`"
          :testID="`bench-engine-${row.op}`"
          class="bench-compare-row"
        >
          <Text class="bench-compare-label">{{ row.label }}</Text>
          <Text class="bench-compare-cell">{{ row.visited }}</Text>
          <Text class="bench-compare-cell">{{ row.writes }}</Text>
          <Text class="bench-compare-cell">{{ row.commits }}</Text>
        </View>
        <Text class="note-text">{{
          `Captured around each timed step, with the frame meter held so its own read-and-reset cannot eat them. Every adapter builds the same ${SUITE_ROWS * NATIVE_VIEWS_PER_ROW + 1}-node tree for Create, so a VISITED or WRITES that differs between adapters is work this screen is generating — not a cost of the platform. COMMITS must read 1; anything higher means a foreign commit landed inside the window. The ms is the reconcile window and it CONTAINS the createNode/appendChild JSI calls, so compare it across adapters, never read it as engine JS.`
        }}</Text>
      </template>

      <template v-if="hasSuiteResults">
        <Text class="section-label">FABRIC CALLS · ALL MOUNTED</Text>
        <View class="bench-compare-row">
          <Text class="bench-compare-label" />
          <Text class="bench-compare-head-cell">CREATE/APPEND/CLONE</Text>
          <Text class="bench-compare-head-cell">PROP KEYS</Text>
        </View>
        <View
          v-for="row in fabricRows"
          :key="`fabric-${row.op}`"
          :testID="`bench-fabric-${row.op}`"
          class="bench-compare-row"
        >
          <Text class="bench-compare-label">{{ row.label }}</Text>
          <Text class="bench-compare-cell">{{ row.calls }}</Text>
          <Text class="bench-compare-cell">{{ row.propKeys }}</Text>
        </View>
        <Text class="note-text">{{
          `Counted by wrapping global.nativeFabricUIManager before the engine binds it — the one surface this canary and the stock-React-Native baseline (examples/bare-rn) genuinely share, and therefore the only like-for-like number between them. The ENGINE table above has no counterpart over there: stock has no reconcile walk to count. Read as two questions. CREATE/APPEND/CLONE answers "does one stack ask Fabric to do MORE"; PROP KEYS answers the other half, "or the same number of times with fatter payloads". The wrapper costs one JS call per crossing and is therefore in every timing on this screen — the comparison holds only because the other side carries the identical wrapper.`
        }}</Text>
      </template>

      <Text class="note-text">{{
        `Every operation in a fixed order, each timed step starting from exactly ${SUITE_ROWS} rows, with untimed resets in between. All-mounted is krausest's own shape (${NATIVE_VIEWS_PER_ROW} native views per row) and the column that compares to the published web numbers; virtualized mounts a window instead, so it prices what an app ships rather than the commit path itself. Pressing the operation buttons by hand leaves Remove and Append measuring whatever happened to be on screen.`
      }}</Text>

      <!-- Both sticky paths and the row list sit under the buttons: the meter above stays on
        screen while either box is being dragged — the concrete case the benchmark exists for. -->
      <BenchmarkStickyScroll />
      <BenchmarkStickySectionList />
      <Text class="note-text"
        >Drag inside a box (not the page) and watch the counters above — the two
        boxes differ only in which sticky implementation carries the
        frame.</Text
      >

      <Text class="section-label">{{
        isAllMounted ? 'ROWS · ALL MOUNTED' : 'ROWS · VIRTUALIZED'
      }}</Text>
      <template v-if="isAllMounted">
        <BenchmarkRow
          v-for="row in rows"
          :key="row.id"
          :row="row"
          :is-selected="row.id === selectedId"
          :on-select="onSelect"
          :on-remove="onRemove"
        />
      </template>
      <FlatList
        v-else
        testID="bench-rows-virtualized"
        class="bench-rows-viewport"
        :data="rows"
        :key-extractor="rowKeyExtractor"
        :get-item-layout="rowItemLayout"
      >
        <template #item="{ item }">
          <BenchmarkRow
            :row="item"
            :is-selected="item.id === selectedId"
            :on-select="onSelect"
            :on-remove="onRemove"
          />
        </template>
      </FlatList>

      <!-- Below the fold on purpose: the single operations are for poking at one commit shape
        while debugging, not for reporting. Their Remove and Append numbers depend on press order,
        which is exactly what the suite above exists to remove. -->
      <Text class="section-label">OPERATIONS · LAST RUN</Text>
      <View
        v-for="operation in operations"
        :key="operation.id"
        class="bench-op-row"
      >
        <View class="flex1">
          <ActionButton
            :testID="`bench-op-${operation.id}`"
            :title="operation.label"
            :onPress="operation.onPress"
            :color="accent"
          />
        </View>
        <Text
          :testID="`bench-result-${operation.id}`"
          class="bench-op-result"
          >{{ formatDuration(lastDurations.get(operation.id)) }}</Text
        >
      </View>

      <Text testID="bench-row-count" class="info-text">{{
        `rows: ${rows.length} · ${mountedViews} native views mounted · selected: ${selectedId ?? 'none'}`
      }}</Text>

      <Text class="section-label">{{
        `HISTORY · LAST ${HISTORY_LIMIT} MEASUREMENTS`
      }}</Text>
      <Text v-if="history.length === 0" class="note-text"
        >Run an operation above to record a measurement.</Text
      >
      <template v-else>
        <Text
          v-for="entry in history"
          :key="entry.seq"
          class="bench-history-row"
          >{{
            `${entry.label} — ${formatDuration(entry.durationMs)} · ${entry.rowCount} rows`
          }}</Text
        >
      </template>
    </ScrollView>
  </SafeAreaView>
</template>

// On-device twin of the js-framework-benchmark (krausest) suite, ported from
// examples/react/screens/BenchmarkScreen.tsx against .claude/skills/symbiote-perf-measurement's
// benchmark-screen-spec.md. This screen is a RULER: every constant, word list, operation, row
// count, label and testID below is the reference's, because the numbers it produces are read next
// to the other five canaries'. A port that measures something slightly different is worse than no
// port at all, so nothing here is "improved".
//
// What IS Solid's own is the lifecycle, which is what the ruler exists to compare:
//   - one createStore holds rows + selection, so a partial update writes through a path and only
//     the touched labels' text nodes recommit — the fine-grained update Solid is scored on. React
//     rebuilds an immutable list and re-renders two memoized rows; both express the SAME operation,
//     and the difference between them is the measurement.
//   - <For> is the keyed list. Store rows are stable proxies over stable objects, so a swap moves
//     two nodes and a filter drops one, exactly as React's key={row.id} does.
//   - control flow (<For>, <Show>) is imported EXPLICITLY. An un-imported control-flow name
//     resolves against the RENDERER module and reads back `undefined`, which builds fine and throws
//     at runtime (.claude/rules/solid-descriptor-bridge.md §3).
//   - the suite's re-entrancy guard is the progress signal itself, read live at call time. React
//     needs a separate useRef because `measure` closes over stale state; a Solid signal read is
//     always current, so a second holder would only be a second thing to keep in sync.
//
// ONE INVARIANT COULD NOT BE MET EXACTLY, and it is named rather than substituted: sticky PATH B
// below carries no `getItemLayout`. @symbiote-native/solid's VirtualizedSectionList does not expose
// the prop (React's and Svelte's do), so the list learns each cell's extent from its own onLayout.
// PATH B therefore does strictly MORE per-frame work here than on those two, and its frame numbers
// are not comparable across adapters until the prop lands. PATH A, the row operations and the whole
// suite are unaffected.

import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Accessor,
} from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
  type ISection,
} from '@symbiote-native/solid';
import {
  readCommitProfile,
  registerPostCommit,
  unregisterPostCommit,
} from '@symbiote-native/engine';
import {
  readFabricCallProfile,
  type IFabricCallProfile,
} from '../fabric-call-counter';
import { ActionButton } from '../components/ActionButton';
import {
  commitProfileGate,
  JsFrameRateMeter,
} from '../components/JsFrameRateMeter';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import './BenchmarkScreen.css';

// Word lists and row shape are taken verbatim from js-framework-benchmark (krausest) so the
// numbers here can be read next to the published Solid ones. Its rules forbid hand-tuning the
// implementation for the benchmark, so everything below is the plain keyed-list Solid anyone would
// write: a store for the list, one row component, stable handlers.
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

const ROW_BATCH = 1000;
const ROW_BATCH_LARGE = 10000;

// The number that decides whether a row COUNT is even feasible here, and the one krausest cannot
// tell us: its counts are DOM-node counts. `BenchmarkRow` below expands to NINE native views
// (1 View + 3x[Text + RawText] + 2 Pressable Views), so 10 000 rows mounted at once is 90 000
// UIViews. Measured 2026-08-18 on the iOS 26.5 simulator, that never completed: RAM climbed
// 2.1 -> 2.8 GB and the JS thread sat at 0 fps. 1 000 rows (9 000 views) completes in ~880 ms.
// That ceiling is the native host's, not the engine's — which is exactly why the two mount modes
// below exist, so the claim can be measured instead of asserted.
// ONE row shape, everywhere. The `plain` / `with-input` pair existed to price a single TextInput
// as a delta inside one column; that number has been taken, so the arm now only splits every
// future measurement in two. Ten views, not eleven: a lowered `<TextInput>` is a single native
// input, and its `value` is a prop rather than a child, so it adds no RawText.
const NATIVE_VIEWS_PER_ROW = 10;
// Fixed so getItemLayout is exact in virtualized mode and both modes lay rows out identically.
// Must stay equal to BenchmarkScreen.css's `.bench-row` height.
const BENCH_ROW_HEIGHT = 44;

// How the row list reaches the screen. Same rows, same operations, same measurement — only the
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
// names the broken operation — which is worth more than a hung screen.
const SUITE_STEP_TIMEOUT_MS = 30_000;
const SUITE_TIMED_OUT = Number.NaN;

// Two sticky paths are on this screen on purpose (see the block components below): a plain
// ScrollView, and a SectionList. Same viewport height and same header look, so a difference
// between the two boxes isolates virtualization from stickiness itself.
const STICKY_SECTION_COUNT = 200;
const STICKY_ROWS_PER_SECTION = 3;
const SECTION_LIST_SECTION_COUNT = 16;
const SECTION_LIST_ROWS_PER_SECTION = 32;
const SECTION_LIST_ROW_HEIGHT = 30;
const SECTION_LIST_HEADER_HEIGHT = 28;

// One decimal on a duration, one on the walk share — enough to see a 1% move, few enough that the
// last digit is not noise.
const DURATION_DECIMALS = 1;

interface IStickyListItem {
  id: string;
  label: string;
}

// Every section is far taller than the 320px viewport, so headers genuinely cross-talk while
// scrolling instead of each one appearing and leaving on its own.
const BENCHMARK_SECTIONS: ISection<IStickyListItem>[] = Array.from(
  { length: SECTION_LIST_SECTION_COUNT },
  (_value, section) => ({
    title: `SECTION ${section + 1}`,
    data: Array.from(
      { length: SECTION_LIST_ROWS_PER_SECTION },
      (_rowValue, row) => ({
        id: `s${section}-r${row}`,
        label: `row ${section + 1}.${row + 1}`,
      }),
    ),
  }),
);

interface IBenchmarkRow {
  id: number;
  label: string;
}

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

interface IBenchOperation {
  id: IBenchOpId;
  label: string;
  onPress: () => void;
}

interface IBenchResult {
  seq: number;
  op: IBenchOpId;
  label: string;
  durationMs: number;
  rowCount: number;
}

// What the ENGINE did inside one timed step, captured from readCommitProfile() around the step
// rather than sampled on a timer. This is the number that separates "our commit is expensive" from
// "the framework above it is expensive": every adapter builds the same 9,001-node tree for
// Create 1,000, so a nodesVisited or propWrites that differs between adapters on the SAME step is
// work the screen is generating, not a cost of the platform.
//
// `walkMs` is NOT the engine's JS cost — the window around reconcile() contains the createNode and
// appendChild JSI crossings it makes. Read it only as a DELTA between adapters, where the native
// part is a shared constant (measured: identical Fabric call counts across react/vue/solid/svelte).
interface IStepProfile {
  nodesVisited: number;
  propWrites: number;
  propNoops: number;
  commits: number;
  walkMs: number;
}

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
// number the whole suite exists to pin down — a duration is meaningless without it.
interface ISuiteEntry {
  op: IBenchOpId;
  label: string;
  durationMs: number;
  startRows: number;
  profile: IStepProfile;
  fabric: IFabricCallProfile;
}

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
// operator otherwise has no way to tell a running suite from a dead screen. It doubles as the
// re-entrancy guard — see the note at the top of the file.
interface ISuiteProgress {
  mode: IMountMode;
  label: string;
  done: number;
}

// Both modes' last results, side by side. The comparison IS the output — all-mounted prices the
// commit path itself, virtualized prices what an app actually ships, and reading one without the
// other is how "the engine is slow" gets claimed off a number that measured 9,000 native views.
type ISuiteResults = Record<IMountMode, readonly ISuiteEntry[]>;

const EMPTY_SUITE_RESULTS: ISuiteResults = {
  [MOUNT_MODE.All]: [],
  [MOUNT_MODE.Virtualized]: [],
};

// Rows and selection are ONE store, the way the reference implementation keeps them in one state
// object: every operation then produces exactly one commit, which is what the post-commit hook
// below stops its stopwatch on — a select that only touched a second signal would leave the clock
// running.
interface IListState {
  rows: IBenchmarkRow[];
  selectedId: number | undefined;
}

// Row ids are globally unique and never reused, exactly as in the reference implementation —
// a reused key would let <For> match an old row to a new one and hide real reconciliation work.
let nextRowId = 1;

// Deterministic, not Math.random(), and that is a cross-adapter requirement rather than a
// stylistic one: this screen is a RULER, and the same ruler exists in every example so a
// difference between Solid and React and Vue and Svelte and Angular can be read as a difference in
// the adapter. Random labels vary in length, length changes text measurement, and the noise lands
// in exactly the numbers being compared. A tiny LCG with a fixed seed makes every adapter build the
// byte-identical row list. (krausest forbids tuning the IMPLEMENTATION for the benchmark; pinning
// the data generator's seed is not that.)
const RANDOM_SEED = 1;
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
const LCG_MODULUS = 2 ** 32;
let randomState = RANDOM_SEED;

// Both generators are module state, so they drift with every button pressed before a run. Two
// suite runs are only byte-identical — to each other and across adapters — if both are rewound
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

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '—';
  if (!Number.isFinite(durationMs)) return 'timeout';
  return `${durationMs.toFixed(DURATION_DECIMALS)} ms`;
}

interface IBenchmarkRowProps {
  row: IBenchmarkRow;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}

/**
 * TEN native views, and the count is load-bearing: 1 View + 3x(Text -> RCTText + RCTRawText) +
 * 2x(Pressable -> View) + 1 TextInput. A port that produces 9 or 11 puts every number on this
 * screen ~10% off the other canaries'.
 *
 * NOTHING here destructures `props` — a Solid component body runs ONCE, so a destructured `row` or
 * `isSelected` would freeze the row at its mount-time value and the update/select operations would
 * measure a repaint that never happened.
 */
function BenchmarkRow(props: IBenchmarkRowProps) {
  return (
    <View
      class={props.isSelected ? 'bench-row bench-row-selected' : 'bench-row'}
    >
      <Text class="bench-row-id">{String(props.row.id)}</Text>
      <Pressable class="flex1" onPress={() => props.onSelect(props.row.id)}>
        <Text class="bench-row-label">{props.row.label}</Text>
      </Pressable>
      <Pressable
        class="bench-row-remove"
        onPress={() => props.onRemove(props.row.id)}
      >
        <Text class="bench-row-remove-text">×</Text>
      </Pressable>
      {/* LAST, so the other nine views keep the positions every earlier payload diff was read at.

          No `multiline` — it selects a different native view. No `onChangeText` — a listener would
          price the event path rather than the node. And no `ref`, which for this adapter is not
          merely surplus but measurement-cancelling: `symbiote-text-input` sits in the transform's
          ref-refusal set, so a ref would keep the component and the row would measure the wrapper.

          `value`, not `defaultValue`: controlled is the shape that exercises the behavior's
          afterCommit handshake, which is the part lowering moved onto the node. */}
      <TextInput class="bench-row-input" value={props.row.label} />
    </View>
  );
}

/**
 * Sticky path A — a plain ScrollView with stickyHeaderIndices. Stickiness is computed in JS (the
 * adapter wraps each flagged child and drives it off the scroll offset), but nothing else runs
 * per frame: every child is mounted up front, there is no windowing.
 *
 * The children are built ONCE, in the component body — a Solid component body runs a single time,
 * so this is the direct twin of React's useMemo and a benchmark run can never rebuild these 800
 * elements into the numbers next to the buttons.
 */
function StickyScrollViewBlock() {
  // stickyHeaderIndices addresses DIRECT children of the content container, so the sections are
  // flattened into one list: a header followed by its rows, repeating.
  const stickyChildren = Array.from(
    { length: STICKY_SECTION_COUNT },
    (_value, section) => [
      <Text class="section-header">{`SECTION ${section + 1}`}</Text>,
      ...Array.from({ length: STICKY_ROWS_PER_SECTION }, (_rowValue, row) => (
        <Text class="list-row-text">{`row ${section + 1}.${row + 1}`}</Text>
      )),
    ],
  ).flat();
  const headerIndices = Array.from(
    { length: STICKY_SECTION_COUNT },
    (_value, section) => section * (STICKY_ROWS_PER_SECTION + 1),
  );

  return (
    <>
      <Text class="section-label">
        STICKY PATH A · ScrollView · stickyHeaderIndices
      </Text>
      <ScrollView
        testID="benchmark-sticky-scroll"
        class="bench-sticky"
        stickyHeaderIndices={headerIndices}
        scrollEventThrottle={16}
        nestedScrollEnabled
      >
        {stickyChildren}
      </ScrollView>
      <Text class="note-text">
        {`${STICKY_SECTION_COUNT} sections, every row mounted — no virtualization in the frame.`}
      </Text>
    </>
  );
}

/**
 * Sticky path B — SectionList with stickySectionHeadersEnabled, i.e. VirtualizedSectionList over
 * VirtualizedList. Each scroll frame additionally runs the windowing pass (cell render,
 * viewability) and the sticky math is computed inside the list. Shaped after components/ParityDemo's
 * sticky check, scaled up to 512 rows. If path A holds its frame rate and this one does not, the
 * cost is virtualization rather than stickiness.
 *
 * NO getItemLayout, unlike every other canary — see the note at the top of this file. Without it
 * the list learns a cell's extent only after measuring it, so a fast drag can outrun measurement
 * and leave the window briefly blank; that is this adapter's gap showing, not a finding about
 * virtualization.
 *
 * `renderItem` / `renderSectionHeader` are handed an ACCESSOR here, not the info object every other
 * adapter passes: Solid has no reconciler under a render prop, so a snapshot would freeze the row
 * at its mount-time item (.claude/rules/solid-descriptor-bridge.md §4). Read `info()` INSIDE the
 * JSX, never into a top-level const of the callback.
 */
function StickySectionListBlock() {
  return (
    <>
      <Text class="section-label">
        STICKY PATH B · SectionList · stickySectionHeadersEnabled
      </Text>
      <SectionList
        testID="benchmark-sticky-section-list"
        sections={BENCHMARK_SECTIONS}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled
        class="bench-sticky"
        scrollEventThrottle={16}
        renderSectionHeader={info => (
          // Height is pinned inline rather than in the stylesheet because the number has to agree
          // with the row/header arithmetic every other canary's getItemLayout encodes; splitting it
          // across two files is how that pair silently drifts apart.
          <Text
            class="section-header"
            style={{ height: SECTION_LIST_HEADER_HEIGHT }}
          >
            {info().section.title}
          </Text>
        )}
        renderItem={info => (
          <View class="parity-row" style={{ height: SECTION_LIST_ROW_HEIGHT }}>
            <Text class="list-row-text">{info().item.label}</Text>
          </View>
        )}
      />
      <Text class="note-text">
        {`${SECTION_LIST_SECTION_COUNT} sections x ${SECTION_LIST_ROWS_PER_SECTION} rows — windowed, sticky math inside the list.`}
      </Text>
    </>
  );
}

/**
 * The same nine list operations every framework on js-framework-benchmark is scored on, run against
 * @symbiote-native/engine's commit path on a real device instead of in isolation. A micro-benchmark
 * times pure JS; this screen times the whole round trip — Solid's reactive graph, the engine's
 * mutation -> clone-on-write translation, and completeRoot — and puts a JS-thread frame counter next
 * to it so a saved millisecond can be checked against frames the user actually sees.
 */
export function BenchmarkScreen() {
  const [list, setList] = createStore<IListState>({
    rows: [],
    selectedId: undefined,
  });
  const [mountMode, setMountMode] = createSignal<IMountMode>(MOUNT_MODE.All);
  const [history, setHistory] = createSignal<readonly IBenchResult[]>([]);
  const [suiteResults, setSuiteResults] =
    createSignal<ISuiteResults>(EMPTY_SUITE_RESULTS);
  const [progress, setProgress] = createSignal<ISuiteProgress | undefined>(
    undefined,
  );
  // The single re-entrancy holder. A signal read is always the CURRENT value, so unlike React —
  // where `measure` is a useCallback and reading state would capture a stale closure — the block
  // that drives the button title is also the block the guard reads.
  const isSuiteRunning = (): boolean => progress() !== undefined;

  let pending: {
    startedAt: number;
    settle: (durationMs: number) => void;
  } | null = null;
  let seq = 0;
  // Filled by the post-commit hook, read by `timed` right after its own `await runStep(mutate)`. A
  // plain binding, deliberately NOT a signal: nothing renders it directly (the table below reads it
  // through the suite results), and a signal write inside the post-commit hook would be one more
  // commit hanging off the step it just measured. Steps are serialized and `timed` awaits the
  // progress step BEFORE the measured one, so the value standing here when it reads is always the
  // measured step's.
  let lastStepProfile: IStepProfile = EMPTY_STEP_PROFILE;
  let lastFabricProfile: IFabricCallProfile = EMPTY_FABRIC_PROFILE;
  const [isBatchingCreate, setIsBatchingCreate] = createSignal(false);

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Benchmark];
  const accent = LINE_COLOR.performance;

  // THE timing primitive — every number on this screen, button or suite, comes through here. The
  // clock starts here (Solid commits on a microtask, so a performance.now() pair wrapped around the
  // mutation would time the scheduling call and nothing else) and stops in the post-commit hook
  // below, which resolves this promise. Awaiting it is what lets the suite drive one operation at a
  // time from a known state instead of racing its own steps.
  const runStep = (mutate: () => void): Promise<number> =>
    new Promise<number>(resolve => {
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

  // `rowCount` is passed in rather than read back from the store afterwards: this is the list as it
  // was when the button was pressed, and reading it later would report the post-mutation one.
  const measure = (
    op: IBenchOpId,
    label: string,
    rowCount: number,
    mutate: () => void,
  ): void => {
    if (isSuiteRunning()) return;
    runStep(mutate).then(durationMs => {
      seq += 1;
      setHistory(previous =>
        [{ seq, op, label, durationMs, rowCount }, ...previous].slice(
          0,
          HISTORY_LIMIT,
        ),
      );
    });
  };

  // Stopped by the ENGINE's post-commit hook, not by a Solid lifecycle hook, and that choice is
  // what makes this screen comparable across adapters at all. Solid, Vue, Svelte and Angular all
  // schedule completeRoot on a microtask while React commits synchronously inside its own commit
  // phase, so each framework's own after-render hook fires at a different point relative to the
  // native commit. Five different hooks would silently measure five different quantities and the
  // comparison would be void. registerPostCommit means one definition of "done" everywhere:
  // completeRoot has returned. Native layout and paint happen after that and are not in the number;
  // the frame counter above is what shows those.
  onMount(() => {
    const onCommitted = (): void => {
      const current = pending;
      if (current === null) return;
      pending = null;
      const durationMs = performance.now() - current.startedAt;
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
      current.settle(durationMs);
    };
    registerPostCommit(onCommitted);
    onCleanup(() => unregisterPostCommit(onCommitted));
  });

  // The guards below keep an operation from recording a measurement of nothing — an empty list, or
  // an index krausest's fixed row numbers put past the end of a short one.
  const onSelect = (id: number): void => {
    measure(BENCH_OP.Select, 'Select row', list.rows.length, () => {
      setList('selectedId', current => (current === id ? undefined : id));
    });
  };

  const onRemove = (id: number): void => {
    measure(BENCH_OP.Remove, 'Remove row', list.rows.length - 1, () => {
      setList('rows', rows => rows.filter(row => row.id !== id));
    });
  };

  const onCreate = (): void => {
    measure(BENCH_OP.Create, 'Create 1,000 rows', ROW_BATCH, () => {
      setList({ rows: buildRows(ROW_BATCH), selectedId: undefined });
    });
  };

  // Same call as Create — krausest scores them apart because the starting state differs: this one
  // swaps a full keyed list for another, the other one mounts into an empty container.
  const onReplace = (): void => {
    measure(BENCH_OP.Replace, 'Replace all 1,000 rows', ROW_BATCH, () => {
      setList({ rows: buildRows(ROW_BATCH), selectedId: undefined });
    });
  };

  const onCreateLots = (): void => {
    measure(BENCH_OP.CreateLots, 'Create 10,000 rows', ROW_BATCH_LARGE, () => {
      setList({ rows: buildRows(ROW_BATCH_LARGE), selectedId: undefined });
    });
  };

  const onAppend = (): void => {
    measure(
      BENCH_OP.Append,
      'Append 1,000 rows',
      list.rows.length + ROW_BATCH,
      () => {
        setList('rows', rows => rows.concat(buildRows(ROW_BATCH)));
      },
    );
  };

  // The fine-grained half of the ruler: a store path write touches every 10th row's `label` in
  // place, so <For> keeps all 1,000 rows and only 100 text nodes recommit. React rebuilds the list
  // and re-renders 100 memoized rows. Same operation, different machinery — which is the point.
  const onUpdate = (): void => {
    if (list.rows.length === 0) return;
    measure(
      BENCH_OP.Update,
      'Partial update (every 10th)',
      list.rows.length,
      () => {
        setList(
          'rows',
          produce(rows => {
            for (let index = 0; index < rows.length; index += UPDATE_STRIDE) {
              rows[index].label += UPDATE_SUFFIX;
            }
          }),
        );
      },
    );
  };

  const onSelectSample = (): void => {
    if (list.rows.length <= SELECT_INDEX) return;
    onSelect(list.rows[SELECT_INDEX].id);
  };

  const onRemoveSample = (): void => {
    if (list.rows.length <= REMOVE_INDEX) return;
    onRemove(list.rows[REMOVE_INDEX].id);
  };

  const onSwap = (): void => {
    if (list.rows.length <= SWAP_HIGH_INDEX) return;
    measure(BENCH_OP.Swap, 'Swap 2 rows', list.rows.length, () => {
      setList(
        'rows',
        produce(rows => {
          const low = rows[SWAP_LOW_INDEX];
          rows[SWAP_LOW_INDEX] = rows[SWAP_HIGH_INDEX];
          rows[SWAP_HIGH_INDEX] = low;
        }),
      );
    });
  };

  // Clear wipes the recorded measurements too, not just the rows. A duration stays pinned next to
  // its button until that operation runs again, so a number measured under one set of conditions
  // reads as current under another — a Create 10,000 timed in virtualized mode sat next to the
  // button in all-mounted mode and looked like an all-mounted result. Resetting the run alongside
  // the list keeps a stale figure from ever being read as a fresh one. Clear's OWN measurement
  // still lands (the post-commit hook runs after this commit and appends to the emptied history),
  // so the button that was just pressed does not read as "did nothing".
  const onClear = (): void => {
    if (list.rows.length === 0) return;
    measure(BENCH_OP.Clear, 'Clear', 0, () => {
      setList({ rows: [], selectedId: undefined });
      setHistory([]);
    });
  };

  /**
   * The whole ruler in one press, in a FIXED order, each timed operation starting from exactly
   * SUITE_ROWS rows.
   *
   * Pressing the buttons by hand does not measure what it looks like it measures. `Remove` and
   * `Append` cost scale with the rows currently on screen (a flat parent re-appends every child
   * handle on any structural change), so their numbers depend on which buttons were pressed
   * before them. Measured 2026-08-18, React Debug, same build twice: Remove 87-107 ms against
   * 418.6 ms, Append 953 against 1678 ms, while Create / Replace / Partial / Select / Swap
   * reproduced inside 1-3%. Two runs of the SAME adapter disagreed 4x — so a cross-ADAPTER
   * comparison off those rows was measuring press order, not the adapter.
   *
   * Hence: untimed setup steps in between, awaited through the same engine post-commit seam as
   * the timed ones, so each measurement begins from a state this function chose rather than one
   * the operator happened to leave behind.
   *
   * Runs in EITHER mount mode — the pressed button picks it. No 10,000-row step in either: 10,000
   * rows is 100,000 native views, which the host does not survive in all-mounted (see
   * NATIVE_VIEWS_PER_ROW), and a suite that hangs the screen measures nothing.
   */
  const runSuite = async (mode: IMountMode): Promise<void> => {
    resetRowData();

    const entries: ISuiteEntry[] = [];
    const clearRows = (): void => {
      setList({ rows: [], selectedId: undefined });
    };
    const fillRows = (): void => {
      setList({ rows: buildRows(SUITE_ROWS), selectedId: undefined });
    };

    // The suite's own UI is committed and PAINTED before any measured step starts. The engine
    // coalesces a commit onto a microtask, so setting the progress block and then immediately
    // mutating the list would put the spinner and the first (heaviest) step in one commit: the
    // operator presses the button and gets several hundred milliseconds of frozen screen with the
    // button still reading "Run". Awaiting a commit that carries only the progress block splits the
    // two.
    const showProgress = (label: string): Promise<number> =>
      runStep(() => setProgress({ mode, label, done: entries.length }));

    const timed = async (
      op: IBenchOpId,
      startRows: number,
      mutate: () => void,
    ): Promise<void> => {
      const label = suiteLabel(op);
      await showProgress(label);
      const durationMs = await runStep(mutate);
      // Read AFTER the measured step, never after showProgress: the holder carries whichever step
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
    // progress block appearing. It always changes the tree (the block goes from absent to present)
    // — which matters, because `commitContainer` returns early on a commit that produced no native
    // change (`if (!result.changed) return` sits ABOVE `runPostCommitHooks()` in
    // core/engine/src/commit.ts), so a no-op mutation never resolves its step and would stall the
    // suite until the timeout. Every step after this one changes the tree by construction: Create
    // runs from a guaranteed 0, each fill mints fresh ids and labels because the LCG has advanced,
    // and each clear runs against a non-empty list.
    await runStep(() => {
      setMountMode(mode);
      setSuiteResults(current => ({ ...current, [mode]: [] }));
      setHistory([]);
      setProgress({ mode, label: 'Preparing', done: 0 });
      clearRows();
    });

    await timed(BENCH_OP.Create, 0, fillRows);
    await timed(BENCH_OP.Replace, SUITE_ROWS, fillRows);
    await timed(BENCH_OP.Update, SUITE_ROWS, () => {
      setList(
        'rows',
        produce(rows => {
          for (let index = 0; index < rows.length; index += UPDATE_STRIDE) {
            rows[index].label += UPDATE_SUFFIX;
          }
        }),
      );
    });
    await timed(BENCH_OP.Select, SUITE_ROWS, () => {
      setList('selectedId', list.rows[SELECT_INDEX].id);
    });
    await timed(BENCH_OP.Swap, SUITE_ROWS, () => {
      setList(
        'rows',
        produce(rows => {
          const low = rows[SWAP_LOW_INDEX];
          rows[SWAP_LOW_INDEX] = rows[SWAP_HIGH_INDEX];
          rows[SWAP_HIGH_INDEX] = low;
        }),
      );
    });
    await timed(BENCH_OP.Remove, SUITE_ROWS, () => {
      setList('rows', rows =>
        rows.filter((_row, index) => index !== REMOVE_INDEX),
      );
    });

    await runStep(clearRows);
    await runStep(fillRows);
    await timed(BENCH_OP.Append, SUITE_ROWS, () => {
      setList('rows', rows => rows.concat(buildRows(SUITE_ROWS)));
    });

    await runStep(clearRows);
    await runStep(fillRows);
    await timed(BENCH_OP.Clear, SUITE_ROWS, clearRows);

    setSuiteResults(current => ({ ...current, [mode]: entries }));
    setProgress(undefined);
  };

  // The engine reads `__SYMBIOTE_BATCH_CREATE__` once per commit, not per node, so it has to be
  // set BEFORE the mutation that starts a step — which a press between runs always is. Deliberately
  // a global rather than a prop: nothing on the commit path should have to be threaded a flag.
  const onToggleBatchCreate = (): void => {
    setIsBatchingCreate(current => {
      const next = !current;
      Reflect.set(globalThis, '__SYMBIOTE_BATCH_CREATE__', next);
      return next;
    });
  };

  const onRunSuite = (mode: IMountMode): void => {
    if (isSuiteRunning()) return;
    // Claimed synchronously, before the first await: the guard above and every operation button's
    // guard read this same signal, so a second press in the same tick is already blocked.
    setProgress({ mode, label: 'Preparing', done: 0 });
    runSuite(mode).catch(() => {
      // A rejected step would otherwise leave the progress block up with no way back; whatever
      // entries were collected are dropped, because a partial suite is not a ruler.
      setProgress(undefined);
    });
  };

  const operations = (): readonly IBenchOperation[] => [
    { id: BENCH_OP.Create, label: 'Create 1,000 rows', onPress: onCreate },
    {
      id: BENCH_OP.Replace,
      label: 'Replace all 1,000 rows',
      onPress: onReplace,
    },
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

  const isAllMounted = (): boolean => mountMode() === MOUNT_MODE.All;

  // What the host is actually holding. In virtualized mode the list decides, so it is reported as
  // an approximation of the window rather than a count derived from rows.length.
  const mountedViews = createMemo(() =>
    isAllMounted()
      ? String(list.rows.length * NATIVE_VIEWS_PER_ROW)
      : `~1 window x ${NATIVE_VIEWS_PER_ROW}`,
  );

  const allDurations = createMemo(
    () =>
      new Map(
        suiteResults()[MOUNT_MODE.All].map(entry => [
          entry.op,
          entry.durationMs,
        ]),
      ),
  );
  const virtualizedDurations = createMemo(
    () =>
      new Map(
        suiteResults()[MOUNT_MODE.Virtualized].map(entry => [
          entry.op,
          entry.durationMs,
        ]),
      ),
  );
  const hasSuiteResults = createMemo(
    () => allDurations().size > 0 || virtualizedDurations().size > 0,
  );

  // All-mounted only: it is the cross-renderer column, and the virtualized one prices two
  // different list implementations rather than two renderers.
  const allProfiles = createMemo(
    () =>
      new Map(
        suiteResults()[MOUNT_MODE.All].map(entry => [entry.op, entry.profile]),
      ),
  );
  const allFabricProfiles = createMemo(
    () =>
      new Map(
        suiteResults()[MOUNT_MODE.All].map(entry => [entry.op, entry.fabric]),
      ),
  );

  // History is newest-first, so the first entry found for an operation is its latest run.
  const lastDurations = createMemo(() => {
    const latest = new Map<IBenchOpId, number>();
    for (const entry of history()) {
      if (!latest.has(entry.op)) latest.set(entry.op, entry.durationMs);
    }
    return latest;
  });

  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="benchmark-scroll"
        class="screen"
        contentContainerStyle="content"
      >
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" style={{ backgroundColor: accent }}>
            <Text class="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Benchmark</Text>
            <Text class="hero-body">
              The js-framework-benchmark operations, run on device against the
              engine's commit path — with the JS-thread frame rate beside them.
            </Text>
          </View>
        </View>

        <Text class="section-label">MEASUREMENTS</Text>
        <JsFrameRateMeter accent={accent} />

        {/* Buttons and results sit DIRECTLY under the meter, and everything they stress sits
          below: a suite step holds the JS thread, so the dip has to be readable in the same
          screenful as the press that caused it. */}
        <View class="bench-run-row">
          <View class="flex1">
            <ActionButton
              testID="bench-run-suite-all"
              title={
                progress()?.mode === MOUNT_MODE.All
                  ? 'Running…'
                  : 'Run · all mounted'
              }
              onPress={() => onRunSuite(MOUNT_MODE.All)}
              color={accent}
            />
          </View>
          <View class="flex1">
            <ActionButton
              testID="bench-run-suite-virtualized"
              title={
                progress()?.mode === MOUNT_MODE.Virtualized
                  ? 'Running…'
                  : 'Run · virtualized'
              }
              onPress={() => onRunSuite(MOUNT_MODE.Virtualized)}
              color={accent}
            />
          </View>
        </View>

        <View class="bench-run-row">
          <View class="flex1">
            <ActionButton
              testID="bench-toggle-batch-create"
              title={
                isBatchingCreate()
                  ? 'Batch create · on ✓'
                  : 'Batch create · off'
              }
              onPress={onToggleBatchCreate}
              color={accent}
            />
          </View>
        </View>
        <Text class="note-text">
          {`Temporary experiment switch. On, the engine hands a parent's children to cloneNodeWithChildren in one call instead of appending them one at a time — about a third fewer JSI calls on Create, paid for with one extra ShadowNode per batched parent. The sign is not predicted, which is why it is a runtime toggle: two builds a day apart drifted 4% on Create and 6x on Clear with no code change, so the only trustworthy comparison is back-to-back on one binary. Flip it, re-run the suite, compare.`}
        </Text>

        <Show when={progress()}>
          {(running: Accessor<ISuiteProgress>) => (
            <View testID="bench-suite-progress" class="bench-progress">
              <ActivityIndicator color={accent} />
              <Text class="bench-progress-text">
                {`${running().mode === MOUNT_MODE.All ? 'All mounted' : 'Virtualized'} · ${running().label}`}
              </Text>
              <Text class="bench-progress-count">
                {`${running().done}/${SUITE_STEPS.length}`}
              </Text>
            </View>
          )}
        </Show>

        <Show
          when={hasSuiteResults()}
          fallback={
            <Text testID="bench-suite-empty" class="note-text">
              No suite run yet.
            </Text>
          }
        >
          <View>
            <View class="bench-compare-row">
              <Text class="bench-compare-label" />
              <Text class="bench-compare-head-cell">ALL MOUNTED</Text>
              <Text class="bench-compare-head-cell">VIRTUALIZED</Text>
            </View>
            <For each={SUITE_STEPS}>
              {step => (
                <View
                  testID={`bench-suite-${step.op}`}
                  class="bench-compare-row"
                >
                  <Text class="bench-compare-label">{step.label}</Text>
                  <Text class="bench-compare-cell">
                    {formatDuration(allDurations().get(step.op))}
                  </Text>
                  <Text class="bench-compare-cell">
                    {formatDuration(virtualizedDurations().get(step.op))}
                  </Text>
                </View>
              )}
            </For>
          </View>
        </Show>

        <Show when={hasSuiteResults()}>
          <View>
            <Text class="section-label">ENGINE PER STEP · ALL MOUNTED</Text>
            <View class="bench-compare-row">
              <Text class="bench-compare-label" />
              <Text class="bench-compare-head-cell">VISITED</Text>
              <Text class="bench-compare-head-cell">WRITES/NOOP</Text>
              <Text class="bench-compare-head-cell">COMMITS</Text>
            </View>
            <For each={SUITE_STEPS}>
              {step => {
                // One lookup per change feeding three cells, instead of three lookups that would
                // each have to re-test for the missing-step case.
                const cells = createMemo(() => {
                  const profile = allProfiles().get(step.op);
                  if (profile === undefined) {
                    return { visited: '—', writes: '—', commits: '—' };
                  }
                  return {
                    visited: String(profile.nodesVisited),
                    writes: `${profile.propWrites}/${profile.propNoops}`,
                    commits: `${profile.commits} · ${profile.walkMs.toFixed(DURATION_DECIMALS)}ms`,
                  };
                });
                return (
                  <View
                    testID={`bench-engine-${step.op}`}
                    class="bench-compare-row"
                  >
                    <Text class="bench-compare-label">{step.label}</Text>
                    <Text class="bench-compare-cell">{cells().visited}</Text>
                    <Text class="bench-compare-cell">{cells().writes}</Text>
                    <Text class="bench-compare-cell">{cells().commits}</Text>
                  </View>
                );
              }}
            </For>
            <Text class="note-text">
              {`Captured around each timed step, with the frame meter held so its own read-and-reset cannot eat them. Every adapter builds the same ${SUITE_ROWS * NATIVE_VIEWS_PER_ROW + 1}-node tree for Create, so a VISITED or WRITES that differs between adapters is work this screen is generating — not a cost of the platform. COMMITS must read 1; anything higher means a foreign commit landed inside the window. The ms is the reconcile window and it CONTAINS the createNode/appendChild JSI calls, so compare it across adapters, never read it as engine JS.`}
            </Text>
          </View>
        </Show>

        <Show when={hasSuiteResults()}>
          <View>
            <Text class="section-label">FABRIC CALLS · ALL MOUNTED</Text>
            <View class="bench-compare-row">
              <Text class="bench-compare-label" />
              <Text class="bench-compare-head-cell">CREATE/APPEND/CLONE</Text>
              <Text class="bench-compare-head-cell">PROP KEYS</Text>
            </View>
            <For each={SUITE_STEPS}>
              {step => {
                // One lookup per change feeding both cells, matching the ENGINE table above.
                const cells = createMemo(() => {
                  const fabric = allFabricProfiles().get(step.op);
                  return {
                    calls: formatFabric(fabric),
                    propKeys:
                      fabric === undefined ? '—' : String(fabric.totalPropKeys),
                  };
                });
                return (
                  <View
                    testID={`bench-fabric-${step.op}`}
                    class="bench-compare-row"
                  >
                    <Text class="bench-compare-label">{step.label}</Text>
                    <Text class="bench-compare-cell">{cells().calls}</Text>
                    <Text class="bench-compare-cell">{cells().propKeys}</Text>
                  </View>
                );
              }}
            </For>
            <Text class="note-text">
              {`Counted by wrapping global.nativeFabricUIManager before the engine binds it — the one surface this canary and the stock-React-Native baseline (examples/bare-rn) genuinely share, and therefore the only like-for-like number between them. The ENGINE table above has no counterpart over there: stock has no reconcile walk to count. Read as two questions. CREATE/APPEND/CLONE answers "does one stack ask Fabric to do MORE"; PROP KEYS answers the other half, "or the same number of times with fatter payloads". The wrapper costs one JS call per crossing and is therefore in every timing on this screen — the comparison holds only because the other side carries the identical wrapper.`}
            </Text>
          </View>
        </Show>
        <Text class="note-text">
          {`Every operation in a fixed order, each timed step starting from exactly ${SUITE_ROWS} rows, with untimed resets in between. All-mounted is krausest's own shape (${NATIVE_VIEWS_PER_ROW} native views per row) and the column that compares to the published web numbers; virtualized mounts a window instead, so it prices what an app ships rather than the commit path itself. Pressing the operation buttons by hand leaves Remove and Append measuring whatever happened to be on screen.`}
        </Text>

        {/* Both sticky paths and the row list sit under the buttons: the meter above stays on
          screen while either box is being dragged — the concrete case the benchmark exists for. */}
        <StickyScrollViewBlock />
        <StickySectionListBlock />
        <Text class="note-text">
          Drag inside a box (not the page) and watch the counters above — the
          two boxes differ only in which sticky implementation carries the
          frame.
        </Text>

        <Text class="section-label">
          {isAllMounted() ? 'ROWS · ALL MOUNTED' : 'ROWS · VIRTUALIZED'}
        </Text>
        <Show
          when={isAllMounted()}
          fallback={
            <FlatList
              testID="bench-rows-virtualized"
              class="bench-rows-viewport"
              data={list.rows}
              keyExtractor={row => String(row.id)}
              getItemLayout={(_data, index) => ({
                length: BENCH_ROW_HEIGHT,
                offset: BENCH_ROW_HEIGHT * index,
                index,
              })}
              renderItem={info => (
                <BenchmarkRow
                  row={info().item}
                  isSelected={info().item.id === list.selectedId}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              )}
            />
          }
        >
          <For each={list.rows}>
            {row => (
              <BenchmarkRow
                row={row}
                isSelected={row.id === list.selectedId}
                onSelect={onSelect}
                onRemove={onRemove}
              />
            )}
          </For>
        </Show>

        {/* Below the fold on purpose: the single operations are for poking at one commit shape
          while debugging, not for reporting. Their Remove and Append numbers depend on press
          order, which is exactly what the suite above exists to remove. */}
        <Text class="section-label">OPERATIONS · LAST RUN</Text>
        <For each={operations()}>
          {operation => (
            <View class="bench-op-row">
              <View class="flex1">
                <ActionButton
                  testID={`bench-op-${operation.id}`}
                  title={operation.label}
                  onPress={operation.onPress}
                  color={accent}
                />
              </View>
              <Text
                testID={`bench-result-${operation.id}`}
                class="bench-op-result"
              >
                {formatDuration(lastDurations().get(operation.id))}
              </Text>
            </View>
          )}
        </For>

        <Text testID="bench-row-count" class="info-text">
          {`rows: ${list.rows.length} · ${mountedViews()} native views mounted · selected: ${list.selectedId ?? 'none'}`}
        </Text>

        <Text class="section-label">{`HISTORY · LAST ${HISTORY_LIMIT} MEASUREMENTS`}</Text>
        <Show
          when={history().length > 0}
          fallback={
            <Text class="note-text">
              Run an operation above to record a measurement.
            </Text>
          }
        >
          <For each={history()}>
            {entry => (
              <Text class="bench-history-row">
                {`${entry.label} — ${formatDuration(entry.durationMs)} · ${entry.rowCount} rows`}
              </Text>
            )}
          </For>
        </Show>
      </ScrollView>
    </SafeAreaView>
  );
}

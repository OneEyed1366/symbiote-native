import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FlatList, SectionList, type ISection } from '@symbiote-native/react';
import {
  readCommitProfile,
  registerPostCommit,
  unregisterPostCommit,
  type ICommitProfile,
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

// Word lists and row shape are taken verbatim from js-framework-benchmark (krausest) so the
// numbers here can be read next to the published Vue/Svelte/Solid ones. Its rules forbid
// hand-tuning the implementation for the benchmark, so everything below is the plain keyed-list
// React anyone would write: state in the component, one memoized row component, stable handlers.
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

// krausest's row counts are DOM-node counts, not ours: `BenchmarkRow` expands to NINE native
// views (1 View + 3x[Text + RawText] + 2 Pressable Views), so 10 000 rows is 90 000 UIViews - a
// ceiling the native host hits, not the engine, which is why the two mount modes below exist.

// What turns a row count into a view count on the readout. Nine views of row chrome plus the
// TextInput, which is one native view: renderTextInput emits a single element with no children
// (core/components/src/view/render-text-input.ts).
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

// Two sticky paths are on this screen on purpose (see the block components below): a plain
// ScrollView, and a SectionList. Same viewport height and same header look, so a difference
// between the two boxes isolates virtualization from stickiness itself.
const STICKY_SECTION_COUNT = 200;
const STICKY_ROWS_PER_SECTION = 3;
const SECTION_LIST_SECTION_COUNT = 16;
const SECTION_LIST_ROWS_PER_SECTION = 32;
const SECTION_LIST_ROW_HEIGHT = 30;
const SECTION_LIST_HEADER_HEIGHT = 28;
// Every section is flattened to a header row, its item rows, then a FOOTER row - emitted even
// with no renderSectionFooter, in which case it paints nothing and occupies no height. The
// getItemLayout arithmetic below has to account for that row existing in the index space.
const SECTION_LIST_FOOTER_HEIGHT = 0;
const SECTION_LIST_ENTRIES_PER_SECTION = 1 + SECTION_LIST_ROWS_PER_SECTION + 1;
const SECTION_LIST_SECTION_EXTENT =
  SECTION_LIST_HEADER_HEIGHT +
  SECTION_LIST_ROWS_PER_SECTION * SECTION_LIST_ROW_HEIGHT;

/**
 * The fixed-layout fast path for sticky path B. Without it the list learns a cell's extent only
 * after measuring it, so a fast drag outruns measurement and leaves the window blank for seconds -
 * observed on this very screen, scrolling past section 4.
 *
 * The index is FLAT over the whole stream (this is React Native's shape, not a section-relative
 * one), so it is decoded back into "which section, and what within it" here. Rows are uniform, so
 * a section always spans the same extent and the section's own offset is a multiplication.
 */
function sectionListItemLayout(
  _sections: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  const sectionIndex = Math.floor(index / SECTION_LIST_ENTRIES_PER_SECTION);
  const withinSection = index - sectionIndex * SECTION_LIST_ENTRIES_PER_SECTION;
  const sectionOffset = sectionIndex * SECTION_LIST_SECTION_EXTENT;
  if (withinSection === 0) {
    return { length: SECTION_LIST_HEADER_HEIGHT, offset: sectionOffset, index };
  }
  if (withinSection === SECTION_LIST_ENTRIES_PER_SECTION - 1) {
    // The zero-height footer sits exactly where the next section begins.
    return {
      length: SECTION_LIST_FOOTER_HEIGHT,
      offset: sectionOffset + SECTION_LIST_SECTION_EXTENT,
      index,
    };
  }
  return {
    length: SECTION_LIST_ROW_HEIGHT,
    offset:
      sectionOffset +
      SECTION_LIST_HEADER_HEIGHT +
      (withinSection - 1) * SECTION_LIST_ROW_HEIGHT,
    index,
  };
}

type IStickyListItem = {
  id: string;
  label: string;
};

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

type IBenchmarkRow = {
  id: number;
  label: string;
};

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
// Create 1 000, so a propWrites that differs between adapters on the SAME step is work the screen
// is generating, not a cost of the platform.
//
// Counts, and the two milliseconds that only a device can answer: what the single crossing costs
// end to end and how much of it is reading the buffer out of JS. Headless that read is ~4 ms of
// ~48; Hermes is a different JSI implementation and no fixture can price its array reads.
const EMPTY_STEP_PROFILE: ICommitProfile = {
  commits: 0,
  propWrites: 0,
  nodesCreated: 0,
  applyCalls: 0,
  applyMs: 0,
  decodeMs: 0,
};

const EMPTY_FABRIC_PROFILE: IFabricCallProfile = {
  calls: {},
  propKeys: {},
  createsByView: {},
  totalCalls: 0,
  totalPropKeys: 0,
};

// The one quantity this canary and `examples/bare-rn` (stock React Native on React's own Fabric
// renderer) can both report. The ENGINE table above counts what this adapter pushed at OUR engine,
// which stock has no counterpart for; `global.nativeFabricUIManager` is what both stacks drive, so
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

// What the totals above cannot answer once two arms disagree: WHICH view one of them never asks
// Fabric for. A row is ten native views by construction on both sides, so a createNode total of
// 9 001 against 10 000 is a missing node per row, and only a per-name tally says which.
function formatCreatesByView(profile: IFabricCallProfile | undefined): string {
  if (profile === undefined) return '—';
  const entries = Object.entries(profile.createsByView).sort(
    ([, left], [, right]) => right - left,
  );
  if (entries.length === 0) return 'none';
  return entries.map(([viewName, count]) => `${viewName} ${count}`).join(' · ');
}

// One row of the fixed-order suite. `startRows` is recorded rather than derived because it is the
// number the whole suite exists to pin down - a duration is meaningless without it.
type ISuiteEntry = {
  op: IBenchOpId;
  label: string;
  durationMs: number;
  /**
   * The same step stopped where the STOCK screen stops it, one React phase later.
   *
   * `durationMs` above stops in the engine's post-commit hook, which fires inside
   * `resetAfterCommit` — that is the only point every adapter shares, since Vue, Svelte and Angular
   * commit on a microtask and no React phase means anything to them. `examples/bare-rn` has no such
   * hook and stops in a `useLayoutEffect`, which React runs in `commitLayoutEffects`, AFTER
   * `resetAfterCommit`. The two are one phase apart, and its cost is not nothing on that side: its
   * row is built from RN's own `<Pressable>` and `<TextInput>`, which attach refs and run their own
   * layout work, where ours is tags with no React component at all.
   *
   * So the comparison against stock reads THIS column and the cross-adapter comparison reads the
   * one above. One number per definition of done, each compared only to its own counterpart.
   */
  settledMs: number;
  startRows: number;
  profile: ICommitProfile;
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
// operation then produces exactly one new object, which is what the stopwatch effect below keys
// off - a select that only touched a second useState would leave the clock running.
type IListState = {
  rows: readonly IBenchmarkRow[];
  selectedId: number | undefined;
};

// Row ids are globally unique and never reused, exactly as in the reference implementation -
// a reused key would let React match an old row to a new one and hide real reconciliation work.
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

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '—';
  if (!Number.isFinite(durationMs)) return 'timeout';
  return `${durationMs.toFixed(1)} ms`;
}

type IBenchmarkRowProps = {
  row: IBenchmarkRow;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
};

const BenchmarkRow = memo(function BenchmarkRowView({
  row,
  isSelected,
  onSelect,
  onRemove,
}: IBenchmarkRowProps) {
  return (
    <view className={isSelected ? 'bench-row bench-row-selected' : 'bench-row'}>
      <text className="bench-row-id">{String(row.id)}</text>
      <pressable className="flex1" onPress={() => onSelect(row.id)}>
        <text className="bench-row-label">{row.label}</text>
      </pressable>
      <pressable className="bench-row-remove" onPress={() => onRemove(row.id)}>
        <text className="bench-row-remove-text">×</text>
      </pressable>
      {/* LAST child, and deliberately bare: no `multiline` (it picks the other native view), no
        change handler and no ref — each adds work this row is not measuring. CONTROLLED rather than
        `defaultValue`, because the controlled write is the beat the engine-side machine exists for
        and an uncontrolled input would never run it. */}
      <text-input className="bench-row-input" value={row.label} />
    </view>
  );
});

/**
 * Sticky path A - a plain scroll-view with stickyHeaderIndices. Stickiness is computed in JS (the
 * engine wraps each flagged child and drives it off the scroll offset), but nothing else runs
 * per frame: every child is mounted up front, there is no windowing. Memoized with no props so a
 * benchmark run never re-renders it and never contaminates the numbers next to the buttons.
 */
const StickyScrollViewBlock = memo(function StickyScrollViewBlockView() {
  // stickyHeaderIndices addresses DIRECT children of the content container, so the sections are
  // flattened into one list: a header followed by its rows, repeating. Built once per mount -
  // rebuilding 800 elements on every render would add its own cost to what the meter reports.
  const children = useMemo(
    () =>
      Array.from({ length: STICKY_SECTION_COUNT }, (_value, section) => [
        <text key={`sticky-header-${section}`} className="section-header">
          {`SECTION ${section + 1}`}
        </text>,
        ...Array.from({ length: STICKY_ROWS_PER_SECTION }, (_rowValue, row) => (
          <text key={`sticky-row-${section}-${row}`} className="list-row-text">
            {`row ${section + 1}.${row + 1}`}
          </text>
        )),
      ]).flat(),
    [],
  );
  const headerIndices = useMemo(
    () =>
      Array.from(
        { length: STICKY_SECTION_COUNT },
        (_value, section) => section * (STICKY_ROWS_PER_SECTION + 1),
      ),
    [],
  );

  return (
    <>
      <text className="section-label">
        STICKY PATH A · scroll-view · stickyHeaderIndices
      </text>
      <scroll-view
        testID="benchmark-sticky-scroll"
        className="bench-sticky"
        stickyHeaderIndices={headerIndices}
        scrollEventThrottle={16}
        nestedScrollEnabled
      >
        {children}
      </scroll-view>
      <text className="note-text">
        {`${STICKY_SECTION_COUNT} sections, every row mounted — no virtualization in the frame.`}
      </text>
    </>
  );
});

/**
 * Sticky path B - SectionList with stickySectionHeadersEnabled, i.e. VirtualizedSectionList over
 * VirtualizedList. This is the path the frame-drop regression actually showed up on: each scroll
 * frame additionally runs the windowing pass (cell render, viewability) and the sticky math is
 * computed inside the list. Shaped after components/ParityDemo's sticky check, scaled up to 512
 * rows. If path A holds its frame rate and this one does not, the cost is virtualization rather
 * than stickiness.
 */
const StickySectionListBlock = memo(function StickySectionListBlockView() {
  return (
    <>
      <text className="section-label">
        STICKY PATH B · SectionList · stickySectionHeadersEnabled
      </text>
      <SectionList
        testID="benchmark-sticky-section-list"
        sections={BENCHMARK_SECTIONS}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled
        className="bench-sticky"
        scrollEventThrottle={16}
        getItemLayout={sectionListItemLayout}
        renderSectionHeader={({ section }) => (
          // Height is pinned inline rather than in the stylesheet because the number has to agree
          // with sectionListItemLayout's arithmetic; splitting it across two files is how that
          // pair silently drifts apart.
          <text
            className="section-header"
            style={{ height: SECTION_LIST_HEADER_HEIGHT }}
          >
            {section.title}
          </text>
        )}
        renderItem={({ item }) => (
          <view
            className="parity-row"
            style={{ height: SECTION_LIST_ROW_HEIGHT }}
          >
            <text className="list-row-text">{item.label}</text>
          </view>
        )}
      />
      <text className="note-text">
        {`${SECTION_LIST_SECTION_COUNT} sections x ${SECTION_LIST_ROWS_PER_SECTION} rows — windowed, sticky math inside the list.`}
      </text>
    </>
  );
});

/**
 * On-device twin of the js-framework-benchmark (krausest) suite: the same nine list operations
 * every framework there is scored on, run against @symbiote-native/engine's commit path on a
 * real device instead of in isolation. A micro-benchmark times pure JS; this screen times the
 * whole round trip - React reconcile, the engine's mutation -> clone-on-write translation, and
 * completeRoot - and puts a JS-thread frame counter next to it so a saved millisecond can be
 * checked against frames the user actually sees.
 */
export function BenchmarkScreen() {
  const [list, setList] = useState<IListState>({
    rows: [],
    selectedId: undefined,
  });
  const [mountMode, setMountMode] = useState<IMountMode>(MOUNT_MODE.All);
  const [history, setHistory] = useState<readonly IBenchResult[]>([]);
  const [suiteResults, setSuiteResults] =
    useState<ISuiteResults>(EMPTY_SUITE_RESULTS);
  const [progress, setProgress] = useState<ISuiteProgress | undefined>(
    undefined,
  );
  const isSuiteRunning = progress !== undefined;
  const { rows, selectedId } = list;
  const pendingRef = useRef<{
    startedAt: number;
    settle: (durationMs: number) => void;
  } | null>(null);
  const seqRef = useRef(0);
  // The second stopwatch — same start, stopped one React phase later. See `ISuiteEntry.settledMs`.
  const layoutStartedAtRef = useRef<number | undefined>(undefined);
  const lastSettledMsRef = useRef<number>(SUITE_TIMED_OUT);
  // Filled by the post-commit hook, read by `timed` right after its own `await runStep(mutate)`.
  // A ref rather than a resolved value so the change stays off every other runStep call site;
  // steps are serialized, and `timed` awaits the progress step BEFORE the measured one, so the
  // value standing here when it reads is always the measured step's.
  const lastStepProfileRef = useRef<ICommitProfile>(EMPTY_STEP_PROFILE);
  const lastFabricProfileRef = useRef<IFabricCallProfile>(EMPTY_FABRIC_PROFILE);
  // Read inside `measure`, so it has to be a ref rather than the state below: a press that landed
  // mid-suite would install its own pending record over the suite's, and the next commit would
  // stop the wrong stopwatch - silently attributing one operation's cost to another.
  const isSuiteRunningRef = useRef(false);
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Benchmark];
  const accent = LINE_COLOR.performance;

  // THE timing primitive - every number on this screen, button or suite, comes through here. The
  // clock starts here (state updates are asynchronous, so a performance.now() pair wrapped around
  // the mutation would time the scheduling call and nothing else) and stops in the post-commit
  // hook below, which resolves this promise. Awaiting it is what lets the suite drive one
  // operation at a time from a known state instead of racing its own steps.
  const runStep = useCallback((mutate: () => void): Promise<number> => {
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
        pendingRef.current = null;
        lastStepProfileRef.current = EMPTY_STEP_PROFILE;
        lastFabricProfileRef.current = EMPTY_FABRIC_PROFILE;
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
      const startedAt = performance.now();
      pendingRef.current = { startedAt, settle };
      layoutStartedAtRef.current = startedAt;
      mutate();
    });
  }, []);

  // `rowCount` is passed in rather than read back from state afterwards: this closes over the list
  // as it was when the button was pressed, and reading it later would report the post-mutation one.
  const measure = useCallback(
    (op: IBenchOpId, label: string, rowCount: number, mutate: () => void) => {
      if (isSuiteRunningRef.current) return;
      runStep(mutate).then(durationMs => {
        seqRef.current += 1;
        setHistory(previous =>
          [
            { seq: seqRef.current, op, label, durationMs, rowCount },
            ...previous,
          ].slice(0, HISTORY_LIMIT),
        );
      });
    },
    [runStep],
  );

  // Stopped by the ENGINE's post-commit hook, not by a React lifecycle hook, and that choice is
  // what makes this screen comparable across adapters at all. React's useLayoutEffect happens to
  // land after resetAfterCommit -> SymbioteSurface.commit() -> completeRoot, so it would be correct
  // here - but Vue, Svelte and Angular commit on a microtask, and each framework's own
  // after-render hook fires at a different point relative to the native commit. Four different
  // hooks would silently measure four different quantities and the comparison would be void.
  // registerPostCommit means one definition of "done" everywhere: completeRoot has returned.
  // Native layout and paint happen after that and are not in the number; the frame counter above
  // is what shows those.
  useEffect(() => {
    const onCommitted = (): void => {
      const pending = pendingRef.current;
      if (pending === null) return;
      pendingRef.current = null;
      const durationMs = performance.now() - pending.startedAt;
      // Safe to read here: the commit is recorded BEFORE completeRoot and runPostCommitHooks()
      // fires after it, so this step's numbers are already in the profile.
      lastStepProfileRef.current = readCommitProfile();
      lastFabricProfileRef.current = readFabricCallProfile();
      pending.settle(durationMs);
    };
    registerPostCommit(onCommitted);
    return () => unregisterPostCommit(onCommitted);
  }, []);

  // The SECOND stopwatch, and the one the stock screen's number is comparable to. React runs layout
  // effects in `commitLayoutEffects`, immediately after the `resetAfterCommit` where our engine's
  // post-commit hook fires — so this lands one phase later, exactly where `examples/bare-rn` stops
  // its own clock. No dependency array, for the reason that screen states: every measured mutation
  // is a setState on THIS component, so every step's commit runs this exactly once.
  //
  // It cannot resolve the step's promise — the post-commit hook already did, one phase ago — so it
  // leaves its reading in a ref that `timed` picks up. That ordering is safe rather than lucky: the
  // hook calls `resolve`, and a promise callback is a microtask, so it cannot run until the whole
  // synchronous commit (this effect included) has finished.
  useLayoutEffect(() => {
    const startedAt = layoutStartedAtRef.current;
    if (startedAt === undefined) return;
    layoutStartedAtRef.current = undefined;
    lastSettledMsRef.current = performance.now() - startedAt;
  });

  // The guards below keep an operation from recording a measurement of nothing - an empty list,
  // or an index krausest's fixed row numbers put past the end of a short one.
  const onSelect = useCallback(
    (id: number) => {
      measure(BENCH_OP.Select, 'Select row', rows.length, () => {
        setList(current => ({
          ...current,
          selectedId: current.selectedId === id ? undefined : id,
        }));
      });
    },
    // rows.length is only read to LABEL the measurement, never to compute the new state - the
    // updater below still works off `current`. Keeping it in deps is what the lint rule wants and
    // costs a new identity per row-count change, which is not in any measured path.
    [measure, rows.length],
  );

  const onRemove = useCallback(
    (id: number) => {
      measure(BENCH_OP.Remove, 'Remove row', rows.length - 1, () => {
        setList(current => ({
          ...current,
          rows: current.rows.filter(row => row.id !== id),
        }));
      });
    },
    [measure, rows.length],
  );

  const onCreate = () => {
    measure(BENCH_OP.Create, 'Create 1,000 rows', ROW_BATCH, () => {
      setList({ rows: buildRows(ROW_BATCH), selectedId: undefined });
    });
  };

  // Same call as Create - krausest scores them apart because the starting state differs: this one
  // swaps a full keyed list for another, the other one mounts into an empty container.
  const onReplace = () => {
    measure(BENCH_OP.Replace, 'Replace all 1,000 rows', ROW_BATCH, () => {
      setList({ rows: buildRows(ROW_BATCH), selectedId: undefined });
    });
  };

  const onCreateLots = () => {
    measure(BENCH_OP.CreateLots, 'Create 10,000 rows', ROW_BATCH_LARGE, () => {
      setList({ rows: buildRows(ROW_BATCH_LARGE), selectedId: undefined });
    });
  };

  const onAppend = () => {
    measure(
      BENCH_OP.Append,
      'Append 1,000 rows',
      rows.length + ROW_BATCH,
      () => {
        setList(current => ({
          ...current,
          rows: current.rows.concat(buildRows(ROW_BATCH)),
        }));
      },
    );
  };

  const onUpdate = () => {
    if (rows.length === 0) return;
    measure(BENCH_OP.Update, 'Partial update (every 10th)', rows.length, () => {
      setList(current => ({
        ...current,
        rows: current.rows.map((row, index) =>
          index % UPDATE_STRIDE === 0
            ? { ...row, label: row.label + UPDATE_SUFFIX }
            : row,
        ),
      }));
    });
  };

  const onSelectSample = () => {
    if (rows.length <= SELECT_INDEX) return;
    onSelect(rows[SELECT_INDEX].id);
  };

  const onRemoveSample = () => {
    if (rows.length <= REMOVE_INDEX) return;
    onRemove(rows[REMOVE_INDEX].id);
  };

  const onSwap = () => {
    if (rows.length <= SWAP_HIGH_INDEX) return;
    measure(BENCH_OP.Swap, 'Swap 2 rows', rows.length, () => {
      setList(current => {
        const next = current.rows.slice();
        const low = next[SWAP_LOW_INDEX];
        next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
        next[SWAP_HIGH_INDEX] = low;
        return { ...current, rows: next };
      });
    });
  };

  const isAllMounted = mountMode === MOUNT_MODE.All;

  // The whole ruler in one press, FIXED order, each timed op starting from exactly SUITE_ROWS
  // rows: Remove/Append cost scales with rows on screen (a flat parent re-appends every child
  // handle on structural change), so untimed setup steps run between the timed ones instead.

  // Runs in EITHER mount mode - the pressed button picks it. No 10 000-row step in either: 90 000
  // native views don't survive in all-mounted (see NATIVE_VIEWS_PER_ROW), and a hung screen
  // measures nothing.
  const runSuite = async (mode: IMountMode): Promise<void> => {
    isSuiteRunningRef.current = true;
    resetRowData();

    const entries: ISuiteEntry[] = [];
    const clearRows = (): void => {
      setList({ rows: [], selectedId: undefined });
    };
    const fillRows = (): void => {
      setList({ rows: buildRows(SUITE_ROWS), selectedId: undefined });
    };

    // The suite's own UI is committed and PAINTED before any measured step starts. React batches,
    // so setting a running flag and then immediately mutating the list puts the spinner and the
    // first (heaviest) step in one commit: the operator presses the button and gets several
    // hundred milliseconds of frozen screen with the button still reading "Run". Awaiting a commit
    // that carries only the progress block splits the two.
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
      // Read AFTER the measured step, never after showProgress: the ref holds whichever step
      // committed last, and the progress step commits first by construction.
      entries.push({
        op,
        label,
        durationMs,
        settledMs: lastSettledMsRef.current,
        startRows,
        profile: lastStepProfileRef.current,
        fabric: lastFabricProfileRef.current,
      });
    };

    // One commit for the whole prologue: the mode this run measures, an emptied list, and the
    // progress block appearing. It always changes the tree (the block goes from absent to present)
    // - which matters, because `commitContainer` returns early on a commit that produced no native
    // change (`if (!result.changed) return` sits ABOVE `runPostCommitHooks()` in
    // core/engine/src/commit.ts), so a no-op mutation never resolves its step and would stall the
    // suite until the timeout. Every step after this one changes the tree by construction.
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
      setList(current => ({
        ...current,
        rows: current.rows.map((row, index) =>
          index % UPDATE_STRIDE === 0
            ? { ...row, label: row.label + UPDATE_SUFFIX }
            : row,
        ),
      }));
    });
    await timed(BENCH_OP.Select, SUITE_ROWS, () => {
      setList(current => ({
        ...current,
        selectedId: current.rows[SELECT_INDEX].id,
      }));
    });
    await timed(BENCH_OP.Swap, SUITE_ROWS, () => {
      setList(current => {
        const next = current.rows.slice();
        const low = next[SWAP_LOW_INDEX];
        next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
        next[SWAP_HIGH_INDEX] = low;
        return { ...current, rows: next };
      });
    });
    await timed(BENCH_OP.Remove, SUITE_ROWS, () => {
      setList(current => ({
        ...current,
        rows: current.rows.filter((_row, index) => index !== REMOVE_INDEX),
      }));
    });

    await runStep(clearRows);
    await runStep(fillRows);
    await timed(BENCH_OP.Append, SUITE_ROWS, () => {
      setList(current => ({
        ...current,
        rows: current.rows.concat(buildRows(SUITE_ROWS)),
      }));
    });

    await runStep(clearRows);
    await runStep(fillRows);
    await timed(BENCH_OP.Clear, SUITE_ROWS, clearRows);

    setSuiteResults(current => ({ ...current, [mode]: entries }));
    setProgress(undefined);
    isSuiteRunningRef.current = false;
  };

  const onRunSuite = (mode: IMountMode): void => {
    if (isSuiteRunning) return;
    runSuite(mode).catch(() => {
      // A rejected step would otherwise leave the progress block up with no way back; whatever
      // entries were collected are dropped, because a partial suite is not a ruler.
      isSuiteRunningRef.current = false;
      setProgress(undefined);
    });
  };

  // Clear wipes the recorded measurements too, not just the rows. A duration stays pinned next to
  // its button until that operation runs again, so a number measured under one set of conditions
  // reads as current under another - a Create 10,000 timed in virtualized mode sat next to the
  // button in all-mounted mode and looked like an all-mounted result. Resetting the run alongside
  // the list keeps a stale figure from ever being read as a fresh one. Clear's OWN measurement
  // still lands (the layout effect runs after this commit and appends to the emptied history), so
  // the button that was just pressed does not read as "did nothing".
  const onClear = () => {
    if (rows.length === 0) return;
    measure(BENCH_OP.Clear, 'Clear', 0, () => {
      setList({ rows: [], selectedId: undefined });
      setHistory([]);
    });
  };

  const operations: readonly IBenchOperation[] = [
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

  // What the host is actually holding. In virtualized mode the list decides, so it is reported as
  // an approximation of the window rather than a count derived from rows.length.
  const mountedViews = isAllMounted
    ? String(rows.length * NATIVE_VIEWS_PER_ROW)
    : `~1 window x ${NATIVE_VIEWS_PER_ROW}`;

  const allDurations = new Map(
    suiteResults[MOUNT_MODE.All].map(entry => [entry.op, entry.durationMs]),
  );
  // The all-mounted run stopped one React phase later — the column `examples/bare-rn`'s number is
  // comparable to. See `ISuiteEntry.settledMs`.
  const settledDurations = new Map(
    suiteResults[MOUNT_MODE.All].map(entry => [entry.op, entry.settledMs]),
  );
  const virtualizedDurations = new Map(
    suiteResults[MOUNT_MODE.Virtualized].map(entry => [
      entry.op,
      entry.durationMs,
    ]),
  );
  const hasSuiteResults =
    allDurations.size > 0 || virtualizedDurations.size > 0;

  // All-mounted only: it is the cross-renderer column, and the virtualized one prices two
  // different list implementations rather than two renderers.
  const allProfiles = new Map(
    suiteResults[MOUNT_MODE.All].map(entry => [entry.op, entry.profile]),
  );
  const allFabricProfiles = new Map(
    suiteResults[MOUNT_MODE.All].map(entry => [entry.op, entry.fabric]),
  );

  // History is newest-first, so the first entry found for an operation is its latest run.
  const lastDurations = new Map<IBenchOpId, number>();
  for (const entry of history) {
    if (!lastDurations.has(entry.op))
      lastDurations.set(entry.op, entry.durationMs);
  }

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="benchmark-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: accent }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Benchmark</text>
            <text className="hero-body">
              The js-framework-benchmark operations, run on device against the
              engine's commit path — with the JS-thread frame rate beside them.
            </text>
          </view>
        </view>

        <text className="section-label">MEASUREMENTS</text>
        <JsFrameRateMeter accent={accent} />

        {/* Buttons and results sit DIRECTLY under the meter, and everything they stress sits
          below: a suite step holds the JS thread, so the dip has to be readable in the same
          screenful as the press that caused it. */}
        <view className="bench-run-row">
          <view className="flex1">
            <ActionButton
              testID="bench-run-suite-all"
              title={
                progress?.mode === MOUNT_MODE.All
                  ? 'Running…'
                  : 'Run · all mounted'
              }
              onPress={() => onRunSuite(MOUNT_MODE.All)}
              color={accent}
            />
          </view>
          <view className="flex1">
            <ActionButton
              testID="bench-run-suite-virtualized"
              title={
                progress?.mode === MOUNT_MODE.Virtualized
                  ? 'Running…'
                  : 'Run · virtualized'
              }
              onPress={() => onRunSuite(MOUNT_MODE.Virtualized)}
              color={accent}
            />
          </view>
        </view>

        {progress !== undefined && (
          <view testID="bench-suite-progress" className="bench-progress">
            <activity-indicator color={accent} />
            <text className="bench-progress-text">
              {`${progress.mode === MOUNT_MODE.All ? 'All mounted' : 'Virtualized'} · ${progress.label}`}
            </text>
            <text className="bench-progress-count">
              {`${progress.done}/${SUITE_STEPS.length}`}
            </text>
          </view>
        )}

        {hasSuiteResults ? (
          <view>
            <view className="bench-compare-row">
              <text className="bench-compare-label" />
              <text className="bench-compare-head-cell">ALL MOUNTED</text>
              <text className="bench-compare-head-cell">VS STOCK</text>
              <text className="bench-compare-head-cell">VIRTUALIZED</text>
            </view>
            {SUITE_STEPS.map(step => (
              <view
                key={step.op}
                testID={`bench-suite-${step.op}`}
                className="bench-compare-row"
              >
                <text className="bench-compare-label">{step.label}</text>
                <text className="bench-compare-cell">
                  {formatDuration(allDurations.get(step.op))}
                </text>
                <text className="bench-compare-cell">
                  {formatDuration(settledDurations.get(step.op))}
                </text>
                <text className="bench-compare-cell">
                  {formatDuration(virtualizedDurations.get(step.op))}
                </text>
              </view>
            ))}
          </view>
        ) : (
          <text testID="bench-suite-empty" className="note-text">
            No suite run yet.
          </text>
        )}

        {hasSuiteResults && (
          <view>
            <text className="section-label">ENGINE PER STEP · ALL MOUNTED</text>
            <view className="bench-compare-row">
              <text className="bench-compare-label" />
              <text className="bench-compare-head-cell">WRITES</text>
              <text className="bench-compare-head-cell">COMMITS</text>
              <text className="bench-compare-head-cell">NODES</text>
              <text className="bench-compare-head-cell">CROSSINGS</text>
              <text className="bench-compare-head-cell">APPLY</text>
              <text className="bench-compare-head-cell">DECODE</text>
            </view>
            {SUITE_STEPS.map(step => {
              const profile = allProfiles.get(step.op);
              return (
                <view
                  key={`engine-${step.op}`}
                  testID={`bench-engine-${step.op}`}
                  className="bench-compare-row"
                >
                  <text className="bench-compare-label">{step.label}</text>
                  <text className="bench-compare-cell">
                    {profile === undefined ? '—' : String(profile.propWrites)}
                  </text>
                  <text className="bench-compare-cell">
                    {profile === undefined ? '—' : String(profile.commits)}
                  </text>
                  <text className="bench-compare-cell">
                    {profile === undefined ? '—' : String(profile.nodesCreated)}
                  </text>
                  <text className="bench-compare-cell">
                    {profile === undefined ? '—' : String(profile.applyCalls)}
                  </text>
                  <text className="bench-compare-cell">
                    {profile === undefined ? '—' : profile.applyMs.toFixed(1)}
                  </text>
                  <text className="bench-compare-cell">
                    {profile === undefined ? '—' : profile.decodeMs.toFixed(1)}
                  </text>
                </view>
              );
            })}
            <text className="note-text">
              {`Captured around each timed step, with the frame meter held so its own read-and-reset cannot eat them. NODES counts the fresh Fabric families this step minted, read from the engine's own C++ walk — the census, and the number to check BEFORE any millisecond: a Create that is not ${SUITE_ROWS * NATIVE_VIEWS_PER_ROW} here is not the workload this screen claims, whatever the constant above says. It is also what the stock baseline counts by wrapping createNode, which makes the two comparable; the FABRIC CALLS table below cannot do that any more, because our creates are issued from C++ and never pass through the JS binding it wraps. WRITES prices the layer above: prop writes this screen pushed at the engine, so a WRITES that differs between adapters is work the screen is generating, not a cost of the platform. COMMITS must read 1; anything higher means a foreign commit landed inside the window. CROSSINGS is how many times the buffer was applied into C++, and it must not scale with the tree: a create reads 2 headless, asserted in commit-profile-census.itest.ts. A read of the tree is a batch boundary, so anything navigating what it is inserting turns one crossing into one per mutation — at 1.5-4.4 us of prologue each, ten thousand of those is tens of milliseconds that NODES and WRITES both read as perfectly normal. APPLY and DECODE are the two numbers this screen exists to take, because a fixture cannot: APPLY is the whole crossing in C++ and DECODE is the part of it that reads the buffer out of JS through JSI. Our crossing is ONE call carrying a 12 000-entry array that C++ walks element by element; stock's is ten thousand calls carrying scalars. On the harness's JavaScriptCore that walk is ~4 ms of a ~48 ms APPLY. Hermes is a different JSI implementation and nothing headless can price its array reads. READ THE SHARE, NOT THE MILLISECOND: a phone is slower at everything, so DECODE growing in absolute terms proves nothing. On JavaScriptCore DECODE is 8% of APPLY — 4.0 ms of 49.0 on a thousand-row Create, 571 ns per decoded node. If that share holds here, the single crossing is innocent whatever the clock says; if DECODE has become a third of APPLY, reading the buffer element by element through JSI is most of what this device costs us over stock.`}
            </text>
          </view>
        )}

        {hasSuiteResults && (
          <view>
            <text className="section-label">FABRIC CALLS · ALL MOUNTED</text>
            <view className="bench-compare-row">
              <text className="bench-compare-label" />
              <text className="bench-compare-head-cell">
                CREATE/APPEND/CLONE
              </text>
              <text className="bench-compare-head-cell">PROP KEYS</text>
            </view>
            {SUITE_STEPS.map(step => {
              const fabric = allFabricProfiles.get(step.op);
              return (
                <view
                  key={`fabric-${step.op}`}
                  testID={`bench-fabric-${step.op}`}
                  className="bench-compare-row"
                >
                  <text className="bench-compare-label">{step.label}</text>
                  <text className="bench-compare-cell">
                    {formatFabric(fabric)}
                  </text>
                  <text className="bench-compare-cell">
                    {fabric === undefined ? '—' : String(fabric.totalPropKeys)}
                  </text>
                </view>
              );
            })}
            <text className="section-label">CREATE 1 000 · BY VIEW NAME</text>
            <text
              testID="bench-fabric-creates-by-view"
              className="bench-compare-cell"
            >
              {formatCreatesByView(allFabricProfiles.get(BENCH_OP.Create))}
            </text>
            <text className="note-text">
              {`Counted by wrapping global.nativeFabricUIManager before the engine binds it — the one surface this canary and the stock-React-Native baseline (examples/bare-rn) genuinely share, and therefore the only like-for-like number between them. The ENGINE table above has no counterpart over there: stock has no command buffer to count. Read as two questions. CREATE/APPEND/CLONE answers "does one stack ask Fabric to do MORE"; PROP KEYS answers the other half, "or the same number of times with fatter payloads". The wrapper costs one JS call per crossing and is therefore in every timing on this screen — the comparison holds only because the other side carries the identical wrapper.`}
            </text>
          </view>
        )}
        <text className="note-text">
          {`Every operation in a fixed order, each timed step starting from exactly ${SUITE_ROWS} rows, with untimed resets in between. All-mounted is krausest's own shape (${NATIVE_VIEWS_PER_ROW} native views per row) and the column that compares to the published web numbers; virtualized mounts a window instead, so it prices what an app ships rather than the commit path itself. Pressing the operation buttons by hand leaves Remove and Append measuring whatever happened to be on screen.`}
        </text>

        {/* Both sticky paths and the row list sit under the buttons: the meter above stays on
          screen while either box is being dragged — the concrete case the benchmark exists for. */}
        <StickyScrollViewBlock />
        <StickySectionListBlock />
        <text className="note-text">
          Drag inside a box (not the page) and watch the counters above — the
          two boxes differ only in which sticky implementation carries the
          frame.
        </text>

        {/* Kept above the rows: with a thousand rows mounted, "below the fold" is unreachable
          by scroll — exactly the state you're in when you want to poke at one commit shape. */}
        <text className="section-label">OPERATIONS · LAST RUN</text>
        {operations.map(operation => (
          <view key={operation.id} className="bench-op-row">
            <view className="flex1">
              <ActionButton
                testID={`bench-op-${operation.id}`}
                title={operation.label}
                onPress={operation.onPress}
                color={accent}
              />
            </view>
            <text
              testID={`bench-result-${operation.id}`}
              className="bench-op-result"
            >
              {formatDuration(lastDurations.get(operation.id))}
            </text>
          </view>
        ))}
        <text className="note-text">
          Single operations, for poking at one commit shape while debugging. Do
          NOT report from them — Remove and Append act on whatever row count is
          on screen, which is what the suite above removes.
        </text>

        <text testID="bench-row-count" className="info-text">
          {`rows: ${rows.length} · ${mountedViews} native views mounted · selected: ${selectedId ?? 'none'}`}
        </text>

        <text className="section-label">
          {isAllMounted ? 'ROWS · ALL MOUNTED' : 'ROWS · VIRTUALIZED'}
        </text>
        {isAllMounted ? (
          rows.map(row => (
            <BenchmarkRow
              key={row.id}
              row={row}
              isSelected={row.id === selectedId}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))
        ) : (
          <FlatList
            testID="bench-rows-virtualized"
            className="bench-rows-viewport"
            data={rows}
            keyExtractor={row => String(row.id)}
            getItemLayout={(_data, index) => ({
              length: BENCH_ROW_HEIGHT,
              offset: BENCH_ROW_HEIGHT * index,
              index,
            })}
            renderItem={({ item }) => (
              <BenchmarkRow
                row={item}
                isSelected={item.id === selectedId}
                onSelect={onSelect}
                onRemove={onRemove}
              />
            )}
          />
        )}

        <text className="section-label">{`HISTORY · LAST ${HISTORY_LIMIT} MEASUREMENTS`}</text>
        {history.length === 0 ? (
          <text className="note-text">
            Run an operation above to record a measurement.
          </text>
        ) : (
          history.map(entry => (
            <text key={entry.seq} className="bench-history-row">
              {`${entry.label} — ${formatDuration(entry.durationMs)} · ${entry.rowCount} rows`}
            </text>
          ))
        )}
      </scroll-view>
    </safe-area-view>
  );
}

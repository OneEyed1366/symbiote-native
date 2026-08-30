import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  readFabricCallProfile,
  type IFabricCallProfile,
} from '../fabric-call-counter';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { JsFrameRateMeter } from '../components/JsFrameRateMeter';

// React Native installs `performance` on the global scope but does not declare it in its
// TypeScript globals (src/types/globals.d.ts stops at request/cancelAnimationFrame).
declare const performance: { now: () => number };

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

// The number that decides whether a row COUNT is even feasible here, and the one krausest cannot
// tell us: its counts are DOM-node counts. `BenchmarkRow` below expands to NINE native views
// (1 View + 3x[Text + RawText] + 2 Pressable Views), so 10 000 rows mounted at once is 90 000
// UIViews. Measured 2026-08-18 on the iOS 26.5 simulator, that never completed: RAM climbed
// 2.1 -> 2.8 GB and the JS thread sat at 0 fps. 1 000 rows (9 000 views) completes in ~880 ms.
// That ceiling is the native host's, not the renderer's - which is exactly why the two mount
// modes below exist, so the claim can be measured instead of asserted.
const NATIVE_VIEWS_PER_ROW = 9;
// Fixed so getItemLayout is exact in virtualized mode and both modes lay rows out identically.
const BENCH_ROW_HEIGHT = 44;

// Amber, matching the Performance accent the Symbiote canaries give this screen, so a screenshot
// of the two sits next to each other without a palette difference reading as a rendering one.
const ACCENT_COLOR = '#f5a524';

// How the row list reaches the screen. Same rows, same operations, same measurement - only the
// number of rows SIMULTANEOUSLY MOUNTED differs, which isolates "the commit path is slow" from
// "no host can hold this many native views".
const MOUNT_MODE = {
  // krausest's own shape: every row mounted, no windowing. Measures the commit path directly,
  // and is the only mode whose numbers are comparable to the published web ones.
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

// The section shape SectionList is given: its own `title` plus the `data` every section carries.
type IStickySection = {
  title: string;
  data: readonly IStickyListItem[];
};

// Every section is far taller than the 320px viewport, so headers genuinely cross-talk while
// scrolling instead of each one appearing and leaving on its own.
const BENCHMARK_SECTIONS: IStickySection[] = Array.from(
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

// One row of the fixed-order suite. `startRows` is recorded rather than derived because it is the
// number the whole suite exists to pin down - a duration is meaningless without it.
type ISuiteEntry = {
  op: IBenchOpId;
  label: string;
  durationMs: number;
  startRows: number;
  fabric: IFabricCallProfile;
};

const EMPTY_FABRIC_PROFILE: IFabricCallProfile = {
  calls: {},
  propKeys: {},
  totalCalls: 0,
  totalPropKeys: 0,
};

// The one quantity this baseline and the SymbioteNative canaries can both report. Their engine
// counts its own reconcile walk, which stock has no equivalent of; `global.nativeFabricUIManager`
// is what both stacks actually drive, so counting calls there is the only like-for-like number.
// Read as two questions: does one stack ask Fabric to do MORE, or the same amount with fatter
// payloads.
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
  const step = SUITE_STEPS.find(entry => entry.op === op);
  return step === undefined ? op : step.label;
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
// other is how "the renderer is slow" gets claimed off a number that measured 9,000 native views.
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
// difference between stock React Native and React and Vue and Svelte and Angular can be read as a
// difference in the renderer. Random labels vary in length, length changes text measurement, and
// the noise lands in exactly the numbers being compared. A tiny LCG with a fixed seed makes every
// build produce the byte-identical row list. (krausest forbids tuning the IMPLEMENTATION for the
// benchmark; pinning the data generator's seed is not that.)
const RANDOM_SEED = 1;
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
const LCG_MODULUS = 2 ** 32;
let randomState = RANDOM_SEED;

// Both generators are module state, so they drift with every button pressed before a run. Two
// suite runs are only byte-identical - to each other and across renderers - if both are rewound
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
    <View style={isSelected ? selectedBenchRowStyle : styles.benchRow}>
      <Text style={styles.benchRowId}>{String(row.id)}</Text>
      <Pressable style={styles.flex1} onPress={() => onSelect(row.id)}>
        <Text style={styles.benchRowLabel}>{row.label}</Text>
      </Pressable>
      <Pressable style={styles.benchRowRemove} onPress={() => onRemove(row.id)}>
        <Text style={styles.benchRowRemoveText}>×</Text>
      </Pressable>
    </View>
  );
});

/**
 * Sticky path A - a plain ScrollView with stickyHeaderIndices. Every child is mounted up front,
 * there is no windowing, so nothing runs per frame besides the sticky transform itself. Memoized
 * with no props so a benchmark run never re-renders it and never contaminates the numbers next to
 * the buttons.
 */
const StickyScrollViewBlock = memo(function StickyScrollViewBlockView() {
  // stickyHeaderIndices addresses DIRECT children of the content container, so the sections are
  // flattened into one list: a header followed by its rows, repeating. Built once per mount -
  // rebuilding 800 elements on every render would add its own cost to what the meter reports.
  const children = useMemo(
    () =>
      Array.from({ length: STICKY_SECTION_COUNT }, (_value, section) => [
        <Text key={`sticky-header-${section}`} style={styles.sectionHeader}>
          {`SECTION ${section + 1}`}
        </Text>,
        ...Array.from({ length: STICKY_ROWS_PER_SECTION }, (_rowValue, row) => (
          <Text key={`sticky-row-${section}-${row}`} style={styles.listRowText}>
            {`row ${section + 1}.${row + 1}`}
          </Text>
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
      <Text style={styles.sectionLabel}>
        STICKY PATH A · ScrollView · stickyHeaderIndices
      </Text>
      <ScrollView
        testID="benchmark-sticky-scroll"
        style={styles.benchSticky}
        stickyHeaderIndices={headerIndices}
        scrollEventThrottle={16}
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
      <Text style={styles.noteText}>
        {`${STICKY_SECTION_COUNT} sections, every row mounted — no virtualization in the frame.`}
      </Text>
    </>
  );
});

/**
 * Sticky path B - SectionList with stickySectionHeadersEnabled, i.e. VirtualizedSectionList over
 * VirtualizedList. Each scroll frame additionally runs the windowing pass (cell render,
 * viewability) and the sticky math is computed inside the list. If path A holds its frame rate
 * and this one does not, the cost is virtualization rather than stickiness.
 */
const StickySectionListBlock = memo(function StickySectionListBlockView() {
  return (
    <>
      <Text style={styles.sectionLabel}>
        STICKY PATH B · SectionList · stickySectionHeadersEnabled
      </Text>
      <SectionList<IStickyListItem, IStickySection>
        testID="benchmark-sticky-section-list"
        sections={BENCHMARK_SECTIONS}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled
        style={styles.benchSticky}
        scrollEventThrottle={16}
        getItemLayout={sectionListItemLayout}
        renderSectionHeader={({ section }) => (
          // Height is pinned inline rather than in the stylesheet because the number has to agree
          // with sectionListItemLayout's arithmetic; splitting it across two files is how that
          // pair silently drifts apart.
          <Text
            style={[
              styles.sectionHeader,
              { height: SECTION_LIST_HEADER_HEIGHT },
            ]}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <View style={[styles.parityRow, { height: SECTION_LIST_ROW_HEIGHT }]}>
            <Text style={styles.listRowText}>{item.label}</Text>
          </View>
        )}
      />
      <Text style={styles.noteText}>
        {`${SECTION_LIST_SECTION_COUNT} sections x ${SECTION_LIST_ROWS_PER_SECTION} rows — windowed, sticky math inside the list.`}
      </Text>
    </>
  );
});

/**
 * On-device twin of the js-framework-benchmark (krausest) suite: the same nine list operations
 * every framework there is scored on, run against STOCK React Native - React's own Fabric
 * renderer, no SymbioteNative in the path - on a real device instead of in isolation. This is the
 * baseline the adapter numbers are read against, so every operation, row count, index and timing
 * method is identical to the canaries'.
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
  // Read inside `measure`, so it has to be a ref rather than the state below: a press that landed
  // mid-suite would install its own pending record over the suite's, and the next commit would
  // stop the wrong stopwatch - silently attributing one operation's cost to another.
  const isSuiteRunningRef = useRef(false);
  // Filled by the layout effect, read by `timed` right after its own `await runStep(mutate)`.
  // Steps are serialized and `timed` awaits the progress step BEFORE the measured one, so the
  // value standing here when it reads is always the measured step's.
  const lastFabricProfileRef = useRef<IFabricCallProfile>(EMPTY_FABRIC_PROFILE);

  // THE timing primitive - every number on this screen, button or suite, comes through here. The
  // clock starts here (state updates are asynchronous, so a performance.now() pair wrapped around
  // the mutation would time the scheduling call and nothing else) and stops in the layout effect
  // below, which resolves this promise. Awaiting it is what lets the suite drive one operation at
  // a time from a known state instead of racing its own steps.
  const runStep = useCallback((mutate: () => void): Promise<number> => {
    return new Promise<number>(resolve => {
      let isSettled = false;
      const settle = (durationMs: number): void => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        resolve(durationMs);
      };
      const timer = setTimeout(() => {
        // Drop the pending record too: leaving it would make the NEXT step's commit stop this
        // step's stopwatch and report a duration against the wrong operation.
        pendingRef.current = null;
        settle(SUITE_TIMED_OUT);
      }, SUITE_STEP_TIMEOUT_MS);

      // Zero the Fabric call counters last, immediately before the mutation, so nothing between
      // here and the commit lands in this step's tally. No install retry here — the counting view
      // has to be in place while React's renderer module evaluates, which index.js already did and
      // nothing can redo; an all-zero FABRIC CALLS table means that install did not land.
      readFabricCallProfile();
      pendingRef.current = { startedAt: performance.now(), settle };
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

  // Stopped in a LAYOUT effect, and that choice is what keeps this screen comparable to the
  // Symbiote canaries, which stop the clock in the engine's post-commit hook. React runs
  // `resetAfterCommit` - the host call that ends in Fabric's `completeRoot` - immediately before
  // `commitLayoutEffects` (ReactFiberWorkLoop.commitRootImpl), so by the time this fires the tree
  // is committed and the definition of "done" is the same one: completeRoot has returned. Native
  // layout and paint happen after that and are not in the number; the frame counter above is what
  // shows those. `useEffect` would be wrong - passive effects are flushed later, on a scheduler
  // callback, and would fold that delay into every measurement.
  //
  // No dependency array on purpose: every measured mutation is a setState on THIS component, so
  // every step's commit runs this exactly once.
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    const durationMs = performance.now() - pending.startedAt;
    lastFabricProfileRef.current = readFabricCallProfile();
    pending.settle(durationMs);
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

  /**
   * The whole ruler in one press, in a FIXED order, each timed operation starting from exactly
   * SUITE_ROWS rows.
   *
   * Pressing the buttons by hand does not measure what it looks like it measures. `Remove` and
   * `Append` cost scale with the rows currently on screen (a flat parent re-appends every child
   * handle on any structural change), so their numbers depend on which buttons were pressed
   * before them. Measured 2026-08-18, React Debug, same build twice: Remove 87-107 ms against
   * 418.6 ms, Append 953 against 1678 ms, while Create / Replace / Partial / Select / Swap
   * reproduced inside 1-3%. Two runs of the SAME build disagreed 4x - so a comparison off those
   * rows was measuring press order, not the renderer.
   *
   * Hence: untimed setup steps in between, awaited through the same commit seam as the timed
   * ones, so each measurement begins from a state this function chose rather than one the
   * operator happened to leave behind.
   *
   * Runs in EITHER mount mode - the pressed button picks it. No 10,000-row step in either: 10,000
   * rows is 90,000 native views, which the host does not survive in all-mounted (see
   * NATIVE_VIEWS_PER_ROW), and a suite that hangs the screen measures nothing.
   */
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
        startRows,
        fabric: lastFabricProfileRef.current,
      });
    };

    // One commit for the whole prologue: the mode this run measures, an emptied list, and the
    // progress block appearing. Every mutation in this suite produces a NEW state object, so
    // React can never bail out of the re-render and leave a step waiting on a commit that does
    // not come - a step whose setState passed an identical value would stall until the timeout.
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
    <SafeAreaView style={styles.screen}>
      <ScrollView
        testID="benchmark-scroll"
        style={styles.screen}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroCard}>
          <View style={[styles.heroBadge, { backgroundColor: ACCENT_COLOR }]}>
            <Text style={styles.heroBadgeText}>BM</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Benchmark</Text>
            <Text style={styles.heroBody}>
              The js-framework-benchmark operations, run on device against stock
              React Native's own renderer — with the JS-thread frame rate beside
              them.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>MEASUREMENTS</Text>
        <JsFrameRateMeter accent={ACCENT_COLOR} />

        {/* Buttons and results sit DIRECTLY under the meter, and everything they stress sits
          below: a suite step holds the JS thread, so the dip has to be readable in the same
          screenful as the press that caused it. */}
        <View style={styles.benchRunRow}>
          <View style={styles.flex1}>
            <ActionButton
              testID="bench-run-suite-all"
              title={
                progress?.mode === MOUNT_MODE.All
                  ? 'Running…'
                  : 'Run · all mounted'
              }
              onPress={() => onRunSuite(MOUNT_MODE.All)}
              color={ACCENT_COLOR}
            />
          </View>
          <View style={styles.flex1}>
            <ActionButton
              testID="bench-run-suite-virtualized"
              title={
                progress?.mode === MOUNT_MODE.Virtualized
                  ? 'Running…'
                  : 'Run · virtualized'
              }
              onPress={() => onRunSuite(MOUNT_MODE.Virtualized)}
              color={ACCENT_COLOR}
            />
          </View>
        </View>

        {progress !== undefined && (
          <View testID="bench-suite-progress" style={styles.benchProgress}>
            <ActivityIndicator color={ACCENT_COLOR} />
            <Text style={styles.benchProgressText}>
              {`${progress.mode === MOUNT_MODE.All ? 'All mounted' : 'Virtualized'} · ${progress.label}`}
            </Text>
            <Text style={styles.benchProgressCount}>
              {`${progress.done}/${SUITE_STEPS.length}`}
            </Text>
          </View>
        )}

        {hasSuiteResults ? (
          <View>
            <View style={styles.benchCompareRow}>
              <Text style={styles.benchCompareLabel} />
              <Text style={styles.benchCompareHeadCell}>ALL MOUNTED</Text>
              <Text style={styles.benchCompareHeadCell}>VIRTUALIZED</Text>
            </View>
            {SUITE_STEPS.map(step => (
              <View
                key={step.op}
                testID={`bench-suite-${step.op}`}
                style={styles.benchCompareRow}
              >
                <Text style={styles.benchCompareLabel}>{step.label}</Text>
                <Text style={styles.benchCompareCell}>
                  {formatDuration(allDurations.get(step.op))}
                </Text>
                <Text style={styles.benchCompareCell}>
                  {formatDuration(virtualizedDurations.get(step.op))}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text testID="bench-suite-empty" style={styles.noteText}>
            No suite run yet.
          </Text>
        )}

        {hasSuiteResults && (
          <View>
            <Text style={styles.sectionLabel}>FABRIC CALLS · ALL MOUNTED</Text>
            <View style={styles.benchCompareRow}>
              <Text style={styles.benchCompareLabel} />
              <Text style={styles.benchCompareHeadCell}>
                CREATE/APPEND/CLONE
              </Text>
              <Text style={styles.benchCompareHeadCell}>PROP KEYS</Text>
            </View>
            {SUITE_STEPS.map(step => {
              const fabric = allFabricProfiles.get(step.op);
              return (
                <View
                  key={`fabric-${step.op}`}
                  testID={`bench-fabric-${step.op}`}
                  style={styles.benchCompareRow}
                >
                  <Text style={styles.benchCompareLabel}>{step.label}</Text>
                  <Text style={styles.benchCompareCell}>
                    {formatFabric(fabric)}
                  </Text>
                  <Text style={styles.benchCompareCell}>
                    {fabric === undefined ? '—' : String(fabric.totalPropKeys)}
                  </Text>
                </View>
              );
            })}
            <Text style={styles.noteText}>
              {`Counted by wrapping global.nativeFabricUIManager before the app mounts — the one surface this baseline and the SymbioteNative canaries genuinely share, and therefore the only like-for-like number between them. Their engine's own counters (nodesVisited, propWrites) have no equivalent here: stock has no reconcile walk to count. Read as two questions. CREATE/APPEND/CLONE answers "does one stack ask Fabric to do MORE"; PROP KEYS answers the other half, "or the same number of times with fatter payloads". The wrapper costs one JS call per crossing and is therefore in every timing on this screen — the comparison holds only because the other side carries the identical wrapper.`}
            </Text>
          </View>
        )}
        <Text style={styles.noteText}>
          {`Every operation in a fixed order, each timed step starting from exactly ${SUITE_ROWS} rows, with untimed resets in between. All-mounted is krausest's own shape (${NATIVE_VIEWS_PER_ROW} native views per row) and the column that compares to the published web numbers; virtualized mounts a window instead, so it prices what an app ships rather than the commit path itself. Pressing the operation buttons by hand leaves Remove and Append measuring whatever happened to be on screen.`}
        </Text>

        {/* Both sticky paths and the row list sit under the buttons: the meter above stays on
          screen while either box is being dragged — the concrete case the benchmark exists for. */}
        <StickyScrollViewBlock />
        <StickySectionListBlock />
        <Text style={styles.noteText}>
          Drag inside a box (not the page) and watch the counters above — the
          two boxes differ only in which sticky implementation carries the
          frame.
        </Text>

        <Text style={styles.sectionLabel}>
          {isAllMounted ? 'ROWS · ALL MOUNTED' : 'ROWS · VIRTUALIZED'}
        </Text>
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
            style={styles.benchRowsViewport}
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

        {/* Below the fold on purpose: the single operations are for poking at one commit shape
          while debugging, not for reporting. Their Remove and Append numbers depend on press
          order, which is exactly what the suite above exists to remove. */}
        <Text style={styles.sectionLabel}>OPERATIONS · LAST RUN</Text>
        {operations.map(operation => (
          <View key={operation.id} style={styles.benchOpRow}>
            <View style={styles.flex1}>
              <ActionButton
                testID={`bench-op-${operation.id}`}
                title={operation.label}
                onPress={operation.onPress}
                color={ACCENT_COLOR}
              />
            </View>
            <Text
              testID={`bench-result-${operation.id}`}
              style={styles.benchOpResult}
            >
              {formatDuration(lastDurations.get(operation.id))}
            </Text>
          </View>
        ))}

        <Text testID="bench-row-count" style={styles.infoText}>
          {`rows: ${rows.length} · ${mountedViews} native views mounted · selected: ${selectedId ?? 'none'}`}
        </Text>

        <Text
          style={styles.sectionLabel}
        >{`HISTORY · LAST ${HISTORY_LIMIT} MEASUREMENTS`}</Text>
        {history.length === 0 ? (
          <Text style={styles.noteText}>
            Run an operation above to record a measurement.
          </Text>
        ) : (
          history.map(entry => (
            <Text key={entry.seq} style={styles.benchHistoryRow}>
              {`${entry.label} — ${formatDuration(entry.durationMs)} · ${entry.rowCount} rows`}
            </Text>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Ported one-for-one from the Symbiote canary's App.css classes of the same names — stock RN has
// no className, so every declaration the benchmark screen used lives here instead. Colours are
// the canary palette's tokens inlined (--ink #0b1622, --paper #13243a, --mist #41506a,
// --chalk #cbd5e1), since CSS custom properties have no stock-RN equivalent either.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1622',
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 40,
    paddingLeft: 24,
    paddingRight: 24,
    alignItems: 'stretch',
    gap: 20,
  },
  flex1: {
    flex: 1,
  },
  sectionLabel: {
    color: '#41506a',
    fontSize: 13,
  },
  infoText: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  noteText: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  listRowText: {
    color: '#cbd5e1',
    fontSize: 15,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#13243a',
  },
  heroBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeText: {
    color: '#0b1622',
    fontSize: 15,
    fontWeight: 'bold',
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  heroBody: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  // Height stays inline at the call site — it references SECTION_LIST_ROW_HEIGHT, which
  // getItemLayout also reads.
  parityRow: {
    justifyContent: 'center',
    paddingLeft: 12,
    paddingRight: 12,
  },
  sectionHeader: {
    color: '#0b1622',
    fontSize: 13,
    fontWeight: 'bold',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 12,
    paddingRight: 12,
    backgroundColor: '#7fb5ff',
  },
  // The two suite buttons, side by side under the meter: one per mount mode, so the mode is
  // picked by the press instead of by a separate toggle that could disagree with the numbers.
  benchRunRow: {
    flexDirection: 'row',
    gap: 12,
  },
  // Shown only while a suite runs. A step can hold the JS thread for hundreds of milliseconds, so
  // without this the screen is indistinguishable from a hung one.
  benchProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#0f1e30',
  },
  benchProgressText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 13,
  },
  benchProgressCount: {
    color: '#41506a',
    fontSize: 13,
  },
  // Both modes' results side by side — the label stretches, the two number columns stay at a
  // fixed width so they line up down the table.
  benchCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
  },
  benchCompareLabel: {
    flex: 1,
    color: '#41506a',
    fontSize: 13,
  },
  benchCompareCell: {
    width: 96,
    textAlign: 'right',
    color: '#cbd5e1',
    fontSize: 13,
  },
  benchCompareHeadCell: {
    width: 96,
    textAlign: 'right',
    color: '#41506a',
    fontSize: 11,
    letterSpacing: 1,
  },
  // The sticky-header stress block. Bounded height so the frame counters stay on screen while the
  // inner list is being dragged — the whole point of putting the two next to each other.
  benchSticky: {
    height: 320,
    borderRadius: 12,
    backgroundColor: '#0f1e30',
  },
  // The virtualized row list. Bounded height because a FlatList inside a ScrollView has no
  // viewport of its own to window against, and without one it would mount every row - which is
  // precisely the mode it exists to contrast with.
  benchRowsViewport: {
    height: 420,
    borderRadius: 12,
    backgroundColor: '#0f1e30',
  },
  // One operation: the button stretches, the last measured duration sits beside it at a fixed
  // width so the column of numbers stays aligned across rows of different button widths.
  benchOpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benchOpResult: {
    width: 88,
    textAlign: 'right',
    color: '#cbd5e1',
    fontSize: 14,
  },
  benchHistoryRow: {
    color: '#41506a',
    fontSize: 13,
  },
  // A benchmark list row — kept deliberately plain (id, label, remove) so what is measured is the
  // commit path and not a decorative row's own layout cost.
  benchRow: {
    // Fixed so FlatList's getItemLayout is exact in virtualized mode, and so a row occupies the
    // same box in both mount modes - otherwise the two modes would not be comparable.
    height: BENCH_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 8,
    backgroundColor: '#13243a',
  },
  // Tinted rather than filled with the accent: the row's own text keeps its contrast.
  benchRowSelected: {
    backgroundColor: '#3a2c10',
    borderLeftWidth: 3,
    borderLeftColor: ACCENT_COLOR,
  },
  benchRowId: {
    width: 56,
    color: '#41506a',
    fontSize: 12,
  },
  benchRowLabel: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  benchRowRemove: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchRowRemoveText: {
    color: '#41506a',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

// Module-level so a selected row costs no allocation per render — the canary's equivalent is a
// constant class string, and a fresh array here would price GC into the measured update.
const selectedBenchRowStyle = [styles.benchRow, styles.benchRowSelected];

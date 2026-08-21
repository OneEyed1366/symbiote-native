import { defineComponent, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  Text,
  View,
  type IFlatListSlots,
  type ISection,
  type ISectionListSlots,
} from '@symbiote-native/vue';
import {
  registerPostCommit,
  unregisterPostCommit,
} from '@symbiote-native/engine';
import { ActionButton } from '../components/ActionButton';
import { JsFrameRateMeter } from '../components/JsFrameRateMeter';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Word lists and row shape are taken verbatim from js-framework-benchmark (krausest) so the
// numbers here can be read next to the published Vue/Svelte/Solid ones. Its rules forbid
// hand-tuning the implementation for the benchmark, so everything below is the plain keyed-list
// Vue anyone would write: state in the component, one row component, handlers defined once.
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
// That ceiling is the native host's, not the engine's - which is exactly why the two mount modes
// below exist, so the claim can be measured instead of asserted.
const NATIVE_VIEWS_PER_ROW = 9;
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
// with no sectionFooter slot, in which case it paints nothing and occupies no height. The
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
 * The index is FLAT over the whole stream (this is the list's shape, not a section-relative one),
 * so it is decoded back into "which section, and what within it" here. Rows are uniform, so a
 * section always spans the same extent and the section's own offset is a multiplication.
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

// One row of the fixed-order suite. `startRows` is recorded rather than derived because it is the
// number the whole suite exists to pin down - a duration is meaningless without it.
type ISuiteEntry = {
  op: IBenchOpId;
  label: string;
  durationMs: number;
  startRows: number;
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
// operation then produces exactly one new object, which is what the stopwatch below keys off - a
// select that only touched a second ref would leave the clock running.
type IListState = {
  rows: readonly IBenchmarkRow[];
  selectedId: number | undefined;
};

// The stopwatch currently running, or null between steps. `settle` is the resolve half of the
// step's promise, so the post-commit hook stops the clock without knowing what it was timing.
type IPendingMeasurement = {
  startedAt: number;
  settle: (durationMs: number) => void;
};

// Row ids are globally unique and never reused, exactly as in the reference implementation -
// a reused key would let the renderer match an old row to a new one and hide real reconciliation
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

// Vue's own shouldUpdateComponent compares props before re-rendering a child, so a row whose
// props are all referentially unchanged is skipped without a memo() wrapper - the twin of React's
// memo here. That only holds while the row objects stay RAW, which is why the screen's list state
// below is a shallowRef.
const BenchmarkRow = defineComponent<IBenchmarkRowProps>(
  props => {
    return () => (
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
      </View>
    );
  },
  {
    name: 'BenchmarkRow',
    props: ['row', 'isSelected', 'onSelect', 'onRemove'],
  },
);

type IStickyEntry = {
  key: string;
  text: string;
  isHeader: boolean;
};

// stickyHeaderIndices addresses DIRECT children of the content container, so the sections are
// flattened into one list: a header followed by its rows, repeating. Built once at module scope -
// rebuilding 800 entries on every render would add its own cost to what the meter reports.
const STICKY_ENTRIES: readonly IStickyEntry[] = Array.from(
  { length: STICKY_SECTION_COUNT },
  (_value, section) => [
    {
      key: `sticky-header-${section}`,
      text: `SECTION ${section + 1}`,
      isHeader: true,
    },
    ...Array.from({ length: STICKY_ROWS_PER_SECTION }, (_rowValue, row) => ({
      key: `sticky-row-${section}-${row}`,
      text: `row ${section + 1}.${row + 1}`,
      isHeader: false,
    })),
  ],
).flat();

const STICKY_HEADER_INDICES: number[] = Array.from(
  { length: STICKY_SECTION_COUNT },
  (_value, section) => section * (STICKY_ROWS_PER_SECTION + 1),
);

/**
 * Sticky path A - a plain ScrollView with stickyHeaderIndices. Stickiness is computed in JS (the
 * adapter wraps each flagged child and drives it off the scroll offset), but nothing else runs
 * per frame: every child is mounted up front, there is no windowing. No props and no reactive
 * state, so Vue never re-renders it and a benchmark run never contaminates the numbers next to
 * the buttons.
 */
const StickyScrollViewBlock = defineComponent(
  () => {
    return () => (
      <>
        <Text class="section-label">
          STICKY PATH A · ScrollView · stickyHeaderIndices
        </Text>
        <ScrollView
          testID="benchmark-sticky-scroll"
          class="bench-sticky"
          stickyHeaderIndices={STICKY_HEADER_INDICES}
          scrollEventThrottle={16}
          nestedScrollEnabled={true}
        >
          {STICKY_ENTRIES.map(entry => (
            <Text
              key={entry.key}
              class={entry.isHeader ? 'section-header' : 'list-row-text'}
            >
              {entry.text}
            </Text>
          ))}
        </ScrollView>
        <Text class="note-text">
          {`${STICKY_SECTION_COUNT} sections, every row mounted — no virtualization in the frame.`}
        </Text>
      </>
    );
  },
  { name: 'StickyScrollViewBlock' },
);

/**
 * Sticky path B - SectionList with stickySectionHeadersEnabled, i.e. VirtualizedSectionList over
 * VirtualizedList. This is the path the frame-drop regression actually showed up on: each scroll
 * frame additionally runs the windowing pass (cell render, viewability) and the sticky math is
 * computed inside the list. Shaped after CanaryScreen's ParityDemo sticky check, scaled up to 512
 * rows. If path A holds its frame rate and this one does not, the cost is virtualization rather
 * than stickiness.
 */
const StickySectionListBlock = defineComponent(
  () => {
    return () => (
      <>
        <Text class="section-label">
          STICKY PATH B · SectionList · stickySectionHeadersEnabled
        </Text>
        <SectionList
          testID="benchmark-sticky-section-list"
          sections={BENCHMARK_SECTIONS}
          keyExtractor={item => item.id}
          stickySectionHeadersEnabled={true}
          class="bench-sticky"
          scrollEventThrottle={16}
          getItemLayout={sectionListItemLayout}
        >
          {
            {
              sectionHeader: ({ section }) => (
                // Height is pinned inline rather than in the stylesheet because the number has to
                // agree with sectionListItemLayout's arithmetic; splitting it across two files is
                // how that pair silently drifts apart.
                <Text
                  class="section-header"
                  style={{ height: SECTION_LIST_HEADER_HEIGHT }}
                >
                  {section.title}
                </Text>
              ),
              item: ({ item }) => (
                <View
                  class="parity-row"
                  style={{ height: SECTION_LIST_ROW_HEIGHT }}
                >
                  <Text class="list-row-text">{item.label}</Text>
                </View>
              ),
            } satisfies ISectionListSlots<IStickyListItem>
          }
        </SectionList>
        <Text class="note-text">
          {`${SECTION_LIST_SECTION_COUNT} sections x ${SECTION_LIST_ROWS_PER_SECTION} rows — windowed, sticky math inside the list.`}
        </Text>
      </>
    );
  },
  { name: 'StickySectionListBlock' },
);

/**
 * On-device twin of the js-framework-benchmark (krausest) suite: the same nine list operations
 * every framework there is scored on, run against @symbiote-native/engine's commit path on a
 * real device instead of in isolation. A micro-benchmark times pure JS; this screen times the
 * whole round trip - Vue's reactivity flush and patch, the engine's mutation -> clone-on-write
 * translation, and completeRoot - and puts a JS-thread frame counter next to it so a saved
 * millisecond can be checked against frames the user actually sees.
 */
export const BenchmarkScreen = defineComponent(
  () => {
    // shallowRef, not ref, and that is load-bearing rather than an optimization: a deep ref would
    // wrap every row object in a reactive Proxy, and the row component's prop comparison (Vue's
    // twin of React.memo) compares by identity. Replacing the whole state object per operation is
    // also exactly what the reference implementation does.
    const list = shallowRef<IListState>({ rows: [], selectedId: undefined });
    const mountMode = ref<IMountMode>(MOUNT_MODE.All);
    const history = shallowRef<readonly IBenchResult[]>([]);
    const suiteResults = shallowRef<ISuiteResults>(EMPTY_SUITE_RESULTS);
    // Plain locals: setup runs once, so the stopwatch survives re-renders without a ref, and
    // keeping them OUT of reactive state stops the stopwatch from scheduling a commit of its own.
    let pending: IPendingMeasurement | null = null;
    let seq = 0;
    // Drives the progress block AND gates every operation button: a press that landed mid-suite
    // would install its own pending record over the suite's, and the next commit would stop the
    // wrong stopwatch - silently attributing one operation's cost to another. One ref covers both,
    // because a Vue ref is a box: `.value` read inside the timing path is the current value, never
    // a captured one.
    const progress = shallowRef<ISuiteProgress | undefined>(undefined);
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Benchmark];
    const accent = LINE_COLOR.performance;

    // THE timing primitive - every number on this screen, button or suite, comes through here. The
    // clock starts here (Vue flushes its patch on a microtask and the engine coalesces completeRoot
    // onto another one, so a performance.now() pair wrapped around the mutation would time the
    // scheduling call and nothing else) and stops in the post-commit hook below, which resolves
    // this promise. Awaiting it is what lets the suite drive one operation at a time from a known
    // state instead of racing its own steps.
    const runStep = (mutate: () => void): Promise<number> => {
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
          pending = null;
          settle(SUITE_TIMED_OUT);
        }, SUITE_STEP_TIMEOUT_MS);

        pending = { startedAt: performance.now(), settle };
        mutate();
      });
    };

    // `rowCount` is passed in rather than read back from state afterwards: this closes over the
    // list as it was when the button was pressed, and reading it later would report the
    // post-mutation one.
    const measure = (
      op: IBenchOpId,
      label: string,
      rowCount: number,
      mutate: () => void,
    ): void => {
      if (progress.value !== undefined) return;
      runStep(mutate).then(durationMs => {
        seq += 1;
        history.value = [
          { seq, op, label, durationMs, rowCount },
          ...history.value,
        ].slice(0, HISTORY_LIMIT);
      });
    };

    // Stopped by the ENGINE's post-commit hook, not by nextTick, and that choice is what makes
    // this screen comparable across adapters at all. Vue schedules the patch on a microtask and
    // the engine coalesces completeRoot onto another one, so nextTick fires at a different point
    // relative to the native commit than React's useLayoutEffect does. Four different hooks would
    // silently measure four different quantities and the comparison would be void.
    // registerPostCommit means one definition of "done" everywhere: completeRoot has returned.
    // Native layout and paint happen after that and are not in the number; the frame counter above
    // is what shows those.
    const onCommitted = (): void => {
      const finished = pending;
      if (finished === null) return;
      pending = null;
      finished.settle(performance.now() - finished.startedAt);
    };

    onMounted(() => registerPostCommit(onCommitted));
    onUnmounted(() => unregisterPostCommit(onCommitted));

    // The guards below keep an operation from recording a measurement of nothing - an empty list,
    // or an index krausest's fixed row numbers put past the end of a short one.
    const onSelect = (id: number): void => {
      const current = list.value;
      measure(BENCH_OP.Select, 'Select row', current.rows.length, () => {
        list.value = {
          ...current,
          selectedId: current.selectedId === id ? undefined : id,
        };
      });
    };

    const onRemove = (id: number): void => {
      const current = list.value;
      measure(BENCH_OP.Remove, 'Remove row', current.rows.length - 1, () => {
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

    // Same call as Create - krausest scores them apart because the starting state differs: this
    // one swaps a full keyed list for another, the other one mounts into an empty container.
    const onReplace = (): void => {
      measure(BENCH_OP.Replace, 'Replace all 1,000 rows', ROW_BATCH, () => {
        list.value = { rows: buildRows(ROW_BATCH), selectedId: undefined };
      });
    };

    const onCreateLots = (): void => {
      measure(
        BENCH_OP.CreateLots,
        'Create 10,000 rows',
        ROW_BATCH_LARGE,
        () => {
          list.value = {
            rows: buildRows(ROW_BATCH_LARGE),
            selectedId: undefined,
          };
        },
      );
    };

    const onAppend = (): void => {
      const current = list.value;
      measure(
        BENCH_OP.Append,
        'Append 1,000 rows',
        current.rows.length + ROW_BATCH,
        () => {
          list.value = {
            ...current,
            rows: current.rows.concat(buildRows(ROW_BATCH)),
          };
        },
      );
    };

    const onUpdate = (): void => {
      const current = list.value;
      if (current.rows.length === 0) return;
      measure(
        BENCH_OP.Update,
        'Partial update (every 10th)',
        current.rows.length,
        () => {
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
      const { rows } = list.value;
      if (rows.length <= SELECT_INDEX) return;
      onSelect(rows[SELECT_INDEX].id);
    };

    const onRemoveSample = (): void => {
      const { rows } = list.value;
      if (rows.length <= REMOVE_INDEX) return;
      onRemove(rows[REMOVE_INDEX].id);
    };

    const onSwap = (): void => {
      const current = list.value;
      if (current.rows.length <= SWAP_HIGH_INDEX) return;
      measure(BENCH_OP.Swap, 'Swap 2 rows', current.rows.length, () => {
        const next = current.rows.slice();
        const low = next[SWAP_LOW_INDEX];
        next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
        next[SWAP_HIGH_INDEX] = low;
        list.value = { ...current, rows: next };
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
     * reproduced inside 1-3%. Two runs of the SAME adapter disagreed 4x - so a cross-ADAPTER
     * comparison off those rows was measuring press order, not the adapter.
     *
     * Hence: untimed setup steps in between, awaited through the same engine post-commit seam as
     * the timed ones, so each measurement begins from a state this function chose rather than one
     * the operator happened to leave behind.
     *
     * Runs in EITHER mount mode - the pressed button picks it. No 10,000-row step in either:
     * 10,000 rows is 90,000 native views, which the host does not survive in all-mounted (see
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

      // The suite's own UI is committed and PAINTED before any measured step starts. Vue batches
      // onto a microtask, so setting a running flag and then immediately mutating the list puts
      // the spinner and the first (heaviest) step in one commit: the operator presses the button
      // and gets several hundred milliseconds of frozen screen with the button still reading
      // "Run". Awaiting a commit that carries only the progress block splits the two.
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
        entries.push({
          op,
          label,
          durationMs: await runStep(mutate),
          startRows,
        });
      };

      // One commit for the whole prologue: the mode this run measures, an emptied list, and the
      // progress block appearing. It always changes the tree (the block goes from absent to
      // present) - which matters, because `commitContainer` returns early on a commit that
      // produced no native change (`if (!result.changed) return` sits ABOVE `runPostCommitHooks()`
      // in core/engine/src/commit.ts), so a no-op mutation never resolves its step and would stall
      // the suite until the timeout. Every step after this one changes the tree by construction.
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
        list.value = {
          ...current,
          selectedId: current.rows[SELECT_INDEX].id,
        };
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

    const onToggleMountMode = (): void => {
      mountMode.value =
        mountMode.value === MOUNT_MODE.All
          ? MOUNT_MODE.Virtualized
          : MOUNT_MODE.All;
    };

    // Clear wipes the recorded measurements too, not just the rows. A duration stays pinned next
    // to its button until that operation runs again, so a number measured under one set of
    // conditions reads as current under another - a Create 10,000 timed in virtualized mode sat
    // next to the button in all-mounted mode and looked like an all-mounted result. Resetting the
    // run alongside the list keeps a stale figure from ever being read as a fresh one. Clear's OWN
    // measurement still lands (the post-commit hook runs after this commit and appends to the
    // emptied history), so the button that was just pressed does not read as "did nothing".
    const onClear = (): void => {
      if (list.value.rows.length === 0) return;
      measure(BENCH_OP.Clear, 'Clear', 0, () => {
        list.value = { rows: [], selectedId: undefined };
        history.value = [];
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

    return () => {
      const { rows, selectedId } = list.value;
      const isAllMounted = mountMode.value === MOUNT_MODE.All;
      // What the host is actually holding. In virtualized mode the list decides, so it is reported
      // as an approximation of the window rather than a count derived from rows.length.
      const mountedViews = isAllMounted
        ? String(rows.length * NATIVE_VIEWS_PER_ROW)
        : `~1 window x ${NATIVE_VIEWS_PER_ROW}`;

      // History is newest-first, so the first entry found for an operation is its latest run.
      const lastDurations = new Map<IBenchOpId, number>();
      for (const entry of history.value) {
        if (!lastDurations.has(entry.op))
          lastDurations.set(entry.op, entry.durationMs);
      }

      const allDurations = new Map(
        suiteResults.value[MOUNT_MODE.All].map(entry => [
          entry.op,
          entry.durationMs,
        ]),
      );
      const virtualizedDurations = new Map(
        suiteResults.value[MOUNT_MODE.Virtualized].map(entry => [
          entry.op,
          entry.durationMs,
        ]),
      );
      const hasSuiteResults =
        allDurations.size > 0 || virtualizedDurations.size > 0;

      return (
        <SafeAreaView class="screen">
          <ScrollView
            testID="benchmark-scroll"
            class="screen"
            contentContainerStyle="scroll-content"
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
                  The js-framework-benchmark operations, run on device against
                  the engine's commit path — with the JS-thread frame rate
                  beside them.
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
                    progress.value?.mode === MOUNT_MODE.All
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
                    progress.value?.mode === MOUNT_MODE.Virtualized
                      ? 'Running…'
                      : 'Run · virtualized'
                  }
                  onPress={() => onRunSuite(MOUNT_MODE.Virtualized)}
                  color={accent}
                />
              </View>
            </View>

            {progress.value !== undefined && (
              <View testID="bench-suite-progress" class="bench-progress">
                <ActivityIndicator color={accent} />
                <Text class="bench-progress-text">
                  {`${progress.value.mode === MOUNT_MODE.All ? 'All mounted' : 'Virtualized'} · ${progress.value.label}`}
                </Text>
                <Text class="bench-progress-count">
                  {`${progress.value.done}/${SUITE_STEPS.length}`}
                </Text>
              </View>
            )}

            {hasSuiteResults ? (
              <View>
                <View class="bench-compare-row">
                  <Text class="bench-compare-label" />
                  <Text class="bench-compare-head-cell">ALL MOUNTED</Text>
                  <Text class="bench-compare-head-cell">VIRTUALIZED</Text>
                </View>
                {SUITE_STEPS.map(step => (
                  <View
                    key={step.op}
                    testID={`bench-suite-${step.op}`}
                    class="bench-compare-row"
                  >
                    <Text class="bench-compare-label">{step.label}</Text>
                    <Text class="bench-compare-cell">
                      {formatDuration(allDurations.get(step.op))}
                    </Text>
                    <Text class="bench-compare-cell">
                      {formatDuration(virtualizedDurations.get(step.op))}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text testID="bench-suite-empty" class="note-text">
                No suite run yet.
              </Text>
            )}
            <Text class="note-text">
              {`Every operation in a fixed order, each timed step starting from exactly ${SUITE_ROWS} rows, with untimed resets in between. All-mounted is krausest's own shape (${NATIVE_VIEWS_PER_ROW} native views per row) and the column that compares to the published web numbers; virtualized mounts a window instead, so it prices what an app ships rather than the commit path itself. Pressing the operation buttons by hand leaves Remove and Append measuring whatever happened to be on screen.`}
            </Text>

            {/* Both sticky paths and the row list sit under the buttons: the meter above stays on
              screen while either box is being dragged — the concrete case the benchmark exists
              for. */}
            <StickyScrollViewBlock />
            <StickySectionListBlock />
            <Text class="note-text">
              Drag inside a box (not the page) and watch the counters above —
              the two boxes differ only in which sticky implementation carries
              the frame.
            </Text>

            <Text class="section-label">
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
                class="bench-rows-viewport"
                data={rows}
                keyExtractor={row => String(row.id)}
                getItemLayout={(_data: unknown, index: number) => ({
                  length: BENCH_ROW_HEIGHT,
                  offset: BENCH_ROW_HEIGHT * index,
                  index,
                })}
              >
                {/* The cell is the #item scoped slot — Vue's idiom (no renderItem prop). */}
                {
                  {
                    item: ({ item }) => (
                      <BenchmarkRow
                        row={item}
                        isSelected={item.id === selectedId}
                        onSelect={onSelect}
                        onRemove={onRemove}
                      />
                    ),
                  } satisfies IFlatListSlots<IBenchmarkRow>
                }
              </FlatList>
            )}

            {/* Below the fold on purpose: the single operations are for poking at one commit shape
              while debugging, not for reporting. Their Remove and Append numbers depend on press
              order, which is exactly what the suite above exists to remove. */}
            <Text class="section-label">OPERATIONS · LAST RUN</Text>
            {operations.map(operation => (
              <View key={operation.id} class="bench-op-row">
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
                  {formatDuration(lastDurations.get(operation.id))}
                </Text>
              </View>
            ))}

            <Text testID="bench-row-count" class="info-text">
              {`rows: ${rows.length} · ${mountedViews} native views mounted · selected: ${selectedId ?? 'none'}`}
            </Text>

            <Text class="section-label">{`HISTORY · LAST ${HISTORY_LIMIT} MEASUREMENTS`}</Text>
            {history.value.length === 0 ? (
              <Text class="note-text">
                Run an operation above to record a measurement.
              </Text>
            ) : (
              history.value.map(entry => (
                <Text key={entry.seq} class="bench-history-row">
                  {`${entry.label} — ${formatDuration(entry.durationMs)} · ${entry.rowCount} rows`}
                </Text>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      );
    };
  },
  { name: 'BenchmarkScreen' },
);

<script lang="ts" module>
  // Word lists and row shape are taken verbatim from js-framework-benchmark (krausest) so the
  // numbers here can be read next to the published Vue/Svelte/Solid ones. Its rules forbid
  // hand-tuning the implementation for the benchmark, so everything below is the plain keyed-list
  // Svelte anyone would write: runes in the component, one row component, plain handlers.
  //
  // Module scope, not instance scope, for the same reason React puts these at module level: the
  // row-id counter and the LCG state must survive a remount, or a second visit to this screen
  // would hand out ids that were already used.
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
  // tell us: its counts are DOM-node counts. `BenchmarkRow` expands to NINE native views
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

  // Two sticky paths are on this screen on purpose (see the markup below): a plain ScrollView, and
  // a SectionList. Same viewport height and same header look, so a difference between the two
  // boxes isolates virtualization from stickiness itself.
  const STICKY_SECTION_COUNT = 200;
  const STICKY_ROWS_PER_SECTION = 3;
  const SECTION_LIST_SECTION_COUNT = 16;
  const SECTION_LIST_ROWS_PER_SECTION = 32;
  const SECTION_LIST_ROW_HEIGHT = 30;
  const SECTION_LIST_HEADER_HEIGHT = 28;
  // Every section is flattened to a header row, its item rows, then a FOOTER row - emitted even
  // with no sectionFooter snippet, in which case it paints nothing and occupies no height. The
  // getItemLayout arithmetic below has to account for that row existing in the index space.
  const SECTION_LIST_FOOTER_HEIGHT = 0;
  const SECTION_LIST_ENTRIES_PER_SECTION =
    1 + SECTION_LIST_ROWS_PER_SECTION + 1;
  const SECTION_LIST_SECTION_EXTENT =
    SECTION_LIST_HEADER_HEIGHT +
    SECTION_LIST_ROWS_PER_SECTION * SECTION_LIST_ROW_HEIGHT;
  // RN raises the scroll event rate for sticky headers; both boxes ask for the same 16ms so the
  // two paths are compared under one scroll cadence.
  const SCROLL_EVENT_THROTTLE_MS = 16;

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
    const withinSection =
      index - sectionIndex * SECTION_LIST_ENTRIES_PER_SECTION;
    const sectionOffset = sectionIndex * SECTION_LIST_SECTION_EXTENT;
    if (withinSection === 0) {
      return {
        length: SECTION_LIST_HEADER_HEIGHT,
        offset: sectionOffset,
        index,
      };
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

  // Sticky path A's children, flattened once at module scope: a header followed by its rows,
  // repeating. React builds the same list inside a useMemo - here a module const is the same
  // guarantee, and rebuilding 800 entries on a re-render would add its own cost to what the meter
  // reports. `kind` is what the markup switches on to wrap only the headers.
  type IStickyEntry = {
    key: string;
    kind: 'header' | 'row';
    text: string;
  };

  const STICKY_ENTRIES: readonly IStickyEntry[] = Array.from(
    { length: STICKY_SECTION_COUNT },
    (_value, section): IStickyEntry[] => [
      {
        key: `sticky-header-${section}`,
        kind: 'header',
        text: `SECTION ${section + 1}`,
      },
      ...Array.from(
        { length: STICKY_ROWS_PER_SECTION },
        (_rowValue, row): IStickyEntry => ({
          key: `sticky-row-${section}-${row}`,
          kind: 'row',
          text: `row ${section + 1}.${row + 1}`,
        }),
      ),
    ],
  ).flat();

  // Supplied even though this adapter cannot honor it as an auto-wrap (see the markup comment):
  // it is what flips ScrollView into its `sticky-js` scroll-forwarding mode, which is what drives
  // the shared AnimatedValue the manually-composed headers below interpolate off.
  const STICKY_HEADER_INDICES: number[] = Array.from(
    { length: STICKY_SECTION_COUNT },
    (_value, section) => section * (STICKY_ROWS_PER_SECTION + 1),
  );

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
  export const SUITE_STEPS: readonly { op: IBenchOpId; label: string }[] = [
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

  // Which mode is mid-run and how far along. Rendered as its own block rather than folded into
  // the button title, because a suite step can hold the JS thread for hundreds of milliseconds
  // and the operator otherwise has no way to tell a running suite from a dead screen.
  type ISuiteProgress = {
    mode: IMountMode;
    label: string;
    done: number;
  };

  // Both modes' last results, side by side. The comparison IS the output - all-mounted prices the
  // commit path itself, virtualized prices what an app actually ships, and reading one without
  // the other is how "the engine is slow" gets claimed off a number that measured 9,000 views.
  type ISuiteResults = Record<IMountMode, readonly ISuiteEntry[]>;

  const EMPTY_SUITE_RESULTS: ISuiteResults = {
    [MOUNT_MODE.All]: [],
    [MOUNT_MODE.Virtualized]: [],
  };

  // Rows and selection are ONE state object, the way the reference implementation keeps them: every
  // operation then produces exactly one new object, which is what the stopwatch keys off - a select
  // that only touched a second rune would leave the clock running.
  type IListState = {
    rows: readonly IBenchmarkRow[];
    selectedId: number | undefined;
  };

  // Row ids are globally unique and never reused, exactly as in the reference implementation -
  // a reused key would let the keyed each-block match an old row to a new one and hide real
  // reconciliation work.
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
</script>

<script lang="ts">
  /**
   * On-device twin of the js-framework-benchmark (krausest) suite: the same nine list operations
   * every framework there is scored on, run against @symbiote-native/engine's commit path on a
   * real device instead of in isolation. A micro-benchmark times pure JS; this screen times the
   * whole round trip - Svelte's own update, the engine's mutation -> clone-on-write translation,
   * and completeRoot - and puts a JS-thread frame counter next to it so a saved millisecond can be
   * checked against frames the user actually sees. Svelte twin of
   * examples/react/screens/BenchmarkScreen.tsx; every constant and operation above is copied
   * verbatim because this screen is a RULER shared across the four canaries.
   *
   * Markup is ordinary, readable Svelte - normal indentation, siblings on their own lines, long
   * sentences wrapped. The edge-to-edge packing §16 once required is no longer needed: the
   * `collapseTextWhitespace()` preprocessor registered in svelte.config.js deletes a
   * whitespace-only node that spans a newline and collapses a wrapped sentence, which covers both
   * shapes normal formatting produces. Verified 2026-08-19 by compiling this file through the real
   * preprocessor chain: zero whitespace-only literals, zero text nodes carrying a newline. Only a
   * same-LINE gap between two siblings (`<View><A /> <B /></View>`) is still uncaught, and normal
   * formatting does not produce one.
   */
  import {
    ActivityIndicator,
    FlatList,
    SafeAreaView,
    ScrollView,
    ScrollViewStickyHeader,
    SectionList,
    Text,
    View,
    type ISection,
  } from '@symbiote-native/svelte';
  import {
    registerPostCommit,
    unregisterPostCommit,
  } from '@symbiote-native/engine';
  import ActionButton from '../components/ActionButton.svelte';
  import BenchmarkRow from '../components/BenchmarkRow.svelte';
  import type { IBenchmarkRow } from '../components/BenchmarkRow.svelte';
  import JsFrameRateMeter from '../components/JsFrameRateMeter.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  // $state.raw, not $state: the list is REPLACED wholesale by every operation, never mutated
  // field-by-field, and a deep proxy over 10 000 row objects would put a per-row cost into the
  // very number being compared across adapters.
  let list = $state.raw<IListState>({ rows: [], selectedId: undefined });
  let mountMode = $state<IMountMode>(MOUNT_MODE.All);
  let history = $state.raw<readonly IBenchResult[]>([]);
  let suiteResults = $state.raw<ISuiteResults>(EMPTY_SUITE_RESULTS);
  let progress = $state.raw<ISuiteProgress | undefined>(undefined);

  const rows = $derived(list.rows);
  const selectedId = $derived(list.selectedId);

  // Deliberately NOT runes (React's useRef pair): the pending stopwatch and the sequence counter
  // are read and written by the measurement machinery itself, and making them reactive would
  // schedule a commit from inside the post-commit hook that is trying to time one.
  let pending: {
    startedAt: number;
    settle: (durationMs: number) => void;
  } | null = null;
  let seq = 0;

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Benchmark];
  const accent = LINE_COLOR.performance;

  // THE timing primitive - every number on this screen, button or suite, comes through here. The
  // clock starts here (a rune write is asynchronous, so a performance.now() pair wrapped around the
  // mutation would time the scheduling call and nothing else) and stops in the post-commit hook
  // below, which resolves this promise. Awaiting it is what lets the suite drive one operation at a
  // time from a known state instead of racing its own steps.
  function runStep(mutate: () => void): Promise<number> {
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
  }

  // `rowCount` is passed in rather than read back from state afterwards: this closes over the list
  // as it was when the button was pressed, and reading it later would report the post-mutation one.
  function measure(
    op: IBenchOpId,
    label: string,
    rowCount: number,
    mutate: () => void,
  ): void {
    // A press mid-suite would install its own pending record over the suite's, and the next commit
    // would stop the wrong stopwatch - attributing one operation's cost to another, silently. One
    // rune carries the fact for both the guard and the progress block: a rune read here is live,
    // not a captured snapshot, so a second non-reactive copy would only be a second thing to
    // desync.
    if (progress !== undefined) return;
    runStep(mutate).then(durationMs => {
      seq += 1;
      history = [{ seq, op, label, durationMs, rowCount }, ...history].slice(
        0,
        HISTORY_LIMIT,
      );
    });
  }

  // Stopped by the ENGINE's post-commit hook, not by Svelte's own after-update hook, and that
  // choice is what makes this screen comparable across adapters at all. Svelte batches its update
  // and the engine coalesces the commit onto a microtask, so `tick()` resolves at a DIFFERENT
  // point relative to completeRoot than React's useLayoutEffect does - this repo has already been
  // bitten by exactly that ordering, where a parity test needed a second tick() to drain a
  // coalesced flush. Four framework hooks would silently measure four different quantities under
  // one name and the cross-adapter table would be fiction. registerPostCommit means one definition
  // of "done" everywhere: completeRoot has returned. Native layout and paint happen after that and
  // are not in the number; the frame counter above is what shows those.
  $effect(() => {
    const onCommitted = (): void => {
      const finished = pending;
      if (finished === null) return;
      pending = null;
      finished.settle(performance.now() - finished.startedAt);
    };
    registerPostCommit(onCommitted);
    return (): void => unregisterPostCommit(onCommitted);
  });

  // The guards below keep an operation from recording a measurement of nothing - an empty list,
  // or an index krausest's fixed row numbers put past the end of a short one.
  function onSelect(id: number): void {
    measure(BENCH_OP.Select, 'Select row', list.rows.length, () => {
      list = {
        ...list,
        selectedId: list.selectedId === id ? undefined : id,
      };
    });
  }

  function onRemove(id: number): void {
    measure(BENCH_OP.Remove, 'Remove row', list.rows.length - 1, () => {
      list = { ...list, rows: list.rows.filter(row => row.id !== id) };
    });
  }

  function onCreate(): void {
    measure(BENCH_OP.Create, 'Create 1,000 rows', ROW_BATCH, () => {
      list = { rows: buildRows(ROW_BATCH), selectedId: undefined };
    });
  }

  // Same call as Create - krausest scores them apart because the starting state differs: this one
  // swaps a full keyed list for another, the other one mounts into an empty container.
  function onReplace(): void {
    measure(BENCH_OP.Replace, 'Replace all 1,000 rows', ROW_BATCH, () => {
      list = { rows: buildRows(ROW_BATCH), selectedId: undefined };
    });
  }

  function onCreateLots(): void {
    measure(BENCH_OP.CreateLots, 'Create 10,000 rows', ROW_BATCH_LARGE, () => {
      list = { rows: buildRows(ROW_BATCH_LARGE), selectedId: undefined };
    });
  }

  function onAppend(): void {
    measure(
      BENCH_OP.Append,
      'Append 1,000 rows',
      list.rows.length + ROW_BATCH,
      () => {
        list = { ...list, rows: list.rows.concat(buildRows(ROW_BATCH)) };
      },
    );
  }

  function onUpdate(): void {
    if (list.rows.length === 0) return;
    measure(
      BENCH_OP.Update,
      'Partial update (every 10th)',
      list.rows.length,
      () => {
        list = {
          ...list,
          rows: list.rows.map((row, index) =>
            index % UPDATE_STRIDE === 0
              ? { ...row, label: row.label + UPDATE_SUFFIX }
              : row,
          ),
        };
      },
    );
  }

  function onSelectSample(): void {
    if (list.rows.length <= SELECT_INDEX) return;
    onSelect(list.rows[SELECT_INDEX].id);
  }

  function onRemoveSample(): void {
    if (list.rows.length <= REMOVE_INDEX) return;
    onRemove(list.rows[REMOVE_INDEX].id);
  }

  function onSwap(): void {
    if (list.rows.length <= SWAP_HIGH_INDEX) return;
    measure(BENCH_OP.Swap, 'Swap 2 rows', list.rows.length, () => {
      const next = list.rows.slice();
      const low = next[SWAP_LOW_INDEX];
      next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
      next[SWAP_HIGH_INDEX] = low;
      list = { ...list, rows: next };
    });
  }

  // Clear wipes the recorded measurements too, not just the rows. A duration stays pinned next to
  // its button until that operation runs again, so a number measured under one set of conditions
  // reads as current under another - a Create 10,000 timed in virtualized mode sat next to the
  // button in all-mounted mode and looked like an all-mounted result. Resetting the run alongside
  // the list keeps a stale figure from ever being read as a fresh one. Clear's OWN measurement
  // still lands (the post-commit hook runs after this commit and prepends to the emptied history),
  // so the button that was just pressed does not read as "did nothing".
  function onClear(): void {
    if (list.rows.length === 0) return;
    measure(BENCH_OP.Clear, 'Clear', 0, () => {
      list = { rows: [], selectedId: undefined };
      history = [];
    });
  }

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

  const isAllMounted = $derived(mountMode === MOUNT_MODE.All);

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
   * Runs in EITHER mount mode - the pressed button picks it. No 10,000-row step in either: 10,000
   * rows is 90,000 native views, which the host does not survive in all-mounted (see
   * NATIVE_VIEWS_PER_ROW), and a suite that hangs the screen measures nothing.
   */
  async function runSuite(mode: IMountMode): Promise<void> {
    resetRowData();

    const entries: ISuiteEntry[] = [];
    const clearRows = (): void => {
      list = { rows: [], selectedId: undefined };
    };
    const fillRows = (): void => {
      list = { rows: buildRows(SUITE_ROWS), selectedId: undefined };
    };

    // The suite's own UI is committed and PAINTED before any measured step starts. The engine
    // coalesces commits onto a microtask, so setting a running flag and then immediately mutating
    // the list puts the spinner and the first (heaviest) step in one commit: the operator presses
    // the button and gets several hundred milliseconds of frozen screen with the button still
    // reading "Run". Awaiting a commit that carries only the progress block splits the two.
    const showProgress = (label: string): Promise<number> =>
      runStep(() => {
        progress = { mode, label, done: entries.length };
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
    // progress block appearing. It always changes the tree (the block goes from absent to present)
    // - which matters, because `commitContainer` returns early on a commit that produced no native
    // change (`if (!result.changed) return` sits ABOVE `runPostCommitHooks()` in
    // core/engine/src/commit.ts), so a no-op mutation never resolves its step and would stall the
    // suite until the timeout. Every step after this one changes the tree by construction.
    await runStep(() => {
      mountMode = mode;
      suiteResults = { ...suiteResults, [mode]: [] };
      history = [];
      progress = { mode, label: 'Preparing', done: 0 };
      clearRows();
    });

    await timed(BENCH_OP.Create, 0, fillRows);
    await timed(BENCH_OP.Replace, SUITE_ROWS, fillRows);
    await timed(BENCH_OP.Update, SUITE_ROWS, () => {
      list = {
        ...list,
        rows: list.rows.map((row, index) =>
          index % UPDATE_STRIDE === 0
            ? { ...row, label: row.label + UPDATE_SUFFIX }
            : row,
        ),
      };
    });
    await timed(BENCH_OP.Select, SUITE_ROWS, () => {
      list = { ...list, selectedId: list.rows[SELECT_INDEX].id };
    });
    await timed(BENCH_OP.Swap, SUITE_ROWS, () => {
      const next = list.rows.slice();
      const low = next[SWAP_LOW_INDEX];
      next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
      next[SWAP_HIGH_INDEX] = low;
      list = { ...list, rows: next };
    });
    await timed(BENCH_OP.Remove, SUITE_ROWS, () => {
      list = {
        ...list,
        rows: list.rows.filter((_row, index) => index !== REMOVE_INDEX),
      };
    });

    await runStep(clearRows);
    await runStep(fillRows);
    await timed(BENCH_OP.Append, SUITE_ROWS, () => {
      list = { ...list, rows: list.rows.concat(buildRows(SUITE_ROWS)) };
    });

    await runStep(clearRows);
    await runStep(fillRows);
    await timed(BENCH_OP.Clear, SUITE_ROWS, clearRows);

    suiteResults = { ...suiteResults, [mode]: entries };
    progress = undefined;
  }

  function onRunSuite(mode: IMountMode): void {
    if (progress !== undefined) return;
    runSuite(mode).catch(() => {
      // A rejected step would otherwise leave the progress block up with no way back; whatever
      // entries were collected are dropped, because a partial suite is not a ruler.
      progress = undefined;
    });
  }

  const allDurations = $derived(
    new Map(
      suiteResults[MOUNT_MODE.All].map(entry => [entry.op, entry.durationMs]),
    ),
  );
  const virtualizedDurations = $derived(
    new Map(
      suiteResults[MOUNT_MODE.Virtualized].map(entry => [
        entry.op,
        entry.durationMs,
      ]),
    ),
  );
  const hasSuiteResults = $derived(
    allDurations.size > 0 || virtualizedDurations.size > 0,
  );

  // What the host is actually holding. In virtualized mode the list decides, so it is reported as
  // an approximation of the window rather than a count derived from rows.length.
  const mountedViews = $derived(
    isAllMounted
      ? String(rows.length * NATIVE_VIEWS_PER_ROW)
      : `~1 window x ${NATIVE_VIEWS_PER_ROW}`,
  );

  // History is newest-first, so the first entry found for an operation is its latest run.
  const lastDurations = $derived.by(() => {
    const durations = new Map<IBenchOpId, number>();
    for (const entry of history) {
      if (!durations.has(entry.op)) durations.set(entry.op, entry.durationMs);
    }
    return durations;
  });
</script>

<SafeAreaView class="screen">
  <ScrollView
    testID="benchmark-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <View class={`line-tag line-tag-${lineInfo.line}`}>
      <Text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </Text>
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
    <JsFrameRateMeter {accent} />

    <!-- Buttons and results sit DIRECTLY under the meter, and everything they stress sits below:
      a suite step holds the JS thread, so the dip has to be readable in the same screenful as the
      press that caused it. -->
    <View class="bench-run-row">
      <View class="flex1">
        <ActionButton
          testID="bench-run-suite-all"
          title={progress?.mode === MOUNT_MODE.All
            ? 'Running…'
            : 'Run · all mounted'}
          onPress={() => onRunSuite(MOUNT_MODE.All)}
          color={accent}
        />
      </View>
      <View class="flex1">
        <ActionButton
          testID="bench-run-suite-virtualized"
          title={progress?.mode === MOUNT_MODE.Virtualized
            ? 'Running…'
            : 'Run · virtualized'}
          onPress={() => onRunSuite(MOUNT_MODE.Virtualized)}
          color={accent}
        />
      </View>
    </View>

    {#if progress !== undefined}
      <View testID="bench-suite-progress" class="bench-progress">
        <ActivityIndicator color={accent} />
        <Text class="bench-progress-text">
          {`${progress.mode === MOUNT_MODE.All ? 'All mounted' : 'Virtualized'} · ${progress.label}`}
        </Text>
        <Text class="bench-progress-count">
          {`${progress.done}/${SUITE_STEPS.length}`}
        </Text>
      </View>
    {/if}

    {#if hasSuiteResults}
      <View class="bench-compare-row">
        <Text class="bench-compare-label" />
        <Text class="bench-compare-head-cell">ALL MOUNTED</Text>
        <Text class="bench-compare-head-cell">VIRTUALIZED</Text>
      </View>
      {#each SUITE_STEPS as step (step.op)}
        <View testID={`bench-suite-${step.op}`} class="bench-compare-row">
          <Text class="bench-compare-label">{step.label}</Text>
          <Text class="bench-compare-cell">
            {formatDuration(allDurations.get(step.op))}
          </Text>
          <Text class="bench-compare-cell">
            {formatDuration(virtualizedDurations.get(step.op))}
          </Text>
        </View>
      {/each}
    {:else}
      <Text testID="bench-suite-empty" class="note-text">
        No suite run yet.
      </Text>
    {/if}
    <Text class="note-text">
      {`Every operation in a fixed order, each timed step starting from exactly ${SUITE_ROWS} rows, with untimed resets in between. All-mounted is krausest's own shape (${NATIVE_VIEWS_PER_ROW} native views per row) and the column that compares to the published web numbers; virtualized mounts a window instead, so it prices what an app ships rather than the commit path itself. Pressing the operation buttons by hand leaves Remove and Append measuring whatever happened to be on screen.`}
    </Text>

    <!-- Both sticky paths and the row list sit under the buttons: the meter above stays on screen
      while either box is being dragged — the concrete case the benchmark exists for. Neither box
      is a child component: Svelte's reactivity already gives what React needs `memo` for, since
      nothing below reads `rows`, so a benchmark run never re-renders either box. -->
    <Text class="section-label">
      STICKY PATH A · ScrollView · stickyHeaderIndices
    </Text>
    <!-- KNOWN GAP, and the ONE invariant this port cannot express the way React does: this adapter
      never auto-wraps a child by index, because Svelte hands a component an opaque Snippet rather
      than an indexable child list (scroll-view-props.ts). `stickyHeaderIndices` is still passed —
      it is what puts the ScrollView in `sticky-js` forwarding mode so the shared scroll
      AnimatedValue actually gets driven — and each header is composed inside
      ScrollViewStickyHeader by hand, which is the SAME component and the same extra host view
      React's auto-wrap inserts. What is missing is the cross-talk: no headerLayoutYs map exists
      without the wrap, so a pinned header is never pushed off by the next one. -->
    <ScrollView
      testID="benchmark-sticky-scroll"
      class="bench-sticky"
      stickyHeaderIndices={STICKY_HEADER_INDICES}
      scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
      nestedScrollEnabled
    >
      {#each STICKY_ENTRIES as entry (entry.key)}
        {#if entry.kind === 'header'}
          <ScrollViewStickyHeader>
            <Text class="section-header">{entry.text}</Text>
          </ScrollViewStickyHeader>
        {:else}
          <Text class="list-row-text">{entry.text}</Text>
        {/if}
      {/each}
    </ScrollView>
    <Text class="note-text">
      {`${STICKY_SECTION_COUNT} sections, every row mounted — no virtualization in the frame.`}
    </Text>

    <Text class="section-label">
      STICKY PATH B · SectionList · stickySectionHeadersEnabled
    </Text>
    <SectionList
      testID="benchmark-sticky-section-list"
      sections={BENCHMARK_SECTIONS}
      keyExtractor={item => item.id}
      stickySectionHeadersEnabled
      class="bench-sticky"
      scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
      getItemLayout={sectionListItemLayout}
    >
      {#snippet sectionHeader({ section })}
        <Text
          class="section-header"
          style={{ height: SECTION_LIST_HEADER_HEIGHT }}
        >
          {section.title}
        </Text>
      {/snippet}
      {#snippet item({ item })}
        <View class="parity-row" style={{ height: SECTION_LIST_ROW_HEIGHT }}>
          <Text class="list-row-text">{item.label}</Text>
        </View>
      {/snippet}
    </SectionList>
    <Text class="note-text">
      {`${SECTION_LIST_SECTION_COUNT} sections x ${SECTION_LIST_ROWS_PER_SECTION} rows — windowed, sticky math inside the list.`}
    </Text>
    <Text class="note-text">
      Drag inside a box (not the page) and watch the counters above — the two
      boxes differ only in which sticky implementation carries the frame.
    </Text>

    <Text class="section-label">
      {isAllMounted ? 'ROWS · ALL MOUNTED' : 'ROWS · VIRTUALIZED'}
    </Text>
    {#if isAllMounted}
      {#each rows as row (row.id)}
        <BenchmarkRow
          {row}
          isSelected={row.id === selectedId}
          {onSelect}
          {onRemove}
        />
      {/each}
    {:else}
      <FlatList
        testID="bench-rows-virtualized"
        class="bench-rows-viewport"
        data={rows}
        keyExtractor={row => String(row.id)}
        getItemLayout={(_data, index) => ({
          length: BENCH_ROW_HEIGHT,
          offset: BENCH_ROW_HEIGHT * index,
          index,
        })}
      >
        {#snippet item({ item })}
          <BenchmarkRow
            row={item}
            isSelected={item.id === selectedId}
            {onSelect}
            {onRemove}
          />
        {/snippet}
      </FlatList>
    {/if}

    <!-- Below the fold on purpose: the single operations are for poking at one commit shape while
      debugging, not for reporting. Their Remove and Append numbers depend on press order, which is
      exactly what the suite above exists to remove. -->
    <Text class="section-label">OPERATIONS · LAST RUN</Text>
    {#each operations as operation (operation.id)}
      <View class="bench-op-row">
        <View class="flex1">
          <ActionButton
            testID={`bench-op-${operation.id}`}
            title={operation.label}
            onPress={operation.onPress}
            color={accent}
          />
        </View>
        <Text testID={`bench-result-${operation.id}`} class="bench-op-result">
          {formatDuration(lastDurations.get(operation.id))}
        </Text>
      </View>
    {/each}

    <Text testID="bench-row-count" class="info-text">
      {`rows: ${rows.length} · ${mountedViews} native views mounted · selected: ${selectedId ?? 'none'}`}
    </Text>

    <Text class="section-label">
      {`HISTORY · LAST ${HISTORY_LIMIT} MEASUREMENTS`}
    </Text>
    {#if history.length === 0}
      <Text class="note-text">
        Run an operation above to record a measurement.
      </Text>
    {:else}
      {#each history as entry (entry.seq)}
        <Text class="bench-history-row">
          {`${entry.label} — ${formatDuration(entry.durationMs)} · ${entry.rowCount} rows`}
        </Text>
      {/each}
    {/if}
  </ScrollView>
</SafeAreaView>

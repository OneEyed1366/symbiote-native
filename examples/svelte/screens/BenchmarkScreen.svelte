<script lang="ts" module>
  import type { IFabricCallProfile } from '../fabric-call-counter';
  import {
    BENCH_OP,
    SUITE_STEPS,
    formatDuration,
    formatFabric,
    suiteLabel,
    type IBenchOpId,
    type IStepProfile,
  } from './bench-clock';

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
  // tell us: its counts are DOM-node counts. `BenchmarkRow` expands to TEN native views
  // (1 View + 3x[Text + RawText] + 2 Pressable Views + 1 TextInput), so 10 000 rows mounted at once
  // is 100 000 UIViews. Measured 2026-08-18 on the nine-view row, iOS 26.5 simulator: that never
  // completed — RAM climbed 2.1 -> 2.8 GB and the JS thread sat at 0 fps, while 1 000 rows
  // completed in ~880 ms. That ceiling is the native host's, not the engine's - which is exactly
  // why the two mount modes below exist, so the claim can be measured instead of asserted.
  //
  // A TextInput is exactly ONE native view — no wrapper, no raw-text child (its text rides as the
  // `text` prop, not as a child node). It was briefly a second row shape behind a toggle, so the
  // input's cost could be read as a delta against the nine-view row; that delta has been taken on
  // every column, so the arm is gone and the ten-view row is the one shape every number here is
  // measured on.
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
    profile: IStepProfile;
    fabric: IFabricCallProfile;
  };

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
   * same-LINE gap between two siblings (`<view><A /> <B /></view>`) is still uncaught, and normal
   * formatting does not produce one.
   */
  import {
    FlatList,
    SectionList,
    type ISection,
  } from '@symbiote-native/svelte';
  import { createBenchClock } from './bench-clock';
  import ActionButton from '../components/ActionButton.svelte';
  import BenchmarkRow from '../components/BenchmarkRow.svelte';
  import type { IBenchmarkRow } from '../components/BenchmarkRow.svelte';
  import JsFrameRateMeter, {
    commitProfileGate,
  } from '../components/JsFrameRateMeter.svelte';
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

  // Not a rune: making the sequence counter reactive would schedule a commit from inside the hook
  // that is timing one.
  let seq = 0;
  const clock = createBenchClock(commitProfileGate);
  const runStep = clock.runStep;

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

  // All-mounted only: it is the cross-renderer column, and the virtualized one prices two
  // different list implementations rather than two renderers.
  const allProfiles = $derived(
    new Map(
      suiteResults[MOUNT_MODE.All].map(entry => [entry.op, entry.profile]),
    ),
  );
  const allFabricProfiles = $derived(
    new Map(
      suiteResults[MOUNT_MODE.All].map(entry => [entry.op, entry.fabric]),
    ),
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
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built once, returned, and never mutated after that
    const durations = new Map<IBenchOpId, number>();
    for (const entry of history) {
      if (!durations.has(entry.op)) durations.set(entry.op, entry.durationMs);
    }
    return durations;
  });
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="benchmark-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: accent }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Benchmark</text>
        <text class="hero-body">
          The js-framework-benchmark operations, run on device against the
          engine's commit path — with the JS-thread frame rate beside them.
        </text>
      </view>
    </view>

    <text class="section-label">MEASUREMENTS</text>
    <JsFrameRateMeter {accent} />

    <!-- Buttons and results sit DIRECTLY under the meter, and everything they stress sits below:
      a suite step holds the JS thread, so the dip has to be readable in the same screenful as the
      press that caused it. -->
    <view class="bench-run-row">
      <view class="flex1">
        <ActionButton
          testID="bench-run-suite-all"
          title={progress?.mode === MOUNT_MODE.All
            ? 'Running…'
            : 'Run · all mounted'}
          onPress={() => onRunSuite(MOUNT_MODE.All)}
          color={accent}
        />
      </view>
      <view class="flex1">
        <ActionButton
          testID="bench-run-suite-virtualized"
          title={progress?.mode === MOUNT_MODE.Virtualized
            ? 'Running…'
            : 'Run · virtualized'}
          onPress={() => onRunSuite(MOUNT_MODE.Virtualized)}
          color={accent}
        />
      </view>
    </view>

    {#if progress !== undefined}
      <view testID="bench-suite-progress" class="bench-progress">
        <activity-indicator color={accent} />
        <text class="bench-progress-text">
          {`${progress.mode === MOUNT_MODE.All ? 'All mounted' : 'Virtualized'} · ${progress.label}`}
        </text>
        <text class="bench-progress-count">
          {`${progress.done}/${SUITE_STEPS.length}`}
        </text>
      </view>
    {/if}

    {#if hasSuiteResults}
      <view class="bench-compare-row">
        <text class="bench-compare-label" />
        <text class="bench-compare-head-cell">ALL MOUNTED</text>
        <text class="bench-compare-head-cell">VIRTUALIZED</text>
      </view>
      {#each SUITE_STEPS as step (step.op)}
        <view testID={`bench-suite-${step.op}`} class="bench-compare-row">
          <text class="bench-compare-label">{step.label}</text>
          <text class="bench-compare-cell">
            {formatDuration(allDurations.get(step.op))}
          </text>
          <text class="bench-compare-cell">
            {formatDuration(virtualizedDurations.get(step.op))}
          </text>
        </view>
      {/each}
    {:else}
      <text testID="bench-suite-empty" class="note-text">
        No suite run yet.
      </text>
    {/if}

    {#if hasSuiteResults}
      <text class="section-label">ENGINE PER STEP · ALL MOUNTED</text>
      <view class="bench-compare-row">
        <text class="bench-compare-label" />
        <text class="bench-compare-head-cell">WRITES</text>
        <text class="bench-compare-head-cell">COMMITS</text>
      </view>
      {#each SUITE_STEPS as step (step.op)}
        {@const profile = allProfiles.get(step.op)}
        <view testID={`bench-engine-${step.op}`} class="bench-compare-row">
          <text class="bench-compare-label">{step.label}</text>
          <text class="bench-compare-cell">
            {profile === undefined ? '—' : String(profile.propWrites)}
          </text>
          <text class="bench-compare-cell">
            {profile === undefined ? '—' : String(profile.commits)}
          </text>
        </view>
      {/each}
      <text class="note-text">
        {`Captured around each timed step, with the frame meter held so its own read-and-reset cannot eat them. Every adapter builds the same ${SUITE_ROWS * NATIVE_VIEWS_PER_ROW + 1}-node tree for Create, so a WRITES that differs between adapters is work this screen is generating — not a cost of the platform. COMMITS must read 1; anything higher means a foreign commit landed inside the window. There is no ms here and no node count: the tree lives in C++ and JS only fills a command buffer, so what the host spends applying it is invisible from JS.`}
      </text>
    {/if}

    {#if hasSuiteResults}
      <text class="section-label">FABRIC CALLS · ALL MOUNTED</text>
      <view class="bench-compare-row">
        <text class="bench-compare-label" />
        <text class="bench-compare-head-cell">CREATE/APPEND/CLONE</text>
        <text class="bench-compare-head-cell">PROP KEYS</text>
      </view>
      {#each SUITE_STEPS as step (step.op)}
        {@const fabric = allFabricProfiles.get(step.op)}
        <view testID={`bench-fabric-${step.op}`} class="bench-compare-row">
          <text class="bench-compare-label">{step.label}</text>
          <text class="bench-compare-cell">{formatFabric(fabric)}</text>
          <text class="bench-compare-cell">
            {fabric === undefined ? '—' : String(fabric.totalPropKeys)}
          </text>
        </view>
      {/each}
      <text class="note-text">
        Counted by wrapping global.nativeFabricUIManager before the engine binds
        it — the one surface this canary and the stock-React-Native baseline
        (examples/bare-rn) genuinely share, and therefore the only like-for-like
        number between them. The ENGINE table above has no counterpart over
        there: stock has no reconcile walk to count. Read as two questions.
        CREATE/APPEND/CLONE answers "does one stack ask Fabric to do MORE"; PROP
        KEYS answers the other half, "or the same number of times with fatter
        payloads". The wrapper costs one JS call per crossing and is therefore
        in every timing on this screen — the comparison holds only because the
        other side carries the identical wrapper.
      </text>
    {/if}
    <text class="note-text">
      {`Every operation in a fixed order, each timed step starting from exactly ${SUITE_ROWS} rows, with untimed resets in between. All-mounted is krausest's own shape (${NATIVE_VIEWS_PER_ROW} native views per row) and the column that compares to the published web numbers; virtualized mounts a window instead, so it prices what an app ships rather than the commit path itself. Pressing the operation buttons by hand leaves Remove and Append measuring whatever happened to be on screen.`}
    </text>

    <!-- Both sticky paths and the row list sit under the buttons: the meter above stays on screen
      while either box is being dragged — the concrete case the benchmark exists for. Neither box
      is a child component: Svelte's reactivity already gives what React needs `memo` for, since
      nothing below reads `rows`, so a benchmark run never re-renders either box. -->
    <text class="section-label">
      STICKY PATH A · ScrollView · sticky-header tag
    </text>
    <!-- A header is MARKED with the `sticky-header` TAG, not wrapped in a component and not named
      by an index. The ScrollView host behavior registers that tag, each header finds this
      ScrollView by walking up, and the collision point — the y at which one pin is pushed off by
      the next — comes from the owner's DOCUMENT order, so nothing here computes or forwards an
      index. `stickyHeaderIndices` WOULD work here too, since 2026-09-10 — the behavior walks the
      committed children, so deleting the ScrollView component (which used to strip the prop) turned
      RN's own API on. This path stays index-free on purpose: an index has to be kept in step with
      the children, and a tag does not. -->
    <scroll-view
      testID="benchmark-sticky-scroll"
      class="bench-sticky"
      scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
      nestedScrollEnabled
    >
      {#each STICKY_ENTRIES as entry (entry.key)}
        {#if entry.kind === 'header'}
          <sticky-header>
            <text class="section-header">{entry.text}</text>
          </sticky-header>
        {:else}
          <text class="list-row-text">{entry.text}</text>
        {/if}
      {/each}
    </scroll-view>
    <text class="note-text">
      {`${STICKY_SECTION_COUNT} sections, every row mounted — no virtualization in the frame.`}
    </text>

    <text class="section-label">
      STICKY PATH B · SectionList · stickySectionHeadersEnabled
    </text>
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
        <text
          class="section-header"
          style={{ height: SECTION_LIST_HEADER_HEIGHT }}
        >
          {section.title}
        </text>
      {/snippet}
      {#snippet item({ item })}
        <view class="parity-row" style={{ height: SECTION_LIST_ROW_HEIGHT }}>
          <text class="list-row-text">{item.label}</text>
        </view>
      {/snippet}
    </SectionList>
    <text class="note-text">
      {`${SECTION_LIST_SECTION_COUNT} sections x ${SECTION_LIST_ROWS_PER_SECTION} rows — windowed, sticky math inside the list.`}
    </text>
    <text class="note-text">
      Drag inside a box (not the page) and watch the counters above — the two
      boxes differ only in which sticky implementation carries the frame.
    </text>

    <!-- These sat BELOW the rows until 2026-09-07, deliberately, so nobody would report numbers
      from them: their Remove and Append act on whatever happened to be on screen, which is the
      whole reason the suite above exists. That is still true and the note under them still says
      so — what changed is that "below the fold" became UNREACHABLE once the list holds a thousand
      rows, which is exactly the state you are in when you want to poke at one commit shape.
      A caveat keeps working from the top of the screen; a scroll position does not.

      No `{#if}` added here: on this adapter one costs an anchor per instantiation even when its
      condition is false, and this block sits above the row loop now. -->
    <text class="section-label">OPERATIONS · LAST RUN</text>
    {#each operations as operation (operation.id)}
      <view class="bench-op-row">
        <view class="flex1">
          <ActionButton
            testID={`bench-op-${operation.id}`}
            title={operation.label}
            onPress={operation.onPress}
            color={accent}
          />
        </view>
        <text testID={`bench-result-${operation.id}`} class="bench-op-result">
          {formatDuration(lastDurations.get(operation.id))}
        </text>
      </view>
    {/each}
    <text class="note-text">
      Single operations, for poking at one commit shape while debugging. Do NOT
      report from them — Remove and Append act on whatever row count is on
      screen, which is what the suite above removes.
    </text>

    <text testID="bench-row-count" class="info-text">
      {`rows: ${rows.length} · ${mountedViews} native views mounted · selected: ${selectedId ?? 'none'}`}
    </text>

    <text class="section-label">
      {isAllMounted ? 'ROWS · ALL MOUNTED' : 'ROWS · VIRTUALIZED'}
    </text>
    {#if isAllMounted}
      <!-- No conditional anywhere under this loop, and on this adapter that is a measurement
        decision rather than tidiness: an `{#if}` costs one anchor per instantiation EVEN WHEN ITS
        CONDITION IS FALSE, so one inside the row would put 1 000 extra retained nodes on the tree
        while `renderable` — and therefore every FABRIC counter — read identically. Mechanism and
        the anchor census: `svelte-adapter-dom-shim` §32. -->
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

    <text class="section-label">
      {`HISTORY · LAST ${HISTORY_LIMIT} MEASUREMENTS`}
    </text>
    {#if history.length === 0}
      <text class="note-text">
        Run an operation above to record a measurement.
      </text>
    {:else}
      {#each history as entry (entry.seq)}
        <text class="bench-history-row">
          {`${entry.label} — ${formatDuration(entry.durationMs)} · ${entry.rowCount} rows`}
        </text>
      {/each}
    {/if}
  </scroll-view>
</safe-area-view>

<script lang="ts">
  // On-device twin of js-framework-benchmark (krausest): the same nine list operations, timed
  // against the engine's commit path, with a JS-thread frame counter beside them
  // The React twin is examples/react/screens/BenchmarkScreen.tsx, with the same constants

  // Markup is ordinary Svelte: the `collapseTextWhitespace()` preprocessor (svelte.config.js)
  // drops whitespace-only newline-spanning nodes, so only a same-line gap between siblings stays
  import { FlatList } from '@symbiote-native/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import BenchmarkRow from '../components/BenchmarkRow.svelte';
  import BenchStickyBoxes from '../components/BenchStickyBoxes.svelte';
  import BenchSuiteResults from '../components/BenchSuiteResults.svelte';
  import JsFrameRateMeter, {
    commitProfileGate,
  } from '../components/JsFrameRateMeter.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import {
    BENCH_OP,
    SUITE_STEPS,
    createBenchClock,
    formatDuration,
    type IBenchOpId,
  } from './bench-clock';
  import {
    BENCH_ROW_HEIGHT,
    clearedList,
    freshList,
    HISTORY_LIMIT,
    NATIVE_VIEWS_PER_ROW,
    REMOVE_INDEX,
    ROW_BATCH,
    ROW_BATCH_LARGE,
    SELECT_INDEX,
    SWAP_HIGH_INDEX,
    withAppendedRows,
    withSwappedRows,
    withUpdatedLabels,
    type IListState,
  } from './bench-data';
  import {
    EMPTY_SUITE_RESULTS,
    MOUNT_MODE,
    runBenchSuite,
    type IBenchResult,
    type IMountMode,
    type ISuiteProgress,
    type ISuiteResults,
    type ISuiteState,
  } from './bench-suite';

  type IBenchOperation = {
    id: IBenchOpId;
    label: string;
    onPress: () => void;
  };

  // $state.raw, not $state: every operation replaces the list wholesale, and a deep proxy over
  // 10 000 rows would put a per-row cost into the number being compared across adapters
  let list = $state.raw<IListState>(clearedList());
  let mountMode = $state<IMountMode>(MOUNT_MODE.All);
  let history = $state.raw<readonly IBenchResult[]>([]);
  let suiteResults = $state.raw<ISuiteResults>(EMPTY_SUITE_RESULTS);
  let progress = $state.raw<ISuiteProgress | undefined>(undefined);

  // The suite writes through these accessors, so its steps hit the runes above
  const suiteState: ISuiteState = {
    get list() {
      return list;
    },
    set list(next) {
      list = next;
    },
    get mountMode() {
      return mountMode;
    },
    set mountMode(next) {
      mountMode = next;
    },
    get history() {
      return history;
    },
    set history(next) {
      history = next;
    },
    get suiteResults() {
      return suiteResults;
    },
    set suiteResults(next) {
      suiteResults = next;
    },
    get progress() {
      return progress;
    },
    set progress(next) {
      progress = next;
    },
  };

  const rows = $derived(list.rows);
  const selectedId = $derived(list.selectedId);
  const isAllMounted = $derived(mountMode === MOUNT_MODE.All);

  // Not a rune: a reactive counter would schedule a commit from inside the hook timing one
  let seq = 0;
  const clock = createBenchClock(commitProfileGate);

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Benchmark];
  const accent = LINE_COLOR.performance;

  // `rowCount` is passed in, as reading it from state afterwards would report the new list
  function measure(
    op: IBenchOpId,
    label: string,
    rowCount: number,
    mutate: () => void,
  ): void {
    // A press mid-suite would install its own pending record over the suite's, and the next
    // commit would stop the wrong stopwatch and charge one operation's cost to another
    if (progress !== undefined) return;
    clock.runStep(mutate).then(durationMs => {
      seq += 1;
      history = [{ seq, op, label, durationMs, rowCount }, ...history].slice(
        0,
        HISTORY_LIMIT,
      );
    });
  }

  // Why the stopwatch stops in the engine's post-commit hook is documented in ./bench-clock.ts
  $effect(() => clock.install());

  // The guards keep an operation from recording a measurement of nothing, as on an empty list
  // or at an index krausest's fixed row numbers put past the end of a short one
  function onSelect(id: number): void {
    measure(BENCH_OP.Select, 'Select row', list.rows.length, () => {
      list = { ...list, selectedId: list.selectedId === id ? undefined : id };
    });
  }

  function onRemove(id: number): void {
    measure(BENCH_OP.Remove, 'Remove row', list.rows.length - 1, () => {
      list = { ...list, rows: list.rows.filter(row => row.id !== id) };
    });
  }

  function onCreate(): void {
    measure(BENCH_OP.Create, 'Create 1,000 rows', ROW_BATCH, () => {
      list = freshList(ROW_BATCH);
    });
  }

  // The same call as Create, which krausest scores apart: this one swaps a full keyed list
  function onReplace(): void {
    measure(BENCH_OP.Replace, 'Replace all 1,000 rows', ROW_BATCH, () => {
      list = freshList(ROW_BATCH);
    });
  }

  function onCreateLots(): void {
    measure(BENCH_OP.CreateLots, 'Create 10,000 rows', ROW_BATCH_LARGE, () => {
      list = freshList(ROW_BATCH_LARGE);
    });
  }

  function onAppend(): void {
    const rowCount = list.rows.length + ROW_BATCH;
    measure(BENCH_OP.Append, 'Append 1,000 rows', rowCount, () => {
      list = withAppendedRows(list, ROW_BATCH);
    });
  }

  function onUpdate(): void {
    if (list.rows.length === 0) return;
    const label = 'Partial update (every 10th)';
    measure(BENCH_OP.Update, label, list.rows.length, () => {
      list = withUpdatedLabels(list);
    });
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
      list = withSwappedRows(list);
    });
  }

  // Clear wipes the recorded measurements too, or a figure taken under one mount mode would sit
  // next to its button and read as current under the other
  // Its own measurement still lands, as the post-commit hook prepends to the emptied history
  function onClear(): void {
    if (list.rows.length === 0) return;
    measure(BENCH_OP.Clear, 'Clear', 0, () => {
      list = clearedList();
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

  function onRunSuite(mode: IMountMode): void {
    if (progress !== undefined) return;
    runBenchSuite(mode, suiteState, clock).catch(() => {
      // A rejected step would leave the progress block up, and a partial suite is no ruler
      progress = undefined;
    });
  }

  // The host holds what the list mounts, so virtualized mode reports a window, not a row count
  const mountedViews = $derived(
    isAllMounted
      ? String(rows.length * NATIVE_VIEWS_PER_ROW)
      : `~1 window x ${NATIVE_VIEWS_PER_ROW}`,
  );

  // History is newest-first, so the first entry found for an operation is its latest run
  const lastDurations = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built once, never mutated
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
          engine's commit path, with the JS-thread frame rate beside them.
        </text>
      </view>
    </view>

    <text class="section-label">MEASUREMENTS</text>
    <JsFrameRateMeter {accent} />

    <!-- Buttons and results sit directly under the meter, as a suite step holds the JS thread
      and the dip has to be readable in the same screenful as the press that caused it -->
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

    <BenchSuiteResults {suiteResults} />
    <BenchStickyBoxes />

    <!-- Kept above the rows, as with a thousand rows mounted the part below is out of reach -->
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
      report from them, as Remove and Append act on whatever row count is on
      screen, which is what the suite above removes.
    </text>

    <text testID="bench-row-count" class="info-text">
      {`rows: ${rows.length} · ${mountedViews} native views mounted · selected: ${selectedId ?? 'none'}`}
    </text>

    <text class="section-label">
      {isAllMounted ? 'ROWS · ALL MOUNTED' : 'ROWS · VIRTUALIZED'}
    </text>
    {#if isAllMounted}
      <!-- No conditional under this loop, as an `{#if}` costs one anchor per instantiation
        even when false, so one inside the row would add 1 000 retained nodes
        while `renderable` and every Fabric counter read the same -->
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

<script lang="ts" module>
  import type { IFabricCallProfile } from '../fabric-call-counter';
  import type { IBenchOpId, IStepProfile } from './bench-clock';

  // Svelte only: no other adapter carries this screen and neither does `examples/bare-rn`, so
  // nothing measured here is a cross-adapter number.
  const PRIM_ROWS = 1000;

  // krausest's own indices and stride, so a step here means what the same step means on
  // BenchmarkScreen. SWAP_HIGH_INDEX is why the row count may not drop below 1,000.
  const UPDATE_STRIDE = 10;
  const UPDATE_SUFFIX = ' !!!';
  const SELECT_INDEX = 1;
  const REMOVE_INDEX = 3;
  const SWAP_LOW_INDEX = 1;
  const SWAP_HIGH_INDEX = 998;

  // Every primitive that is a bare tag here AND renders naturally as one of N repeated instances.
  // Excluded: `scroll-view`, `modal`, `safe-area-view`, `keyboard-avoiding-view` and the list
  // family are structural, so a thousand of them is no shape an app builds; `refresh-control` and
  // `input-accessory-view` are attach-only and render no node of their own.
  const PRIMITIVE_TAG = {
    View: 'view',
    Text: 'text',
    Image: 'image',
    Pressable: 'pressable',
    TextInput: 'text-input',
    Switch: 'switch',
    Button: 'button',
    ActivityIndicator: 'activity-indicator',
    ImageBackground: 'image-background',
    TouchableOpacity: 'touchable-opacity',
    TouchableHighlight: 'touchable-highlight',
    TouchableWithoutFeedback: 'touchable-without-feedback',
    TouchableNativeFeedback: 'touchable-native-feedback',
  } as const;

  type IPrimitiveTag = (typeof PRIMITIVE_TAG)[keyof typeof PRIMITIVE_TAG];

  // `note` says how this primitive's row differs from a row of plain views. It never states a
  // native-view COUNT — the FABRIC column reports the real one, and a number in prose is never
  // re-measured.
  const SECTIONS: readonly {
    tag: IPrimitiveTag;
    note: string;
  }[] = [
    {
      tag: PRIMITIVE_TAG.View,
      note: 'RCTView, nothing folded. The baseline every other section is read against.',
    },
    {
      tag: PRIMITIVE_TAG.Text,
      note: 'Carries a raw-text child, so a text row commits more nodes than it has tags.',
    },
    {
      tag: PRIMITIVE_TAG.Image,
      note: 'No source: this prices the node and its fold, never the network.',
    },
    {
      tag: PRIMITIVE_TAG.Pressable,
      note: 'One node plus the press machine, which the engine attaches at createElement.',
    },
    {
      tag: PRIMITIVE_TAG.TextInput,
      note: 'The value rides as a prop, not as a child node.',
    },
    {
      tag: PRIMITIVE_TAG.Switch,
      note: 'The only primitive whose native view differs by platform name, not just by props.',
    },
    {
      tag: PRIMITIVE_TAG.Button,
      note: 'The behavior builds the touchable and the label under it — a tag, several nodes.',
    },
    {
      tag: PRIMITIVE_TAG.ActivityIndicator,
      note: 'Animated natively, so its cost is a create cost and not a per-frame one.',
    },
    {
      tag: PRIMITIVE_TAG.ImageBackground,
      note: 'The behavior builds the image under the box, the same way the wrapper used to.',
    },
    {
      tag: PRIMITIVE_TAG.TouchableOpacity,
      note: 'Pressable plus an engine-side opacity fade on one node.',
    },
    {
      tag: PRIMITIVE_TAG.TouchableHighlight,
      note: 'Pressable plus the underlay machine, which re-folds the payload on show and hide.',
    },
    {
      tag: PRIMITIVE_TAG.TouchableWithoutFeedback,
      note: 'Commits NO node of its own — it clones onto its single child, so the child is the row.',
    },
    {
      tag: PRIMITIVE_TAG.TouchableNativeFeedback,
      note: 'Also an anchor: no node of its own, and on Android it folds the ripple onto the child.',
    },
  ];

  type IPrimRow = {
    id: number;
    label: string;
  };

  type ISuiteEntry = {
    op: IBenchOpId;
    label: string;
    durationMs: number;
    profile: IStepProfile;
    fabric: IFabricCallProfile;
  };

  // Deterministic, not Math.random(): labels feed text measurement, so a varying length would put
  // its own noise into the numbers being compared. Same LCG and seed as BenchmarkScreen, so a
  // label here is byte-identical to a label there.
  const RANDOM_SEED = 1;
  const LCG_MULTIPLIER = 1_664_525;
  const LCG_INCREMENT = 1_013_904_223;
  const LCG_MODULUS = 2 ** 32;
  let randomState = RANDOM_SEED;
  let nextRowId = 1;

  // Both generators are module state and drift with every run. Rewinding before each section is
  // what makes two sections build the same labels, and therefore what makes them subtractable.
  function resetRowData(): void {
    randomState = RANDOM_SEED;
    nextRowId = 1;
  }

  function nextRandom(): number {
    randomState = (randomState * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return randomState / LCG_MODULUS;
  }

  function buildRows(count: number): IPrimRow[] {
    const rows: IPrimRow[] = new Array(count);
    for (let index = 0; index < count; index += 1) {
      rows[index] = {
        id: nextRowId,
        label: `n${Math.floor(nextRandom() * 1000)}`,
      };
      nextRowId += 1;
    }
    return rows;
  }
</script>

<script lang="ts">
  /**
   * Per-primitive twin of BenchmarkScreen. That screen measures a ten-tag row — the shape an app
   * ships, and the only one comparable to the published js-framework-benchmark numbers; this one
   * measures a primitive at a time, which is the only shape that can price one.
   *
   * ONE section is mounted at a time, and that is a measurement requirement rather than a UI
   * choice: thirteen sections of a thousand tags is thirteen thousand native views, which the host
   * does not survive.
   *
   * Every cell carries the SAME class, so the CSS half of each row's prop-key count is identical
   * across sections and the delta between two is the primitive itself. A resolved class flattens
   * into the payload one key per declaration, so a rule with one extra line prices a different
   * element.
   */
  import { onDestroy } from 'svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import JsFrameRateMeter, {
    commitProfileGate,
  } from '../components/JsFrameRateMeter.svelte';
  import {
    BENCH_OP,
    SUITE_STEPS,
    createBenchClock,
    formatDuration,
    formatFabric,
    suiteLabel,
  } from './bench-clock';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  // $state.raw, not $state: the list is REPLACED wholesale by every operation, and a deep proxy
  // over a thousand row objects would put a per-row cost into the number being compared.
  let rows = $state.raw<readonly IPrimRow[]>([]);
  let selectedId = $state.raw<number | undefined>(undefined);
  let activeTag = $state.raw<IPrimitiveTag | undefined>(undefined);
  let results = $state.raw<
    Partial<Record<IPrimitiveTag, readonly ISuiteEntry[]>>
  >({});
  let progress = $state.raw<
    { tag: IPrimitiveTag; label: string; done: number } | undefined
  >(undefined);
  let isRunning = $state(false);

  const clock = createBenchClock(commitProfileGate);
  const runStep = clock.runStep;
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.PrimitiveBench];
  const accent = LINE_COLOR.performance;

  $effect(() => clock.install());

  // A section left mounted would keep a thousand native views alive behind the next screen. The
  // suite always ends on Clear, so this only catches a run abandoned by navigating away.
  onDestroy(() => {
    rows = [];
  });

  function cellClass(row: IPrimRow): string {
    return row.id === selectedId ? 'pb-cell pb-cell-on' : 'pb-cell';
  }

  /**
   * The eight-step suite for ONE primitive, each timed step starting from exactly PRIM_ROWS rows.
   *
   * The untimed setup steps in between earn their place: `Remove` and `Append` cost scale with the
   * rows currently mounted, so without them a step's number would depend on which step ran before
   * it.
   */
  async function runSection(tag: IPrimitiveTag): Promise<void> {
    resetRowData();
    const entries: ISuiteEntry[] = [];
    const clearRows = (): void => {
      rows = [];
      selectedId = undefined;
    };
    const fillRows = (): void => {
      rows = buildRows(PRIM_ROWS);
      selectedId = undefined;
    };

    // Committed and painted BEFORE the step it announces. In one commit the spinner and the
    // heaviest step land together, so Run still reads "Run" through several hundred ms of frozen
    // screen.
    const showProgress = (label: string): Promise<number> =>
      runStep(() => {
        progress = { tag, label, done: entries.length };
      });

    const timed = async (op: IBenchOpId, mutate: () => void): Promise<void> => {
      const label = suiteLabel(op);
      await showProgress(label);
      const durationMs = await runStep(mutate);
      // Read AFTER the measured step, never after showProgress: the clock's holder carries
      // whichever step committed last, and the progress step commits first by construction.
      entries.push({
        op,
        label,
        durationMs,
        profile: clock.lastStepProfile,
        fabric: clock.lastFabricProfile,
      });
    };

    // One commit for the whole prologue, and it always changes the tree — the progress block goes
    // absent to present. `commitContainer` returns early on a commit with no native change, so a
    // step that changes nothing stalls the suite until the clock times out.
    await runStep(() => {
      activeTag = tag;
      results = { ...results, [tag]: [] };
      progress = { tag, label: 'Preparing', done: 0 };
      clearRows();
    });

    await timed(BENCH_OP.Create, fillRows);
    await timed(BENCH_OP.Replace, fillRows);
    await timed(BENCH_OP.Update, () => {
      rows = rows.map((row, index) =>
        index % UPDATE_STRIDE === 0
          ? { ...row, label: row.label + UPDATE_SUFFIX }
          : row,
      );
    });
    await timed(BENCH_OP.Select, () => {
      selectedId = rows[SELECT_INDEX].id;
    });
    await timed(BENCH_OP.Swap, () => {
      const next = rows.slice();
      const low = next[SWAP_LOW_INDEX];
      next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
      next[SWAP_HIGH_INDEX] = low;
      rows = next;
    });
    await timed(BENCH_OP.Remove, () => {
      rows = rows.filter((_row, index) => index !== REMOVE_INDEX);
    });

    await runStep(clearRows);
    await runStep(fillRows);
    await timed(BENCH_OP.Append, () => {
      rows = rows.concat(buildRows(PRIM_ROWS));
    });

    await runStep(clearRows);
    await runStep(fillRows);
    await timed(BENCH_OP.Clear, clearRows);

    // AWAITED, which is why this is a runStep and not two plain writes: it changes the tree, so it
    // commits, and an unawaited commit lands microtasks later — after the NEXT section installed
    // its stopwatch, which it then stops. That read as `Create 0.4 ms · FABRIC 0/0/12` in every
    // section but the first (`.claude/rules/perf-claims-need-numbers.md`).
    await runStep(() => {
      results = { ...results, [tag]: entries };
      progress = undefined;
    });
  }

  async function runSections(tags: readonly IPrimitiveTag[]): Promise<void> {
    if (isRunning) return;
    isRunning = true;
    try {
      for (const tag of tags) {
        await runSection(tag);
      }
    } finally {
      // A rejected step would otherwise leave the progress block up with no way back.
      progress = undefined;
      isRunning = false;
    }
  }

  function onRunSection(tag: IPrimitiveTag): void {
    void runSections([tag]);
  }

  function onRunAll(): void {
    void runSections(SECTIONS.map(section => section.tag));
  }
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="primitive-bench-scroll"
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
        <text class="hero-title">Primitive benchmark</text>
        <text class="hero-body">
          One section per tag-only primitive, each a thousand identical tags
          through the same eight-step suite — so a per-primitive cost can be
          read instead of a whole row's.
        </text>
      </view>
    </view>

    <text class="section-label">MEASUREMENTS</text>
    <JsFrameRateMeter {accent} />

    <view class="bench-run-row">
      <view class="flex1">
        <ActionButton
          testID="primitive-bench-run-all"
          title={isRunning ? 'Running…' : 'Run every section'}
          onPress={onRunAll}
          color={accent}
        />
      </view>
    </view>
    <text class="note-text">
      {`Each section mounts ${PRIM_ROWS} of one tag and runs the same eight steps as BenchmarkScreen. Only ONE is mounted at a time — thirteen at once is thirteen thousand native views, which the host does not survive. FABRIC is createNode/appendChild/clones, the one quantity examples/bare-rn also reports, and the instrument's own check: Create and Append MUST report a non-zero createNode. A row that does not is a step that settled on somebody else's commit, not a fast one.`}
    </text>

    {#if progress !== undefined}
      <view testID="primitive-bench-progress" class="bench-progress">
        <activity-indicator color={accent} />
        <text class="bench-progress-text">
          {`<${progress.tag}> · ${progress.label}`}
        </text>
        <text class="bench-progress-count">
          {`${progress.done}/${SUITE_STEPS.length}`}
        </text>
      </view>
    {/if}

    {#each SECTIONS as section (section.tag)}
      {@const entries = results[section.tag]}
      <text class="section-label">{`<${section.tag}>`}</text>
      <text class="note-text">{section.note}</text>
      <view class="bench-run-row">
        <view class="flex1">
          <ActionButton
            testID={`primitive-bench-run-${section.tag}`}
            title={progress?.tag === section.tag
              ? 'Running…'
              : `Run · ${section.tag}`}
            onPress={() => onRunSection(section.tag)}
            color={accent}
          />
        </view>
      </view>

      {#if entries === undefined}
        <text testID={`primitive-bench-empty-${section.tag}`} class="note-text">
          Not run yet.
        </text>
      {:else}
        <view class="bench-compare-row">
          <text class="bench-compare-label" />
          <text class="bench-compare-head-cell">TIME</text>
          <text class="bench-compare-head-cell">FABRIC</text>
        </view>
        {#each SUITE_STEPS as step (step.op)}
          {@const entry = entries.find(candidate => candidate.op === step.op)}
          <view
            testID={`primitive-bench-${section.tag}-${step.op}`}
            class="bench-compare-row"
          >
            <text class="bench-compare-label">{step.label}</text>
            <text class="bench-compare-cell">
              {formatDuration(entry?.durationMs)}
            </text>
            <text class="bench-compare-cell">
              {formatFabric(entry?.fabric)}
            </text>
          </view>
        {/each}
      {/if}
    {/each}

    <text class="section-label">MOUNTED SECTION</text>
    <text class="note-text">
      {`The tags the timed steps above act on. Clipped to a fixed box so the frame meter stays on screen while a step holds the JS thread — every one of the ${PRIM_ROWS} is mounted, whether or not it is painted inside the box.`}
    </text>
    <view class="pb-viewport">
      <view class="pb-strip">
        <!-- Thirteen sibling each-blocks, not one each-block over a thirteen-branch {#if}. A
          branch INSIDE the loop costs two anchor nodes per row — 2,000 retained objects that are
          not the primitive under test. Outside it, one anchor per SECTION. -->
        {#if activeTag === PRIMITIVE_TAG.View}
          {#each rows as row (row.id)}
            <view class={cellClass(row)} testID={row.label} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.Text}
          {#each rows as row (row.id)}
            <text class={cellClass(row)}>{row.label}</text>
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.Image}
          {#each rows as row (row.id)}
            <image class={cellClass(row)} testID={row.label} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.Pressable}
          {#each rows as row (row.id)}
            <pressable class={cellClass(row)} testID={row.label} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.TextInput}
          {#each rows as row (row.id)}
            <text-input class={cellClass(row)} value={row.label} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.Switch}
          {#each rows as row (row.id)}
            <switch class={cellClass(row)} testID={row.label} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.Button}
          {#each rows as row (row.id)}
            <button class={cellClass(row)} title={row.label} color={accent} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.ActivityIndicator}
          {#each rows as row (row.id)}
            <activity-indicator class={cellClass(row)} testID={row.label} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.ImageBackground}
          {#each rows as row (row.id)}
            <image-background class={cellClass(row)} testID={row.label} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.TouchableOpacity}
          {#each rows as row (row.id)}
            <touchable-opacity class={cellClass(row)} testID={row.label} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.TouchableHighlight}
          {#each rows as row (row.id)}
            <touchable-highlight class={cellClass(row)} testID={row.label} />
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.TouchableWithoutFeedback}
          <!-- The two anchor tags commit no node of their own, so each needs the child it clones
            onto — without it the section mounts nothing and times an empty tree. -->
          {#each rows as row (row.id)}
            <touchable-without-feedback testID={row.label}>
              <view class={cellClass(row)} />
            </touchable-without-feedback>
          {/each}
        {:else if activeTag === PRIMITIVE_TAG.TouchableNativeFeedback}
          {#each rows as row (row.id)}
            <touchable-native-feedback testID={row.label}>
              <view class={cellClass(row)} />
            </touchable-native-feedback>
          {/each}
        {/if}
      </view>
    </view>
  </scroll-view>
</safe-area-view>

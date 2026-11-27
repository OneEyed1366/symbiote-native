<script lang="ts">
  // The three comparison tables of the suite: durations for both mount modes, then the engine
  // and the Fabric counters for the all-mounted run
  import {
    SUITE_STEPS,
    formatDuration,
    formatFabric,
  } from '../screens/bench-clock';
  import { NATIVE_VIEWS_PER_ROW } from '../screens/bench-data';
  import {
    MOUNT_MODE,
    SUITE_ROWS,
    type ISuiteResults,
  } from '../screens/bench-suite';

  let { suiteResults }: { suiteResults: ISuiteResults } = $props();

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

  // All-mounted only, as it is the cross-renderer column and the virtualized one prices
  // two different list implementations rather than two renderers
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
</script>

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
  <text testID="bench-suite-empty" class="note-text">No suite run yet.</text>
{/if}

{#if hasSuiteResults}
  <text class="section-label">ENGINE PER STEP - ALL MOUNTED</text>
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
        {profile === undefined ? '-' : String(profile.propWrites)}
      </text>
      <text class="bench-compare-cell">
        {profile === undefined ? '-' : String(profile.commits)}
      </text>
    </view>
  {/each}
  <text class="note-text">
    {`Captured around each timed step, with the frame meter held so its own read-and-reset cannot eat them. Every adapter builds the same ${SUITE_ROWS * NATIVE_VIEWS_PER_ROW + 1}-node tree for Create, so a WRITES that differs between adapters is work this screen is generating, not a cost of the platform. COMMITS must read 1, and anything higher means a foreign commit landed inside the window. There is no ms here and no node count, as the tree lives in C++ and JS only fills a command buffer.`}
  </text>

  <text class="section-label">FABRIC CALLS - ALL MOUNTED</text>
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
        {fabric === undefined ? '-' : String(fabric.totalPropKeys)}
      </text>
    </view>
  {/each}
  <text class="note-text">
    Counted by wrapping global.nativeFabricUIManager before the engine binds it. It is the one
    surface this canary and the stock React Native baseline (examples/bare-rn) share, so it is
    the only like-for-like number between them. CREATE/APPEND/CLONE answers whether one stack
    asks Fabric to do more, and PROP KEYS whether it asks the same number of times with fatter
    payloads. The wrapper costs one JS call per crossing and sits in every timing on this
    screen, so the comparison holds only because the other side carries the identical wrapper.
  </text>
{/if}
<text class="note-text">
  {`Every operation in a fixed order, each timed step starting from exactly ${SUITE_ROWS} rows, with untimed resets in between. All-mounted is krausest's own shape (${NATIVE_VIEWS_PER_ROW} native views per row) and the column that compares to the published web numbers. Virtualized mounts a window instead, so it prices what an app ships rather than the commit path itself. Pressing the operation buttons by hand leaves Remove and Append measuring whatever happened to be on screen.`}
</text>

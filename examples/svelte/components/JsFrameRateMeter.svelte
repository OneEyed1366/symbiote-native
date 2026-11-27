<script lang="ts" module>
  // `readCommitProfile()` is read-and-RESET and this meter calls it once per window off rAF
  // A step that wants the profile of its OWN commit must stop the meter first, or a window
  // closing inside the step eats its numbers and leaves a plausible zero

  // A plain mutable object in module scope, not a rune or a prop
  // A reactive form re-renders the meter, and that commit lands inside the measured window
  // That perturbs the duration and can settle the step early against the wrong commit
  export const commitProfileGate = { isHeldByBenchmark: false };
</script>

<script lang="ts">
  // JS-thread frame rate: a rAF loop times consecutive frames and reports the average per window
  // It also counts frames later than 1.5 budgets, the visible cost of a long commit
  // Svelte twin of `examples/react/components/JsFrameRateMeter.tsx`, constants copied verbatim
  import {
    readCommitProfile,
    type ICommitProfile,
  } from '@symbiote-native/engine';
  import ActionButton from './ActionButton.svelte';

  // 60 Hz budget. Frames are timed on the JS thread only: requestAnimationFrame is scheduled by
  // JS, so a stall here is a stall in the code we actually optimize. The native UI thread keeps
  // compositing at 60/120 Hz regardless, which is why a native FPS readout would stay flat and
  // tell us nothing about the engine's commit cost.
  const FRAME_BUDGET_MS = 1_000 / 60;

  // 1.5x slack so ordinary scheduler jitter (a frame landing a millisecond or two late) is not
  // counted as jank - only a frame that missed its slot outright.
  const DROPPED_FRAME_THRESHOLD_MS = FRAME_BUDGET_MS * 1.5;

  // requestAnimationFrame stops ticking while the app is backgrounded, so the first frame after it
  // returns carries the whole suspended interval. That is not jank and must not enter the stats -
  // an idle stretch once reported a 102-second "worst frame".
  const SUSPENDED_FRAME_MS = 1_000;

  // The rate is averaged over a window instead of published per frame: a state write at 60 Hz
  // would itself dominate the very commit path this meter is supposed to observe.
  const SAMPLE_WINDOW_MS = 500;

  // What the engine wrote in the last window, shown beside the frame numbers
  // Writes are what an adapter generates, so a spread between adapters is the adapter's own
  // The engine's own cost is not readable from JS, since the shadow tree lives in C++
  const EMPTY_COMMIT_SAMPLE: ICommitProfile = {
    commits: 0,
    propWrites: 0,
    nodesCreated: 0,
    applyCalls: 0,
    applyMs: 0,
    decodeMs: 0,
  };

  let { accent }: { accent: string } = $props();

  let framesPerSecond = $state(0);
  let droppedFrames = $state(0);
  let worstFrameMs = $state(0);
  // Replaced wholesale each window, never mutated field-by-field, so a raw cell is enough - and
  // it keeps the per-window write off the deep-proxy path.
  let commitSample = $state.raw<ICommitProfile>(EMPTY_COMMIT_SAMPLE);

  // The running per-frame accumulators (React's useRef pair). Deliberately NOT runes: they are
  // written on every single frame and only published once per window, so making them reactive
  // would commit at 60 Hz and measure the meter instead of the screen.
  let droppedSoFar = 0;
  let worstSoFar = 0;

  $effect(() => {
    let previousFrameAt = performance.now();
    let windowStartedAt = previousFrameAt;
    let framesInWindow = 0;
    let handle = 0;
    let stopped = false;

    const onFrame = (): void => {
      if (stopped) return;
      const now = performance.now();
      const deltaMs = now - previousFrameAt;
      previousFrameAt = now;
      framesInWindow += 1;

      if (deltaMs < SUSPENDED_FRAME_MS) {
        if (deltaMs > DROPPED_FRAME_THRESHOLD_MS) droppedSoFar += 1;
        if (deltaMs > worstSoFar) worstSoFar = deltaMs;
      }

      const windowMs = now - windowStartedAt;
      // Held by a benchmark step, the whole block is skipped: `readCommitProfile()` would eat the
      // step's profile and the rune writes would add a commit inside its window
      // The window just grows and publishes once after release
      if (
        windowMs >= SAMPLE_WINDOW_MS &&
        !commitProfileGate.isHeldByBenchmark
      ) {
        framesPerSecond = Math.round((framesInWindow * 1_000) / windowMs);
        droppedFrames = droppedSoFar;
        worstFrameMs = worstSoFar;
        // Read-and-reset, once per window, so each sample covers exactly the window just closed
        // rather than an ever-growing total.
        commitSample = readCommitProfile();
        framesInWindow = 0;
        windowStartedAt = now;
      }

      handle = requestAnimationFrame(onFrame);
    };

    handle = requestAnimationFrame(onFrame);
    return (): void => {
      stopped = true;
      cancelAnimationFrame(handle);
    };
  });

  function onReset(): void {
    droppedSoFar = 0;
    worstSoFar = 0;
    droppedFrames = 0;
    worstFrameMs = 0;
    commitSample = EMPTY_COMMIT_SAMPLE;
  }
</script>

<view class="bench-meter">
  <text class="section-label">JS-THREAD FRAME RATE</text>
  <view class="bench-meter-row">
    <view class="bench-metric">
      <text
        testID="bench-fps"
        class="bench-metric-value"
        style={{ color: accent }}
      >
        {String(framesPerSecond)}
      </text>
      <text class="bench-metric-label">fps</text>
    </view>
    <view class="bench-metric">
      <text
        testID="bench-dropped"
        class="bench-metric-value"
        style={{ color: accent }}
      >
        {String(droppedFrames)}
      </text>
      <text class="bench-metric-label">dropped</text>
    </view>
    <view class="bench-metric">
      <text class="bench-metric-value" style={{ color: accent }}>
        {worstFrameMs.toFixed(0)}
      </text>
      <text class="bench-metric-label">worst ms</text>
    </view>
  </view>
  <text class="section-label">ENGINE PER WINDOW</text>
  <view class="bench-meter-row">
    <view class="bench-metric">
      <text
        testID="bench-commits"
        class="bench-metric-value"
        style={{ color: accent }}
      >
        {String(commitSample.commits)}
      </text>
      <text class="bench-metric-label">commits</text>
    </view>
    <view class="bench-metric">
      <text
        testID="bench-commit-writes"
        class="bench-metric-value"
        style={{ color: accent }}
      >
        {String(commitSample.propWrites)}
      </text>
      <text class="bench-metric-label">prop writes</text>
    </view>
  </view>
  <ActionButton
    testID="bench-fps-reset"
    title="Reset frame counters"
    onPress={onReset}
    color={accent}
  />
</view>

import { defineComponent, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { Text, View } from '@symbiote-native/vue';
import {
  readCommitProfile,
  type ICommitProfile,
} from '@symbiote-native/engine';
import { ActionButton } from './ActionButton';

// The benchmark holds this while a timed step is in flight. Without it the meter's own sampling
// window can close inside the step and consume the step's numbers, leaving a plausible zero and no
// sign that anything was lost.
//
// A mutable module field, not a prop. A prop change re-renders the meter, and that re-render is a
// commit landing inside the very window being measured — which would both perturb the duration and
// (because the screen's post-commit hook stops the clock on ANY commit) risk settling the step
// early against the wrong commit. A plain object rather than a ref for the same reason: a reactive
// read would tie the gate to the render.
export const commitProfileGate = { isHeldByBenchmark: false };

// 60 Hz budget. Frames are timed on the JS thread only: requestAnimationFrame is scheduled by
// JS, so a stall here is a stall in the code we actually optimize. The native UI thread keeps
// compositing at 60/120 Hz regardless, which is why a native FPS readout would stay flat and
// tell us nothing about the engine's commit cost.
const FRAME_BUDGET_MS = 1000 / 60;

// 1.5x slack so ordinary scheduler jitter (a frame landing a millisecond or two late) is not
// counted as jank - only a frame that missed its slot outright.
const DROPPED_FRAME_THRESHOLD_MS = FRAME_BUDGET_MS * 1.5;

// requestAnimationFrame stops ticking while the app is backgrounded, so the first frame after it
// returns carries the whole suspended interval. That is not jank and must not enter the stats -
// an idle stretch once reported a 102-second "worst frame".
const SUSPENDED_FRAME_MS = 1_000;

// The rate is averaged over a window instead of published per frame: a state write at 60 Hz would
// itself dominate the very commit path this meter is supposed to observe.
const SAMPLE_WINDOW_MS = 500;

type IJsFrameRateMeterProps = {
  accent: string;
};

// What the engine was ASKED for inside the last window, beside the frame numbers so the two can be
// read against each other: a stall with no commits under it is not the commit path's.
//
// Counts, never a share of the window. What the engine SPENDS is no longer readable from JS - the
// tree lives in C++ and this side only fills a command buffer, so timing it means instrumenting the
// host, not this meter.
const EMPTY_COMMIT_PROFILE: ICommitProfile = {
  commits: 0,
  propWrites: 0,
  applyMs: 0,
  buildMs: 0,
  commitMs: 0,
  adoptSwaps: 0,
  propClones: 0,
  textSwaps: 0,
  dirtyTexts: 0,
  layoutMs: 0,
  textMs: 0,
  layoutNodes: 0,
  textMeasures: 0,
};

/**
 * JS-thread frame rate. A requestAnimationFrame loop measures the delta between consecutive
 * frames, reports the averaged rate over a half-second window, and keeps a running count of
 * frames that arrived later than one and a half budgets - the visible cost of a long commit.
 */
export const JsFrameRateMeter = defineComponent<IJsFrameRateMeterProps>(
  props => {
    const framesPerSecond = ref(0);
    const droppedFrames = ref(0);
    const worstFrameMs = ref(0);
    // shallowRef, not ref: the sample is replaced wholesale each window, so a deep proxy would
    // only add per-field tracking - and would wrap the shared EMPTY_COMMIT_PROFILE constant.
    const engine = shallowRef<ICommitProfile>(EMPTY_COMMIT_PROFILE);
    // Plain locals, not refs: setup runs once, so these survive re-renders on their own. React
    // needs useRef here only because its component body re-runs.
    let droppedCount = 0;
    let worstMs = 0;

    let handle = 0;
    let stopped = false;

    onMounted(() => {
      let previousFrameAt = performance.now();
      let windowStartedAt = previousFrameAt;
      let framesInWindow = 0;

      const onFrame = (): void => {
        if (stopped) return;
        const now = performance.now();
        const deltaMs = now - previousFrameAt;
        previousFrameAt = now;
        framesInWindow += 1;

        if (deltaMs < SUSPENDED_FRAME_MS) {
          if (deltaMs > DROPPED_FRAME_THRESHOLD_MS) droppedCount += 1;
          if (deltaMs > worstMs) worstMs = deltaMs;
        }

        const windowMs = now - windowStartedAt;
        // While a benchmark step holds the gate the whole window-close block is skipped, publish
        // and reset alike: the readCommitProfile() below would eat the step's profile, and the ref
        // writes would put an extra commit inside its measured window. The window simply grows and
        // publishes once, longer, after the step releases.
        if (
          windowMs >= SAMPLE_WINDOW_MS &&
          !commitProfileGate.isHeldByBenchmark
        ) {
          framesPerSecond.value = Math.round(
            (framesInWindow * 1000) / windowMs,
          );
          droppedFrames.value = droppedCount;
          worstFrameMs.value = worstMs;
          // Read-and-reset, once per window, so each sample covers exactly the window just closed
          // rather than an ever-growing total.
          engine.value = readCommitProfile();
          framesInWindow = 0;
          windowStartedAt = now;
        }

        handle = requestAnimationFrame(onFrame);
      };

      handle = requestAnimationFrame(onFrame);
    });

    onUnmounted(() => {
      stopped = true;
      cancelAnimationFrame(handle);
    });

    const onReset = (): void => {
      droppedCount = 0;
      worstMs = 0;
      droppedFrames.value = 0;
      worstFrameMs.value = 0;
      engine.value = EMPTY_COMMIT_PROFILE;
    };

    return () => (
      <View class="bench-meter">
        <Text class="section-label">JS-THREAD FRAME RATE</Text>
        <View class="bench-meter-row">
          <View class="bench-metric">
            <Text
              testID="bench-fps"
              class="bench-metric-value"
              style={{ color: props.accent }}
            >
              {String(framesPerSecond.value)}
            </Text>
            <Text class="bench-metric-label">fps</Text>
          </View>
          <View class="bench-metric">
            <Text
              testID="bench-dropped"
              class="bench-metric-value"
              style={{ color: props.accent }}
            >
              {String(droppedFrames.value)}
            </Text>
            <Text class="bench-metric-label">dropped</Text>
          </View>
          <View class="bench-metric">
            <Text class="bench-metric-value" style={{ color: props.accent }}>
              {worstFrameMs.value.toFixed(0)}
            </Text>
            <Text class="bench-metric-label">worst ms</Text>
          </View>
        </View>
        <Text class="section-label">ENGINE PER WINDOW</Text>
        <View class="bench-meter-row">
          <View class="bench-metric">
            <Text
              testID="bench-commits"
              class="bench-metric-value"
              style={{ color: props.accent }}
            >
              {String(engine.value.commits)}
            </Text>
            <Text class="bench-metric-label">commits</Text>
          </View>
          <View class="bench-metric">
            <Text
              testID="bench-commit-writes"
              class="bench-metric-value"
              style={{ color: props.accent }}
            >
              {String(engine.value.propWrites)}
            </Text>
            <Text class="bench-metric-label">prop writes</Text>
          </View>
        </View>
        <ActionButton
          testID="bench-fps-reset"
          title="Reset frame counters"
          onPress={onReset}
          color={props.accent}
        />
      </View>
    );
  },
  { name: 'JsFrameRateMeter', props: ['accent'] },
);

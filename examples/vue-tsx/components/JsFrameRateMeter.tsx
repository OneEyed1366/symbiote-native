import { defineComponent, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { Text, View } from '@symbiote-native/vue';
import { readCommitProfile } from '@symbiote-native/engine';
import { ActionButton } from './ActionButton';

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

// What the engine's reconcile walk cost inside the last window, next to the frame numbers so the
// two can be read against each other: the walk is a term in every adapter's frame budget.
//
// Reported as two halves, never as `walkMs / nodesVisited`. Dirty-marking means the denominator
// counts only the nodes reconcile did NOT skip, while the numerator still covers everything it does
// (the JSI createNode/appendChild calls included), so that ratio inflates by the skip factor: 13.4
// us/node without dirty-marking, 438 us/node with it, on a device that had got ~2x faster. So
// `nodesPerCommit` is the skip itself (read against the screen's node count) and `msPerCommit` is
// what a commit costs. A true per-node figure needs a full walk - a cold mount, where nothing is
// skippable.
type IWalkSample = {
  sharePercent: number;
  nodesPerCommit: number;
  msPerCommit: number;
};

const EMPTY_WALK_SAMPLE: IWalkSample = {
  sharePercent: 0,
  nodesPerCommit: 0,
  msPerCommit: 0,
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
    // only add per-field tracking - and would wrap the shared EMPTY_WALK_SAMPLE constant.
    const walk = shallowRef<IWalkSample>(EMPTY_WALK_SAMPLE);
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
        if (windowMs >= SAMPLE_WINDOW_MS) {
          framesPerSecond.value = Math.round(
            (framesInWindow * 1000) / windowMs,
          );
          droppedFrames.value = droppedCount;
          worstFrameMs.value = worstMs;
          // Read-and-reset, once per window, so each sample covers exactly the window just closed
          // rather than an ever-growing total.
          const commitProfile = readCommitProfile();
          walk.value = {
            sharePercent: (commitProfile.walkMs / windowMs) * 100,
            nodesPerCommit:
              commitProfile.commits === 0
                ? 0
                : commitProfile.nodesVisited / commitProfile.commits,
            msPerCommit:
              commitProfile.commits === 0
                ? 0
                : commitProfile.walkMs / commitProfile.commits,
          };
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
      walk.value = EMPTY_WALK_SAMPLE;
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
        <Text class="section-label">ENGINE RECONCILE WALK</Text>
        <View class="bench-meter-row">
          <View class="bench-metric">
            <Text
              testID="bench-walk-share"
              class="bench-metric-value"
              style={{ color: props.accent }}
            >
              {walk.value.sharePercent.toFixed(1)}
            </Text>
            <Text class="bench-metric-label">% of window</Text>
          </View>
          <View class="bench-metric">
            <Text
              testID="bench-walk-nodes-per-commit"
              class="bench-metric-value"
              style={{ color: props.accent }}
            >
              {walk.value.nodesPerCommit.toFixed(0)}
            </Text>
            <Text class="bench-metric-label">nodes / commit</Text>
          </View>
          <View class="bench-metric">
            <Text
              testID="bench-walk-ms-per-commit"
              class="bench-metric-value"
              style={{ color: props.accent }}
            >
              {walk.value.msPerCommit.toFixed(1)}
            </Text>
            <Text class="bench-metric-label">ms / commit</Text>
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

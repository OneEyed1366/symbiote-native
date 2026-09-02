import { useEffect, useRef, useState } from 'react';
import { Text, View } from '@symbiote-native/react';
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

// The rate is averaged over a window instead of published per frame: a setState at 60 Hz would
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

// `readCommitProfile()` is read-and-RESET, and this meter calls it once per window off rAF. A
// benchmark step that wants the profile of its OWN commit must stop the meter first: otherwise a
// window can close inside the step and consume the step's numbers, leaving a plausible zero and no
// sign that anything was lost.
//
// A mutable module field, not a prop. A prop change re-renders the meter, and that re-render is a
// commit landing inside the very window being measured — which would both perturb the duration and
// (because the screen's post-commit hook stops the clock on ANY commit) risk settling the step
// early against the wrong commit.
export const commitProfileGate = { isHeldByBenchmark: false };

/**
 * JS-thread frame rate. A requestAnimationFrame loop measures the delta between consecutive
 * frames, reports the averaged rate over a half-second window, and keeps a running count of
 * frames that arrived later than one and a half budgets - the visible cost of a long commit.
 */
export function JsFrameRateMeter({ accent }: IJsFrameRateMeterProps) {
  const [framesPerSecond, setFramesPerSecond] = useState(0);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [worstFrameMs, setWorstFrameMs] = useState(0);
  const [walk, setWalk] = useState<IWalkSample>(EMPTY_WALK_SAMPLE);
  const droppedRef = useRef(0);
  const worstRef = useRef(0);

  useEffect(() => {
    let previousFrameAt = performance.now();
    let windowStartedAt = previousFrameAt;
    let framesInWindow = 0;
    let handle = 0;
    let stopped = false;

    const onFrame = () => {
      if (stopped) return;
      const now = performance.now();
      const deltaMs = now - previousFrameAt;
      previousFrameAt = now;
      framesInWindow += 1;

      if (deltaMs < SUSPENDED_FRAME_MS) {
        if (deltaMs > DROPPED_FRAME_THRESHOLD_MS) droppedRef.current += 1;
        if (deltaMs > worstRef.current) worstRef.current = deltaMs;
      }

      const windowMs = now - windowStartedAt;
      // While a benchmark step holds the gate the whole window-close block is skipped, publish and
      // reset alike: the readCommitProfile() below would eat the step's profile, and the three
      // setStates would put an extra commit inside its measured window. The window simply grows and
      // publishes once, longer, after the step releases.
      if (
        windowMs >= SAMPLE_WINDOW_MS &&
        !commitProfileGate.isHeldByBenchmark
      ) {
        setFramesPerSecond(Math.round((framesInWindow * 1000) / windowMs));
        setDroppedFrames(droppedRef.current);
        setWorstFrameMs(worstRef.current);
        // Read-and-reset, once per window, so each sample covers exactly the window just closed
        // rather than an ever-growing total.
        const commitProfile = readCommitProfile();
        setWalk({
          sharePercent: (commitProfile.walkMs / windowMs) * 100,
          nodesPerCommit:
            commitProfile.commits === 0
              ? 0
              : commitProfile.nodesVisited / commitProfile.commits,
          msPerCommit:
            commitProfile.commits === 0
              ? 0
              : commitProfile.walkMs / commitProfile.commits,
        });
        framesInWindow = 0;
        windowStartedAt = now;
      }

      handle = requestAnimationFrame(onFrame);
    };

    handle = requestAnimationFrame(onFrame);
    return () => {
      stopped = true;
      cancelAnimationFrame(handle);
    };
  }, []);

  const onReset = () => {
    droppedRef.current = 0;
    worstRef.current = 0;
    setDroppedFrames(0);
    setWorstFrameMs(0);
    setWalk(EMPTY_WALK_SAMPLE);
  };

  return (
    <View className="bench-meter">
      <Text className="section-label">JS-THREAD FRAME RATE</Text>
      <View className="bench-meter-row">
        <View className="bench-metric">
          <Text
            testID="bench-fps"
            className="bench-metric-value"
            style={{ color: accent }}
          >
            {String(framesPerSecond)}
          </Text>
          <Text className="bench-metric-label">fps</Text>
        </View>
        <View className="bench-metric">
          <Text
            testID="bench-dropped"
            className="bench-metric-value"
            style={{ color: accent }}
          >
            {String(droppedFrames)}
          </Text>
          <Text className="bench-metric-label">dropped</Text>
        </View>
        <View className="bench-metric">
          <Text className="bench-metric-value" style={{ color: accent }}>
            {worstFrameMs.toFixed(0)}
          </Text>
          <Text className="bench-metric-label">worst ms</Text>
        </View>
      </View>
      <Text className="section-label">ENGINE RECONCILE WALK</Text>
      <View className="bench-meter-row">
        <View className="bench-metric">
          <Text
            testID="bench-walk-share"
            className="bench-metric-value"
            style={{ color: accent }}
          >
            {walk.sharePercent.toFixed(1)}
          </Text>
          <Text className="bench-metric-label">% of window</Text>
        </View>
        <View className="bench-metric">
          <Text
            testID="bench-walk-nodes-per-commit"
            className="bench-metric-value"
            style={{ color: accent }}
          >
            {walk.nodesPerCommit.toFixed(0)}
          </Text>
          <Text className="bench-metric-label">nodes / commit</Text>
        </View>
        <View className="bench-metric">
          <Text
            testID="bench-walk-ms-per-commit"
            className="bench-metric-value"
            style={{ color: accent }}
          >
            {walk.msPerCommit.toFixed(1)}
          </Text>
          <Text className="bench-metric-label">ms / commit</Text>
        </View>
      </View>
      <ActionButton
        testID="bench-fps-reset"
        title="Reset frame counters"
        onPress={onReset}
        color={accent}
      />
    </View>
  );
}

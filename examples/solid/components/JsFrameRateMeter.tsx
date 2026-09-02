// JS-thread frame rate + the engine's reconcile-walk cost, ported from
// examples/react/components/JsFrameRateMeter.tsx. Every constant, every label and every testID is
// the reference's, because the numbers on this panel are read next to the other five canaries'.
//
// Solid shape, not a transliterated React component: the counters are signals, the running totals
// between samples are plain `let` bindings (nothing reads them during render, so making them
// reactive would only cost a notification), and the rAF loop is started in onMount and torn down
// in onCleanup instead of an effect returning a disposer. NOTHING destructures `props` — a Solid
// component body runs ONCE, so a destructured `accent` would freeze at its mount-time value.

import { createSignal, onCleanup, onMount } from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { readCommitProfile } from '@symbiote-native/engine';
import { ActionButton } from './ActionButton';
import './JsFrameRateMeter.css';

// 60 Hz budget. Frames are timed on the JS thread only: requestAnimationFrame is scheduled by
// JS, so a stall here is a stall in the code we actually optimize. The native UI thread keeps
// compositing at 60/120 Hz regardless, which is why a native FPS readout would stay flat and
// tell us nothing about the engine's commit cost.
const FRAME_BUDGET_MS = 1000 / 60;

// 1.5x slack so ordinary scheduler jitter (a frame landing a millisecond or two late) is not
// counted as jank — only a frame that missed its slot outright.
const DROPPED_FRAME_THRESHOLD_MS = FRAME_BUDGET_MS * 1.5;

// requestAnimationFrame stops ticking while the app is backgrounded, so the first frame after it
// returns carries the whole suspended interval. That is not jank and must not enter the stats —
// an idle stretch once reported a 102-second "worst frame".
const SUSPENDED_FRAME_MS = 1_000;

// The rate is averaged over a window instead of published per frame: writing a signal at 60 Hz
// would itself dominate the very commit path this meter is supposed to observe.
const SAMPLE_WINDOW_MS = 500;

const MS_PER_SECOND = 1000;
const PERCENT = 100;

interface IJsFrameRateMeterProps {
  accent: string;
}

// What the engine's reconcile walk cost inside the last window, next to the frame numbers so the
// two can be read against each other: the walk is a term in every adapter's frame budget.
//
// Reported as two halves, never as `walkMs / nodesVisited`. Dirty-marking means the denominator
// counts only the nodes reconcile did NOT skip, while the numerator still covers everything it does
// (the JSI createNode/appendChild calls included), so that ratio inflates by the skip factor: 13.4
// us/node without dirty-marking, 438 us/node with it, on a device that had got ~2x faster. So
// `nodesPerCommit` is the skip itself (read against the screen's node count) and `msPerCommit` is
// what a commit costs. A true per-node figure needs a full walk — a cold mount, where nothing is
// skippable.
interface IWalkSample {
  sharePercent: number;
  nodesPerCommit: number;
  msPerCommit: number;
}

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
// A mutable module field, not a signal and not a prop. Either would be reactive, and a reactive
// change re-renders the meter — a commit landing inside the very window being measured, which would
// both perturb the duration and (because the screen's post-commit hook stops the clock on ANY
// commit) risk settling the step early against the wrong commit.
export const commitProfileGate = { isHeldByBenchmark: false };

/**
 * JS-thread frame rate. A requestAnimationFrame loop measures the delta between consecutive
 * frames, reports the averaged rate over a half-second window, and keeps a running count of
 * frames that arrived later than one and a half budgets — the visible cost of a long commit.
 */
export function JsFrameRateMeter(props: IJsFrameRateMeterProps) {
  const [framesPerSecond, setFramesPerSecond] = createSignal(0);
  const [droppedFrames, setDroppedFrames] = createSignal(0);
  const [worstFrameMs, setWorstFrameMs] = createSignal(0);
  const [walk, setWalk] = createSignal<IWalkSample>(EMPTY_WALK_SAMPLE);

  // Running totals, carried across windows and published only when one closes. Plain bindings
  // rather than signals: no JSX reads them, so a signal would notify nobody.
  let droppedSinceReset = 0;
  let worstSinceResetMs = 0;

  onMount(() => {
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
        if (deltaMs > DROPPED_FRAME_THRESHOLD_MS) droppedSinceReset += 1;
        if (deltaMs > worstSinceResetMs) worstSinceResetMs = deltaMs;
      }

      const windowMs = now - windowStartedAt;
      // While a benchmark step holds the gate the whole window-close block is skipped, publish and
      // reset alike: the readCommitProfile() below would eat the step's profile, and the four signal
      // writes would put an extra commit inside its measured window. The window simply grows and
      // publishes once, longer, after the step releases.
      if (
        windowMs >= SAMPLE_WINDOW_MS &&
        !commitProfileGate.isHeldByBenchmark
      ) {
        setFramesPerSecond(
          Math.round((framesInWindow * MS_PER_SECOND) / windowMs),
        );
        setDroppedFrames(droppedSinceReset);
        setWorstFrameMs(worstSinceResetMs);
        // Read-and-reset, once per window, so each sample covers exactly the window just closed
        // rather than an ever-growing total.
        const commitProfile = readCommitProfile();
        setWalk({
          sharePercent: (commitProfile.walkMs / windowMs) * PERCENT,
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
    onCleanup(() => {
      stopped = true;
      cancelAnimationFrame(handle);
    });
  });

  const onReset = (): void => {
    droppedSinceReset = 0;
    worstSinceResetMs = 0;
    setDroppedFrames(0);
    setWorstFrameMs(0);
    setWalk(EMPTY_WALK_SAMPLE);
  };

  return (
    <View class="bench-meter">
      <Text class="section-label">JS-THREAD FRAME RATE</Text>
      <View class="bench-meter-row">
        <View class="bench-metric">
          <Text
            testID="bench-fps"
            class="bench-metric-value"
            style={{ color: props.accent }}
          >
            {String(framesPerSecond())}
          </Text>
          <Text class="bench-metric-label">fps</Text>
        </View>
        <View class="bench-metric">
          <Text
            testID="bench-dropped"
            class="bench-metric-value"
            style={{ color: props.accent }}
          >
            {String(droppedFrames())}
          </Text>
          <Text class="bench-metric-label">dropped</Text>
        </View>
        <View class="bench-metric">
          <Text class="bench-metric-value" style={{ color: props.accent }}>
            {worstFrameMs().toFixed(0)}
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
            {walk().sharePercent.toFixed(1)}
          </Text>
          <Text class="bench-metric-label">% of window</Text>
        </View>
        <View class="bench-metric">
          <Text
            testID="bench-walk-nodes-per-commit"
            class="bench-metric-value"
            style={{ color: props.accent }}
          >
            {walk().nodesPerCommit.toFixed(0)}
          </Text>
          <Text class="bench-metric-label">nodes / commit</Text>
        </View>
        <View class="bench-metric">
          <Text
            testID="bench-walk-ms-per-commit"
            class="bench-metric-value"
            style={{ color: props.accent }}
          >
            {walk().msPerCommit.toFixed(1)}
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
}

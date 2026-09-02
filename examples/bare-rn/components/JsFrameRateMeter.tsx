import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from './ActionButton';

// 60 Hz budget. Frames are timed on the JS thread only: requestAnimationFrame is scheduled by
// JS, so a stall here is a stall in the code we actually optimize. The native UI thread keeps
// compositing at 60/120 Hz regardless, which is why a native FPS readout would stay flat and
// tell us nothing about the renderer's commit cost.
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

const MS_PER_SECOND = 1000;

// React Native installs `performance` on the global scope but does not declare it in its
// TypeScript globals (src/types/globals.d.ts stops at request/cancelAnimationFrame).
declare const performance: { now: () => number };

type IJsFrameRateMeterProps = {
  accent: string;
};

/**
 * JS-thread frame rate. A requestAnimationFrame loop measures the delta between consecutive
 * frames, reports the averaged rate over a half-second window, and keeps a running count of
 * frames that arrived later than one and a half budgets - the visible cost of a long commit.
 *
 * There is no reconcile-walk panel here, unlike the Symbiote canaries: React's own Fabric
 * renderer exposes no commit profiler, and a panel reading 0.0 ms would be read as "stock RN
 * commits for free".
 */
export function JsFrameRateMeter({ accent }: IJsFrameRateMeterProps) {
  const [framesPerSecond, setFramesPerSecond] = useState(0);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [worstFrameMs, setWorstFrameMs] = useState(0);
  const droppedRef = useRef(0);
  const worstRef = useRef(0);

  useEffect(() => {
    let previousFrameAt = performance.now();
    let windowStartedAt = previousFrameAt;
    let framesInWindow = 0;
    let handle = 0;
    let isStopped = false;

    const onFrame = () => {
      if (isStopped) return;
      const now = performance.now();
      const deltaMs = now - previousFrameAt;
      previousFrameAt = now;
      framesInWindow += 1;

      if (deltaMs < SUSPENDED_FRAME_MS) {
        if (deltaMs > DROPPED_FRAME_THRESHOLD_MS) droppedRef.current += 1;
        if (deltaMs > worstRef.current) worstRef.current = deltaMs;
      }

      const windowMs = now - windowStartedAt;
      if (windowMs >= SAMPLE_WINDOW_MS) {
        setFramesPerSecond(
          Math.round((framesInWindow * MS_PER_SECOND) / windowMs),
        );
        setDroppedFrames(droppedRef.current);
        setWorstFrameMs(worstRef.current);
        framesInWindow = 0;
        windowStartedAt = now;
      }

      handle = requestAnimationFrame(onFrame);
    };

    handle = requestAnimationFrame(onFrame);
    return () => {
      isStopped = true;
      cancelAnimationFrame(handle);
    };
  }, []);

  const onReset = () => {
    droppedRef.current = 0;
    worstRef.current = 0;
    setDroppedFrames(0);
    setWorstFrameMs(0);
  };

  return (
    <View style={styles.benchMeter}>
      <Text style={styles.sectionLabel}>JS-THREAD FRAME RATE</Text>
      <View style={styles.benchMeterRow}>
        <View style={styles.benchMetric}>
          <Text
            testID="bench-fps"
            style={[styles.benchMetricValue, { color: accent }]}
          >
            {String(framesPerSecond)}
          </Text>
          <Text style={styles.benchMetricLabel}>fps</Text>
        </View>
        <View style={styles.benchMetric}>
          <Text
            testID="bench-dropped"
            style={[styles.benchMetricValue, { color: accent }]}
          >
            {String(droppedFrames)}
          </Text>
          <Text style={styles.benchMetricLabel}>dropped</Text>
        </View>
        <View style={styles.benchMetric}>
          <Text style={[styles.benchMetricValue, { color: accent }]}>
            {worstFrameMs.toFixed(0)}
          </Text>
          <Text style={styles.benchMetricLabel}>worst ms</Text>
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

// Ported from the Symbiote canary's `.bench-meter*` / `.bench-metric*` / `.section-label` CSS
// classes; stock RN has no className, so the declarations live here instead.
const styles = StyleSheet.create({
  benchMeter: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#13243a',
  },
  benchMeterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  benchMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 12,
    backgroundColor: '#0b1622',
  },
  benchMetricValue: {
    fontSize: 26,
    fontWeight: 'bold',
  },
  benchMetricLabel: {
    color: '#41506a',
    fontSize: 11,
    letterSpacing: 1,
  },
  sectionLabel: {
    color: '#41506a',
    fontSize: 13,
  },
});

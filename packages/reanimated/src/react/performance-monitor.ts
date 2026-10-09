import { createElement, useEffect, useState, type ReactElement } from 'react';
import { StyleSheet } from '@symbiote-native/react';
import type { FrameInfo } from 'react-native-reanimated/src/frameCallback';
import { TextInput, View } from './animated';
import { useAnimatedProps } from './hooks/use-animated-props';
import { useFrameCallback } from './hooks/use-frame-callback';
import { useSharedValue } from './hooks/use-shared-value';

const DEFAULT_BUFFER_SIZE = 20;
const MS_PER_SECOND = 1_000;

type ICircularBuffer = {
  next: number;
  buffer: Float32Array;
  size: number;
  count: number;
  push(value: number): number | null;
};

type IReadingProps = { smoothingFrames: number };

export type IPerformanceMonitorProps = {
  // Frames kept for smoothing at the highest rate, so a bigger value is a steadier number
  smoothingFrames?: number;
};

function createCircularDoublesBuffer(size: number): ICircularBuffer {
  'worklet';
  return {
    next: 0,
    buffer: new Float32Array(size),
    size,
    count: 0,
    push(value) {
      const oldValue = this.buffer[this.next];
      const oldCount = this.count;
      this.buffer[this.next] = value;
      this.next = (this.next + 1) % this.size;
      this.count = Math.min(this.size, this.count + 1);
      return oldCount === this.size ? oldValue : null;
    },
  };
}

function completeBufferRoutine(
  buffer: ICircularBuffer,
  timestamp: number,
): number {
  'worklet';
  const rounded = Math.round(timestamp);
  const droppedTimestamp = buffer.push(rounded) ?? rounded;
  const averageFrameTime = (rounded - droppedTimestamp) / buffer.count;
  return MS_PER_SECOND / averageFrameTime;
}

const styles = StyleSheet.create({
  monitor: {
    flexDirection: 'row',
    position: 'absolute',
    backgroundColor: '#0006',
    zIndex: 1_000,
  },
  text: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    color: '#ffff',
    fontFamily: 'monospace',
    paddingHorizontal: 3,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

function readingOf(
  animatedProps: ReturnType<typeof useAnimatedProps>,
): ReactElement {
  return createElement(
    View,
    { style: styles.container },
    createElement(TextInput, {
      style: styles.text,
      animatedProps,
      editable: false,
    }),
  );
}

function JsPerformance({ smoothingFrames }: IReadingProps): ReactElement {
  const jsFps = useSharedValue<string | null>(null);
  const [buffer] = useState(() => createCircularDoublesBuffer(smoothingFrames));

  useEffect(() => {
    let frame = requestAnimationFrame(function measure(timestamp) {
      jsFps.value = completeBufferRoutine(buffer, timestamp).toFixed(0);
      frame = requestAnimationFrame(measure);
    });
    return () => cancelAnimationFrame(frame);
  }, [jsFps, buffer]);

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const text = 'JS: ' + (jsFps.value ?? 'N/A') + ' ';
    return { text, defaultValue: text };
  });
  return readingOf(animatedProps);
}

function UiPerformance({ smoothingFrames }: IReadingProps): ReactElement {
  const uiFps = useSharedValue<string | null>(null);
  const circularBuffer = useSharedValue<ICircularBuffer | null>(null);

  useFrameCallback(({ timestamp }: FrameInfo) => {
    'worklet';
    if (circularBuffer.value === null) {
      circularBuffer.value = createCircularDoublesBuffer(smoothingFrames);
    }
    uiFps.value = completeBufferRoutine(
      circularBuffer.value,
      timestamp,
    ).toFixed(0);
  });

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const text = 'UI: ' + (uiFps.value ?? 'N/A') + ' ';
    return { text, defaultValue: text };
  });
  return readingOf(animatedProps);
}

// A JS and a UI frame rate, as upstream's overlay shows them
export function PerformanceMonitor({
  smoothingFrames = DEFAULT_BUFFER_SIZE,
}: IPerformanceMonitorProps): ReactElement {
  return createElement(
    View,
    { style: styles.monitor },
    createElement(JsPerformance, { smoothingFrames }),
    createElement(UiPerformance, { smoothingFrames }),
  );
}

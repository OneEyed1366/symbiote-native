import { StyleSheet } from '@symbiote-native/engine';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type { FrameInfo } from 'react-native-reanimated/src/frameCallback';

export const DEFAULT_BUFFER_SIZE = 20;
const MS_PER_SECOND = 1_000;

type ICircularBuffer = {
  next: number;
  buffer: Float32Array;
  size: number;
  count: number;
  push(value: number): number | null;
};

export type IPerformanceMonitorProps = {
  // Frames kept for smoothing at the highest rate, so a bigger value is a steadier number
  smoothingFrames?: number;
};

export function createCircularDoublesBuffer(size: number): ICircularBuffer {
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

export function completeBufferRoutine(
  buffer: ICircularBuffer,
  timestamp: number,
): number {
  'worklet';
  const rounded = Math.round(timestamp);
  const droppedTimestamp = buffer.push(rounded) ?? rounded;
  const averageFrameTime = (rounded - droppedTimestamp) / buffer.count;
  return MS_PER_SECOND / averageFrameTime;
}

// Counts the JS frames into `jsFps` a frame at a time, and returns the stop
export function measureJsFrames(
  buffer: ICircularBuffer,
  jsFps: SharedValue<string | null>,
): () => void {
  let frame = requestAnimationFrame(function measure(timestamp) {
    jsFps.value = completeBufferRoutine(buffer, timestamp).toFixed(0);
    frame = requestAnimationFrame(measure);
  });
  return () => cancelAnimationFrame(frame);
}

export const performanceStyles = StyleSheet.create({
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

// The text the reading shows, written by the UI side whenever its frame rate changes
export function readingUpdater(
  label: 'JS' | 'UI',
  fps: SharedValue<string | null>,
) {
  return () => {
    'worklet';
    const text = label + ': ' + (fps.value ?? 'N/A') + ' ';
    return { text, defaultValue: text };
  };
}

// Measures the UI frame rate, a frame at a time
export function uiFrameMeter(
  smoothingFrames: number,
  circularBuffer: SharedValue<ICircularBuffer | null>,
  uiFps: SharedValue<string | null>,
) {
  return ({ timestamp }: FrameInfo) => {
    'worklet';
    if (circularBuffer.value === null) {
      circularBuffer.value = createCircularDoublesBuffer(smoothingFrames);
    }
    uiFps.value = completeBufferRoutine(
      circularBuffer.value,
      timestamp,
    ).toFixed(0);
  };
}

import { createComponent, onCleanup } from 'solid-js';
import { descriptorToSolid } from '@symbiote-native/solid';
import type { ISymbioteNode } from '@symbiote-native/engine';
import {
  createCircularDoublesBuffer,
  DEFAULT_BUFFER_SIZE,
  measureJsFrames,
  performanceStyles,
  readingUpdater,
  uiFrameMeter,
  type IPerformanceMonitorProps,
} from '../core/performance-monitor';
import { hostNode } from './host-node';
import { hooks } from './primitives/hooks';

export type { IPerformanceMonitorProps };

type IReadingProps = { smoothingFrames: number };

const { useAnimatedProps, useFrameCallback, useSharedValue } = hooks;

function readingOf(
  animatedProps: ReturnType<typeof useAnimatedProps>,
): ISymbioteNode {
  return descriptorToSolid(() => ({
    type: 'view',
    props: { style: performanceStyles.container },
    children: [
      {
        type: 'text-input',
        props: {
          style: performanceStyles.text,
          animatedProps,
          editable: false,
        },
        children: [],
      },
    ],
  }));
}

function JsPerformance(props: IReadingProps): ISymbioteNode {
  const jsFps = useSharedValue<string | null>(null);
  const buffer = createCircularDoublesBuffer(props.smoothingFrames);
  onCleanup(measureJsFrames(buffer, jsFps));

  return readingOf(useAnimatedProps(readingUpdater('JS', jsFps)));
}

function UiPerformance(props: IReadingProps): ISymbioteNode {
  const uiFps = useSharedValue<string | null>(null);
  const circularBuffer = useSharedValue<ReturnType<
    typeof createCircularDoublesBuffer
  > | null>(null);
  useFrameCallback(uiFrameMeter(props.smoothingFrames, circularBuffer, uiFps));

  return readingOf(useAnimatedProps(readingUpdater('UI', uiFps)));
}

// A JS and a UI frame rate, as upstream's overlay shows them
export function PerformanceMonitor(
  props: IPerformanceMonitorProps,
): ISymbioteNode {
  const smoothingFrames = () => props.smoothingFrames ?? DEFAULT_BUFFER_SIZE;
  return hostNode(
    'view',
    () => ({ style: performanceStyles.monitor }),
    () => [
      createComponent(JsPerformance, {
        get smoothingFrames() {
          return smoothingFrames();
        },
      }),
      createComponent(UiPerformance, {
        get smoothingFrames() {
          return smoothingFrames();
        },
      }),
    ],
  );
}

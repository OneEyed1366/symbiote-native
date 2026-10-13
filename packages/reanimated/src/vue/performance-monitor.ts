import {
  defineComponent,
  h,
  onScopeDispose,
  type VNode,
} from '@vue/runtime-core';
import {
  createCircularDoublesBuffer,
  DEFAULT_BUFFER_SIZE,
  measureJsFrames,
  performanceStyles,
  readingUpdater,
  uiFrameMeter,
  type IPerformanceMonitorProps,
} from '../core/performance-monitor';
import { TextInput, View } from './animated';
import { useAnimatedProps } from './composables/use-animated-props';
import { useFrameCallback } from './composables/use-frame-callback';
import { useSharedValue } from './composables/use-shared-value';

export type { IPerformanceMonitorProps };

function readingOf(animatedProps: ReturnType<typeof useAnimatedProps>): VNode {
  return h(View, { style: performanceStyles.container }, [
    h(TextInput, {
      style: performanceStyles.text,
      animatedProps,
      editable: false,
    }),
  ]);
}

const JsPerformance = defineComponent(
  (props: { smoothingFrames: number }) => {
    const jsFps = useSharedValue<string | null>(null);
    const buffer = createCircularDoublesBuffer(props.smoothingFrames);
    onScopeDispose(measureJsFrames(buffer, jsFps));

    const animatedProps = useAnimatedProps(readingUpdater('JS', jsFps));
    return () => readingOf(animatedProps);
  },
  { name: 'JsPerformance', props: ['smoothingFrames'] },
);

const UiPerformance = defineComponent(
  (props: { smoothingFrames: number }) => {
    const uiFps = useSharedValue<string | null>(null);
    const circularBuffer = useSharedValue<ReturnType<
      typeof createCircularDoublesBuffer
    > | null>(null);
    useFrameCallback(
      uiFrameMeter(props.smoothingFrames, circularBuffer, uiFps),
    );

    const animatedProps = useAnimatedProps(readingUpdater('UI', uiFps));
    return () => readingOf(animatedProps);
  },
  { name: 'UiPerformance', props: ['smoothingFrames'] },
);

// A JS and a UI frame rate, as upstream's overlay shows them
export const PerformanceMonitor = defineComponent(
  (props: IPerformanceMonitorProps) => () => {
    const smoothingFrames = props.smoothingFrames ?? DEFAULT_BUFFER_SIZE;
    return h(View, { style: performanceStyles.monitor }, [
      h(JsPerformance, { smoothingFrames }),
      h(UiPerformance, { smoothingFrames }),
    ]);
  },
  { name: 'PerformanceMonitor', props: ['smoothingFrames'] },
);

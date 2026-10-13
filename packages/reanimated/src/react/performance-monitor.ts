import { createElement, useEffect, useState, type ReactElement } from 'react';
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
import { useAnimatedProps } from './hooks/use-animated-props';
import { useFrameCallback } from './hooks/use-frame-callback';
import { useSharedValue } from './hooks/use-shared-value';

export type { IPerformanceMonitorProps };

type IReadingProps = { smoothingFrames: number };

function readingOf(
  animatedProps: ReturnType<typeof useAnimatedProps>,
): ReactElement {
  return createElement(
    View,
    { style: performanceStyles.container },
    createElement(TextInput, {
      style: performanceStyles.text,
      animatedProps,
      editable: false,
    }),
  );
}

function JsPerformance({ smoothingFrames }: IReadingProps): ReactElement {
  const jsFps = useSharedValue<string | null>(null);
  const [buffer] = useState(() => createCircularDoublesBuffer(smoothingFrames));

  useEffect(() => measureJsFrames(buffer, jsFps), [jsFps, buffer]);

  return readingOf(useAnimatedProps(readingUpdater('JS', jsFps)));
}

function UiPerformance({ smoothingFrames }: IReadingProps): ReactElement {
  const uiFps = useSharedValue<string | null>(null);
  const circularBuffer = useSharedValue<ReturnType<
    typeof createCircularDoublesBuffer
  > | null>(null);

  useFrameCallback(uiFrameMeter(smoothingFrames, circularBuffer, uiFps));

  return readingOf(useAnimatedProps(readingUpdater('UI', uiFps)));
}

// A JS and a UI frame rate, as upstream's overlay shows them
export function PerformanceMonitor({
  smoothingFrames = DEFAULT_BUFFER_SIZE,
}: IPerformanceMonitorProps): ReactElement {
  return createElement(
    View,
    { style: performanceStyles.monitor },
    createElement(JsPerformance, { smoothingFrames }),
    createElement(UiPerformance, { smoothingFrames }),
  );
}

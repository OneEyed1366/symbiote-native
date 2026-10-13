<script lang="ts">
  import {
    readingUpdater,
    uiFrameMeter,
    type createCircularDoublesBuffer,
  } from '../core/performance-monitor';
  import { hooks } from './runes/hooks';
  import PerformanceReading from './performance-reading.svelte';

  let { smoothingFrames }: { smoothingFrames: number } = $props();

  const { useAnimatedProps, useFrameCallback, useSharedValue } = hooks;

  const uiFps = useSharedValue<string | null>(null);
  const circularBuffer = useSharedValue<ReturnType<
    typeof createCircularDoublesBuffer
  > | null>(null);
  useFrameCallback(uiFrameMeter(smoothingFrames, circularBuffer, uiFps));

  const animatedProps = useAnimatedProps(readingUpdater('UI', uiFps));
</script>

<PerformanceReading {animatedProps} />

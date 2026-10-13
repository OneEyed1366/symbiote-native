<script lang="ts">
  import {
    createCircularDoublesBuffer,
    measureJsFrames,
    readingUpdater,
  } from '../core/performance-monitor';
  import { hooks } from './runes/hooks';
  import PerformanceReading from './performance-reading.svelte';

  let { smoothingFrames }: { smoothingFrames: number } = $props();

  const { useAnimatedProps, useSharedValue } = hooks;

  const jsFps = useSharedValue<string | null>(null);
  const buffer = createCircularDoublesBuffer(smoothingFrames);

  $effect(() => measureJsFrames(buffer, jsFps));

  const animatedProps = useAnimatedProps(readingUpdater('JS', jsFps));
</script>

<PerformanceReading {animatedProps} />

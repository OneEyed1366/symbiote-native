<script lang="ts">
  // A JS and a UI frame rate, as upstream's overlay shows them
  import {
    DEFAULT_BUFFER_SIZE,
    performanceStyles,
    type IPerformanceMonitorProps,
  } from '../core/performance-monitor';
  import JsPerformance from './js-performance.svelte';
  import UiPerformance from './ui-performance.svelte';

  let {
    smoothingFrames = DEFAULT_BUFFER_SIZE,
  }: IPerformanceMonitorProps = $props();
</script>

<view p={{ style: performanceStyles.monitor }}>
  <JsPerformance {smoothingFrames} />
  <UiPerformance {smoothingFrames} />
</view>

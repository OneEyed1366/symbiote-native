<script lang="ts">
  // The text a reading shows, written by the UI side as its frame rate changes
  import { performanceStyles } from '../core/performance-monitor';
  import type { hooks } from './runes/hooks';

  let {
    animatedProps,
  }: { animatedProps: ReturnType<typeof hooks.useAnimatedProps> } = $props();
</script>

<view p={{ style: performanceStyles.container }}>
  <text-input
    p={{ style: performanceStyles.text, animatedProps, editable: false }}
  />
</view>

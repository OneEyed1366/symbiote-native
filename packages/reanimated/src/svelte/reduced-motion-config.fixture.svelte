<script module lang="ts">
  import { ReduceMotion } from 'react-native-reanimated/src/commonTypes';

  // What a test changes to see the component follow it
  export const config: { mode: ReduceMotion } = $state({
    mode: ReduceMotion.Always,
  });
</script>

<script lang="ts">
  import ReducedMotionConfig from './reduced-motion-config.svelte';
</script>

<ReducedMotionConfig mode={config.mode} />

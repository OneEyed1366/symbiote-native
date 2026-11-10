<script lang="ts">
  // Lets you overwrite the default reduce motion behavior for the whole app, while it stands
  import type { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
  import { overrideReducedMotion } from '../core/reduced-motion';

  let { mode }: { mode: ReduceMotion } = $props();

  $effect(() => overrideReducedMotion(mode));
</script>

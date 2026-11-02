<script lang="ts">
  // Stack.Screen: a marker that paints nothing, Stack reads it through the collector
  // Stack mounts the registered component itself for each pushed route
  import { collectScreenMarker } from './screen-registry';
  import type { IScreenProps } from './screen-props';

  let { name, component, options, initialParams }: IScreenProps = $props();

  collectScreenMarker('stack', () => ({
    name,
    component,
    options,
    initialParams,
  }));
</script>

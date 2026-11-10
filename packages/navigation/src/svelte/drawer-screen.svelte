<script lang="ts">
  // Drawer.Screen: a marker that paints nothing, Drawer reads it through the collector
  import { collectScreenMarker } from './screen-registry';
  import type { IDrawerScreenProps } from './drawer-screen-props';

  let { name, component, options, initialParams }: IDrawerScreenProps =
    $props();

  collectScreenMarker('drawer', () => ({
    name,
    component,
    options,
    initialParams,
  }));
</script>

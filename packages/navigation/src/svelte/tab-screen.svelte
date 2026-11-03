<script lang="ts">
  // Tab.Screen: a marker that paints nothing, Tab reads it through the collector
  // The kind tag stops it from registering with an ancestor Stack or Drawer when it is misplaced
  import { collectScreenMarker } from './screen-registry';
  import type { ITabScreenProps } from './tab-screen-props';

  let { name, component, options, initialParams }: ITabScreenProps = $props();

  collectScreenMarker('tab', () => ({
    name,
    component,
    options,
    initialParams,
  }));
</script>

<script lang="ts">
  // NativeTab.Screen: a marker that paints nothing, NativeTab reads it through the collector
  import { collectScreenMarker } from './screen-registry';
  import type { INativeTabScreenProps } from './native-tab-screen-props';

  let { name, component, options, initialParams }: INativeTabScreenProps =
    $props();

  collectScreenMarker('nativeTab', () => ({
    name,
    component,
    options,
    initialParams,
  }));
</script>

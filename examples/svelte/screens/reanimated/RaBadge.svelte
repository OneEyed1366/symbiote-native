<script lang="ts">
  import { hostInstance } from '@symbiote-native/svelte';
  import type { IViewProps } from '@symbiote-native/svelte';
  import type { IAnimatedHostProps } from '@symbiote-native/reanimated/svelte';

  let { ref, ...rest }: IAnimatedHostProps<IViewProps> = $props();

  let element: unknown = $state.raw(undefined);

  // The animated ref is told which node this component draws
  $effect(() => {
    ref?.(hostInstance(element) ?? null);
  });
</script>

<view
  {@attach (node: unknown) => {
    element = node;
  }}
  class="ra-tile ra-tile-small"
  p={rest}
/>

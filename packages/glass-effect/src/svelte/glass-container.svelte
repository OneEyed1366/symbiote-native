<script lang="ts">
  import DescriptorHost from '@symbiote-native/svelte/descriptor-host';
  import { renderGlassContainer } from '../core';
  import type { IGlassContainerSvelteProps } from './glass-props';

  let {
    children,
    ref = $bindable(),
    ...rest
  }: IGlassContainerSvelteProps = $props();
  const descriptor = $derived(renderGlassContainer({ ...rest }));
</script>

<DescriptorHost {descriptor} bind:ref {children} />

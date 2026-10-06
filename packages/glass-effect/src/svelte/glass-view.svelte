<script lang="ts">
  import DescriptorHost from '@symbiote-native/svelte/descriptor-host';
  import { renderGlassView } from '../core';
  import type { IGlassViewSvelteProps } from './glass-props';

  let { children, ref = $bindable(), ...rest }: IGlassViewSvelteProps = $props();
  const descriptor = $derived(renderGlassView({ ...rest }));
</script>

<DescriptorHost {descriptor} bind:ref {children} />

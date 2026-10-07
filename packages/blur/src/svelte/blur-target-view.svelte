<script lang="ts">
  import DescriptorHost from '@symbiote-native/svelte/descriptor-host';
  import { renderBlurTargetView } from '../core';
  import type { IBlurTargetViewSvelteProps } from './blur-props';

  let {
    children,
    ref = $bindable(),
    ...rest
  }: IBlurTargetViewSvelteProps = $props();
  const descriptor = $derived(renderBlurTargetView({ ...rest }));
</script>

<DescriptorHost {descriptor} bind:ref {children} />

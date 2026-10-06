<script lang="ts">
  import DescriptorHost from '@symbiote-native/svelte/descriptor-host';
  import { renderImageBackground } from '../core';
  import type { IImageBackgroundSvelteProps } from './image-background-props';

  const { children, ...rest }: IImageBackgroundSvelteProps = $props();
  const descriptor = $derived(renderImageBackground({ ...rest }));
</script>

<DescriptorHost {descriptor} {children} />

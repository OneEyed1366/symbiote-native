<script lang="ts">
  // The native view name is mixed-case, which a literal tag would parse as a component reference,
  // so the tag is dynamic
  import { hostProps } from '@symbiote-native/svelte/native-view-bridge';
  import { useNativeViewController } from '@symbiote-native/svelte/runes/use-native-view-controller';
  import { createImageView } from '../core';
  import type { IImageViewProps } from '../core';

  const props: IImageViewProps = $props();
  const view = useNativeViewController(createImageView, () => ({ ...props }));

  // The functions of the view are instance members, `bind:this` reaches them
  export const startAnimating = view.handle.startAnimating;
  export const stopAnimating = view.handle.stopAnimating;
  export const lockResourceAsync = view.handle.lockResourceAsync;
  export const unlockResourceAsync = view.handle.unlockResourceAsync;
  export const reloadAsync = view.handle.reloadAsync;
</script>

{#if view.descriptor}
  <svelte:element
    this={view.descriptor.type}
    {@attach view.attachHost}
    {@attach hostProps(view.descriptor.props)}
  />
{/if}

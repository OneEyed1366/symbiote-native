<script lang="ts">
  import DescriptorHost from '@symbiote-native/svelte/descriptor-host';
  import { useNativeViewController } from '@symbiote-native/svelte/runes/use-native-view-controller';
  import { createGLView } from '../core';
  import type { IGLViewProps } from '../core';

  const props: IGLViewProps = $props();
  const view = useNativeViewController(createGLView, () => ({ ...props }));

  // The functions of the view are instance members, `bind:this` reaches them
  export const createCameraTextureAsync = view.handle.createCameraTextureAsync;
  export const destroyObjectAsync = view.handle.destroyObjectAsync;
  export const takeSnapshotAsync = view.handle.takeSnapshotAsync;
  export const getContextId = (): number | undefined => view.handle.exglCtxId;
</script>

{#if view.descriptor}
  <DescriptorHost descriptor={view.descriptor} />
{/if}

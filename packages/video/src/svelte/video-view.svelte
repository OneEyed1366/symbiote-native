<script lang="ts">
  // The native view name is mixed-case, which a literal tag would parse as a component reference,
  // so the tag is dynamic
  import { hostProps } from '@symbiote-native/svelte/native-view-bridge';
  import { useNativeViewController } from '@symbiote-native/svelte/runes/use-native-view-controller';
  import { createVideoView } from '../core';
  import type { IVideoViewProps } from '../core';

  const props: IVideoViewProps = $props();
  const view = useNativeViewController(createVideoView, () => ({ ...props }));

  // The functions of the view are instance members, `bind:this` reaches them
  export const enterFullscreen = view.handle.enterFullscreen;
  export const exitFullscreen = view.handle.exitFullscreen;
  export const startPictureInPicture = view.handle.startPictureInPicture;
  export const stopPictureInPicture = view.handle.stopPictureInPicture;
</script>

{#if view.descriptor}
  <svelte:element
    this={view.descriptor.type}
    {@attach view.attachHost}
    {@attach hostProps(view.descriptor.props)}
  />
{/if}

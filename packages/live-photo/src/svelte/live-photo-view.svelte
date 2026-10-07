<script lang="ts">
  // The native view name is mixed-case, which a literal tag would parse as a component reference,
  // so the tag is dynamic
  import {
    hostInstance,
    hostProps,
  } from '@symbiote-native/svelte/native-view-bridge';
  import { createLivePhotoViewHandle, renderLivePhotoView } from '../core';
  import type { ILivePhotoPlaybackStyle, ILivePhotoViewProps } from '../core';

  const props: ILivePhotoViewProps = $props();
  const descriptor = $derived(renderLivePhotoView({ ...props }));
  let shim: unknown = $state(null);
  const handle = createLivePhotoViewHandle(() => hostInstance(shim));

  export function startPlayback(playbackStyle?: ILivePhotoPlaybackStyle): void {
    handle.startPlayback(playbackStyle);
  }

  export function stopPlayback(): void {
    handle.stopPlayback();
  }
</script>

{#if descriptor}
  <svelte:element
    this={descriptor.type}
    bind:this={shim}
    {@attach hostProps(descriptor.props)}
  />
{/if}

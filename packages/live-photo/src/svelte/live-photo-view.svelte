<script lang="ts">
  // The native view name is mixed-case, which a literal tag would parse as a component reference,
  // so the tag is dynamic
  import {
    captureHost,
    hostInstance,
    hostProps,
  } from '@symbiote-native/svelte/native-view-bridge';
  import { createLivePhotoViewHandle, renderLivePhotoView } from '../core';
  import type { IViewProps } from '@symbiote-native/svelte';
  import type { ILivePhotoPlaybackStyle, ILivePhotoViewProps } from '../core';

  const props: ILivePhotoViewProps & Pick<IViewProps, 'class'> = $props();
  const descriptor = $derived(renderLivePhotoView({ ...props }));
  let viewHost: unknown = $state.raw(null);
  const captureViewHost = captureHost(host => {
    viewHost = host;
  });
  const handle = createLivePhotoViewHandle(() => hostInstance(viewHost));

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
    {@attach captureViewHost}
    {@attach hostProps(descriptor.props)}
  />
{/if}

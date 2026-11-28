<script lang="ts">
  // The native view name is mixed-case, which a literal tag would parse as a component reference,
  // so the tag is dynamic
  import { hostProps } from '@symbiote-native/svelte/native-view-bridge';
  import { renderVideoAirPlayButton } from '../core';
  import type { IViewProps } from '@symbiote-native/svelte';
  import type { IVideoAirPlayButtonProps } from '../core';

  const props: IVideoAirPlayButtonProps & Pick<IViewProps, 'class'> = $props();
  const descriptor = $derived(renderVideoAirPlayButton({ ...props }));
</script>

<svelte:element this={descriptor.type} {@attach hostProps(descriptor.props)} />

<script lang="ts">
  // Core picks the native view and its props, the snippet fills it with children
  // The tag is a runtime string, as a capitalized view name would parse as a component
  import type { Snippet } from 'svelte';
  import { Platform } from '@symbiote-native/engine';
  import { useWindowDimensions } from '@symbiote-native/svelte/runes/use-window-dimensions';
  import { resolveFullWindowOverlay } from '../core';
  import type { IFullWindowOverlayProps } from '../core';
  import { hostProps } from './attachments';

  let {
    children,
    unstable_accessibilityContainerViewIsModal,
  }: IFullWindowOverlayProps & { children?: Snippet } = $props();

  const dimensions = useWindowDimensions();
  const overlay = $derived(
    resolveFullWindowOverlay({
      unstable_accessibilityContainerViewIsModal,
      isIOS: Platform.select({ ios: true, default: false }) === true,
      width: dimensions.current.width,
      height: dimensions.current.height,
    }),
  );
</script>

<svelte:element this={overlay.viewName} {@attach hostProps(overlay.props)}>
  {@render children?.()}
</svelte:element>

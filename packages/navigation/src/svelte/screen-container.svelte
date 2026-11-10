<script lang="ts">
  // Core picks the native view, the other props go through as they are
  // The tag is a runtime string, as a capitalized view name would parse as a component
  import type { Snippet } from 'svelte';
  import { Platform } from '@symbiote-native/engine';
  import { resolveScreenContainerViewName } from '../core';
  import type { IScreenContainerProps } from '../core';
  import { hostProps } from './attachments';

  let {
    children,
    enabled,
    hasTwoStates,
    ...viewProps
  }: Record<string, unknown> &
    IScreenContainerProps & { children?: Snippet } = $props();

  const viewName = $derived(
    resolveScreenContainerViewName({ enabled, hasTwoStates, os: Platform.OS }),
  );
</script>

<svelte:element this={viewName} {@attach hostProps(viewProps)}>
  {@render children?.()}
</svelte:element>

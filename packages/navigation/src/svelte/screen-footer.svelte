<script lang="ts">
  // The native footer view of a `formSheet`, view props go through as they are
  // The tag is a runtime string, as a capitalized view name would parse as a component
  import type { Snippet } from 'svelte';
  import { RNS_SCREEN_FOOTER_VIEW_NAME } from '../core';
  import { hostProps } from './attachments';

  let { children, ...viewProps }: Record<string, unknown> & {
    children?: Snippet;
  } = $props();
</script>

<svelte:element
  this={RNS_SCREEN_FOOTER_VIEW_NAME}
  {@attach hostProps(viewProps)}
>
  {@render children?.()}
</svelte:element>

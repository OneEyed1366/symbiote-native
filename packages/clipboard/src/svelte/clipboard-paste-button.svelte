<script lang="ts">
  // The native view name is mixed-case, which a literal tag would parse as a component reference,
  // so the tag is dynamic
  import { renderClipboardPasteButton } from '../core/clipboard-paste-button';
  import type { IClipboardPasteButtonProps } from '../core/clipboard-paste-button';

  const props: IClipboardPasteButtonProps = $props();
  const descriptor = $derived(renderClipboardPasteButton({ ...props }));
</script>

{#if descriptor}
  <svelte:element this={descriptor.type} p={descriptor.props} />
{/if}

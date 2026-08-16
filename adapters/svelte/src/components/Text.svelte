<script lang="ts" module>
  // See View.svelte's header comment — same object-bag design (svelte-adapter-dom-shim
  // skill §3g(c)). No IResponderProps here, matching every other adapter's ITextProps.
  import type { ITextProps } from './text-props';

  export type { ITextProps };
</script>

<script lang="ts">
  import { createAttachmentsSync } from '../runes/attachments';
  import type { ShimElement } from '../dom-shim';

  let { children, ...bag }: ITextProps = $props();

  // See View.svelte's note: `{@attach}` arrives as a symbol-keyed entry in the same rest object.
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, bag);
  });
</script>

<symbiote-text p={bag} bind:this={hostShim}>
  {@render children?.()}
</symbiote-text>

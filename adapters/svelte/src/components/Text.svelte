<script lang="ts" module>
  // See View.svelte's header comment — same object-bag design (svelte-adapter-dom-shim
  // skill §3g(c)). No IResponderProps here, matching every other adapter's ITextProps.
  import type { ITextProps } from './text-props';

  export type { ITextProps };
</script>

<script lang="ts">
  import { resolveTextProps } from '@symbiote-native/components';
  import { createAttachmentsSync } from '../runes/attachments';
  import type { ShimElement } from '../dom-shim';

  let { children, ...rest }: ITextProps = $props();

  // See View.svelte's note: `{@attach}` arrives as a symbol-keyed entry in the same rest object.
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, rest);
  });

  // A FRESH object per pass, exactly as View.svelte builds its own: ShimElement's `p` setter
  // diffs the incoming bag against the one it stored last time, so handing it the SAME live rest
  // proxy twice compares that object with itself and applies nothing — every prop update after
  // mount was silently dropped.
  // resolveTextProps carries RN's Text.js defaults (ellipsizeMode 'tail', allowFontScaling
  // true); without them native falls back to `clip` and a clamped Text cuts mid-word.
  const bag = $derived(resolveTextProps({ ...rest }));
</script>

<symbiote-text p={bag} bind:this={hostShim}>
  {@render children?.()}
</symbiote-text>

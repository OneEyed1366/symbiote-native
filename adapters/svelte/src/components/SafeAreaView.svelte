<script lang="ts" module>
  // SafeAreaView primitive. A plain view whose native side insets its children to the safe area
  // (notch, rounded corners, system bars). There is no JS-side translation; RN just renders the
  // native RCTSafeAreaView and lets the host do the inset math, so this maps style + children
  // straight onto the intrinsic — same object-bag pattern as View.svelte.
  import type { ISafeAreaViewProps } from './safe-area-view-props';

  export type { ISafeAreaViewProps };
</script>

<script lang="ts">
  import { dlog } from '@symbiote-native/engine';
  import { resolveAccessibilityProps } from '@symbiote-native/components';

  import { createAttachmentsSync } from '../runes/attachments';
  import type { ShimElement } from '../dom-shim';

  let { children, ...rest }: ISafeAreaViewProps = $props();

  dlog('SafeAreaView -> SafeAreaView');

  const bag = $derived(resolveAccessibilityProps(rest));

  // See View.svelte's note on `{@attach}`.
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, rest);
  });
</script>

<symbiote-safe-area-view p={bag} bind:this={hostShim}>
  {@render children?.()}
</symbiote-safe-area-view>

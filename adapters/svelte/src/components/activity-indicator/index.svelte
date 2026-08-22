<script lang="ts" module>
  // ActivityIndicator: render-only (no state). Calls the shared renderActivityIndicator()
  // straight from core/components — the size translation, platform default-color fold, and
  // native-extras all live there, once, for every adapter. The root stays a literal template
  // tag (`bind:this` needs a known tag), but its child (the spinner) is materialized and kept
  // in sync via the generic descriptorToSvelte bridge (createDescriptorChildrenSync) instead of
  // a hand-written child tag — see svelte-adapter-dom-shim skill §19 for why this is safe and
  // cheap (create once, update by position, never recreate).
  import type { IActivityIndicatorProps } from './activity-indicator-props';

  export type { IActivityIndicatorProps };
</script>

<script lang="ts">
  import {
    renderActivityIndicator,
    resolveAccessibilityProps,
  } from '@symbiote-native/components';
  import { PLATFORM } from './activity-indicator-platform';
  import { createDescriptorChildrenSync } from '../../descriptor-to-svelte';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';

  let {
    animating = true,
    color,
    hidesWhenStopped = true,
    size = 'small',
    style,
    class: className,
    ...passthrough
  }: IActivityIndicatorProps = $props();

  const descriptor = $derived(
    renderActivityIndicator(
      {
        animating,
        hidesWhenStopped,
        size,
        color,
        style,
        passthrough: {
          ...resolveAccessibilityProps(passthrough),
          class: className,
        },
      },
      PLATFORM,
    ),
  );
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncChildren = createDescriptorChildrenSync();

  $effect(() => {
    syncChildren(hostShim, descriptor.children);
  });
  // See View.svelte's note on `{@attach}`.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, passthrough);
  });
</script>

<symbiote-view p={descriptor.props} bind:this={hostShim} />

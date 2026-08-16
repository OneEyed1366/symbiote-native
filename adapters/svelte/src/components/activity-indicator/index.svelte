<script lang="ts" module>
  // ActivityIndicator: render-only (no state). Calls the shared renderActivityIndicator()
  // straight from core/components — the size translation, platform default-color fold, and
  // native-extras all live there, once, for every adapter. The root stays a literal template
  // tag (`{@attach}` needs a known tag), but its child (the spinner) is materialized and kept
  // in sync via the generic descriptorToSvelte bridge (createDescriptorChildrenSync) instead of
  // a hand-written child tag — see svelte-adapter-custom-renderer skill for why this is safe and
  // cheap (create once, update by position, never recreate).
  import type { IActivityIndicatorProps } from './activity-indicator-props';

  export type { IActivityIndicatorProps };
</script>

<script lang="ts">
  import { renderActivityIndicator, resolveAccessibilityProps } from '@symbiote-native/components';
  import { PLATFORM } from './activity-indicator-platform';
  import { createDescriptorChildrenSync } from '../../descriptor-to-svelte';
  import { toTemplateSafeProps } from '../../renderer';
  import type { IHostInstance } from '@symbiote-native/engine';

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
        passthrough: { ...resolveAccessibilityProps(passthrough), class: className },
      },
      PLATFORM,
    ),
  );
  let hostRef = $state.raw<IHostInstance | null>(null);
  const syncChildren = createDescriptorChildrenSync();

  $effect(() => {
    syncChildren(hostRef, descriptor.children);
  });

  // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment) — renamed before the spread; `setAttributeOp`'s
  // `realPropName()` reverses it right before `routeProp`.
  const templateProps = $derived(toTemplateSafeProps(descriptor.props));
</script>

<symbiote-view {...templateProps} {@attach (node) => (hostRef = node)} />

<script lang="ts" module>
  // Animated.Text — see AnimatedView.svelte's header comment for the shared design rationale
  // (hand-authored root tag, shared reconcile runtime). Text.svelte is likewise a pure
  // pass-through bag, so hand-authoring loses no logic.
  import type { IAnimatedComponentProps } from './animated-component-props';

  export type { IAnimatedComponentProps };
</script>

<script lang="ts">
  import { isNativeAnimatedAvailable, reduceProps, readPassthroughStyle } from '@symbiote-native/engine';
  import { createAnimatedReconcileRuntime } from './animated-props-runtime';
  import { createAttachmentsSync } from '../../runes/attachments';
  import { toTemplateSafeProps } from '../../renderer';
  import type { IHostInstance } from '@symbiote-native/engine';

  let {
    children,
    passthroughAnimatedPropExplicitValues: passthrough,
    ...rest
  }: IAnimatedComponentProps = $props();

  let hostRef = $state.raw<IHostInstance | null>(null);

  const wantsNative = $derived(passthrough != null && isNativeAnimatedAvailable());

  const reduced = $derived.by(() => {
    const out = reduceProps(rest);
    const passthroughStyle = readPassthroughStyle(passthrough);
    if (passthroughStyle !== undefined) {
      out.style = out.style === undefined ? passthroughStyle : [out.style, passthroughStyle];
    }
    // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
    // TEMPLATE_KEY_UNMANGLE header comment) — renamed before the spread; `setAttributeOp`'s
    // `realPropName()` reverses it right before `routeProp`.
    return toTemplateSafeProps(out);
  });

  const runtime = createAnimatedReconcileRuntime();

  $effect(() => {
    const currentRest = rest;
    const node = hostRef;
    runtime.reconcile(currentRest, node, wantsNative);
  });

  $effect(() => () => runtime.teardown());

  // See View.svelte's note on `{@attach}`.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostRef, rest);
  });
</script>

<symbiote-text {...reduced} {@attach (node) => (hostRef = node)}>
  {@render children?.()}
</symbiote-text>

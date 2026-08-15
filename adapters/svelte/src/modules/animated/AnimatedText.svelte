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
  import type { ShimElement } from '../../dom-shim';

  let {
    children,
    passthroughAnimatedPropExplicitValues: passthrough,
    ...rest
  }: IAnimatedComponentProps = $props();

  let hostShim = $state.raw<ShimElement | null>(null);

  const wantsNative = $derived(passthrough != null && isNativeAnimatedAvailable());

  const reduced = $derived.by(() => {
    const out = reduceProps(rest);
    const passthroughStyle = readPassthroughStyle(passthrough);
    if (passthroughStyle !== undefined) {
      out.style = out.style === undefined ? passthroughStyle : [out.style, passthroughStyle];
    }
    return out;
  });

  const runtime = createAnimatedReconcileRuntime();

  $effect(() => {
    const currentRest = rest;
    const node = hostShim?.engineNode ?? null;
    runtime.reconcile(currentRest, node, wantsNative);
  });

  $effect(() => () => runtime.teardown());

  // See View.svelte's note on `{@attach}`.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, rest);
  });
</script>

<symbiote-text p={reduced} bind:this={hostShim}>
  {@render children?.()}
</symbiote-text>

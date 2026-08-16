<script lang="ts" module>
  // InputAccessoryView: render-only host assembly (iOS). Calls the shared
  // core/components/src/view/render-input-accessory-view.ts's renderInputAccessoryView()
  // directly (nativeID/backgroundColor/style -> the host node, everything else passthrough) —
  // the same calling convention as keyboard-avoiding-view/index.svelte's shared-render-fn call,
  // rather than hand-duplicating its prop-assembly logic (per the svelte-adapter-dom-shim
  // skill's §15/§19 correction: a fixed-shape Descriptor still has to be CALLED, not
  // re-derived). The root tag stays literal below since renderInputAccessoryView always paints
  // the same 'symbiote-input-accessory-view' host — no dynamic <svelte:element> needed. The
  // host has no structural children of its own; the user's children nest directly under it.
  import type { IInputAccessoryViewProps } from './input-accessory-view-props';

  export type { IInputAccessoryViewProps };
</script>

<script lang="ts">
  import { renderInputAccessoryView, resolveAccessibilityProps } from '@symbiote-native/components';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';

  let {
    nativeID,
    backgroundColor,
    style,
    children,
    ...passthrough
  }: IInputAccessoryViewProps = $props();

  const descriptor = $derived(
    renderInputAccessoryView({
      nativeID,
      backgroundColor,
      style,
      passthrough: resolveAccessibilityProps(passthrough),
    }),
  );

  // See View.svelte's note on `{@attach}`.
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, passthrough);
  });
</script>

<symbiote-input-accessory-view p={descriptor.props} bind:this={hostShim}>
  {@render children?.()}
</symbiote-input-accessory-view>

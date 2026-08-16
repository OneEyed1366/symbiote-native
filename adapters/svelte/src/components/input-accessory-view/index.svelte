<script lang="ts" module>
  // InputAccessoryView: render-only host assembly (iOS). Calls the shared
  // core/components/src/view/render-input-accessory-view.ts's renderInputAccessoryView()
  // directly (nativeID/backgroundColor/style -> the host node, everything else passthrough) —
  // the same calling convention as keyboard-avoiding-view/index.svelte's shared-render-fn call,
  // rather than hand-duplicating its prop-assembly logic (per the svelte-adapter-custom-renderer
  // skill: a fixed-shape Descriptor still has to be CALLED, not re-derived). The root tag stays
  // literal below since renderInputAccessoryView always paints
  // the same 'symbiote-input-accessory-view' host — no dynamic <svelte:element> needed. The
  // host has no structural children of its own; the user's children nest directly under it.
  import type { IInputAccessoryViewProps } from './input-accessory-view-props';

  export type { IInputAccessoryViewProps };
</script>

<script lang="ts">
  import { renderInputAccessoryView, resolveAccessibilityProps } from '@symbiote-native/components';
  import { toTemplateSafeProps } from '../../renderer';
  import type { IHostInstance } from '@symbiote-native/engine';

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
  let hostRef = $state.raw<IHostInstance | null>(null);

  // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment) — renamed before the spread; `setAttributeOp`'s
  // `realPropName()` reverses it right before `routeProp`.
  const templateProps = $derived(toTemplateSafeProps(descriptor.props));
</script>

<symbiote-input-accessory-view {...templateProps} {@attach (node) => (hostRef = node)}>
  {@render children?.()}
</symbiote-input-accessory-view>

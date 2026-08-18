// A shared runtime guard for the two ApiPlaygroundScreen demos that receive a raw host node
// through `{@attach fn}` (TemplateSyntaxDemo's measure attach, SpecialElementsDemo's
// <svelte:element> dynamic tag) — mirrors adapters/svelte/src/host-instance.ts's own
// module-private `isShimElement`, which isn't exported past the adapter's public type-only
// `ShimElement` (svelte-adapter-dom-shim skill §22c/"A CAPITALIZED native Fabric tag").
import type { ShimElement } from '@symbiote-native/svelte';

export function isShimElement(value: unknown): value is ShimElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    'engineNode' in value &&
    'tagName' in value
  );
}

// The `{@attach hostProps(bag)}` pattern packages/navigation's Svelte screens use to hand a
// <svelte:element> dynamic tag its props — a plain attribute (`p={bag}`) silently fails to land
// on a dynamic tag, since it compiles through Svelte's generic setAttribute codegen rather than
// the custom-element property-set path (svelte-adapter-dom-shim skill §4/§15).
export function hostProps(
  props: Record<string, unknown>,
): (node: unknown) => void {
  return node => {
    if (isShimElement(node)) node.p = props;
  };
}

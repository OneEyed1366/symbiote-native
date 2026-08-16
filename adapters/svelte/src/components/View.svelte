<script lang="ts" module>
  // Host primitive for app code. Per svelte-adapter-dom-shim skill §3g(c): Symbiote's
  // custom-element codegen path stringifies individual attributes, so unlike Vue's View
  // (which spreads props onto the intrinsic tag and lets patchProp route each one), this
  // component assembles every prop into ONE object bag and hands it to `<symbiote-view p={bag}>`
  // — the shim element's `p` setter diffs it per key into routeProp. `children` is pulled out
  // first: it is a Svelte-specific field (a Snippet), never forwarded into the bag, mirroring
  // why every adapter's IViewProps is declared per-adapter (CLAUDE.md
  // <prop_types_split_agnostic_vs_per_adapter>) rather than shared verbatim.
  import type { IViewProps } from './view-props';

  export type { IViewProps };
</script>

<script lang="ts">
  import { createAttachmentsSync } from '../runes/attachments';
  import type { ShimElement } from '../dom-shim';

  let { children, id, nativeID, ...rest }: IViewProps = $props();

  // `{@attach fn}` on a component lands as a SYMBOL-keyed prop, so it rides in `rest` alongside
  // the ordinary bag keys and never reaches the engine (routeProp only walks string keys). This
  // is the one directive-shaped Svelte feature that IS legal on a component, hence the only way
  // an author reaches the committed host node — see runes/attachments.ts.
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, rest);
  });

  // RN's modern `id` is just a W3C-named alias for `nativeID`: View.js copies it over
  // (`processedProps.nativeID = id`), so `id` wins when both are set. Fold it here and drop
  // the raw `id` key so it never reaches Fabric (every non-function prop in the bag otherwise
  // passes through to the slot as-is) — mirrors React's `resolveId` in
  // `adapters/react/src/components.ts`, adapted to the object-bag idiom.
  const bag = $derived(id === undefined ? { ...rest, nativeID } : { ...rest, nativeID: id });
</script>

<symbiote-view p={bag} bind:this={hostShim}>
  {@render children?.()}
</symbiote-view>

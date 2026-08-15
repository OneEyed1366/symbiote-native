<script lang="ts" module>
  // Image: render-only (no state). Source resolution / width-height fold / resizeMode & tintColor
  // style-read / alt->accessibility fold mirror core/components/src/view/render-image/index.ts's
  // renderImage() exactly, via image-logic.ts's buildImageBag (see that file's header for why the
  // logic is duplicated rather than the Descriptor consumed). renderImage always produces a
  // SINGLE symbiote-image node, so the markup here is just that one host tag.
  //
  // Statics (getSize/prefetch/queryCache/…) are attached in the sibling `index.ts`, not here — a
  // `.svelte` file's default export resolves through svelte's ambient module fallback (a bare
  // value, not something `Object.assign` can usefully augment from inside the component itself).
  import type { IImageProps } from './image-props';

  export type { IImageProps };
</script>

<script lang="ts">
  import { resolveAccessibilityProps } from '@symbiote-native/components';
  import { buildImageBag } from './image-logic';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';

  let {
    source,
    defaultSource,
    loadingIndicatorSource,
    style,
    resizeMode,
    tintColor,
    src,
    srcSet,
    alt,
    width,
    height,
    crossOrigin,
    referrerPolicy,
    ...passthrough
  }: IImageProps = $props();

  const bag = $derived(
    buildImageBag({
      source,
      defaultSource,
      loadingIndicatorSource,
      style,
      resizeMode,
      tintColor,
      src,
      srcSet,
      alt,
      width,
      height,
      crossOrigin,
      referrerPolicy,
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

<symbiote-image p={bag} bind:this={hostShim} />

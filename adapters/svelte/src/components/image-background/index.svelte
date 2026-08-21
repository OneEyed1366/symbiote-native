<script lang="ts" module>
  // ImageBackground: render-only composition (absolute-fill Image behind, children on top).
  // Calls renderImageBackground() straight from core/components for the absolute-fill
  // positioning + wrapper-dimension proxy onto the inner Image — both tags stay literal (the
  // wrapper hosts `{@render children?.()}` as a live sibling after the image, which the
  // generic descriptorToSvelte bridge can't safely own: appending the image inside an $effect
  // would race Svelte's own placement of the live children and could reorder them — see
  // svelte-adapter-dom-shim skill §19), so `.props`/`.children[0].props` are destructured onto
  // the two known host tags, same pattern as Modal/index.svelte.
  import type { IImageBackgroundProps } from './image-background-props';

  export type { IImageBackgroundProps };
</script>

<script lang="ts">
  import {
    renderImageBackground,
    resolveAccessibilityProps,
  } from '@symbiote-native/components';
  import { resolveClassName } from '@symbiote-native/engine';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';

  let {
    children,
    style,
    imageStyle,
    class: className,
    source,
    defaultSource,
    loadingIndicatorSource,
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
  }: IImageBackgroundProps = $props();

  const resolvedImageStyle = $derived(
    typeof imageStyle === 'string' ? resolveClassName(imageStyle) : imageStyle,
  );

  const descriptor = $derived(
    renderImageBackground({
      style,
      imageStyle: resolvedImageStyle,
      image: {
        source,
        defaultSource,
        loadingIndicatorSource,
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
      },
    }),
  );
  const imageBag = $derived.by(() => {
    const child = descriptor.children[0];
    return typeof child === 'string' ? {} : child.props;
  });
  const wrapperBag = $derived({ ...descriptor.props, class: className });

  // See View.svelte's note on `{@attach}` — the attachment binds to the OUTER wrapper, the node
  // this component's own `class`/`style` land on and the one a caller means by "this component".
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, passthrough);
  });
</script>

<symbiote-view p={wrapperBag} bind:this={hostShim}>
  <symbiote-image p={imageBag} />
  {@render children?.()}
</symbiote-view>

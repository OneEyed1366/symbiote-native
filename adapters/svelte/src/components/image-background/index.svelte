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
  import { renderImageBackground, resolveAccessibilityProps } from '@symbiote-native/components';
  import { resolveClassName, type IHostInstance } from '@symbiote-native/engine';
  import { createAttachmentsSync } from '../../runes/attachments';
  import { toTemplateSafeProps } from '../../renderer';

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

  // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment) — renamed before either bag is spread below;
  // `setAttributeOp`'s `realPropName()` reverses it right before `routeProp`.
  const templateImageBag = $derived(toTemplateSafeProps(imageBag));
  const templateWrapperBag = $derived(toTemplateSafeProps(wrapperBag));

  // See View.svelte's note on `{@attach}` — the attachment binds to the OUTER wrapper, the node
  // this component's own `class`/`style` land on and the one a caller means by "this component".
  // `innerImageRef` is a second, internal-only ref on the absolute-fill Image.
  let hostRef = $state.raw<IHostInstance | null>(null);
  let innerImageRef = $state.raw<IHostInstance | null>(null);
  // passthrough never rides `wrapperBag`'s own spread (it only feeds the inner Image via
  // renderImageBackground) — so `{@attach}` symbols inside it need this manual re-sync, unlike
  // most components (see runes/attachments.ts's header).
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostRef, passthrough);
  });
</script>

<symbiote-view {...templateWrapperBag} {@attach (node) => (hostRef = node)}><symbiote-image {...templateImageBag} {@attach (node) => (innerImageRef = node)} />{@render children?.()}</symbiote-view>

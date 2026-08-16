<script lang="ts" module>
  // Animated.Image — unlike View/Text, Image.svelte does REAL prop transformation
  // (buildImageBag: source resolution, resizeMode/tintColor read off style, width/height fold,
  // alt->accessibility). Hand-authoring a bare pass-through bag here (like AnimatedView/Text)
  // would silently drop all of that — the exact copy-paste-instead-of-calling bug class the
  // svelte-adapter-dom-shim skill's §15/§19 already caught on Switch/ActivityIndicator/
  // TextInput/ImageBackground. So this component calls buildImageBag itself (same as
  // image/index.svelte), fed with rasterized (reduceProps'd) field values.
  //
  // Known, inherited (not Svelte-specific) limitation: the PER-FRAME animated path
  // (AnimatedProps.update -> setNativeProps) pushes the raw `rest` fields directly, bypassing
  // buildImageBag's mapping — same as Vue's/React's Animated.Image, since AnimatedProps is
  // framework-agnostic and has no notion of a component's own prop transform. In practice this
  // only matters if a non-`style` field (e.g. `source`) is itself animated, which is not a
  // supported use — animating Image is expected to go through `style` (opacity/transform),
  // which round-trips correctly since buildImageBag keeps `style` under the same key name.
  import type { IAnimatedComponentProps } from './animated-component-props';

  export type { IAnimatedComponentProps };
</script>

<script lang="ts">
  import { isNativeAnimatedAvailable, reduceProps, readPassthroughStyle } from '@symbiote-native/engine';
  import { resolveAccessibilityProps } from '@symbiote-native/components';
  import type { IAccessibilityProps, IAriaProps, IImageViewProps } from '@symbiote-native/components';
  import { buildImageBag } from '../../components/image/image-logic';
  import { createAnimatedReconcileRuntime } from './animated-props-runtime';
  import { createAttachmentsSync } from '../../runes/attachments';
  import { toTemplateSafeProps } from '../../renderer';
  import type { IHostInstance } from '@symbiote-native/engine';

  let { passthroughAnimatedPropExplicitValues: passthrough, ...rest }: IAnimatedComponentProps =
    $props();

  let hostRef = $state.raw<IHostInstance | null>(null);

  const wantsNative = $derived(passthrough != null && isNativeAnimatedAvailable());

  // Rasterize every field (style's animated entries resolved to plain numbers, any other
  // animated field to its current value), then re-run Image's own field split + buildImageBag
  // over the resolved values — the same shape image/index.svelte builds, just fed reduced
  // values instead of raw $props().
  const reduced = $derived.by(() => {
    const resolved = reduceProps(rest);
    const {
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
      ...imagePassthrough
    } = resolved;
    // reduceProps returns a flat Record<string, unknown> — every field above is `unknown`
    // even though it is, at runtime, exactly the shape IImageViewProps/IAccessibilityProps
    // declare. Bridging that back into a typed shape without an `as` cast uses the same
    // `Object.assign(Object.create(null), …)` pattern React's create-animated-component.tsx
    // already establishes: Object.create(null) types as `any`, so Object.assign's result does
    // too, and TS allows assigning `any` into a specifically-typed binding.
    const accessibility: IAccessibilityProps & IAriaProps = Object.assign(
      Object.create(null),
      imagePassthrough,
    );
    const view: IImageViewProps = Object.assign(Object.create(null), {
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
      passthrough: resolveAccessibilityProps(accessibility),
    });
    const bag = buildImageBag(view);
    const passthroughStyle = readPassthroughStyle(passthrough);
    if (passthroughStyle !== undefined) {
      bag.style = bag.style === undefined ? passthroughStyle : [bag.style, passthroughStyle];
    }
    // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
    // TEMPLATE_KEY_UNMANGLE header comment) — renamed before the spread; `setAttributeOp`'s
    // `realPropName()` reverses it right before `routeProp`.
    return toTemplateSafeProps(bag);
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

<symbiote-image {...reduced} {@attach (node) => (hostRef = node)} />

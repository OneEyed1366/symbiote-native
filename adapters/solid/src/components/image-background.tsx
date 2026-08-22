// ImageBackground — the Solid lifecycle half. The composition (the absolute-fill Image behind the
// children, the wrapper-dimension proxy onto that Image, the imageStyle-last merge) lives
// framework-agnostic in @symbiote-native/components' renderImageBackground and is shared verbatim
// with React, Vue and Svelte. Solid supplies only the reactivity, the class-name resolution and
// the child order.
//
// SPLIT DOWN THE MIDDLE, and the seam is the children rule. The wrapper hosts a live Solid subtree
// (the overlay content), which only the reconciler can reduce, so it stays a literal
// `symbiote-view` carrying the shared fn's own props — the same shape View and SafeAreaView use,
// and the same one Svelte's ImageBackground lands on. The inner image is a leaf built entirely
// from VALUES, so it goes through descriptorToSolid, which builds it once and re-props it in place
// (replacing it would restart the download and drop the decoded bitmap).
//
// FLAT FILE, no folder: there are no platform or shared variants to group
// (`symbiote-file-layout` — only genuine groups get a folder).
//
// NOTHING here destructures `props` at setup. Solid props are getters and a component body runs
// ONCE; splitProps keeps every bucket reactive, and each read happens inside an accessor.

import { createMemo, splitProps } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  createDescriptorShapeGuard,
  renderImageBackground,
  resolveAccessibilityProps,
  type IImageProps,
} from '@symbiote-native/components';
import {
  resolveClassName,
  type IClassNameValue,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import { descriptorToSolid } from '../descriptor-to-solid';

// Inherits every forwarding Image prop (source, defaultSource, loadingIndicatorSource, the W3C
// aliases, resizeMode/resizeMethod/tintColor/blurRadius/capInsets/fadeDuration, the six load
// events, accessibility + aria); they flow onto the inner Image. `style` is overridden to mean the
// WRAPPER View's style. `children` is a Solid JSX.Element, which is what keeps this type
// per-adapter (<prop_types_split_agnostic_vs_per_adapter>) — React's takes a ReactNode, Vue's uses
// slots, Svelte's a Snippet, and an adapter never imports another adapter's types.
export interface IImageBackgroundProps extends Omit<IImageProps, 'style'> {
  // Wrapper View style; its width/height are reapplied to the inner Image by the shared fn.
  style?: IStyleProp<IViewStyle>;
  // Style merged onto the inner absolute-fill Image, after the proxied dimensions. A bare string
  // resolves through the shared style registry, like `class` on the wrapper below.
  imageStyle?: IStyleProp<IViewStyle> | string;
  // Applies to the WRAPPER, mirroring `style` — not to the inner image. Solid's spelling of
  // React's `className`.
  class?: IClassNameValue;
  children?: JSX.Element;
}

// renderImage's typed view fields — the props it CONSUMES rather than forwards. Split off so they
// never also ride through `passthrough`: the W3C aliases in particular must not reach Fabric raw,
// since native sees only the resolved `source` array they fold into. `style` is absent on purpose
// — the inner image's style is computed by renderImageBackground, never taken from the caller.
const IMAGE_VIEW_PROPS = [
  'source',
  'defaultSource',
  'loadingIndicatorSource',
  'resizeMode',
  'tintColor',
  'src',
  'srcSet',
  'alt',
  'width',
  'height',
  'crossOrigin',
  'referrerPolicy',
] as const;

const shape = createDescriptorShapeGuard('ImageBackground');

export function ImageBackground(props: IImageBackgroundProps): JSX.Element {
  const [local, view, rest] = splitProps(
    props,
    ['children', 'style', 'imageStyle', 'class'],
    IMAGE_VIEW_PROPS,
  );

  // One memo, so the wrapper bag and the inner image derive from a SINGLE call per change.
  const wrapper = createMemo(() =>
    renderImageBackground({
      style: local.style,
      // A bare string is a registered class name and has to become a style object here, before
      // it reaches the shared fn — which merges it, and knows nothing about the registry.
      imageStyle:
        typeof local.imageStyle === 'string'
          ? resolveClassName(local.imageStyle)
          : local.imageStyle,
      image: {
        ...view,
        // The wrapper is a raw host, not the View component, so the aria/role fold is this
        // component's own job; the resolved surface rides the IMAGE, matching every other adapter.
        passthrough: { ...resolveAccessibilityProps(rest) },
      },
    }),
  );

  const backgroundImage = descriptorToSolid(() =>
    shape.asElement(wrapper().children[0]),
  );

  // ONE object literal rather than a spread-then-override on the tag: `class` is legitimately
  // undefined, and Solid's mergeProps (which the compiler uses for a spread followed by an
  // explicit prop) would discard that undefined instead of applying it
  // (.claude/rules/solid-descriptor-bridge.md §6). No withStableKeys — renderImageBackground's
  // wrapper props are `{ style }` unconditionally, so no key can vanish between runs.
  const wrapperBag = (): Record<string, unknown> => ({
    ...wrapper().props,
    class: local.class,
  });

  // The user children come AFTER the image in child order, which is what makes them paint on top.
  return (
    <symbiote-view {...wrapperBag()}>
      {backgroundImage}
      {local.children}
    </symbiote-view>
  );
}

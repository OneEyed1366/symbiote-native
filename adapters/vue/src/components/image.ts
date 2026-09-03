// Image: the Vue lifecycle half. The full fold (source/src/srcSet resolution, width/height ->
// style fold, resizeMode/tintColor, alt -> accessibility, and the native source array) lives
// framework-agnostic in @symbiote-native/components, shared verbatim with React; Vue narrows the
// untyped attrs into renderImage's typed view, folds aria/role, bridges the Descriptor to a
// vnode, and carries the Image statics (getSize/prefetch/queryCache/...).
//
// FUNCTIONAL, not a stateful defineComponent: Animated.Image wraps it via createAnimatedComponent,
// which captures the host node through a ref that only falls through on a functional component
// (a defineComponent's ref resolves to a useless component proxy; see components.ts).

import type { FunctionalComponent } from '@vue/runtime-core';
import {
  imageStatics,
  renderImage,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
  type IImageProps as IImageBaseProps,
  type IImageSourceProp,
  type IImageStatics,
  type IResizeMode,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import { descriptorToVue } from '../descriptor-to-vue';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

export { setImageSourceResolver } from '@symbiote-native/components';
export type {
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from '@symbiote-native/components';

// Vue's own idiom for a registered class name (mirrors IViewProps.class) - a per-adapter field
// per <prop_types_split_agnostic_vs_per_adapter>, not part of the shared agnostic base.
export type IImageProps = IImageBaseProps & { class?: IClassNameValue };

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asSource(value: unknown): IImageSourceProp | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null) return value;
  return undefined;
}

function isResizeMode(value: unknown): value is IResizeMode {
  return (
    value === 'cover' ||
    value === 'contain' ||
    value === 'stretch' ||
    value === 'repeat' ||
    value === 'center'
  );
}

function asResizeMode(value: unknown): IResizeMode | undefined {
  return isResizeMode(value) ? value : undefined;
}

function asCrossOrigin(
  value: unknown,
): 'anonymous' | 'use-credentials' | undefined {
  return value === 'anonymous' || value === 'use-credentials'
    ? value
    : undefined;
}

function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

const HANDLED_ATTRS = [
  'source',
  'defaultSource',
  'loadingIndicatorSource',
  'style',
  'resizeMode',
  'tintColor',
  'src',
  'srcSet',
  'alt',
  'width',
  'height',
  'crossOrigin',
  'referrerPolicy',
];

type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

const ImageComponent: FunctionalComponent<IImageProps> = (
  _props,
  { attrs: rawAttrs },
) => {
  const attrs = normalizeVueAttrs(rawAttrs);
  return descriptorToVue(
    renderImage({
      source: asSource(attrs.source),
      defaultSource: asSource(attrs.defaultSource),
      loadingIndicatorSource: asSource(attrs.loadingIndicatorSource),
      style: isStyleProp(attrs.style) ? attrs.style : undefined,
      resizeMode: asResizeMode(attrs.resizeMode),
      tintColor: asString(attrs.tintColor),
      src: asString(attrs.src),
      srcSet: asString(attrs.srcSet),
      alt: asString(attrs.alt),
      width: asNumber(attrs.width),
      height: asNumber(attrs.height),
      crossOrigin: asCrossOrigin(attrs.crossOrigin),
      referrerPolicy: asString(attrs.referrerPolicy),
      passthrough: resolveAccessibilityProps(forwardAttrs(attrs)),
    }),
  );
};
ImageComponent.displayName = 'Image';
ImageComponent.inheritAttrs = false;

// Statics attached like RN (Image.getSize/prefetch/...), shared verbatim with React.
export const Image: FunctionalComponent<IImageProps> & IImageStatics =
  Object.assign(ImageComponent, imageStatics);

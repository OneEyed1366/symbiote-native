// ImageBackground: the Vue lifecycle half. The composition (the absolute-fill Image behind the
// children, the dimension-proxy + style-merge math) lives framework-agnostic in
// @symbiote-native/components/renderImageBackground, shared verbatim with React; Vue narrows the
// untyped attrs into the typed Image view, folds aria/role, bridges the Descriptor to vnodes, and
// appends the slot children ON TOP of the inner image.
//
// FUNCTIONAL, not a stateful defineComponent: render-only, no state.

import { h, type FunctionalComponent, type VNode } from '@vue/runtime-core';
import {
  renderImageBackground,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
  type IDescriptorChild,
  type IImageProps,
  type IImageSourceProp,
  type IResizeMode,
} from '@symbiote-native/components';
import {
  resolveClassName,
  type IClassNameValue,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import { descriptorToVue } from '../descriptor-to-vue';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

// React's IImageBackgroundProps carries `children?: ReactNode`; Vue takes children via slots.
// `style` is the WRAPPER View style, `imageStyle` the inner one.
export interface IImageBackgroundProps extends Omit<IImageProps, 'style'> {
  style?: IStyleProp<IViewStyle>;
  // A bare string is a class name; a style object/array flows through unchanged. Lands on the
  // INNER image, not the wrapper.
  imageStyle?: IStyleProp<IViewStyle> | string;
  // Forwarded onto the WRAPPER View like `style`, not the inner image.
  class?: IClassNameValue;
}

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

function toChildVNode(child: IDescriptorChild): VNode | string {
  return typeof child === 'string' ? child : descriptorToVue(child);
}

const HANDLED_ATTRS = [
  'style',
  'imageStyle',
  'class',
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
];

type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

const ImageBackgroundComponent: FunctionalComponent = (
  _props,
  { attrs: rawAttrs, slots },
) => {
  const attrs = normalizeVueAttrs(rawAttrs);
  const wrapper = renderImageBackground({
    style: isStyleProp(attrs.style) ? attrs.style : undefined,
    imageStyle:
      typeof attrs.imageStyle === 'string'
        ? resolveClassName(attrs.imageStyle)
        : isStyleProp(attrs.imageStyle)
          ? attrs.imageStyle
          : undefined,
    image: {
      source: asSource(attrs.source),
      defaultSource: asSource(attrs.defaultSource),
      loadingIndicatorSource: asSource(attrs.loadingIndicatorSource),
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
    },
  });

  // wrapper = symbiote-view > [imageDescriptor]; the slot children paint AFTER the image (on top).
  const slotChildren = slots.default !== undefined ? slots.default() : [];
  return h(
    wrapper.type,
    { ...wrapper.props, key: wrapper.key, class: attrs.class },
    [...wrapper.children.map(toChildVNode), ...slotChildren],
  );
};
ImageBackgroundComponent.displayName = 'ImageBackground';
ImageBackgroundComponent.inheritAttrs = false;

export const ImageBackground = ImageBackgroundComponent;

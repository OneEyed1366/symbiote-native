import {
  requireNativeModule,
  requireNativeViewManager,
} from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import {
  defineExpoNativeView,
  defineExpoViewMethods,
  getNativeTag,
  isDevBuild,
  styleOfProps,
} from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { IMAGE_MODULE_NAME, SF_SYMBOL_PREFIX } from './constants';
import { toImageEvents } from './image-view-events';
import {
  nativeColorProps,
  platformStyle,
  splitImageStyle,
  toNativeColor,
} from './native-style';
import type { IImageStyleParts } from './native-style';
import {
  resolveContentFit,
  resolveContentPosition,
  resolveSfEffect,
  resolveTransition,
  warnOnce,
} from './props';
import { resolveSources } from './sources';
import type { IImageViewHandle, IImageViewProps } from './types';

// Registered on render: a barrel side effect is lost in a release build
const imageView = defineExpoNativeView(
  requireNativeViewManager,
  IMAGE_MODULE_NAME,
);

const callViewFunction = defineExpoViewMethods(
  requireNativeModule,
  IMAGE_MODULE_NAME,
);

export const imageViewName = imageView.name;

export const ensureImageViewRegistered = imageView.ensureRegistered;

export type IImageView = {
  handle: IImageViewHandle;
  /** `null` means the view cannot register and the caller renders nothing */
  render(props: IImageViewProps): IDescriptor | null;
};

type IGetNode = () => ISymbioteNode | null | undefined;

// Props the view reads itself and native has no use for
const OWN_PROPS = [
  'style',
  'source',
  'placeholder',
  'contentFit',
  'contentPosition',
  'transition',
  'fadeDuration',
  'resizeMode',
  'defaultSource',
  'loadingIndicatorSource',
  'sfEffect',
  'alt',
] as const satisfies readonly (keyof IImageViewProps)[];

function hasSfSymbol(sources: ReturnType<typeof resolveSources>): boolean {
  return (
    Array.isArray(sources) &&
    sources.some(source => source.uri?.startsWith(`${SF_SYMBOL_PREFIX}/`))
  );
}

function withoutOwnProps(props: IImageViewProps): Record<string, unknown> {
  const own: readonly string[] = OWN_PROPS;
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !own.includes(key)),
  );
}

function placeholderOf(props: IImageViewProps) {
  const { defaultSource, loadingIndicatorSource } = props;
  if (defaultSource || loadingIndicatorSource) {
    warnOnce(
      '`defaultSource` and `loadingIndicatorSource` props are deprecated, use `placeholder`',
    );
  }
  return resolveSources(
    props.placeholder ?? defaultSource ?? loadingIndicatorSource,
  );
}

// For an SF Symbol `fontSize` sizes both the symbol and its container
function symbolProps(parts: IImageStyleParts, isSfSymbol: boolean) {
  if (!isSfSymbol) return { symbolWeight: null, symbolSize: null };
  const { fontWeight, fontSize } = parts;
  return {
    symbolWeight: fontWeight === undefined ? null : String(fontWeight),
    symbolSize: fontSize || null,
  };
}

function sizedStyle(parts: IImageStyleParts, isSfSymbol: boolean) {
  const { fontSize, rest } = parts;
  return isSfSymbol && fontSize
    ? { width: fontSize, height: fontSize, ...rest }
    : rest;
}

function nativeProps(props: IImageViewProps): Record<string, unknown> {
  const parts = splitImageStyle(styleOfProps(props));
  const source = resolveSources(props.source);
  const isSfSymbol = hasSfSymbol(source);
  const sized = sizedStyle(parts, isSfSymbol);
  const style = platformStyle(sized);
  const symbolColor = isSfSymbol ? parts.color : undefined;
  return {
    ...withoutOwnProps(props),
    ...style,
    accessibilityLabel: props.accessibilityLabel ?? props.alt,
    style,
    source,
    placeholder: placeholderOf(props),
    contentFit: resolveContentFit(
      props.contentFit,
      props.resizeMode ?? parts.resizeMode,
      isSfSymbol,
    ),
    contentPosition: resolveContentPosition(props.contentPosition),
    transition: resolveTransition(props.transition, props.fadeDuration),
    sfEffect: resolveSfEffect(props.sfEffect),
    ...symbolProps(parts, isSfSymbol),
    ...nativeColorProps(sized),
    tintColor: toNativeColor(props.tintColor || symbolColor || style.tintColor),
    ...toImageEvents(props),
  };
}

function createImageViewHandle(getNode: IGetNode): IImageViewHandle {
  // Like upstream's `ref.current?.`, a view that has not committed yet answers nothing
  async function call(method: string): Promise<void> {
    const node = getNode();
    if (!node || getNativeTag(node) === undefined) return;
    await callViewFunction(node, method, []);
  }
  return {
    startAnimating: () => call('startAnimating'),
    stopAnimating: () => call('stopAnimating'),
    lockResourceAsync: () => call('lockResourceAsync'),
    unlockResourceAsync: () => call('unlockResourceAsync'),
    reloadAsync: () => call('reloadAsync'),
  };
}

/** One per mounted view, `getNode` answers the host node once it exists */
export function createImageView(getNode: IGetNode): IImageView {
  return {
    handle: createImageViewHandle(getNode),
    render: props => {
      if (!ensureImageViewRegistered()) {
        if (isDevBuild()) console.warn("'Image' is not available.");
        return null;
      }
      return el(imageViewName(), nativeProps(props));
    },
  };
}

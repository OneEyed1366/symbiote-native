import type {
  IAccessibilityProps,
  IAriaProps,
  IResponderProps,
} from '@symbiote-native/components';
import type {
  IColorValue,
  IStyleProp,
  ITextStyle,
  IViewStyle,
} from '@symbiote-native/engine';
import type { SharedRef } from 'expo-modules-core';
import type { SFSymbol } from 'sf-symbols-typescript';

export type IImageSource = {
  /** `http(s)`, `file`, `data`, an asset URI and the `sf:/` and `blurhash:/` schemes */
  uri?: string;
  /** Sent with the request */
  headers?: Record<string, string>;
  /** Used for layout while the image loads, and the size of a hash placeholder */
  width?: number | null;
  height?: number | null;
  /** A Blurhash string, the source becomes a `blurhash:/` uri */
  blurhash?: string;
  /** A Thumbhash string, the source becomes a `thumbhash:/` uri */
  thumbhash?: string;
  /** The key of the cache entry, the uri by default */
  cacheKey?: string;
  /** Web only */
  webMaxViewportWidth?: number;
  /** Plays the image as an animation, detected from the content by default */
  isAnimated?: boolean;
};

export type IImageContentFit =
  'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

export type IImageDecodeFormat = 'argb' | 'rgb';

export type IImageResizeMode =
  'cover' | 'contain' | 'stretch' | 'repeat' | 'center';

export type IImageContentPositionValue =
  number | string | `${number}%` | `${number}` | 'center';

export type IImageContentPositionString =
  | 'center'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top center'
  | 'top right'
  | 'top left'
  | 'right center'
  | 'right top'
  | 'right bottom'
  | 'bottom center'
  | 'bottom right'
  | 'bottom left'
  | 'left center'
  | 'left top'
  | 'left bottom';

/** Two edges, the native side takes only this form */
export type IImageContentPositionObject =
  | { top?: IImageContentPositionValue; right?: IImageContentPositionValue }
  | { top?: IImageContentPositionValue; left?: IImageContentPositionValue }
  | { bottom?: IImageContentPositionValue; right?: IImageContentPositionValue }
  | { bottom?: IImageContentPositionValue; left?: IImageContentPositionValue };

export type IImageContentPosition =
  IImageContentPositionObject | IImageContentPositionString;

export type IImageTransition = {
  /** In milliseconds */
  duration?: number;
  timing?: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear';
  effect?:
    | 'cross-dissolve'
    | 'flip-from-top'
    | 'flip-from-right'
    | 'flip-from-bottom'
    | 'flip-from-left'
    | 'curl-up'
    | 'curl-down'
    | 'sf:replace'
    | 'sf:down-up'
    | 'sf:up-up'
    | 'sf:off-up'
    | null;
};

export type ISfSymbolEffectType =
  | 'bounce'
  | 'bounce/up'
  | 'bounce/down'
  | 'pulse'
  | 'variable-color'
  | 'variable-color/iterative'
  | 'variable-color/cumulative'
  | 'scale'
  | 'scale/up'
  | 'scale/down'
  | 'appear'
  | 'disappear'
  | 'wiggle'
  | 'rotate'
  | 'breathe'
  | 'draw/on'
  | 'draw/off';

export type ISfSymbolEffectObject = {
  effect: ISfSymbolEffectType;
  /** `-1` repeats forever */
  repeat?: number;
  scope?: 'by-layer' | 'whole-symbol' | null;
};

/** iOS 17+ for an SF Symbol source */
export type ISfSymbolEffect =
  | ISfSymbolEffectType
  | ISfSymbolEffectObject
  | (ISfSymbolEffectType | ISfSymbolEffectObject)[];

export type IImageLoadEventData = {
  cacheType: 'none' | 'disk' | 'memory';
  source: {
    url: string;
    width: number;
    height: number;
    mediaType: string | null;
    isAnimated?: boolean;
  };
};

export type IImageProgressEventData = { loaded: number; total: number };

export type IImageErrorEventData = { error: string };

export type IImagePrefetchOptions = {
  /** `memory-disk` by default */
  cachePolicy?: 'disk' | 'memory-disk' | 'memory';
  headers?: Record<string, string>;
};

export type IImageCacheConfig = {
  /** In bytes */
  maxDiskSize?: number;
  /** In bytes */
  maxMemoryCost?: number;
  maxMemoryCount?: number;
};

export type IImageLoadOptions = {
  maxWidth?: number;
  maxHeight?: number;
  tintColor?: IColorValue | number;
  /** `retry` loads again */
  onError?(error: Error, retry: () => void): void;
};

/** A reference to a native image, an image view takes it as its source */
export declare class ImageRef extends SharedRef<'image'> {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly mediaType: string | null;
  readonly isAnimated?: boolean;
  /** The id the native view looks the shared object up by */
  readonly __expo_shared_object_id__: number;
}

export type IImageStyle = IViewStyle & {
  tintColor?: IColorValue;
  resizeMode?: IImageResizeMode;
  /** With `color` and `fontSize` for an SF Symbol */
  fontWeight?: ITextStyle['fontWeight'];
  color?: IColorValue;
  fontSize?: number;
};

export type IImageSources =
  | IImageSource
  | `sf:${SFSymbol}`
  | (string & {})
  | number
  | IImageSource[]
  | string[]
  | SharedRef<'image'>
  | null;

export type IImageViewProps = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    style?: IStyleProp<IImageStyle>;
    /** A uri, an asset, a source object, a list of them or an `ImageRef` */
    source?: IImageSources;
    /** Shown while `source` loads */
    placeholder?:
      | IImageSource
      | string
      | number
      | IImageSource[]
      | string[]
      | SharedRef<'image'>
      | null;
    /** `cover` by default, `contain` for an SF Symbol */
    contentFit?: IImageContentFit;
    placeholderContentFit?: IImageContentFit;
    /** `center` by default */
    contentPosition?: IImageContentPosition;
    /** A number is the duration of a cross dissolve */
    transition?: IImageTransition | number | null;
    blurRadius?: number;
    tintColor?: IColorValue | null;
    priority?: 'low' | 'normal' | 'high' | null;
    loading?: 'lazy' | 'eager';
    cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk' | null;
    /** How the image follows a changing view size */
    responsivePolicy?: 'live' | 'initial' | 'static';
    /** Lets a recycled list cell tell its images apart */
    recyclingKey?: string | null;
    /** Plays an animated image on its own, `true` by default */
    autoplay?: boolean;
    /** An effect of an SF Symbol source, iOS 17+ */
    sfEffect?: ISfSymbolEffect | null;
    onLoadStart?: () => void;
    onLoad?: (event: IImageLoadEventData) => void;
    onProgress?: (event: IImageProgressEventData) => void;
    onError?: (event: IImageErrorEventData) => void;
    onLoadEnd?: () => void;
    onDisplay?: () => void;
    /** @deprecated Use `placeholder` */
    defaultSource?: IImageSource | null;
    /** @deprecated Use `placeholder` */
    loadingIndicatorSource?: IImageSource | null;
    /** @deprecated Use `contentFit` */
    resizeMode?: IImageResizeMode;
    /** @deprecated Use `transition` */
    fadeDuration?: number;
    focusable?: boolean;
    accessible?: boolean;
    accessibilityLabel?: string;
    /** The accessibility label when none is given */
    alt?: string;
    /** iOS only, lets the user select text in the image */
    enableLiveTextInteraction?: boolean;
    /** Downscales a larger image to the view, `true` by default */
    allowDownscaling?: boolean;
    /** Android only, `argb` by default */
    decodeFormat?: IImageDecodeFormat;
    /** iOS only */
    useAppleWebpCodec?: boolean;
    /** Android only */
    enforceEarlyResizing?: boolean;
    /** iOS only */
    preferHighDynamicRange?: boolean;
    /** Web only */
    draggable?: boolean;
    testID?: string;
    nativeID?: string;
  };

/** What a ref to the view hands out */
export type IImageViewHandle = {
  /** Starts an animated image */
  startAnimating(): Promise<void>;
  stopAnimating(): Promise<void>;
  /** Keeps the resource from being reloaded */
  lockResourceAsync(): Promise<void>;
  unlockResourceAsync(): Promise<void>;
  /** Reloads the resource, the lock is ignored */
  reloadAsync(): Promise<void>;
};

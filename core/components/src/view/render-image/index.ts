import {
  dlog,
  type IImageSource,
  type IImageSourceProp,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '../../accessibility-props';
import { el, type IDescriptor } from '../../descriptor';

export type { IImageSource, IImageSourceProp };

type IImageEventHandler = (event: ISymbioteEvent) => void;

export type IResizeMode = 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';

// iOS resizable-image cap insets: the unscaled border kept fixed while the
// center stretches (a 9-patch on iOS). Forwarded as-is; native understands it.
export type IImageCapInsets = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

// Android decode strategy: 'auto' lets RN pick, 'resize' downsamples at decode
// (cheaper memory), 'scale' decodes full then scales, 'none' disables resizing
// (ImageProps.js:116).
export type IResizeMethod = 'auto' | 'resize' | 'scale' | 'none';

export type IImageProps = IAccessibilityProps &
  IAriaProps & {
    // `source` is optional because the W3C aliases (`src` / `srcSet`) can supply it
    // instead; the fold in the component resolves exactly one of them to native.
    source?: IImageSourceProp;
    defaultSource?: IImageSourceProp;
    // Android-only: shown while the main source loads. Mutually exclusive with
    // defaultSource (RN warns if both are set). Resolved like any asset source.
    loadingIndicatorSource?: IImageSourceProp;
    style?: IStyleProp<IViewStyle>;
    resizeMode?: IResizeMode;
    // Android decode-time scaling strategy.
    resizeMethod?: IResizeMethod;
    tintColor?: string;
    blurRadius?: number;
    // iOS: cap insets for a resizable (stretchable-center) image.
    capInsets?: IImageCapInsets;
    // Android: cross-fade duration in ms when the image appears.
    fadeDuration?: number;
    // Android: stream the image in as it downloads rather than waiting for the full
    // file (ImageProps.js:90). Forwarded as-is; inert on iOS.
    progressiveRenderingEnabled?: boolean;

    // --- W3C HTML-style aliases (ImageProps.js ~166-202) ---
    // A single remote URI, folded into `source` (ImageProps.js:src). Mutually
    // exclusive with `source` in practice; the fold prefers src/srcSet.
    src?: string;
    // A comma-separated `uri 2x, uri 3x` descriptor list, expanded into a scaled
    // `source` array (mirrors getImageSourcesFromImageProps' srcSet parsing).
    srcSet?: string;
    // Accessibility text: folds to accessibilityLabel and marks the image accessible
    // (Image.ios.js/Image.android.js: alt -> accessibilityLabel + accessible).
    alt?: string;
    // Layout dp shorthands folded into style (ImageProps.js:195,202).
    width?: number;
    height?: number;
    // CORS mode; 'use-credentials' adds the credentials header to the source
    // (ImageSourceUtils.js getImageSourcesFromImageProps).
    crossOrigin?: 'anonymous' | 'use-credentials';
    // Referrer policy, forwarded as a source header (ImageSourceUtils.js).
    referrerPolicy?: string;

    onLoadStart?: IImageEventHandler;
    onLoad?: IImageEventHandler;
    onLoadEnd?: IImageEventHandler;
    onError?: IImageEventHandler;
    onProgress?: IImageEventHandler;
    onPartialLoad?: IImageEventHandler;
  };

// THE FIVE HELPERS THAT STOOD HERE WENT WITH `mapImageProps`, and nothing in the tree calls them
// any more: `normalizeSource`, `headersFromAliases`, `expandSrcSet`, `resolveSourceArray`,
// `readStyleString`, `readSourceUri`. Each is now a piece of `foldImageProps` in
// `SymbioteFabricProps.cpp` — except the asset lookup `normalizeSource` wrapped, which moved to
// WRITE time instead (`core/engine/src/image-source-write.ts`), because Metro's asset registry is
// JavaScript and has no business in the payload builder.
//
// Deleted rather than left exported-and-unused: an uncalled twin of a rule that lives somewhere
// else is a copy kept alive by its own test, which is the one thing this port is not allowed to
// produce.

// The pre-resolved inputs renderImage paints from (mirrors ISwitchViewProps /
// IActivityIndicatorViewProps). The adapter narrows the typed transform fields (source
// resolution, the width/height fold, resizeMode/tintColor) and folds everything else
// (events, blurRadius, capInsets, the already-folded accessibility* props, testID) into
// `passthrough`, which lands on the host image untouched. The W3C source aliases
// (src / srcSet / crossOrigin / referrerPolicy) are typed fields consumed here, NOT
// passthrough, so they never reach Fabric raw: native sees only the resolved `source` array.
export type IImageViewProps = {
  source?: IImageSourceProp;
  defaultSource?: IImageSourceProp;
  loadingIndicatorSource?: IImageSourceProp;
  style?: IStyleProp<IViewStyle>;
  resizeMode?: IResizeMode;
  tintColor?: string;
  src?: string;
  srcSet?: string;
  alt?: string;
  width?: number;
  height?: number;
  crossOrigin?: 'anonymous' | 'use-credentials';
  referrerPolicy?: string;
  passthrough: Record<string, unknown>;
};

// The names `renderImage` CONSUMES rather than forwards — the fold's input list, and the reason it
// is exported: an adapter that splits props before calling renderImage was copying this list by
// hand, and a name added here reached the copy only if someone remembered. The Image behavior's
// `foldPayload` reads it too, so the flat path and the view path cannot drift apart.
export const IMAGE_VIEW_PROP_NAMES = [
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
] as const;

/**
 * `mapImageProps` STOOD HERE and is now the engine's — `foldImageProps` in
 * `SymbioteFabricProps.cpp`, with `core/engine/cpp/tests/js/image-payload.itest.ts` as its contract.
 *
 * WHAT IS LEFT IS A GATHER, NOT A FOLD, and the distinction is the whole change. This flattens a
 * typed view object back into the bag an app authored — the `<image>` tag then receives those names
 * verbatim and the engine resolves them at commit, once, for every adapter. Angular is the caller
 * that kept this path alive (its `<Image>` component has typed `@Input()`s rather than a prop bag);
 * it now hands the tag raw props like every other adapter does.
 *
 * So the aliases (`src`, `srcSet`, `alt`, `width`, `height`, `crossOrigin`, `referrerPolicy`) leave
 * here UNRESOLVED on purpose. Resolving them would be the second implementation this file's own
 * header spent four lines warning about.
 */
export function renderImage(view: IImageViewProps): IDescriptor {
  dlog('Image -> RCTImageView');
  const props: Record<string, unknown> = { ...view.passthrough };
  for (const name of IMAGE_VIEW_PROP_NAMES) {
    const value = view[name];
    if (value !== undefined) props[name] = value;
  }
  return el('image', props);
}

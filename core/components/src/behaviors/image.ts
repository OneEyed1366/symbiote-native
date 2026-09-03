// Image's host behavior, and it carries NOTHING but a prop fold — no listeners, no timers, no
// commit hook. That is what a "fold-only" primitive means: the wrapper's whole body was prop
// mapping, so its lowered form owes exactly that and nothing else.
//
// The fold itself is not written here. `mapImageProps` in `../view/render-image` is the one
// implementation, and this file only narrows a flat prop bag into the typed view it takes — the
// same shape `behaviors/text-input.ts` uses (`stringOf` / `booleanOf` guards, then hand the shared
// resolver a typed object). A second copy of the mapping is the exact drift this primitive has
// already paid for once: `adapters/svelte/src/components/image/image-logic.ts` reproduces it by
// hand and says so in its own header, because nothing was exported to call.
//
// WHY THIS MAY SHARE THE WRAPPER'S TAG, where TextInput needed `-managed`. A behavior fold is keyed
// on the tag, and `renderImage` emits `symbiote-image` too — so on a wrapper-built node this fold
// runs on ALREADY-FOLDED props. That is safe here and only here, because the mapping is idempotent:
// every alias it consumes (`src`, `srcSet`, `alt`, `width`, `height`, …) is absent from its own
// output, `source` comes back in the array shape `normalizeSource` guarantees, and
// `loadingIndicatorSource` leaves under a DIFFERENT name (`loadingIndicatorSrc`), so a second pass
// finds nothing left to fold. Idempotence is asserted in `image.test.ts` rather than assumed — the
// audit rule's point is that a double fold is invisible precisely when it happens to be harmless,
// so the property has to be pinned or it is an accident waiting to be broken.
import {
  registerHostBehavior,
  type IImageSourceProp,
  type IStyleProp,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';

import {
  IMAGE_VIEW_PROP_NAMES,
  mapImageProps,
  type IResizeMode,
} from '../view/render-image';

export const IMAGE_TAG = 'symbiote-image';

const RESIZE_MODES: ReadonlySet<string> = new Set([
  'cover',
  'contain',
  'stretch',
  'repeat',
  'center',
]);
const CROSS_ORIGINS: ReadonlySet<string> = new Set([
  'anonymous',
  'use-credentials',
]);
const CONSUMED: ReadonlySet<string> = new Set(IMAGE_VIEW_PROP_NAMES);

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function resizeModeOf(value: unknown): IResizeMode | undefined {
  if (typeof value !== 'string' || !RESIZE_MODES.has(value)) return undefined;
  // Narrowed by the set membership above, then re-stated as the union through a switch rather than
  // a cast: the set and the type are two declarations of one list, and only this makes them agree.
  switch (value) {
    case 'cover':
    case 'contain':
    case 'stretch':
    case 'repeat':
    case 'center':
      return value;
    default:
      return undefined;
  }
}

function crossOriginOf(
  value: unknown,
): 'anonymous' | 'use-credentials' | undefined {
  if (typeof value !== 'string' || !CROSS_ORIGINS.has(value)) return undefined;
  return value === 'anonymous' ? 'anonymous' : 'use-credentials';
}

// A source is an asset id (number), a `{uri}` object, or an array of those. Anything else cannot be
// resolved and is dropped rather than forwarded — a malformed source reaching Fabric paints nothing
// and reports nothing, which is worse than an image that is simply absent.
function sourceOf(value: unknown): IImageSourceProp | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'object' || value === null) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof Reflect.get(value, 'uri') === 'string') return { ...value };
  return undefined;
}

// A StyleProp is an object, an array of them, or a registered class array — all of which
// `flattenStyle` already handles. The only thing to exclude is a scalar.
function styleOf(value: unknown): IStyleProp<IViewStyle> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (Array.isArray(value)) return value;
  return { ...value };
}

export function foldImagePayload(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const passthrough: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!CONSUMED.has(key)) passthrough[key] = props[key];
  }
  return mapImageProps({
    source: sourceOf(props.source),
    defaultSource: sourceOf(props.defaultSource),
    loadingIndicatorSource: sourceOf(props.loadingIndicatorSource),
    style: styleOf(props.style),
    resizeMode: resizeModeOf(props.resizeMode),
    tintColor: stringOf(props.tintColor),
    src: stringOf(props.src),
    srcSet: stringOf(props.srcSet),
    alt: stringOf(props.alt),
    width: numberOf(props.width),
    height: numberOf(props.height),
    crossOrigin: crossOriginOf(props.crossOrigin),
    referrerPolicy: stringOf(props.referrerPolicy),
    passthrough,
  });
}

// Required by IHostBehavior and deliberately empty: Image owns no per-node runtime. Written out
// rather than shared with a `noop` helper so the emptiness reads as a decision.
function attach(_node: ISymbioteNode): void {
  // nothing to set up
}

function detach(_node: ISymbioteNode): void {
  // nothing to release
}

export function registerImageBehavior(): void {
  registerHostBehavior(IMAGE_TAG, {
    attach,
    detach,
    foldPayload: foldImagePayload,
  });
}

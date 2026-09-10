// The ten style keys RN parses in JS before native, and the one place they are resolved.
//
// WHY THEY RUN AT WRITE TIME AND NOT AT PAYLOAD-BUILD TIME. On a device the payload is built by
// `core/engine/cpp/SymbioteFabricProps.cpp`, which does not carry these — they are pure JS. So a
// `boxShadow: '0 2px 4px #000'` resolved only inside `fabric-props.ts` is resolved only headless,
// and the device gets the raw CSS string. Fabric's C++ parses a style string ONLY under
// `enableNativeCSSParsing()`, which defaults to FALSE, so the declaration is dropped in silence:
// no warning, no wrong value, just a gradient or a shadow that is not there. Resolving on the way
// IN puts the structured value in `node.props` itself, which is the one thing both payload builders
// read.
//
// This is the same move `configPayloadFold` makes for a third-party view's own processors, one
// layer down: anything the C++ half cannot do has to happen before the C++ half sees the value.
//
// IDENTITY IS PART OF THE CONTRACT. A style object that needs nothing comes back BY IDENTITY, and
// so does an array whose every entry did. The host's `OP_SET_PROP` skips a same-identity write, and
// `pushClassStyle` compares what it is about to publish against what it published last — hand
// either of them a fresh object per write and an unchanged style becomes a write and a dirty node
// on every render.

import { processAspectRatio } from './process-aspect-ratio';
import { processBackgroundImage } from './process-background-image';
import {
  processBackgroundPosition,
  processBackgroundRepeat,
  processBackgroundSize,
  type IBackgroundLonghandInput,
} from './process-background-longhands';
import { processBoxShadow } from './process-box-shadow';
import { processFilter } from './process-filter';
import { processFontVariant } from './process-font-variant';
import { processTransform } from './process-transform';
import { processTransformOrigin } from './process-transform-origin';
import { isRecord, isString } from './type-guards';

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

// boxShadow accepts a CSS string or an array of shadow objects; anything else is
// undefined to processBoxShadow (which returns []). Narrowing avoids an `as` cast.
function asBoxShadowInput(
  value: unknown,
): Parameters<typeof processBoxShadow>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// filter accepts a CSS string or an array of single-key filter objects; same narrowing.
function asFilterInput(value: unknown): Parameters<typeof processFilter>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// experimental_backgroundImage accepts a CSS string (gradient functions) or an array of
// structured gradient objects; same narrowing as boxShadow/filter.
function asBackgroundImageInput(
  value: unknown,
): Parameters<typeof processBackgroundImage>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// transformOrigin accepts a CSS string or a [x, y, z] array of strings/numbers; anything
// else is undefined to processTransformOrigin (which defaults to center/center/0).
function asTransformOriginInput(
  value: unknown,
): Parameters<typeof processTransformOrigin>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isStringOrNumber);
  return undefined;
}

// aspectRatio accepts a number (the common, working form) or a ratio string; otherwise
// undefined, which processAspectRatio drops.
function asAspectRatioInput(
  value: unknown,
): Parameters<typeof processAspectRatio>[0] {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

// fontVariant accepts an array of variant strings (the common, working form) or a
// space-separated string; anything else becomes an empty string, which yields [].
function asFontVariantInput(
  value: unknown,
): Parameters<typeof processFontVariant>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isString);
  return '';
}

// transform accepts a CSS string (processTransform parses it) or an array of single-key
// transform records (the hot animated / sticky-header path). A non-string non-array value is NOT
// dropped: it may already be processed, so it passes through verbatim rather than being coerced to
// [] (which would erase a valid transform).
function processTransformValue(value: unknown): unknown {
  if (typeof value === 'string') return processTransform(value);
  if (Array.isArray(value)) return processTransform(value.filter(isRecord));
  return value;
}

const STYLE_PROCESSORS = new Map<string, (value: unknown) => unknown>([
  ['boxShadow', value => processBoxShadow(asBoxShadowInput(value))],
  ['filter', value => processFilter(asFilterInput(value))],
  [
    'transformOrigin',
    value => processTransformOrigin(asTransformOriginInput(value)),
  ],
  ['transform', processTransformValue],
  ['aspectRatio', value => processAspectRatio(asAspectRatioInput(value))],
  ['fontVariant', value => processFontVariant(asFontVariantInput(value))],
  [
    'experimental_backgroundImage',
    value => processBackgroundImage(asBackgroundImageInput(value)),
  ],
  [
    'experimental_backgroundSize',
    value => processBackgroundSize(asBackgroundLonghandInput(value)),
  ],
  [
    'experimental_backgroundPosition',
    value => processBackgroundPosition(asBackgroundLonghandInput(value)),
  ],
  [
    'experimental_backgroundRepeat',
    value => processBackgroundRepeat(asBackgroundLonghandInput(value)),
  ],
]);

// All three longhands take the same two shapes: a CSS string, or an already-structured array RN
// passes through untouched. Anything else is undefined, which upstream answers with [] and the
// wrapper turns into an absent key.
function asBackgroundLonghandInput(value: unknown): IBackgroundLonghandInput {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value;
  return undefined;
}

// Keyed on the style object, so a class-resolved style shared by a thousand rows is resolved once.
// The value is the object to USE — which is the input itself whenever nothing needed resolving, so
// a hit costs one lookup and returns the same reference the caller already had.
const resolvedStyles = new WeakMap<object, Record<string, unknown>>();

function resolveRecord(
  style: Record<string, unknown>,
): Record<string, unknown> {
  const cached = resolvedStyles.get(style);
  if (cached !== undefined) return cached;
  let out: Record<string, unknown> | undefined;
  for (const [key, process] of STYLE_PROCESSORS) {
    if (!(key in style)) continue;
    const value = style[key];
    if (value === undefined) continue;
    const next = process(value);
    if (Object.is(next, value)) continue;
    const claimed = out ?? { ...style };
    claimed[key] = next;
    out = claimed;
  }
  const answer = out ?? style;
  resolvedStyles.set(style, answer);
  return answer;
}

/**
 * A style value with its structured keys resolved — the same value by identity when there was
 * nothing to resolve, which is nearly always.
 *
 * Accepts what a style slot can hold: one object, or a (nested) array of them. An array is not
 * memoized — `pushClassStyle` mints a fresh one on every publish, so a cache keyed on it could
 * never hit; its ENTRIES carry the memo instead, and the original array comes back untouched when
 * none of them moved.
 */
export function resolveStructuredStyle(style: unknown): unknown {
  if (Array.isArray(style)) {
    let out: unknown[] | undefined;
    for (let at = 0; at < style.length; at += 1) {
      const next = resolveStructuredStyle(style[at]);
      if (Object.is(next, style[at])) continue;
      const claimed = out ?? [...style];
      claimed[at] = next;
      out = claimed;
    }
    return out ?? style;
  }
  return isRecord(style) ? resolveRecord(style) : style;
}

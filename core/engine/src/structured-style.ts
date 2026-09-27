// The ten style keys RN parses in JS before native, and the one place they are resolved.

// They run at write time, not payload-build time: SymbioteFabricProps.cpp doesn't carry these
// processors, so resolving only in fabric-props.ts leaves the device its raw CSS string, silently
// dropped (C++ parses a style string only under enableNativeCSSParsing, default false).

// Same move `configPayloadFold` makes for a third-party view's own processors: anything the C++
// half can't do has to happen before the C++ half sees the value.

// Identity is part of the contract: an object/array needing no resolution comes back by identity,
// since OP_SET_PROP skips a same-identity write and pushClassStyle diffs by reference — a fresh
// object per call would turn an unchanged style into a write and a dirty node every render.

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

// transform accepts a CSS string or an array of single-key records (the hot animated /
// sticky-header path). A non-string non-array value passes through verbatim — it may already be
// processed, so coercing it to [] would erase a valid transform.
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

// A style value with its structured keys resolved — same value by identity when nothing needed
// resolving, which is nearly always.

// Accepts one object or a (nested) array of them. An array itself isn't memoized (pushClassStyle
// mints a fresh one per publish, so a cache keyed on it would never hit); its entries carry the
// memo instead.
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

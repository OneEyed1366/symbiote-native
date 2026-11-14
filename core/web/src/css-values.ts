// Style values that are more than a number or a word: the structured forms an author may write

import { isRecord } from '@symbiote-native/engine';

export type ICssDeclarations = Record<string, string>;

export function toLength(value: unknown): string {
  return typeof value === 'number' ? `${value}px` : String(value);
}

// A string is CSS already, a list is written entry by entry, anything else cannot be written
function serializeList(
  value: unknown,
  serializeEntry: (entry: unknown) => string | undefined,
  separator: string,
): string | undefined {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return undefined;
  const parts = value.map(serializeEntry);
  return parts.includes(undefined) ? undefined : parts.join(separator);
}

// A transform or filter entry is a record of one function name to its argument
function callOf(entry: unknown): [string, unknown] | undefined {
  if (!isRecord(entry)) return undefined;
  const [name] = Object.keys(entry);
  return name === undefined ? undefined : [name, entry[name]];
}

// Whether a transform function takes a distance, which is px, or a bare angle or factor
const TRANSFORM_TAKES_LENGTH = {
  translateX: true,
  translateY: true,
  perspective: true,
  scale: false,
  scaleX: false,
  scaleY: false,
  rotate: false,
  rotateX: false,
  rotateY: false,
  rotateZ: false,
  skewX: false,
  skewY: false,
} as const satisfies Record<string, boolean>;

type ITransformName = keyof typeof TRANSFORM_TAKES_LENGTH;

function isTransformName(name: string): name is ITransformName {
  return name in TRANSFORM_TAKES_LENGTH;
}

const MATRIX_3D_SIZE = 16;

function transformCall(entry: unknown): string | undefined {
  const call = callOf(entry);
  if (call === undefined) return undefined;
  const [name, argument] = call;
  if (name === 'matrix' && Array.isArray(argument)) {
    const suffix = argument.length === MATRIX_3D_SIZE ? '3d' : '';
    return `matrix${suffix}(${argument.join(', ')})`;
  }
  if (!isTransformName(name)) return undefined;
  const text = TRANSFORM_TAKES_LENGTH[name]
    ? toLength(argument)
    : String(argument);
  return `${name}(${text})`;
}

export const serializeTransform = (value: unknown): string | undefined =>
  serializeList(value, transformCall, ' ');

export const serializeOrigin = (value: unknown): string | undefined =>
  serializeList(value, toLength, ' ');

function boxShadowOf(entry: unknown): string | undefined {
  if (!isRecord(entry)) return undefined;
  const { offsetX, offsetY, blurRadius, spreadDistance, color, inset } = entry;
  const lengths = [offsetX, offsetY, blurRadius ?? 0, spreadDistance ?? 0];
  const parts = lengths.map(toLength);
  if (color !== undefined) parts.push(String(color));
  if (inset === true) parts.unshift('inset');
  return parts.join(' ');
}

export const serializeBoxShadow = (value: unknown): string | undefined =>
  serializeList(value, boxShadowOf, ', ');

const FILTER_NAMES = {
  brightness: 'brightness',
  blur: 'blur',
  contrast: 'contrast',
  grayscale: 'grayscale',
  hueRotate: 'hue-rotate',
  invert: 'invert',
  opacity: 'opacity',
  saturate: 'saturate',
  sepia: 'sepia',
  dropShadow: 'drop-shadow',
} as const satisfies Record<string, string>;

type IFilterName = keyof typeof FILTER_NAMES;

function isFilterName(name: string): name is IFilterName {
  return name in FILTER_NAMES;
}

// A bare number is a distance for blur, an angle for hue-rotate and a factor for the rest
function filterArgument(name: IFilterName, argument: unknown): string {
  if (name === 'dropShadow') {
    return typeof argument === 'string'
      ? argument
      : (boxShadowOf(argument) ?? '');
  }
  if (typeof argument !== 'number') return String(argument);
  if (name === 'blur') return `${argument}px`;
  return name === 'hueRotate' ? `${argument}deg` : String(argument);
}

function filterCall(entry: unknown): string | undefined {
  const call = callOf(entry);
  if (call === undefined || !isFilterName(call[0])) return undefined;
  return `${FILTER_NAMES[call[0]]}(${filterArgument(call[0], call[1])})`;
}

export const serializeFilter = (value: unknown): string | undefined =>
  serializeList(value, filterCall, ' ');

// The numeric font variants are one CSS property, small caps is another
export function serializeFontVariant(
  value: unknown,
): ICssDeclarations | undefined {
  if (!Array.isArray(value)) return undefined;
  const variants = value.map(String);
  const caps = variants.filter(variant => variant.endsWith('caps'));
  const numeric = variants.filter(variant => !variant.endsWith('caps'));
  const out: ICssDeclarations = {};
  if (numeric.length > 0) out['font-variant-numeric'] = numeric.join(' ');
  if (caps.length > 0) out['font-variant-caps'] = caps.join(' ');
  return out;
}

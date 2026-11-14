// A length inside a media feature, with the `calc()`, `min()`, `max()` and `clamp()` around it
// Only `px`, `rem` and `em` have a size here, so any other unit makes the whole value unknown

import { isRecord, readNumber, readString } from './value-readers.ts';

const RELATIVE_UNITS = ['rem', 'em'] as const;
type IRelativeUnit = (typeof RELATIVE_UNITS)[number];

const SUM = 'sum';
const PX = 'px';

// `min` and `max` take any number of operands, `clamp` takes the three of `(low, preferred, high)`
const PICKERS: ReadonlyMap<string, (values: readonly number[]) => number> = new Map([
  ['min', values => Math.min(...values)],
  ['max', values => Math.max(...values)],
  ['clamp', ([low = 0, preferred = 0, high = 0]) => Math.min(high, Math.max(low, preferred))],
]);

function isRelativeUnit(unit: string): unit is IRelativeUnit {
  return RELATIVE_UNITS.some(relative => relative === unit);
}

function allNumbers(values: readonly (number | undefined)[]): values is number[] {
  return values.every(value => value !== undefined);
}

/** The length in pixels, or `undefined` when a part of it is not a `px`, `rem` or `em` length */
export function mediaLengthPx(node: unknown, remToPx: number): number | undefined {
  if (!isRecord(node)) return undefined;
  const unit = readString(node.unit);
  const amount = readNumber(node.value);
  if (unit !== null && amount !== null) {
    if (unit === PX) return amount;
    return isRelativeUnit(unit) ? amount * remToPx : undefined;
  }

  const picker = PICKERS.get(String(node.type));
  if (picker === undefined && node.type !== SUM) return mediaLengthPx(node.value, remToPx);
  if (!Array.isArray(node.value)) return undefined;

  const lengths = node.value.map(operand => mediaLengthPx(operand, remToPx));
  if (!allNumbers(lengths)) return undefined;
  return picker === undefined ? lengths.reduce((total, part) => total + part, 0) : picker(lengths);
}

import { REM_TO_PX } from '../values.ts';
import type { IDeclarationContext, IStyleValue } from './declaration-types.ts';
import {
  isRecord,
  readNumber,
  readString,
  roundFloat,
} from './value-readers.ts';

const ABSOLUTE_UNIT_TO_PX: Record<string, number> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  pt: 96 / 72,
  pc: 16,
};

// RN's `borderWidth` takes a number, so the CSS keywords become the browser-default points
const BORDER_WIDTH_KEYWORD_PX: Record<string, number> = {
  thin: 1,
  medium: 3,
  thick: 5,
};

const NODE_TYPE = {
  auto: 'auto',
  calc: 'calc',
  value: 'value',
  percentage: 'percentage',
  number: 'number',
  integer: 'integer',
  function: 'function',
  sum: 'sum',
} as const;

// The wrappers nest differently per property, so the walk goes through all of them
const WRAPPER_TYPES: ReadonlySet<string> = new Set([
  'length',
  'length-percentage',
  'dimension',
  NODE_TYPE.value,
]);

export type IResolvedLength = {
  readonly kind: 'px' | 'percent' | 'auto';
  readonly value: number;
};

function unitToPx(
  unit: string,
  amount: number,
  context: IDeclarationContext,
): number | null {
  // `em` scales by the root size, as the old parser did: there is no box tree for a parent size
  if (unit === 'rem' || unit === 'em') {
    return amount * (context.remToPx ?? REM_TO_PX);
  }

  const factor = ABSOLUTE_UNIT_TO_PX[unit];
  return factor === undefined ? null : amount * factor;
}

// The leaf every wrapper bottoms out at is a bare `{unit, value}`, and undefined means not one
function readLeaf(
  value: Record<string, unknown>,
  context: IDeclarationContext,
): IResolvedLength | null | undefined {
  const unit = readString(value.unit);
  const amount = readNumber(value.value);
  if (unit === null || amount === null) return undefined;
  const px = unitToPx(unit, amount, context);
  return px === null ? null : { kind: 'px', value: px };
}

// lightningcss reports a percentage as a FRACTION: `100%` arrives as 1
function readPercentage(value: unknown): IResolvedLength | null {
  const fraction = readNumber(value);
  return fraction === null ? null : { kind: 'percent', value: fraction * 100 };
}

// RN's `lineHeight` has no multiplier form, so a unitless `1.4` becomes 1.4 points
function readPlainNumber(value: unknown): IResolvedLength | null {
  const plain = readNumber(value);
  return plain === null ? null : { kind: 'px', value: plain };
}

function readTyped(
  value: Record<string, unknown>,
  context: IDeclarationContext,
): IResolvedLength | null {
  const type = readString(value.type);
  if (type === null) return null;
  if (type === NODE_TYPE.auto) return { kind: 'auto', value: 0 };
  if (type === NODE_TYPE.percentage) return readPercentage(value.value);
  if (type === NODE_TYPE.number || type === NODE_TYPE.integer) {
    return readPlainNumber(value.value);
  }
  if (type === NODE_TYPE.calc) return evaluateCalc(value.value, context);
  if (WRAPPER_TYPES.has(type)) return readLength(value.value, context);
  const px = BORDER_WIDTH_KEYWORD_PX[type];
  return px === undefined ? null : { kind: 'px', value: px };
}

/**
 * Reduces a length-ish wrapper of lightningcss to px, percent or auto, or to null when RN cannot
 * express it: a viewport unit, a `calc()` that does not evaluate, `normal`
 */
export function readLength(
  value: unknown,
  context: IDeclarationContext,
): IResolvedLength | null {
  if (!isRecord(value)) return null;
  const leaf = readLeaf(value, context);
  return leaf === undefined ? readTyped(value, context) : leaf;
}

export function lengthToStyleValue(length: IResolvedLength): IStyleValue {
  switch (length.kind) {
    case 'auto':
      return 'auto';
    case 'percent':
      return `${roundFloat(length.value)}%`;
    case 'px':
      return roundFloat(length.value);
  }
}

// lightningcss folds a same-unit `calc()` itself, so a sum that reaches here mixes units
// It evaluates only when every operand reduces to px
function evaluateSum(
  operands: unknown,
  context: IDeclarationContext,
): IResolvedLength | null {
  if (!Array.isArray(operands)) return null;

  let total = 0;
  for (const operand of operands) {
    const term = evaluateCalc(operand, context);
    if (term === null || term.kind !== 'px') return null;
    total += term.value;
  }
  return { kind: 'px', value: total };
}

// `min()`, `max()`, `clamp()` and `product` have no RN equivalent, and a guess is how the old
// evaluator emitted 100 for `calc(100% - 24px)`
function evaluateCalc(
  node: unknown,
  context: IDeclarationContext,
): IResolvedLength | null {
  if (!isRecord(node)) return null;

  switch (node.type) {
    case NODE_TYPE.function:
    case NODE_TYPE.calc:
      return evaluateCalc(node.value, context);
    case NODE_TYPE.sum:
      return evaluateSum(node.value, context);
    case NODE_TYPE.value:
      return readLength(node.value, context);
    default:
      return null;
  }
}

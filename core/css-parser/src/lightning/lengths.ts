import { REM_TO_PX } from '../values.ts';
import type { IDeclarationContext, IStyleValue } from './style-types.ts';
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

export const LENGTH_KIND = {
  px: 'px',
  percent: 'percent',
  auto: 'auto',
} as const;

// The `type` tags lightningcss puts on the wrappers this file walks
const NODE = {
  auto: 'auto',
  calc: 'calc',
  percentage: 'percentage',
  value: 'value',
} as const;

// Wrappers that only carry the length one level down
const WRAPPER_TYPE_NAMES = [
  'length',
  'length-percentage',
  'dimension',
  NODE.value,
] as const satisfies readonly string[];
const WRAPPER_TYPES: ReadonlySet<string> = new Set(WRAPPER_TYPE_NAMES);

export type IResolvedLength = {
  readonly kind: (typeof LENGTH_KIND)[keyof typeof LENGTH_KIND];
  readonly value: number;
};

function pxLength(value: number): IResolvedLength {
  return { kind: LENGTH_KIND.px, value };
}

type ILeafReader = (amount: number | null) => IResolvedLength | null;

const readPlainNumber: ILeafReader = amount =>
  amount === null ? null : pxLength(amount);

// A table keeps `readLength` flat: one entry per leaf `type`, a keyword ignoring the amount
const LEAF_READERS = new Map<string, ILeafReader>([
  // lightningcss reports a percentage as a FRACTION: `100%` arrives as 1
  [
    NODE.percentage,
    amount =>
      amount === null
        ? null
        : { kind: LENGTH_KIND.percent, value: amount * 100 },
  ],
  // RN's `lineHeight` has no multiplier form, so a unitless `1.4` becomes 1.4 points
  ['number', readPlainNumber],
  ['integer', readPlainNumber],
  ...Object.entries(BORDER_WIDTH_KEYWORD_PX).map(
    ([keyword, px]): [string, ILeafReader] => [keyword, () => pxLength(px)],
  ),
]);

function unitToPx(
  unit: string,
  amount: number,
  context: IDeclarationContext,
): number | null {
  // `em` scales by the root size too, since no box tree gives a parent font size here
  if (unit === 'rem' || unit === 'em') {
    return amount * (context.remToPx ?? REM_TO_PX);
  }

  const factor = ABSOLUTE_UNIT_TO_PX[unit];
  return factor === undefined ? null : amount * factor;
}

/**
 * Reduces any of lightningcss's length-ish wrappers to px, percent or auto, or `null` when RN
 * cannot express it (a viewport unit, a `calc()` it cannot evaluate, `normal`)
 */
export function readLength(
  value: unknown,
  context: IDeclarationContext,
): IResolvedLength | null {
  if (!isRecord(value)) return null;

  // A bare `LengthValue` (`{unit, value}`) is the leaf every wrapper bottoms out at
  const unit = readString(value.unit);
  const amount = readNumber(value.value);
  if (unit !== null && amount !== null) {
    const px = unitToPx(unit, amount, context);
    return px === null ? null : pxLength(px);
  }

  const type = readString(value.type) ?? '';
  if (type === NODE.auto) return { kind: LENGTH_KIND.auto, value: 0 };
  if (type === NODE.calc) return evaluateCalc(value.value, context);
  if (WRAPPER_TYPES.has(type)) return readLength(value.value, context);
  return LEAF_READERS.get(type)?.(amount) ?? null;
}

/** Whether a `min()`, `clamp()` or another math function is left in the tree, `calc()` aside */
export function containsMathFunction(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(containsMathFunction);
  if (!isRecord(node)) return false;
  const isMathCall =
    node.type === 'function' &&
    isRecord(node.value) &&
    node.value.type !== NODE.calc;
  return isMathCall || containsMathFunction(node.value);
}

type IOperandKinds = {
  opaqueUnit: boolean;
  hasPercent: boolean;
  hasLength: boolean;
};

function collectOperandKinds(
  node: unknown,
  kinds: IOperandKinds,
  context: IDeclarationContext,
): void {
  if (Array.isArray(node)) {
    for (const item of node) collectOperandKinds(item, kinds, context);
    return;
  }
  if (!isRecord(node)) return;
  if (node.type === NODE.percentage) kinds.hasPercent = true;
  const unit = readString(node.unit);
  if (unit !== null) {
    kinds.hasLength = true;
    kinds.opaqueUnit ||= unitToPx(unit, 0, context) === null;
  }
  collectOperandKinds(node.value, kinds, context);
}

/**
 * Whether the engine can never compute this tree: a viewport or font-relative unit it has no
 * size for, or a percentage next to a length (needs the parent box)
 */
export function isUnresolvableAtRuntime(
  node: unknown,
  context: IDeclarationContext,
): boolean {
  const kinds: IOperandKinds = {
    opaqueUnit: false,
    hasPercent: false,
    hasLength: false,
  };
  collectOperandKinds(node, kinds, context);
  return kinds.opaqueUnit || (kinds.hasPercent && kinds.hasLength);
}

export function lengthToStyleValue(length: IResolvedLength): IStyleValue {
  switch (length.kind) {
    case LENGTH_KIND.auto:
      return NODE.auto;
    case LENGTH_KIND.percent:
      return `${roundFloat(length.value)}%`;
    case LENGTH_KIND.px:
      return roundFloat(length.value);
  }
}

function sumOperands(
  operands: unknown,
  context: IDeclarationContext,
): IResolvedLength | null {
  if (!Array.isArray(operands)) return null;

  let total = 0;
  for (const operand of operands) {
    const term = evaluateCalc(operand, context);
    if (term === null || term.kind !== LENGTH_KIND.px) return null;
    total += term.value;
  }
  return pxLength(total);
}

// Evaluates a `calc()` sum when every operand reduces to px, `null` otherwise
// `min()`, `max()`, `clamp()` and `product` have no RN form, and a guessed one is wrong
function evaluateCalc(
  node: unknown,
  context: IDeclarationContext,
): IResolvedLength | null {
  if (!isRecord(node)) return null;

  switch (node.type) {
    case 'function':
    case NODE.calc:
      return evaluateCalc(node.value, context);
    case 'sum':
      return sumOperands(node.value, context);
    case NODE.value:
      return readLength(node.value, context);
    default:
      return null;
  }
}

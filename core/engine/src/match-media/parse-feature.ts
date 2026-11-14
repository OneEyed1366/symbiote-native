// Reads the tokens inside one pair of parentheses as a media feature: plain, boolean or range
// A feature the runtime cannot answer keeps its text and has no condition

import {
  isKeywordFeature,
  isMediaComparison,
  isNumericFeature,
  type IKeywordFeature,
  type IMediaComparison,
  type IMediaCondition,
} from '../style-registry/media-evaluate';
import {
  COLON,
  isDimension,
  isIdent,
  isMathToken,
  isNumberToken,
  isPunct,
  isRatioToken,
  punctOf,
  tokenText,
  type IToken,
} from './tokenize';

export type IPart = {
  readonly text: string;
  readonly condition: IMediaCondition | undefined;
};

const RESOLUTION = 'resolution';
const ASPECT_RATIO = 'aspect-ratio';
const NO_PREFERENCE = 'no-preference';
// Written on its own these are false at `no-preference`, and the other keyword features are true
const OFF_KEYWORD_NAMES = [
  'prefers-reduced-motion',
  'prefers-contrast',
  'prefers-reduced-transparency',
] as const satisfies readonly IKeywordFeature[];
const OFF_KEYWORD_FEATURES: ReadonlySet<string> = new Set(OFF_KEYWORD_NAMES);
const ROOT_FONT_PX = 16;
const DPI_PER_DPPX = 96;
const CM_PER_INCH = 2.54;
const MIN_PREFIX = 'min-';
const MAX_PREFIX = 'max-';
const INTERVAL_LENGTH = 5;
const RANGE_LENGTH = 3;

export const PX_PER_LENGTH_UNIT: Readonly<Record<string, number>> = {
  px: 1,
  em: ROOT_FONT_PX,
  rem: ROOT_FONT_PX,
};
const DPPX_OF_RESOLUTION: Readonly<Record<string, (amount: number) => number>> = {
  dppx: amount => amount,
  x: amount => amount,
  dpi: amount => amount / DPI_PER_DPPX,
  dpcm: amount => (amount * CM_PER_INCH) / DPI_PER_DPPX,
};

// `400px <= width` reads as `width >= 400px`, so the operator flips with the sides
const FLIPPED: Readonly<Record<IMediaComparison, IMediaComparison>> = {
  '=': '=',
  '>': '<',
  '>=': '<=',
  '<': '>',
  '<=': '>=',
};

function convertUnit(feature: string, amount: number, unit: string): number | undefined {
  if (feature === RESOLUTION) {
    const dots = DPPX_OF_RESOLUTION[unit]?.(amount);
    return dots !== undefined && dots < 0 ? undefined : dots;
  }
  const factor = PX_PER_LENGTH_UNIT[unit];
  return factor === undefined ? undefined : amount * factor;
}

// Infinity does not survive the JSON the conditions ship as, so the largest number stands in
function quotientOf(top: number, bottom: number): number | undefined {
  if (top < 0 || bottom < 0) return undefined;
  if (bottom === 0) return top === 0 ? 0 : Number.MAX_VALUE;
  return top / bottom;
}

// A bare number is a ratio of one for `aspect-ratio`, and a bare `0` is a length
function bareNumberOf(feature: string, value: number): number | undefined {
  if (feature === ASPECT_RATIO) return value < 0 ? undefined : value;
  return value === 0 && feature !== RESOLUTION ? 0 : undefined;
}

// Kept apart so `bareNumberOf` carries the number rules and this one the token kinds
function numberOf(feature: string, token: IToken): number | undefined {
  if (isRatioToken(token)) {
    return feature === ASPECT_RATIO ? quotientOf(token.top, token.bottom) : undefined;
  }
  if (isMathToken(token)) {
    return feature === RESOLUTION || feature === ASPECT_RATIO ? undefined : token.px;
  }
  if (isNumberToken(token)) return bareNumberOf(feature, token.value);
  return isDimension(token) ? convertUnit(feature, token.value, token.unit) : undefined;
}

function comparison(
  operator: IMediaComparison,
  name: string,
  value: IToken,
): IMediaCondition | undefined {
  if (isNumericFeature(name) || name === ASPECT_RATIO) {
    const amount = numberOf(name, value);
    return amount === undefined ? undefined : [operator, name, amount];
  }
  if (isKeywordFeature(name) && operator === '=' && isIdent(value)) {
    return [operator, name, value.text];
  }
  return undefined;
}

// `min-width` is `width >=` and `max-width` is `width <=`, which only a numeric feature has
function plainCondition(name: string, value: IToken): IMediaCondition | undefined {
  if (name.startsWith(MIN_PREFIX)) return comparison('>=', name.slice(MIN_PREFIX.length), value);
  if (name.startsWith(MAX_PREFIX)) return comparison('<=', name.slice(MAX_PREFIX.length), value);
  return comparison('=', name, value);
}

function isOperand(token: IToken | undefined): token is IToken {
  return isNumberToken(token) || isDimension(token) || isRatioToken(token) || isMathToken(token);
}

// A feature on its own is true unless its value is zero or its "off" keyword
function booleanCondition(name: string): IMediaCondition | undefined {
  if (isNumericFeature(name) || name === ASPECT_RATIO) return ['>', name, 0];
  if (!isKeywordFeature(name)) return undefined;
  return OFF_KEYWORD_FEATURES.has(name) ? ['!', ['=', name, NO_PREFERENCE]] : ['&', []];
}

function operatorOf(token: IToken | undefined): IMediaComparison | undefined {
  const text = punctOf(token);
  return text !== undefined && isMediaComparison(text) ? text : undefined;
}

function sideCondition(
  name: IToken | undefined,
  operator: IMediaComparison | undefined,
  value: IToken | undefined,
): IMediaCondition | undefined {
  if (!isIdent(name) || operator === undefined || !isOperand(value)) return undefined;
  return comparison(operator, name.text, value);
}

function flippedOperatorOf(token: IToken | undefined): IMediaComparison | undefined {
  const operator = operatorOf(token);
  return operator === undefined ? undefined : FLIPPED[operator];
}

// `name op value`, `value op name` or an interval `value op name op value`
function rangeCondition(tokens: readonly IToken[]): IMediaCondition | undefined {
  const [first, firstOp, second, secondOp, third] = tokens;
  if (tokens.length === RANGE_LENGTH && isIdent(first)) {
    return sideCondition(first, operatorOf(firstOp), second);
  }
  const start = sideCondition(second, flippedOperatorOf(firstOp), first);
  if (tokens.length === RANGE_LENGTH) return start;
  const end = sideCondition(second, operatorOf(secondOp), third);
  return start === undefined || end === undefined ? undefined : ['&', [start, end]];
}

function isEdge(token: IToken | undefined): boolean {
  return isIdent(token) || isOperand(token);
}

// A name alone, `name: value`, or operands and operators alternating
function isFeatureShape(tokens: readonly IToken[]): boolean {
  const [first, second, third] = tokens;
  if (tokens.length === 1) return isIdent(first);
  if (tokens.length === RANGE_LENGTH && isPunct(second, COLON)) {
    return isIdent(first) && third !== undefined;
  }
  if (tokens.length !== RANGE_LENGTH && tokens.length !== INTERVAL_LENGTH) return false;
  return tokens.every((token, at) =>
    at % 2 === 0 ? isEdge(token) : operatorOf(token) !== undefined,
  );
}

/** `undefined` is a syntax error, which the caller reads as `not all` */
export function parseFeature(tokens: readonly IToken[]): IPart | undefined {
  if (!isFeatureShape(tokens)) return undefined;
  const [first, second, third] = tokens;
  if (tokens.length === 1 && isIdent(first)) {
    return { text: `(${first.text})`, condition: booleanCondition(first.text) };
  }
  if (isIdent(first) && isPunct(second, COLON) && third !== undefined) {
    return {
      text: `(${first.text}: ${tokenText(third)})`,
      condition: plainCondition(first.text, third),
    };
  }
  return { text: `(${tokens.map(tokenText).join(' ')})`, condition: rangeCondition(tokens) };
}

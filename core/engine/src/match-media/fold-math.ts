// Folds `calc()`, `min()`, `max()` and `clamp()` in a token list into one token with a pixel size
// Only `px`, `rem` and `em` have a size, so any other unit leaves the token without one

import { PX_PER_LENGTH_UNIT } from './parse-feature';
import {
  CLOSE,
  COMMA,
  OPEN,
  isDimension,
  isFunction,
  isIdent,
  isMathToken,
  isPunct,
  mathToken,
  splitTopLevel,
  tokenText,
  type IToken,
} from './tokenize';

const PLUS = '+';
const MINUS = '-';

type ICursor = { readonly tokens: readonly IToken[]; at: number };

// What each function makes of its arguments, `undefined` for a wrong count
const COMBINERS: ReadonlyMap<
  string,
  (values: readonly number[]) => number | undefined
> = new Map([
  ['calc', values => (values.length === 1 ? values[0] : undefined)],
  ['min', values => Math.min(...values)],
  ['max', values => Math.max(...values)],
  [
    'clamp',
    ([low, preferred, high, ...extra]) =>
      low === undefined ||
      preferred === undefined ||
      high === undefined ||
      extra.length > 0
        ? undefined
        : Math.min(high, Math.max(low, preferred)),
  ],
]);

// The `-` of a subtraction scans as a word, since a name may start with a dash
function operatorAt(cursor: ICursor): typeof PLUS | typeof MINUS | undefined {
  const token = cursor.tokens[cursor.at];
  if (isPunct(token, PLUS)) return PLUS;
  return isIdent(token, MINUS) ? MINUS : undefined;
}

function operandAt(cursor: ICursor): number | undefined {
  const token = cursor.tokens[cursor.at];
  cursor.at += 1;
  if (isMathToken(token)) return token.px;
  if (isDimension(token)) {
    const factor = PX_PER_LENGTH_UNIT[token.unit];
    return factor === undefined ? undefined : token.value * factor;
  }
  if (!isPunct(token, OPEN)) return undefined;
  const inner = sumAt(cursor);
  const closes = isPunct(cursor.tokens[cursor.at], CLOSE);
  cursor.at += 1;
  return closes ? inner : undefined;
}

function sumAt(cursor: ICursor): number | undefined {
  let total = operandAt(cursor);
  for (
    let sign = operatorAt(cursor);
    sign !== undefined;
    sign = operatorAt(cursor)
  ) {
    cursor.at += 1;
    const next = operandAt(cursor);
    total =
      total === undefined || next === undefined
        ? undefined
        : total + (sign === PLUS ? next : -next);
  }
  return total;
}

function sumOf(tokens: readonly IToken[]): number | undefined {
  const cursor: ICursor = { tokens, at: 0 };
  const total = sumAt(cursor);
  return cursor.at === tokens.length ? total : undefined;
}

function pxOfCall(name: string, inner: readonly IToken[]): number | undefined {
  const values = splitTopLevel(inner).map(sumOf);
  const known = values.filter((value): value is number => value !== undefined);
  return known.length < values.length
    ? undefined
    : COMBINERS.get(name)?.(known);
}

// Written back with the spacing a serialized query uses
function textOfCall(name: string, inner: readonly IToken[]): string {
  const body = inner
    .map(token => {
      if (isFunction(token)) return `${tokenText(token)}(`;
      if (isPunct(token, COMMA)) return ', ';
      if (isPunct(token, PLUS) || isIdent(token, MINUS))
        return ` ${tokenText(token)} `;
      return tokenText(token);
    })
    .join('');
  return `${name}(${body})`;
}

// The index of the `)` that closes the call opened just before `from`, or -1 when there is none
function closeOfCall(tokens: readonly IToken[], from: number): number {
  let depth = 1;
  for (let at = from; at < tokens.length; at++) {
    const token = tokens[at];
    if (isPunct(token, OPEN) || isFunction(token)) depth += 1;
    if (isPunct(token, CLOSE)) depth -= 1;
    if (depth === 0) return at;
  }
  return -1;
}

export function foldMath(tokens: readonly IToken[]): IToken[] {
  const folded: IToken[] = [];
  for (let at = 0; at < tokens.length; at++) {
    const token = tokens[at];
    if (token === undefined) continue;
    const end =
      isFunction(token) && COMBINERS.has(token.text)
        ? closeOfCall(tokens, at + 1)
        : -1;
    if (!isFunction(token) || end === -1) {
      folded.push(token);
      continue;
    }
    const inner = foldMath(tokens.slice(at + 1, end));
    folded.push(
      mathToken(textOfCall(token.text, inner), pxOfCall(token.text, inner)),
    );
    at = end;
  }
  return folded;
}

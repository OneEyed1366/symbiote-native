// Splits a media query string into the tokens its grammar is built from
// Names fold to lowercase in ASCII only, since `İ` must not become `i`

export const OPEN = '(';
export const CLOSE = ')';
export const COMMA = ',';
export const COLON = ':';

const IDENT = 'ident';
const FUNCTION = 'function';
const NUMBER_KIND = 'number';
const DIMENSION = 'dimension';
const PUNCT = 'punct';
const RATIO = 'ratio';
const MATH = 'math';
const SLASH = '/';

export type IIdentToken = {
  readonly kind: typeof IDENT;
  readonly text: string;
};
export type INumberToken = {
  readonly kind: typeof NUMBER_KIND;
  readonly value: number;
};
export type IDimensionToken = {
  readonly kind: typeof DIMENSION;
  readonly value: number;
  readonly unit: string;
};
/** `59/80`, folded from three tokens because a ratio is one operand in a feature */
export type IRatioToken = {
  readonly kind: typeof RATIO;
  readonly top: number;
  readonly bottom: number;
};
export type IFunctionToken = {
  readonly kind: typeof FUNCTION;
  readonly text: string;
};
/** `calc(10px + 1em)` folded to its text and its size in pixels, `undefined` when it has none */
export type IMathToken = {
  readonly kind: typeof MATH;
  readonly text: string;
  readonly px: number | undefined;
};
export type IToken =
  | IIdentToken
  | INumberToken
  | IDimensionToken
  | IRatioToken
  | IMathToken
  | IFunctionToken
  | { readonly kind: typeof PUNCT; readonly text: string };

type IScan = { readonly token?: IToken; readonly end: number };

const SPACE = /\s+/y;
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/y;
const WORD = /[a-z_\u0080-￿-][\w\u0080-￿-]*/iy;
const PERCENT = /%/y;
const COMPARATOR = /[<>]=?|=/y;

export function isPunct(token: IToken | undefined, text: string): boolean {
  return token?.kind === PUNCT && token.text === text;
}

// With `text` it is that one word, such as `and`, and without it any name
export function isIdent(
  token: IToken | undefined,
  text?: string,
): token is IIdentToken {
  return token?.kind === IDENT && (text === undefined || token.text === text);
}

export function isFunction(token: IToken | undefined): token is IFunctionToken {
  return token?.kind === FUNCTION;
}

export function isDimension(
  token: IToken | undefined,
): token is IDimensionToken {
  return token?.kind === DIMENSION;
}

export function isNumberToken(
  token: IToken | undefined,
): token is INumberToken {
  return token?.kind === NUMBER_KIND;
}

export function isRatioToken(token: IToken | undefined): token is IRatioToken {
  return token?.kind === RATIO;
}

export function isMathToken(token: IToken | undefined): token is IMathToken {
  return token?.kind === MATH;
}

export function mathToken(text: string, px: number | undefined): IMathToken {
  return { kind: MATH, text, px };
}

// The text of an operator or a bracket, and nothing for any other token
export function punctOf(token: IToken | undefined): string | undefined {
  return token?.kind === PUNCT ? token.text : undefined;
}

// The token as it is written back into the serialized query
export function tokenText(token: IToken): string {
  if (token.kind === RATIO) return `${token.top} / ${token.bottom}`;
  if (token.kind === MATH) return token.text;
  if (token.kind === NUMBER_KIND) return String(token.value);
  if (token.kind === DIMENSION) return `${token.value}${token.unit}`;
  return token.text;
}

export function foldCase(text: string): string {
  return text.replace(/[A-Z]+/g, upper => upper.toLowerCase());
}

function matchAt(
  pattern: RegExp,
  text: string,
  at: number,
): string | undefined {
  pattern.lastIndex = at;
  return pattern.exec(text)?.[0];
}

function scanNumber(text: string, at: number, raw: string): IScan {
  const afterNumber = at + raw.length;
  const value = Number(raw);
  const unit =
    matchAt(WORD, text, afterNumber) ?? matchAt(PERCENT, text, afterNumber);
  if (unit === undefined)
    return { token: { kind: NUMBER_KIND, value }, end: afterNumber };
  return {
    token: { kind: DIMENSION, value, unit: foldCase(unit) },
    end: afterNumber + unit.length,
  };
}

function scanWord(text: string, at: number, raw: string): IScan {
  const end = at + raw.length;
  const name = foldCase(raw);
  if (text.charAt(end) === OPEN)
    return { token: { kind: FUNCTION, text: name }, end: end + 1 };
  return { token: { kind: IDENT, text: name }, end };
}

function scan(text: string, at: number): IScan {
  const space = matchAt(SPACE, text, at);
  if (space !== undefined) return { end: at + space.length };
  const number = matchAt(NUMBER, text, at);
  if (number !== undefined) return scanNumber(text, at, number);
  const word = matchAt(WORD, text, at);
  if (word !== undefined) return scanWord(text, at, word);
  const punct = matchAt(COMPARATOR, text, at) ?? text.charAt(at);
  return { token: { kind: PUNCT, text: punct }, end: at + punct.length };
}

// Commas inside parentheses do not split, and a stray `)` does not take the depth below zero
export function splitTopLevel(tokens: readonly IToken[]): IToken[][] {
  const groups: IToken[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (isPunct(token, COMMA) && depth === 0) {
      groups.push([]);
      continue;
    }
    if (isPunct(token, OPEN) || isFunction(token)) depth += 1;
    if (isPunct(token, CLOSE)) depth = Math.max(0, depth - 1);
    groups[groups.length - 1]?.push(token);
  }
  return groups;
}

// Three tokens, number slash number, become one ratio so the grammar above sees a single operand
function foldRatios(tokens: readonly IToken[]): IToken[] {
  const folded: IToken[] = [];
  for (let at = 0; at < tokens.length; at++) {
    const top = tokens[at];
    const bottom = tokens[at + 2];
    if (
      isNumberToken(top) &&
      isPunct(tokens[at + 1], SLASH) &&
      isNumberToken(bottom)
    ) {
      folded.push({ kind: RATIO, top: top.value, bottom: bottom.value });
      at += 2;
    } else if (top !== undefined) {
      folded.push(top);
    }
  }
  return folded;
}

export function tokenize(text: string): IToken[] {
  const tokens: IToken[] = [];
  let at = 0;
  while (at < text.length) {
    const next = scan(text, at);
    if (next.token !== undefined) tokens.push(next.token);
    at = next.end;
  }
  return foldRatios(tokens);
}

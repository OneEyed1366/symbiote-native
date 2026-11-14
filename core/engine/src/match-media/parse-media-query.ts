// Parses a media query list into the `media` text of `matchMedia` and the compiler's tuple tree
// One part the runtime cannot answer leaves the whole list without a condition

import type { IMediaCondition } from '../style-registry/media-evaluate';
import { foldMath } from './fold-math';
import { parseFeature, type IPart } from './parse-feature';
import {
  CLOSE,
  OPEN,
  isFunction,
  isIdent,
  isPunct,
  splitTopLevel,
  tokenize,
  type IToken,
} from './tokenize';

export type IParsedMediaList = {
  /** The serialized list, as `MediaQueryList.media` reads */
  readonly text: string;
  /** `undefined` when some part is one the runtime cannot answer */
  readonly condition: IMediaCondition | undefined;
};

type ICursor = { readonly tokens: readonly IToken[]; at: number };

const AND = 'and';
const OR = 'or';
const NOT = 'not';
const ONLY = 'only';
const ALL = 'all';
const SCREEN = 'screen';
const NEVER_TEXT = 'not all';
const RESERVED_TYPES: readonly string[] = [AND, OR, NOT, ONLY];
const ANSWERED_TYPES: readonly string[] = [ALL, SCREEN];

// A query nested deeper is refused as invalid, so the recursive reading cannot overflow the stack
const MAX_NESTING = 64;

const ALWAYS: IMediaCondition = ['&', []];
const NEVER: IMediaCondition = ['!', ALWAYS];
const INVALID: IPart = { text: NEVER_TEXT, condition: NEVER };

function negate(part: IPart): IPart {
  return {
    text: `${NOT} ${part.text}`,
    condition: part.condition === undefined ? undefined : ['!', part.condition],
  };
}

function joinParts(parts: readonly IPart[], word: typeof AND | typeof OR): IPart {
  const conditions = parts.flatMap(part =>
    part.condition === undefined ? [] : [part.condition],
  );
  return {
    text: parts.map(part => part.text).join(` ${word} `),
    condition:
      conditions.length < parts.length
        ? undefined
        : [word === AND ? '&' : '|', conditions],
  };
}

function peek(cursor: ICursor, ahead = 0): IToken | undefined {
  return cursor.tokens[cursor.at + ahead];
}

// The tokens up to the matching `)`, which is left unread when the text ends before it
function takeBalanced(cursor: ICursor): IToken[] {
  const taken: IToken[] = [];
  let depth = 0;
  for (let token = peek(cursor); token !== undefined; token = peek(cursor)) {
    if (isPunct(token, CLOSE) && depth === 0) break;
    if (isPunct(token, OPEN)) depth += 1;
    if (isPunct(token, CLOSE)) depth -= 1;
    taken.push(token);
    cursor.at += 1;
  }
  return taken;
}

function closeParen(cursor: ICursor): void {
  if (isPunct(peek(cursor), CLOSE)) cursor.at += 1;
}

// A feature's text carries its own parentheses, and a nested condition gets them here
function parseInParens(cursor: ICursor): IPart | undefined {
  if (!isPunct(peek(cursor), OPEN)) return undefined;
  cursor.at += 1;
  const next = peek(cursor);
  const isNested = isPunct(next, OPEN) || isIdent(next, NOT);
  const part = isNested ? parseCondition(cursor, true) : parseFeature(takeBalanced(cursor));
  if (part === undefined) return undefined;
  closeParen(cursor);
  return isNested ? { text: `(${part.text})`, condition: part.condition } : part;
}

function chainWord(cursor: ICursor, allowOr: boolean): typeof AND | typeof OR | undefined {
  if (isIdent(peek(cursor), AND)) return AND;
  return allowOr && isIdent(peek(cursor), OR) ? OR : undefined;
}

// One operand, or operands joined by a single repeated `and` or `or`
function parseCondition(cursor: ICursor, allowOr: boolean): IPart | undefined {
  if (isIdent(peek(cursor), NOT)) {
    cursor.at += 1;
    const inner = parseInParens(cursor);
    return inner === undefined ? undefined : negate(inner);
  }
  const first = parseInParens(cursor);
  const word = chainWord(cursor, allowOr);
  if (first === undefined || word === undefined) return first;
  const parts = [first];
  while (isIdent(peek(cursor), word)) {
    cursor.at += 1;
    const next = parseInParens(cursor);
    if (next === undefined) return undefined;
    parts.push(next);
  }
  return joinParts(parts, word);
}

function typedText(
  qualifier: string | undefined,
  type: string,
  condition: IPart | undefined,
): string {
  if (qualifier === undefined && type === ALL && condition !== undefined) {
    return condition.text;
  }
  const head = qualifier === undefined ? type : `${qualifier} ${type}`;
  return condition === undefined ? head : `${head} ${AND} ${condition.text}`;
}

// `[not | only] type [and condition]`
function parseTyped(cursor: ICursor): IPart | undefined {
  const lead = peek(cursor);
  const qualifier = isIdent(lead, NOT) || isIdent(lead, ONLY) ? lead.text : undefined;
  if (qualifier !== undefined) cursor.at += 1;
  const type = peek(cursor);
  if (!isIdent(type) || RESERVED_TYPES.includes(type.text)) return undefined;
  cursor.at += 1;
  let condition: IPart | undefined;
  if (isIdent(peek(cursor), AND)) {
    cursor.at += 1;
    condition = parseCondition(cursor, false);
    if (condition === undefined) return undefined;
  }
  const text = typedText(qualifier, type.text, condition);
  const base = condition === undefined ? ALWAYS : condition.condition;
  if (!ANSWERED_TYPES.includes(type.text) || base === undefined) {
    return { text, condition: undefined };
  }
  return { text, condition: qualifier === NOT ? ['!', base] : base };
}

function startsWithCondition(cursor: ICursor): boolean {
  const first = peek(cursor);
  return isPunct(first, OPEN) || (isIdent(first, NOT) && isPunct(peek(cursor, 1), OPEN));
}

function parseQuery(tokens: readonly IToken[]): IPart {
  const cursor: ICursor = { tokens, at: 0 };
  const part = startsWithCondition(cursor)
    ? parseCondition(cursor, true)
    : parseTyped(cursor);
  return part !== undefined && cursor.at === tokens.length ? part : INVALID;
}

function nestingOf(tokens: readonly IToken[]): number {
  let depth = 0;
  let deepest = 0;
  for (const token of tokens) {
    if (isPunct(token, OPEN) || isFunction(token)) depth += 1;
    if (isPunct(token, CLOSE)) depth = Math.max(0, depth - 1);
    deepest = Math.max(deepest, depth);
  }
  return deepest;
}

export function parseMediaQueryList(source: string): IParsedMediaList {
  const raw = tokenize(source);
  if (nestingOf(raw) > MAX_NESTING) return INVALID;
  const tokens = foldMath(raw);
  if (tokens.length === 0) return { text: '', condition: ALWAYS };
  const queries = splitTopLevel(tokens).map(parseQuery);
  const text = queries.map(query => query.text).join(', ');
  const conditions = queries.flatMap(query =>
    query.condition === undefined ? [] : [query.condition],
  );
  if (conditions.length < queries.length) return { text, condition: undefined };
  const answered = conditions.filter(condition => condition !== NEVER);
  if (answered.length === 0) return { text, condition: NEVER };
  return { text, condition: answered.length === 1 ? answered[0] : ['|', answered] };
}

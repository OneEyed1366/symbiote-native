// The payload of `:global(X)` and `:deep(X)` when lightningcss leaves it as a raw token stream
// It is read as if its classes had been written bare, the wrapper only moves the scope boundary

import type { Token, TokenOrValue } from 'lightningcss';
import {
  drop,
  pushToken,
  setCombinator,
  takeState,
  type IBuilder,
} from './selector-builder.ts';
import { stateKeyOf } from './selector-states.ts';
import { COMBINATOR, type ISelectorCombinator } from './selector-types.ts';

// Where a reader says the payload cannot be trusted past this token
const STOP = -1;

const DELIM_COMBINATORS = new Map<string, ISelectorCombinator>([
  ['>', COMBINATOR.child],
  ['+', COMBINATOR.nextSibling],
  ['~', COMBINATOR.laterSibling],
]);

function isTokenOrValue(value: unknown): value is TokenOrValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

function tokenAt(args: readonly unknown[], index: number): Token | null {
  const argument = args[index];
  if (!isTokenOrValue(argument) || argument.type !== 'token') return null;
  return argument.value;
}

function identAt(args: readonly unknown[], index: number): string | null {
  const token = tokenAt(args, index);
  return token?.type === 'ident' ? token.value : null;
}

function isColonAt(args: readonly unknown[], index: number): boolean {
  return tokenAt(args, index)?.type === 'colon';
}

// The payload being read: `wrapper` is the authored spelling, so a drop warning names the right one
type ICursor = {
  readonly builder: IBuilder;
  readonly args: readonly unknown[];
  readonly wrapper: string;
};

// A class is two tokens, a `.` delimiter and the ident, and a `.` alone means a broken payload
function readDelim(cursor: ICursor, value: string, index: number): number {
  const { builder, args, wrapper } = cursor;
  const combinator = DELIM_COMBINATORS.get(value);
  if (combinator !== undefined) {
    setCombinator(builder, combinator);
    return index;
  }
  if (value === '*') {
    drop(builder, 'universal', '*');
    return index;
  }
  if (value !== '.') {
    drop(builder, 'unsupported', `${wrapper.slice(0, -1)}${value})`);
    return index;
  }
  const name = identAt(args, index + 1);
  if (name === null) {
    drop(builder, 'unsupported', wrapper);
    return STOP;
  }
  builder.specificity[1]++;
  pushToken(builder, name);
  return index + 1;
}

// One colon is a pseudo-class and two a pseudo-element, the name is the ident after them
function readColon(cursor: ICursor, index: number): number {
  const { builder, args, wrapper } = cursor;
  const isPseudoElement = isColonAt(args, index + 1);
  const nameIndex = index + (isPseudoElement ? 2 : 1);
  const name = identAt(args, nameIndex) ?? wrapper;
  const stateKey = isPseudoElement ? null : stateKeyOf(name);
  if (stateKey !== null) {
    takeState(builder, name, stateKey);
    return nameIndex;
  }
  builder.specificity[isPseudoElement ? 2 : 1]++;
  drop(builder, isPseudoElement ? 'pseudo-element' : 'pseudo-class', name);
  return nameIndex;
}

// The parsed shape names `[data-x]`, so the stream does too, or one source would warn two ways
function readAttribute({ builder, args }: ICursor, index: number): void {
  const name = identAt(args, index + 1);
  builder.specificity[1]++;
  drop(builder, 'attribute', name === null ? '[...]' : `[${name}]`);
}

function readToken(cursor: ICursor, index: number): number {
  const { builder, args, wrapper } = cursor;
  const token = tokenAt(args, index);
  if (token === null) {
    drop(builder, 'unsupported', wrapper);
    return STOP;
  }
  switch (token.type) {
    case 'white-space':
      setCombinator(builder, COMBINATOR.descendant);
      return index;
    case 'delim':
      return readDelim(cursor, token.value, index);
    case 'colon':
      return readColon(cursor, index);
    case 'ident':
      builder.specificity[2]++;
      drop(builder, 'element', token.value);
      return index;
    case 'id-hash':
      builder.specificity[0]++;
      drop(builder, 'id', `#${token.value}`);
      return index;
    case 'square-bracket-block':
      readAttribute(cursor, index);
      return index;
    default:
      drop(builder, 'unsupported', wrapper);
      return index;
  }
}

export function consumePayload(
  builder: IBuilder,
  args: readonly unknown[],
  wrapper: string,
): void {
  const cursor: ICursor = { builder, args, wrapper };
  let index = 0;
  while (index < args.length) {
    const last = readToken(cursor, index);
    if (last === STOP) return;
    index = last + 1;
  }
}

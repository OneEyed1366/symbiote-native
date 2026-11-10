import type { Token } from 'lightningcss';
import {
  drop,
  pushToken,
  setCombinator,
  type IBuilder,
} from './selector-builder.ts';
import { tokenOf } from './selector-guards.ts';
import { COMBINATOR, type ISelectorCombinator } from './selector-types.ts';
import { applyStateToken, STATE_PSEUDO_CLASS } from './state-token.ts';

// Where the walk stands in the stream, and the authored `:global()` or `:deep()` it came from
type IStream = {
  readonly args: readonly unknown[];
  readonly index: number;
  readonly wrapper: string;
};

const DELIM_COMBINATORS: Record<string, ISelectorCombinator> = {
  '>': COMBINATOR.child,
  '+': COMBINATOR.nextSibling,
  '~': COMBINATOR.laterSibling,
};

function identAt(args: readonly unknown[], index: number): string | null {
  const token = tokenOf(args[index]);
  return token?.type === 'ident' ? token.value : null;
}

function isColonAt(args: readonly unknown[], index: number): boolean {
  return tokenOf(args[index])?.type === 'colon';
}

// Returns the extra tokens consumed, or `null` when the payload is malformed past trust
function consumeDelim(
  builder: IBuilder,
  delim: string,
  stream: IStream,
): number | null {
  const combinator = DELIM_COMBINATORS[delim];
  if (combinator !== undefined) {
    setCombinator(builder, combinator);
    return 0;
  }
  if (delim === '*') {
    drop(builder, 'universal', '*');
    return 0;
  }
  if (delim !== '.') {
    drop(builder, 'unsupported', `${stream.wrapper.slice(0, -1)}${delim})`);
    return 0;
  }
  // A class is two tokens, delim `.` then the ident, and a bare `.` poisons the rest
  const name = identAt(stream.args, stream.index + 1);
  if (name === null) {
    drop(builder, 'unsupported', stream.wrapper);
    return null;
  }
  builder.specificity[1]++;
  pushToken(builder, name);
  return 1;
}

// One colon is a pseudo-class and two a pseudo-element, the name is the ident after them
function consumeColon(builder: IBuilder, stream: IStream): number {
  const isPseudoElement = isColonAt(stream.args, stream.index + 1);
  const nameIndex = stream.index + (isPseudoElement ? 2 : 1);
  const name = identAt(stream.args, nameIndex) ?? stream.wrapper;
  builder.specificity[isPseudoElement ? 2 : 1]++;

  if (!isPseudoElement && name === STATE_PSEUDO_CLASS) {
    applyStateToken(builder);
  } else {
    drop(builder, isPseudoElement ? 'pseudo-element' : 'pseudo-class', name);
  }
  return nameIndex - stream.index;
}

// The parsed shape names `[data-x]`, so the stream reads the name too and both warn alike
function consumeBracket(builder: IBuilder, stream: IStream): number {
  const name = identAt(stream.args, stream.index + 1);
  builder.specificity[1]++;
  drop(builder, 'attribute', name === null ? '[...]' : `[${name}]`);
  return 0;
}

function consumeToken(
  builder: IBuilder,
  token: Token,
  stream: IStream,
): number | null {
  switch (token.type) {
    case 'white-space':
      setCombinator(builder, COMBINATOR.descendant);
      return 0;
    case 'delim':
      return consumeDelim(builder, token.value, stream);
    case 'colon':
      return consumeColon(builder, stream);
    case 'ident':
      builder.specificity[2]++;
      drop(builder, 'element', token.value);
      return 0;
    case 'id-hash':
      builder.specificity[0]++;
      drop(builder, 'id', `#${token.value}`);
      return 0;
    case 'square-bracket-block':
      return consumeBracket(builder, stream);
    default:
      drop(builder, 'unsupported', stream.wrapper);
      return 0;
  }
}

/**
 * Folds the raw token payload of `:global(X)` or `:deep(X)` into the builder as if X were
 * written bare. A plain `.css` file yields this shape, `cssModules` yields a parsed selector
 */
export function consumePayload(
  builder: IBuilder,
  args: readonly unknown[],
  wrapper: string,
): void {
  for (let index = 0; index < args.length; index++) {
    const token = tokenOf(args[index]);
    if (token === null) {
      drop(builder, 'unsupported', wrapper);
      return;
    }
    const skipped = consumeToken(builder, token, { args, index, wrapper });
    if (skipped === null) return;
    index += skipped;
  }
}

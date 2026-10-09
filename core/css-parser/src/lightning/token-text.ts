// A token list (an `unparsed` declaration's value, or a custom property's) printed back as CSS text
import { colorToCss } from './colors.ts';
import {
  isRecord,
  readNumber,
  readString,
  roundFloat,
} from './value-readers.ts';

/**
 * How one token walk treats `var()`: `declarationToStyle` resolves it (`substitute`) and
 * `variablesIn` stores the authored text (`keep`), so the package keeps a single printer
 */
export type ITokenPrinter = {
  readonly variables: ReadonlyMap<string, string>;
  readonly varMode: 'substitute' | 'keep';
  /** Names that resolved to nothing, only ever filled in `substitute` mode */
  readonly missing: string[];
};

type ITokenFormat = (token: Record<string, unknown>) => string | null;

const RAW_TOKEN = 'token';

const TOKEN_TEXT = new Map<string, string>([
  ['colon', ':'],
  ['semicolon', ';'],
  ['comma', ','],
  ['parenthesis-block', '('],
  ['square-bracket-block', '['],
  ['curly-bracket-block', '{'],
  ['close-parenthesis', ')'],
  ['close-square-bracket', ']'],
  ['close-curly-bracket', '}'],
  ['comment', ''],
]);

function withText(build: (text: string) => string): ITokenFormat {
  return token => {
    const text = readString(token.value);
    return text === null ? null : build(text);
  };
}

function withAmount(build: (amount: number) => string): ITokenFormat {
  return token => {
    const amount = readNumber(token.value);
    return amount === null ? null : build(amount);
  };
}

function dimensionToken(token: Record<string, unknown>): string | null {
  const unit = readString(token.unit);
  const amount = readNumber(token.value);
  return unit === null || amount === null
    ? null
    : `${roundFloat(amount)}${unit}`;
}

const asWritten = withText(text => text);
const hashed = withText(text => `#${text}`);

const TOKEN_FORMATS = new Map<string, ITokenFormat>([
  ['ident', asWritten],
  ['delim', asWritten],
  ['white-space', asWritten],
  ['at-keyword', withText(text => `@${text}`)],
  ['hash', hashed],
  ['id-hash', hashed],
  ['string', withText(text => JSON.stringify(text))],
  ['unquoted-url', withText(text => `url(${text})`)],
  ['function', withText(text => `${text}(`)],
  ['number', withAmount(amount => String(roundFloat(amount)))],
  ['percentage', withAmount(amount => `${roundFloat(amount * 100)}%`)],
  ['dimension', dimensionToken],
]);

function rawTokenToText(token: unknown): string | null {
  if (!isRecord(token)) return null;
  const type = readString(token.type);
  if (type === null) return null;
  return TOKEN_TEXT.get(type) ?? TOKEN_FORMATS.get(type)?.(token) ?? null;
}

function dimensionToText(dimension: unknown): string | null {
  if (!isRecord(dimension)) return null;
  const unit = readString(dimension.unit) ?? readString(dimension.type);
  const amount = readNumber(dimension.value);
  return unit === null || amount === null
    ? null
    : `${roundFloat(amount)}${unit}`;
}

function functionToText(fn: unknown, printer: ITokenPrinter): string | null {
  if (!isRecord(fn)) return null;
  const name = readString(fn.name);
  const args = tokensToText(fn.arguments, printer);
  return name === null || args === null ? null : `${name}(${args})`;
}

function variableToText(
  variable: unknown,
  printer: ITokenPrinter,
): string | null {
  if (!isRecord(variable)) return null;

  const name = isRecord(variable.name) ? readString(variable.name.ident) : null;
  if (name === null) return null;

  const hasFallback =
    variable.fallback !== undefined && variable.fallback !== null;

  if (printer.varMode === 'keep') {
    if (!hasFallback) return `var(${name})`;
    const fallback = tokensToText(variable.fallback, printer);
    return fallback === null ? null : `var(${name}, ${fallback})`;
  }

  const declared = printer.variables.get(name);
  if (declared !== undefined) return declared;

  if (hasFallback) return tokensToText(variable.fallback, printer);

  // Declared in another file, which the registry cannot resolve and has no value worth emitting
  printer.missing.push(name);
  return null;
}

// `url()`, `env()` and an animation name have no place in an RN style value
function tokenOrValueToText(
  node: unknown,
  printer: ITokenPrinter,
): string | null {
  if (!isRecord(node)) return null;

  switch (node.type) {
    case RAW_TOKEN:
      return rawTokenToText(node.value);
    case 'color':
      return colorToCss(node.value);
    case 'dashed-ident':
      return readString(node.value);
    case 'length':
    case 'angle':
    case 'time':
    case 'resolution':
      return dimensionToText(node.value);
    case 'function':
      return functionToText(node.value, printer);
    case 'var':
      return variableToText(node.value, printer);
    default:
      return null;
  }
}

/**
 * Prints a token list back to CSS text. In `substitute` mode a `var(--x)` becomes the declared
 * value or its fallback, and a name that resolves to nothing goes to `missing` for the caller
 */
export function tokensToText(
  tokens: unknown,
  printer: ITokenPrinter,
): string | null {
  if (!Array.isArray(tokens)) return null;

  let text = '';
  for (const token of tokens) {
    const piece = tokenOrValueToText(token, printer);
    if (piece === null) return null;
    text += piece;
  }

  return text;
}

// Declaration half of the lightningcss-typed CSS pipeline: one lightningcss `Declaration` object
// (from a visitor, or out of `rule.value.declarations.declarations`) → zero or more React Native
// style entries.
//
// WHY it maps off the typed AST: the retired text mapper re-parsed the declaration TEXT, so it
// re-derived structure lightningcss already hands over, and it lost what it never looked at.
// Three shipped bugs came straight from that (traps 4, 5 and the `var()` one in
// `.claude/rules/style-registry-collisions.md`):
//
//   padding: 8px 16px        text pass → { padding: 8 }   the 16 is silently gone
//   width: calc(100% - 24px) text pass → { width: 100 }   paints ~100pt wide
//   color: var(--from-other) text pass → { color: 'var(--from-other)' }  literal ships to Fabric
//
// lightningcss hands all three back typed: a shorthand arrives PRE-EXPANDED as a Rect, a `calc()`
// arrives as a sum tree with per-operand units, and a `var()` arrives as an `unparsed` declaration
// carrying real var tokens. So each bug becomes a decision rather than an accident — expand the
// Rect, evaluate the sum only when every operand reduces to px, and drop an unresolvable `var()`
// with a warning instead of emitting its text.
//
// The property NAME table (`../properties.ts`) outlived the text pass and is still the one place
// that says what RN calls a property and how the "unsupported property dropped" warning is
// worded. Only value conversion lives here, against the typed AST.
//
// `!important` needs nothing special: lightningcss files those under
// `declarations.importantDeclarations`, and the caller feeds them in like any other declaration.

import { transform } from 'lightningcss';
import type { Declaration } from 'lightningcss';
import { PROPERTY_TABLE, mapCSSProperty } from '../properties.ts';
import { REM_TO_PX, warnOnce } from '../values.ts';

// Build-time Node globals. This package wires no `@types/node` (see src/globals.d.ts, which
// declares `console` for the same reason), and lightningcss's `transform` speaks Uint8Array.
declare const TextEncoder: { new (): { encode(input: string): Uint8Array } };
declare const TextDecoder: { new (): { decode(input: Uint8Array): string } };

/**
 * An OBJECT-shaped RN style value. `core/engine/src/styles.ts` has exactly one such field,
 * `shadowOffset?: { width: number; height: number }`; RN's `textShadowOffset` has the same shape
 * (it is missing from `ITextStyle` there, but `textShadowToStyle` below emits it and RN reads
 * it). Both are all-number, so one record type covers the family.
 */
export type IStyleValueObject = Readonly<Record<string, number>>;

/**
 * One React Native style value.
 *
 * Most are scalars. Two are objects ({@link IStyleValueObject}). Six are ARRAY-capable in RN —
 * `transform: ITransformProp[]`, `boxShadow`, `filter`, `experimental_backgroundImage`,
 * `transformOrigin`, `fontVariant` — but every one of them is `raw` in PROPERTY_TABLE, i.e. this
 * pipeline hands the engine the CSS TEXT and lets its own processors (`process-transform`,
 * `process-box-shadow`, …) build the array at commit time. So the array branch exists so the
 * integration step cannot hit a second widening, not because a declaration produces one today.
 */
export type IStyleValue =
  | string
  | number
  | IStyleValueObject
  | ReadonlyArray<string | number | IStyleValueObject>;

export type IStyleObject = Record<string, IStyleValue>;

export interface IDeclarationContext {
  readonly filename: string;
  /** Custom properties (`--x`) collected from the whole file, name -> raw value text. */
  readonly variables: ReadonlyMap<string, string>;
  /** Root font size for rem, default 16. */
  readonly remToPx?: number;
}

//#region warnings

// Warn-once bookkeeping is keyed by FILE because the public entry point takes one declaration at a
// time — there is no per-run object to hang a `Set` off the way `compileCssToRules` does per call.
// A Metro watch process therefore warns once per (file, property) for the life of the process,
// which is the intended granularity: the same bad property in the same file is one authoring
// mistake, however many times it is recompiled.
const warnedByFile = new Map<string, Set<string>>();

function warnedKeysFor(filename: string): Set<string> {
  const existing = warnedByFile.get(filename);
  if (existing) return existing;

  const created = new Set<string>();
  warnedByFile.set(filename, created);
  return created;
}

function warnDrop(
  context: IDeclarationContext,
  key: string,
  reason: string,
): void {
  warnOnce(
    warnedKeysFor(context.filename),
    key,
    `[@symbiote-native/css-parser] ${reason}, dropped`,
  );
}

//#endregion warnings

//#region unknown-value readers

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readType(value: unknown): string | null {
  return isRecord(value) ? readString(value.type) : null;
}

// lightningcss stores lengths, alphas and ratios as f32, so `1.4` comes back as
// 1.399999976158142. Seven significant digits is the round-trip precision of f32 — it restores the
// authored decimal without inventing one.
function roundFloat(value: number): number {
  return Number(value.toPrecision(7));
}

//#endregion unknown-value readers

//#region lengths

const ABSOLUTE_UNIT_TO_PX: Record<string, number> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  pt: 96 / 72,
  pc: 16,
};

// RN's `borderWidth` takes a number, so the CSS keywords have to become the browser-default points.
const BORDER_WIDTH_KEYWORD_PX: Record<string, number> = {
  thin: 1,
  medium: 3,
  thick: 5,
};

interface IResolvedLength {
  readonly kind: 'px' | 'percent' | 'auto';
  readonly value: number;
}

function unitToPx(
  unit: string,
  amount: number,
  context: IDeclarationContext,
): number | null {
  // `em` is scaled by the root size exactly as the old parser does: this package resolves styles
  // without a box tree, so there is no parent font size to scale against.
  if (unit === 'rem' || unit === 'em') {
    return amount * (context.remToPx ?? REM_TO_PX);
  }

  const factor = ABSOLUTE_UNIT_TO_PX[unit];
  return factor === undefined ? null : amount * factor;
}

/**
 * Reduce any of lightningcss's length-ish value wrappers to px / percent / auto, or `null` when RN
 * cannot express it (a viewport unit, an unevaluable `calc()`, `normal`).
 *
 * The wrappers nest differently per property — `font-size` is `{length:{dimension:{unit,value}}}`,
 * `letter-spacing` is `{length:{value:{unit,value}}}`, `padding-top` is
 * `{length-percentage:{dimension:{unit,value}}}` — so this walks the wrappers instead of encoding
 * one shape per property.
 */
function readLength(
  value: unknown,
  context: IDeclarationContext,
): IResolvedLength | null {
  if (!isRecord(value)) return null;

  // A bare `LengthValue` (`{unit, value}`) — the leaf every wrapper bottoms out at.
  const unit = readString(value.unit);
  const amount = readNumber(value.value);
  if (unit !== null && amount !== null) {
    const px = unitToPx(unit, amount, context);
    return px === null ? null : { kind: 'px', value: px };
  }

  switch (value.type) {
    case 'auto':
      return { kind: 'auto', value: 0 };
    case 'percentage': {
      const fraction = readNumber(value.value);
      // lightningcss reports a percentage as a FRACTION: `100%` arrives as 1.
      return fraction === null
        ? null
        : { kind: 'percent', value: fraction * 100 };
    }
    // RN's `lineHeight` has no multiplier form, so a unitless `line-height: 1.4` becomes 1.4
    // points — wrong, but it is what the retired text pass already shipped and not this file's fix.
    case 'number':
    case 'integer': {
      const plain = readNumber(value.value);
      return plain === null ? null : { kind: 'px', value: plain };
    }
    case 'calc':
      return evaluateCalc(value.value, context);
    case 'length':
    case 'length-percentage':
    case 'dimension':
    case 'value':
      return readLength(value.value, context);
    default: {
      const keyword = readString(value.type);
      const px =
        keyword === null ? undefined : BORDER_WIDTH_KEYWORD_PX[keyword];
      return px === undefined ? null : { kind: 'px', value: px };
    }
  }
}

function lengthToStyleValue(length: IResolvedLength): IStyleValue {
  switch (length.kind) {
    case 'auto':
      return 'auto';
    case 'percent':
      return `${roundFloat(length.value)}%`;
    case 'px':
      return roundFloat(length.value);
  }
}

//#endregion lengths

//#region calc()

/**
 * Evaluate a `calc()` sum when EVERY operand reduces to px; return `null` otherwise.
 *
 * lightningcss already folds a same-unit expression before we see it (`calc(10px + 4px)` arrives
 * as `14px`, `calc(2rem * 2)` as `4rem`), so what reaches here is a mixed expression: either mixed
 * LENGTHS (`calc(1rem + 2px)` — evaluable once rem is in px) or a length mixed with a percentage /
 * viewport unit (`calc(100% - 24px)` — RN has no expression form, so the caller drops it).
 */
function evaluateCalc(
  node: unknown,
  context: IDeclarationContext,
): IResolvedLength | null {
  if (!isRecord(node)) return null;

  switch (node.type) {
    case 'function':
    case 'calc':
      return evaluateCalc(node.value, context);
    case 'sum': {
      if (!Array.isArray(node.value)) return null;

      let total = 0;
      for (const operand of node.value) {
        const term = evaluateCalc(operand, context);
        if (term === null || term.kind !== 'px') return null;
        total += term.value;
      }
      return { kind: 'px', value: total };
    }
    case 'value':
      return readLength(node.value, context);
    // `min()` / `max()` / `clamp()` / `product` — no RN equivalent, and guessing one is how the
    // old evaluator ended up emitting 100 for `calc(100% - 24px)`.
    default:
      return null;
  }
}

//#endregion calc()

//#region colors

function toHexChannel(channel: number): string {
  const clamped = Math.min(255, Math.max(0, Math.round(channel)));
  return clamped.toString(16).padStart(2, '0');
}

// `rgba(0, 0, 0, .3)` survives lightningcss as alpha 0.3019607961177826 — the f32 of 77/255, since
// alpha is stored 8-bit. Print the shortest decimal that quantizes back to the same byte, so the
// output reads like the authored value (`0.3`) rather than its rounding noise.
function shortestAlpha(alpha: number): number {
  const byte = Math.round(alpha * 255);

  for (let digits = 1; digits <= 3; digits++) {
    const candidate = Number(alpha.toFixed(digits));
    if (Math.round(candidate * 255) === byte) return candidate;
  }

  return roundFloat(alpha);
}

/**
 * A lightningcss `CssColor` → the string shape Fabric is already shipped: a hex when opaque
 * (`#000`, `#0f1e30`), `rgba(r, g, b, a)` when translucent.
 *
 * lightningcss normalizes every legacy notation (`red`, `#000`, `hsl(...)`) to `rgb`, so a keyword
 * comes out as its hex — RN's `processColor` reads both. A wide-gamut color (`oklch`, `lab`) has no
 * RN equivalent at all and returns `null` so the caller drops it with a warning.
 */
function colorToCss(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (value.type === 'currentcolor') return 'currentColor';
  if (value.type !== 'rgb') return null;

  const r = readNumber(value.r);
  const g = readNumber(value.g);
  const b = readNumber(value.b);
  const alpha = readNumber(value.alpha);
  if (r === null || g === null || b === null || alpha === null) return null;

  if (alpha < 1) {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${shortestAlpha(alpha)})`;
  }

  const hex = `${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
  const isShortenable =
    hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5];
  return isShortenable ? `#${hex[0]}${hex[2]}${hex[4]}` : `#${hex}`;
}

//#endregion colors

//#region serializing a declaration back to CSS text

const SERIALIZER_TEMPLATE = new TextEncoder().encode('.s{color:red}');
const SERIALIZER_DECODER = new TextDecoder();

/**
 * The CSS text of one declaration's VALUE, produced by lightningcss's own printer.
 *
 * Needed for the `raw` property kind — `transform`, `filter`, `background-image`,
 * `box-shadow`, `transform-origin` are passed to the engine as unparsed CSS text on purpose (see
 * the PROPERTY_TABLE comments: RN's own JS processors parse that exact syntax at commit time). We
 * hold their typed AST and need text back, and re-printing a gradient / transform-list / filter
 * chain by hand would be a second, narrower serializer that drifts from lightningcss's.
 *
 * The trick is to hand lightningcss a one-rule stylesheet and swap that rule's declarations for
 * ours, then read the value out of the printed output.
 */
function serializeValue(declaration: Declaration): string | null {
  try {
    const result = transform({
      filename: 'symbiote-declaration.css',
      code: SERIALIZER_TEMPLATE,
      visitor: {
        Rule(rule) {
          if (rule.type !== 'style') return;
          rule.value.declarations = {
            declarations: [declaration],
            importantDeclarations: [],
          };
          return rule;
        },
      },
    });

    const css = SERIALIZER_DECODER.decode(result.code);
    const open = css.indexOf('{');
    const close = css.lastIndexOf('}');
    if (open === -1 || close <= open) return null;

    const body = css
      .slice(open + 1, close)
      .trim()
      .replace(/;$/, '');
    const colon = body.indexOf(':');
    return colon === -1 ? null : body.slice(colon + 1).trim();
  } catch {
    return null;
  }
}

//#endregion serializing a declaration back to CSS text

//#region var() substitution

const TOKEN_TEXT: Record<string, string> = {
  colon: ':',
  semicolon: ';',
  comma: ',',
  'parenthesis-block': '(',
  'square-bracket-block': '[',
  'curly-bracket-block': '{',
  'close-parenthesis': ')',
  'close-square-bracket': ']',
  'close-curly-bracket': '}',
  comment: '',
};

function rawTokenToText(token: unknown): string | null {
  if (!isRecord(token)) return null;

  const type = readString(token.type);
  if (type === null) return null;

  const fixed = TOKEN_TEXT[type];
  if (fixed !== undefined) return fixed;

  const text = readString(token.value);
  const amount = readNumber(token.value);

  switch (type) {
    case 'ident':
    case 'delim':
    case 'white-space':
      return text;
    case 'at-keyword':
      return text === null ? null : `@${text}`;
    case 'hash':
    case 'id-hash':
      return text === null ? null : `#${text}`;
    case 'string':
      return text === null ? null : JSON.stringify(text);
    case 'unquoted-url':
      return text === null ? null : `url(${text})`;
    case 'function':
      return text === null ? null : `${text}(`;
    case 'number':
      return amount === null ? null : String(roundFloat(amount));
    case 'percentage':
      return amount === null ? null : `${roundFloat(amount * 100)}%`;
    case 'dimension': {
      const unit = readString(token.unit);
      return amount === null || unit === null
        ? null
        : `${roundFloat(amount)}${unit}`;
    }
    default:
      return null;
  }
}

/**
 * How one token walk should treat `var()`. Both callers of the printer share it so this package
 * never grows a second serializer that drifts from this one: {@link declarationToStyle} resolves
 * (`substitute`), {@link variablesIn} stores the authored text (`keep`).
 */
interface ITokenPrinter {
  readonly variables: ReadonlyMap<string, string>;
  readonly varMode: 'substitute' | 'keep';
  /** Names that resolved to nothing — only ever filled in `substitute` mode. */
  readonly missing: string[];
}

/**
 * Print a token list (an `unparsed` declaration's value, or a custom property's) back to CSS text.
 *
 * In `substitute` mode every `var(--x)` is replaced from the printer's variable map, falling back
 * to the `var()` fallback argument when the name is undeclared; a name that resolves to nothing is
 * pushed onto `missing` so the caller can drop the declaration and say WHICH custom property was
 * never declared. In `keep` mode the `var()` is printed verbatim.
 */
function tokensToText(tokens: unknown, printer: ITokenPrinter): string | null {
  if (!Array.isArray(tokens)) return null;

  let text = '';
  for (const token of tokens) {
    const piece = tokenOrValueToText(token, printer);
    if (piece === null) return null;
    text += piece;
  }

  return text;
}

function tokenOrValueToText(
  node: unknown,
  printer: ITokenPrinter,
): string | null {
  if (!isRecord(node)) return null;

  switch (node.type) {
    case 'token':
      return rawTokenToText(node.value);
    case 'color':
      return colorToCss(node.value);
    case 'dashed-ident':
      return readString(node.value);
    case 'length':
    case 'angle':
    case 'time':
    case 'resolution': {
      const dimension = isRecord(node.value) ? node.value : null;
      if (dimension === null) return null;
      const unit = readString(dimension.unit) ?? readString(dimension.type);
      const amount = readNumber(dimension.value);
      return unit === null || amount === null
        ? null
        : `${roundFloat(amount)}${unit}`;
    }
    case 'function': {
      if (!isRecord(node.value)) return null;
      const name = readString(node.value.name);
      const args = tokensToText(node.value.arguments, printer);
      return name === null || args === null ? null : `${name}(${args})`;
    }
    case 'var':
      return variableToText(node.value, printer);
    // `url()` / `env()` / an animation name have no place in an RN style value.
    default:
      return null;
  }
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

  // Declared in ANOTHER file — the documented trap this pipeline exists to stop shipping. The
  // registry is per-file, so there is nothing to resolve against and no value worth emitting.
  printer.missing.push(name);
  return null;
}

//#endregion var() substitution

//#region shorthand (Rect / corner / axis) expansion

interface IRectMapping {
  /** RN prop for the uniform case; `null` forces expansion (RN has no single-value form). */
  readonly shorthand: string | null;
  /** RN longhands in CSS order — top, right, bottom, left; `null` when RN has no per-side prop. */
  readonly sides: readonly [string, string, string, string] | null;
  readonly read: 'length' | 'color' | 'keyword';
}

// Every one of these arrives from lightningcss PRE-EXPANDED into a Rect, which is what makes the
// old parser's `padding: 8px 16px -> { padding: 8 }` fixable at all.
const RECT_PROPERTIES: Record<string, IRectMapping> = {
  padding: {
    shorthand: 'padding',
    sides: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
    read: 'length',
  },
  margin: {
    shorthand: 'margin',
    sides: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
    read: 'length',
  },
  'border-width': {
    shorthand: 'borderWidth',
    sides: [
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
    ],
    read: 'length',
  },
  'border-color': {
    shorthand: 'borderColor',
    sides: [
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
    ],
    read: 'color',
  },
  // RN has `borderStyle` and no per-side style prop, so a four-value `border-style` is
  // inexpressible rather than expandable.
  'border-style': { shorthand: 'borderStyle', sides: null, read: 'keyword' },
  // Always expanded: `top`/`right`/`bottom`/`left` are the props every RN version has, whereas the
  // `inset` shorthand is newer — expanding costs three keys and can never be wrong.
  inset: {
    shorthand: null,
    sides: ['top', 'right', 'bottom', 'left'],
    read: 'length',
  },
};

const RECT_KEYS = ['top', 'right', 'bottom', 'left'] as const;

const CORNER_KEYS = [
  'topLeft',
  'topRight',
  'bottomRight',
  'bottomLeft',
] as const;

const CORNER_PROPS = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
] as const;

// A corner LONGHAND never arrives as a bare length: lightningcss gives a Size2D pair, so
// `border-top-left-radius: 20px` is `[20px, 20px]` and `4px 8px` is `[4px, 8px]`. Reading it as
// one length made every corner longhand drop with "cannot express" on a plain `20px` — found in
// `examples/solid/App.css`'s `.sheet`, the only place in the corpus that uses them.
const CORNER_RADIUS_PROPERTIES: ReadonlySet<string> = new Set([
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
]);

function readRectSide(
  side: unknown,
  mapping: IRectMapping,
  context: IDeclarationContext,
): IStyleValue | null {
  switch (mapping.read) {
    case 'length': {
      const length = readLength(side, context);
      return length === null ? null : lengthToStyleValue(length);
    }
    case 'color':
      return colorToCss(side);
    case 'keyword':
      return readString(side);
  }
}

function rectToStyle(
  cssProperty: string,
  value: unknown,
  mapping: IRectMapping,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

  const resolved: IStyleValue[] = [];
  for (const key of RECT_KEYS) {
    const side = readRectSide(value[key], mapping, context);
    if (side === null) {
      warnDrop(
        context,
        cssProperty,
        `"${cssProperty}" has a value React Native cannot express`,
      );
      return {};
    }
    resolved.push(side);
  }

  const uniform = resolved.every(side => side === resolved[0]);
  if (uniform && mapping.shorthand !== null) {
    return { [mapping.shorthand]: resolved[0]! };
  }

  if (mapping.sides === null) {
    warnDrop(
      context,
      cssProperty,
      `"${cssProperty}" differs per side and React Native has only the "${mapping.shorthand}" shorthand`,
    );
    return {};
  }

  const style: IStyleObject = {};
  mapping.sides.forEach((prop, index) => {
    style[prop] = resolved[index]!;
  });
  return style;
}

function borderRadiusToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

  const resolved: IStyleValue[] = [];
  for (const key of CORNER_KEYS) {
    const corner = value[key];
    // Each corner is an [x, y] pair; RN has no elliptical radius, so only x survives.
    const radius = Array.isArray(corner) ? corner[0] : corner;
    const length = readLength(radius, context);
    if (length === null) {
      warnDrop(
        context,
        'border-radius',
        '"border-radius" has a value React Native cannot express',
      );
      return {};
    }
    resolved.push(lengthToStyleValue(length));
  }

  if (resolved.every(corner => corner === resolved[0])) {
    return { borderRadius: resolved[0]! };
  }

  const style: IStyleObject = {};
  CORNER_PROPS.forEach((prop, index) => {
    style[prop] = resolved[index]!;
  });
  return style;
}

function gapToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

  // `gap: normal` IS the initial value; dropping it changes nothing, so it stays silent.
  const row = readLength(value.row, context);
  const column = readLength(value.column, context);
  if (row === null || column === null) return {};

  const rowValue = lengthToStyleValue(row);
  const columnValue = lengthToStyleValue(column);
  return rowValue === columnValue
    ? { gap: rowValue }
    : { rowGap: rowValue, columnGap: columnValue };
}

function flexToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

  const grow = readNumber(value.grow);
  const shrink = readNumber(value.shrink);
  if (grow === null || shrink === null) return {};

  const basis = readLength(value.basis, context);
  const isRnFlexShorthand =
    shrink === 1 &&
    basis !== null &&
    basis.kind === 'percent' &&
    basis.value === 0;
  // RN's `flex: n` means exactly `n 1 0` — the CSS `flex: <number>` expansion — so the common case
  // stays the one key the old parser emitted.
  if (isRnFlexShorthand) return { flex: roundFloat(grow) };

  const style: IStyleObject = {
    flexGrow: roundFloat(grow),
    flexShrink: roundFloat(shrink),
  };
  if (basis !== null) style.flexBasis = lengthToStyleValue(basis);
  return style;
}

// `text-shadow` is the one property with no engine-side processor to defer to: RN never got a
// unified CSS-string `textShadow` prop, only the three decomposed legacy props. So this package
// is the only place that CAN decompose it. The output shape (three keys, a `{width, height}`
// offset object, `#000000` when the author wrote no color) is the one the registry has always
// been fed, carried over from the retired text pass this replaced.
const TEXT_SHADOW_DEFAULT_COLOR = '#000000';

function shadowLengthPx(
  value: unknown,
  context: IDeclarationContext,
): number | null {
  const length = readLength(value, context);
  return length === null || length.kind !== 'px'
    ? null
    : roundFloat(length.value);
}

function textShadowToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!Array.isArray(value)) return {};

  if (value.length > 1) {
    // Same key and wording as ../values.ts, so a stylesheet compiled by either pipeline reports
    // the limitation identically.
    warnOnce(
      warnedKeysFor(context.filename),
      'text-shadow:multiple',
      '[@symbiote-native/css-parser] multiple text-shadow layers are not supported, only the first is applied',
    );
  }

  const layer = value[0];
  if (!isRecord(layer)) return {};

  const width = shadowLengthPx(layer.xOffset, context);
  const height = shadowLengthPx(layer.yOffset, context);
  if (width === null || height === null) {
    warnDrop(
      context,
      'text-shadow',
      '"text-shadow" has offsets React Native cannot express',
    );
    return {};
  }

  // CSS defaults an omitted shadow color to `currentColor`, which RN has no concept of; the text
  // parser lands on black for the same reason, so both pipelines agree.
  const color = colorToCss(layer.color);
  const isUsableColor = color !== null && color !== 'currentColor';

  return {
    textShadowColor: isUsableColor ? color : TEXT_SHADOW_DEFAULT_COLOR,
    textShadowOffset: { width, height },
    textShadowRadius: shadowLengthPx(layer.blur, context) ?? 0,
  };
}

//#endregion shorthand (Rect / corner / axis) expansion

//#region entry point

// A `var()` may resolve to text holding another `var()`; each round re-parses, so cap the chain
// rather than trusting authored CSS to terminate it.
const MAX_SUBSTITUTION_DEPTH = 4;

const INITIAL_VALUE_KEYWORDS = new Set(['normal', 'none']);

// Single-color properties. `border-color` is absent on purpose — it arrives as a Rect and is
// handled by {@link RECT_PROPERTIES}, which reads each side with the same {@link colorToCss}.
const COLOR_PROPERTIES = new Set([
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
]);

function isDeclaration(value: unknown): value is Declaration {
  return isRecord(value) && typeof value.property === 'string';
}

/** Keep only the scalar entries `mapCSSProperty` produced — {@link IStyleObject} carries no objects. */
function toStyleObject(mapped: Record<string, unknown> | null): IStyleObject {
  const style: IStyleObject = {};
  if (mapped === null) return style;

  for (const [prop, value] of Object.entries(mapped)) {
    if (typeof value === 'string' || typeof value === 'number') {
      style[prop] = value;
    }
  }
  return style;
}

/** Re-parse one substituted declaration back through lightningcss. */
function parseDeclarationText(
  cssProperty: string,
  valueText: string,
): Declaration[] {
  const parsed: Declaration[] = [];

  try {
    transform({
      filename: 'symbiote-substituted.css',
      code: new TextEncoder().encode(`.s{${cssProperty}:${valueText}}`),
      visitor: {
        Rule(rule) {
          if (rule.type !== 'style') return;
          parsed.push(
            ...rule.value.declarations.declarations,
            ...rule.value.declarations.importantDeclarations,
          );
        },
      },
    });
  } catch {
    return [];
  }

  return parsed;
}

function unparsedToStyle(
  value: { propertyId: { property: string }; value: unknown },
  context: IDeclarationContext,
  depth: number,
): IStyleObject {
  const cssProperty = value.propertyId.property;
  // An unparsed CUSTOM property is still just a `--x` declaration — the caller's pre-pass owns it.
  if (cssProperty === 'custom') return {};

  const missing: string[] = [];
  const valueText = tokensToText(value.value, {
    variables: context.variables,
    varMode: 'substitute',
    missing,
  });

  if (missing.length > 0) {
    warnDrop(
      context,
      `${cssProperty}:var`,
      `custom ${missing.length === 1 ? 'property' : 'properties'} ${missing.map(name => `"${name}"`).join(', ')} used by "${cssProperty}" ${missing.length === 1 ? 'is' : 'are'} not declared in this file`,
    );
    return {};
  }

  if (valueText === null || depth >= MAX_SUBSTITUTION_DEPTH) {
    warnDrop(
      context,
      cssProperty,
      `"${cssProperty}" has a value React Native cannot express`,
    );
    return {};
  }

  const style: IStyleObject = {};
  for (const parsed of parseDeclarationText(cssProperty, valueText)) {
    Object.assign(style, declarationToStyleAt(parsed, context, depth + 1));
  }
  return style;
}

/**
 * One lightningcss `Declaration` (the object handed to a visitor / found in
 * `rule.value.declarations.declarations`) mapped to zero or more RN style entries.
 */
export function declarationToStyle(
  declaration: unknown,
  context: IDeclarationContext,
): IStyleObject {
  return declarationToStyleAt(declaration, context, 0);
}

function declarationToStyleAt(
  declaration: unknown,
  context: IDeclarationContext,
  depth: number,
): IStyleObject {
  if (!isDeclaration(declaration)) return {};

  if (declaration.property === 'custom') {
    const name = declaration.value.name;
    // A `--x` declaration: the caller's pre-pass collected it into `context.variables`.
    if (name.startsWith('--')) return {};

    // lightningcss files a property IT does not know under `custom` too, so this is where a
    // genuine typo (`colr: red`) surfaces. `mapCSSProperty` owns the drop-warning wording — the
    // value argument is unread on that path, it warns and returns null on the table miss.
    mapCSSProperty(name, '', warnedKeysFor(context.filename));
    return {};
  }

  if (declaration.property === 'unparsed') {
    return unparsedToStyle(declaration.value, context, depth);
  }

  const cssProperty = declaration.property;
  const value: unknown = declaration.value;

  const rect = RECT_PROPERTIES[cssProperty];
  if (rect) return rectToStyle(cssProperty, value, rect, context);

  switch (cssProperty) {
    case 'border-radius':
      return borderRadiusToStyle(value, context);
    case 'gap':
      return gapToStyle(value, context);
    case 'flex':
      return flexToStyle(value, context);
    case 'overflow': {
      // RN has one `overflow`; a differing x/y is inexpressible.
      const x = isRecord(value) ? readString(value.x) : null;
      const y = isRecord(value) ? readString(value.y) : null;
      if (x === null || x !== y) {
        warnDrop(
          context,
          cssProperty,
          '"overflow" differs per axis and React Native has one overflow prop',
        );
        return {};
      }
      return { overflow: x };
    }
    case 'aspect-ratio': {
      const ratio = isRecord(value) ? value.ratio : null;
      const width = Array.isArray(ratio) ? readNumber(ratio[0]) : null;
      const height = Array.isArray(ratio) ? readNumber(ratio[1]) : null;
      if (width === null || height === null || height === 0) return {};
      return { aspectRatio: roundFloat(width / height) };
    }
    case 'text-shadow':
      return textShadowToStyle(value, context);
    // A CSS-Modules DIRECTIVE, not a style property — and lightningcss has ALREADY acted on it:
    // the composed names come back through `exports[...].composes`, which
    // `metro-css-module/index.ts` walks to flatten a chain. Measured 2026-08-20: it arrives as a
    // first-class `property: 'composes'`, NOT under `custom` where an unknown name goes, so it fell
    // through to the PROPERTY_TABLE miss and every author of a WORKING `.module.*` file was told
    // "unsupported CSS property" on every build. The drop warnings are the only signal that a real
    // rule died; a channel that cries wolf on working code is the one nobody reads when it matters.
    case 'composes':
      return {};
    default:
      break;
  }

  const mapping = PROPERTY_TABLE[cssProperty];
  if (!mapping) {
    mapCSSProperty(cssProperty, '', warnedKeysFor(context.filename));
    return {};
  }

  // Colors are `raw` in the table but must NOT go through the printer below: lightningcss prints
  // a translucent color as `#0000004d`, and the shape this pipeline ships is `rgba(0, 0, 0, 0.3)`.
  if (COLOR_PROPERTIES.has(cssProperty)) {
    const color = colorToCss(value);
    if (color === null) {
      warnDrop(
        context,
        cssProperty,
        `"${cssProperty}" uses a color space React Native cannot read`,
      );
      return {};
    }
    return { [mapping.rnProperty]: color };
  }

  // Only the horizontal half survives — RN has no elliptical radius, the same rule
  // `borderRadiusToStyle` already applies to each corner of the shorthand.
  if (CORNER_RADIUS_PROPERTIES.has(cssProperty)) {
    const radius = readLength(Array.isArray(value) ? value[0] : value, context);
    if (radius === null) {
      warnDrop(
        context,
        cssProperty,
        `"${cssProperty}" has a value React Native cannot express`,
      );
      return {};
    }
    return { [mapping.rnProperty]: lengthToStyleValue(radius) };
  }

  if (mapping.kind === 'raw') {
    const text = serializeValue(declaration);
    if (text === null) {
      warnDrop(
        context,
        cssProperty,
        `"${cssProperty}" has a value React Native cannot express`,
      );
      return {};
    }
    return toStyleObject(
      mapCSSProperty(cssProperty, text, warnedKeysFor(context.filename)),
    );
  }

  if (mapping.kind === 'number') {
    const plain =
      readNumber(value) ?? (isRecord(value) ? readNumber(value.value) : null);
    if (plain === null) return {};
    return { [mapping.rnProperty]: roundFloat(plain) };
  }

  const length = readLength(value, context);
  if (length === null) {
    // `normal` / `none` ARE the CSS initial values (`letter-spacing`, `line-height`) — dropping
    // one changes nothing on screen, so it never earns a warning.
    if (INITIAL_VALUE_KEYWORDS.has(readType(value) ?? '')) return {};

    // The `calc()` that survived lightningcss's own folding mixes a percentage or a viewport unit
    // with a length — RN has no expression form, and the old parser's silent `100` for
    // `calc(100% - 24px)` is exactly the bug this drop replaces.
    const reason =
      readType(isRecord(value) ? value.value : null) === 'calc'
        ? `"${cssProperty}" uses a calc() mixing units React Native cannot resolve`
        : `"${cssProperty}" has a value React Native cannot express`;
    warnDrop(context, cssProperty, reason);
    return {};
  }

  return { [mapping.rnProperty]: lengthToStyleValue(length) };
}

//#endregion entry point

//#region file-wide custom-property pre-pass

/**
 * Every custom property (`--x`) declared anywhere in the file, name -> its raw value text, in the
 * shape {@link IDeclarationContext.variables} expects.
 *
 * A pass of its OWN, ahead of mapping declarations, because nothing orders `:root` first — a
 * component stylesheet may declare a token in a class rule, inside `@media`, or below its first
 * use, and a single forward walk would miss it. Later declaration of the same name wins, which is
 * what the cascade does within one file.
 *
 * The value is stored VERBATIM: a token list that is itself a `var()` chain is printed back as
 * `var(--other)`, and resolution stays in {@link declarationToStyle}, which is the only place that
 * knows whether the chain terminates. Serialization goes through the same token printer the
 * `unparsed` path uses — this package keeps ONE printer.
 */
export function variablesIn(
  css: string,
  filename: string,
): ReadonlyMap<string, string> {
  const variables = new Map<string, string>();
  if (!css) return variables;

  const printer: ITokenPrinter = {
    variables,
    varMode: 'keep',
    missing: [],
  };

  try {
    transform({
      filename,
      code: new TextEncoder().encode(css),
      // A malformed rule elsewhere in the file must not cost us the tokens that ARE declared.
      errorRecovery: true,
      visitor: {
        Rule(rule) {
          if (rule.type !== 'style') return;

          const block = rule.value.declarations;
          for (const declaration of [
            ...block.declarations,
            ...block.importantDeclarations,
          ]) {
            if (declaration.property !== 'custom') continue;

            const name = declaration.value.name;
            if (!name.startsWith('--')) continue;

            const text = tokensToText(declaration.value.value, printer);
            if (text !== null) variables.set(name, text.trim());
          }
        },
      },
    });
  } catch {
    return variables;
  }

  return variables;
}

//#endregion file-wide custom-property pre-pass

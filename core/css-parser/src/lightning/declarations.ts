// One lightningcss `Declaration` to zero or more React Native style entries, off the typed AST
// A shorthand arrives pre-expanded, a `calc()` as a sum tree, a `var()` as an `unparsed` one
// Each part lives in a module of its own: lengths, colors, token text, box shorthands, shadows
import type { Declaration } from 'lightningcss';
import { PROPERTY_TABLE, mapCSSProperty } from '../properties.ts';
import {
  borderRadiusToStyle,
  flexToStyle,
  gapToStyle,
  isCornerRadiusProperty,
  RECT_PROPERTIES,
  rectToStyle,
} from './box-shorthands.ts';
import { colorToCss } from './colors.ts';
import type { IDeclarationContext, IStyleObject } from './declaration-types.ts';
import { parseDeclarationText, serializeValue } from './declaration-text.ts';
import { warnDrop, warnedKeysFor } from './drop-warnings.ts';
import { lengthToStyleValue, readLength } from './lengths.ts';
import { textShadowToStyle } from './text-shadow.ts';
import { tokensToText } from './token-text.ts';
import {
  isRecord,
  readNumber,
  readString,
  readType,
  roundFloat,
} from './value-readers.ts';

export type {
  IDeclarationContext,
  IStyleObject,
  IStyleValue,
  IStyleValueObject,
} from './declaration-types.ts';
export { variablesIn } from './custom-properties.ts';

type ISpecialHandler = (
  value: unknown,
  context: IDeclarationContext,
  cssProperty: string,
) => IStyleObject;

// A `var()` may resolve to text holding another `var()`, so the chain is capped, not trusted
const MAX_SUBSTITUTION_DEPTH = 4;

type IInitialKeyword = 'normal' | 'none';

type IColorProperty =
  | 'color'
  | 'background-color'
  | 'border-top-color'
  | 'border-right-color'
  | 'border-bottom-color'
  | 'border-left-color';

const CUSTOM_PROPERTY = 'custom';

const INITIAL_VALUE_KEYWORDS = [
  'normal',
  'none',
] as const satisfies readonly IInitialKeyword[];

// Single-color properties, while `border-color` arrives as a Rect and is read side by side
const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
] as const satisfies readonly IColorProperty[];

function isColorProperty(cssProperty: string): boolean {
  return COLOR_PROPERTIES.some(property => property === cssProperty);
}

function isInitialKeyword(type: string | null): boolean {
  return INITIAL_VALUE_KEYWORDS.some(keyword => keyword === type);
}

function isDeclaration(value: unknown): value is Declaration {
  return isRecord(value) && typeof value.property === 'string';
}

function cannotExpress(
  context: IDeclarationContext,
  cssProperty: string,
): IStyleObject {
  warnDrop(
    context,
    cssProperty,
    `"${cssProperty}" has a value React Native cannot express`,
  );
  return {};
}

// RN has one `overflow`, so a differing x and y is inexpressible
function overflowToStyle(
  value: unknown,
  context: IDeclarationContext,
  cssProperty: string,
): IStyleObject {
  const x = isRecord(value) ? readString(value.x) : null;
  const y = isRecord(value) ? readString(value.y) : null;
  if (x !== null && x === y) return { overflow: x };
  warnDrop(
    context,
    cssProperty,
    '"overflow" differs per axis and React Native has one overflow prop',
  );
  return {};
}

function aspectRatioToStyle(value: unknown): IStyleObject {
  const ratio = isRecord(value) ? value.ratio : null;
  const width = Array.isArray(ratio) ? readNumber(ratio[0]) : null;
  const height = Array.isArray(ratio) ? readNumber(ratio[1]) : null;
  if (width === null || height === null || height === 0) return {};
  return { aspectRatio: roundFloat(width / height) };
}

// `composes` is a CSS-Modules directive, not a style: its names come back through `exports`
const SPECIAL_PROPERTIES: Record<string, ISpecialHandler> = {
  'border-radius': (value, context) => borderRadiusToStyle(value, context),
  gap: (value, context) => gapToStyle(value, context),
  flex: (value, context) => flexToStyle(value, context),
  overflow: overflowToStyle,
  'aspect-ratio': value => aspectRatioToStyle(value),
  'text-shadow': (value, context) => textShadowToStyle(value, context),
  composes: () => ({}),
};

// Keeps the scalar entries `mapCSSProperty` produced, since an `IStyleObject` carries no objects
function toStyleObject(mapped: Record<string, unknown> | null): IStyleObject {
  const style: IStyleObject = {};
  for (const [prop, value] of Object.entries(mapped ?? {})) {
    if (typeof value === 'string' || typeof value === 'number') {
      style[prop] = value;
    }
  }
  return style;
}

function unparsedToStyle(
  value: { propertyId: { property: string }; value: unknown },
  context: IDeclarationContext,
  depth: number,
): IStyleObject {
  const cssProperty = value.propertyId.property;
  // An unparsed custom property is still a `--x` declaration, which the pre-pass owns
  if (cssProperty === CUSTOM_PROPERTY) return {};

  const missing: string[] = [];
  const valueText = tokensToText(value.value, {
    variables: context.variables,
    varMode: 'substitute',
    missing,
  });

  if (missing.length > 0) {
    const names = missing.map(name => `"${name}"`).join(', ');
    const [noun, verb] =
      missing.length === 1 ? ['property', 'is'] : ['properties', 'are'];
    warnDrop(
      context,
      `${cssProperty}:var`,
      `custom ${noun} ${names} used by "${cssProperty}" ${verb} not declared in this file`,
    );
    return {};
  }

  if (valueText === null || depth >= MAX_SUBSTITUTION_DEPTH) {
    return cannotExpress(context, cssProperty);
  }

  const style: IStyleObject = {};
  for (const parsed of parseDeclarationText(cssProperty, valueText)) {
    Object.assign(style, declarationToStyleAt(parsed, context, depth + 1));
  }
  return style;
}

// lightningcss files a property it does not know under `custom` too, so a typo surfaces here
function customToStyle(
  name: string,
  context: IDeclarationContext,
): IStyleObject {
  if (name.startsWith('--')) return {};
  mapCSSProperty(name, '', warnedKeysFor(context.filename));
  return {};
}

// Colors are `raw` in the table but skip the printer, which writes a translucent one as `#0000004d`
function colorProperty(
  value: unknown,
  cssProperty: string,
  rnProperty: string,
  context: IDeclarationContext,
): IStyleObject {
  const color = colorToCss(value);
  if (color !== null) return { [rnProperty]: color };
  warnDrop(
    context,
    cssProperty,
    `"${cssProperty}" uses a color space React Native cannot read`,
  );
  return {};
}

// Only the horizontal half survives, as RN has no elliptical radius
function cornerRadiusProperty(
  value: unknown,
  cssProperty: string,
  rnProperty: string,
  context: IDeclarationContext,
): IStyleObject {
  const radius = readLength(Array.isArray(value) ? value[0] : value, context);
  if (radius === null) return cannotExpress(context, cssProperty);
  return { [rnProperty]: lengthToStyleValue(radius) };
}

function rawProperty(
  declaration: Declaration,
  cssProperty: string,
  context: IDeclarationContext,
): IStyleObject {
  const text = serializeValue(declaration);
  if (text === null) return cannotExpress(context, cssProperty);
  return toStyleObject(
    mapCSSProperty(cssProperty, text, warnedKeysFor(context.filename)),
  );
}

function numberProperty(value: unknown, rnProperty: string): IStyleObject {
  const plain =
    readNumber(value) ?? (isRecord(value) ? readNumber(value.value) : null);
  return plain === null ? {} : { [rnProperty]: roundFloat(plain) };
}

function lengthProperty(
  value: unknown,
  cssProperty: string,
  rnProperty: string,
  context: IDeclarationContext,
): IStyleObject {
  const length = readLength(value, context);
  if (length !== null) return { [rnProperty]: lengthToStyleValue(length) };
  // `normal` and `none` are the CSS initial values, so dropping one changes nothing on screen
  if (isInitialKeyword(readType(value))) return {};

  // A `calc()` mixing a percentage or viewport unit with a length has no RN expression form
  const isCalc = readType(isRecord(value) ? value.value : null) === 'calc';
  if (!isCalc) return cannotExpress(context, cssProperty);
  warnDrop(
    context,
    cssProperty,
    `"${cssProperty}" uses a calc() mixing units React Native cannot resolve`,
  );
  return {};
}

function tableToStyle(
  declaration: Declaration,
  cssProperty: string,
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  const mapping = PROPERTY_TABLE[cssProperty];
  if (!mapping) {
    mapCSSProperty(cssProperty, '', warnedKeysFor(context.filename));
    return {};
  }
  const { rnProperty } = mapping;
  if (isColorProperty(cssProperty)) {
    return colorProperty(value, cssProperty, rnProperty, context);
  }
  if (isCornerRadiusProperty(cssProperty)) {
    return cornerRadiusProperty(value, cssProperty, rnProperty, context);
  }
  if (mapping.kind === 'raw') {
    return rawProperty(declaration, cssProperty, context);
  }
  if (mapping.kind === 'number') return numberProperty(value, rnProperty);
  return lengthProperty(value, cssProperty, rnProperty, context);
}

function declarationToStyleAt(
  declaration: unknown,
  context: IDeclarationContext,
  depth: number,
): IStyleObject {
  if (!isDeclaration(declaration)) return {};
  if (declaration.property === CUSTOM_PROPERTY) {
    return customToStyle(declaration.value.name, context);
  }
  if (declaration.property === 'unparsed') {
    return unparsedToStyle(declaration.value, context, depth);
  }

  const cssProperty = declaration.property;
  const value: unknown = declaration.value;
  const rect = RECT_PROPERTIES[cssProperty];
  if (rect) return rectToStyle(cssProperty, value, rect, context);
  const special = SPECIAL_PROPERTIES[cssProperty];
  if (special) return special(value, context, cssProperty);
  return tableToStyle(declaration, cssProperty, value, context);
}

/**
 * One lightningcss `Declaration` (from a visitor, or `rule.value.declarations.declarations`) mapped
 * to zero or more RN style entries
 */
export function declarationToStyle(
  declaration: unknown,
  context: IDeclarationContext,
): IStyleObject {
  return declarationToStyleAt(declaration, context, 0);
}

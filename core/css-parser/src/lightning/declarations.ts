// One lightningcss `Declaration` in, zero or more React Native style entries out
// It maps off the typed AST, so a shorthand arrives pre-expanded and a `calc()` as a sum tree
// `!important` needs nothing here: the caller feeds those in like any other declaration

import type { Declaration } from 'lightningcss';
import { PROPERTY_TABLE, mapCSSProperty } from '../properties.ts';
import { colorToCss } from './colors.ts';
import {
  dropUnexpressible,
  warnDrop,
  warnUnresolvable,
  warnedKeysFor,
} from './drop-warning.ts';
import {
  containsMathFunction,
  isUnresolvableAtRuntime,
  lengthToStyleValue,
  readLength,
} from './lengths.ts';
import {
  customToStyle,
  isCustomDeclaration,
  isUnparsedDeclaration,
  unparsedToStyle,
} from './raw-var.ts';
import { serializeValue } from './serialize.ts';
import { shorthandToStyle } from './shorthands.ts';
import type { IDeclarationContext, IStyleObject } from './style-types.ts';
import { isRecord, readNumber, readType, roundFloat } from './value-readers.ts';

export type {
  IDeclarationContext,
  IStyleObject,
  IStyleValue,
  IStyleValueObject,
} from './style-types.ts';

type IPropertyMapping = (typeof PROPERTY_TABLE)[string];

// `normal` and `none` are the CSS initial values of `letter-spacing` and `line-height`
const INITIAL_VALUE_NAMES = ['normal', 'none'] as const;
type IInitialValueName = (typeof INITIAL_VALUE_NAMES)[number];
const INITIAL_VALUE_KEYWORDS: ReadonlySet<string> = new Set<IInitialValueName>(
  INITIAL_VALUE_NAMES,
);

// Colors are `raw` in the table but skip the printer: it writes `#0000004d` for a translucent
// color, and the shape shipped here is `rgba(0, 0, 0, 0.3)`
const COLOR_PROPERTY_NAMES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
] as const;
type IColorPropertyName = (typeof COLOR_PROPERTY_NAMES)[number];
const COLOR_PROPERTIES: ReadonlySet<string> = new Set<IColorPropertyName>(
  COLOR_PROPERTY_NAMES,
);

function isDeclaration(value: unknown): value is Declaration {
  return isRecord(value) && typeof value.property === 'string';
}

// Keeps the scalar entries `mapCSSProperty` produced, as `IStyleObject` carries no objects
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

function colorDeclarationToStyle(
  cssProperty: string,
  rnProperty: string,
  value: unknown,
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

// Raw properties go to the engine as CSS text, as its own processors parse that exact syntax
function rawDeclarationToStyle(
  declaration: Declaration,
  context: IDeclarationContext,
): IStyleObject {
  const cssProperty = declaration.property;
  const text = serializeValue(declaration);
  if (text === null) return dropUnexpressible(context, cssProperty);

  return toStyleObject(
    mapCSSProperty(cssProperty, text, warnedKeysFor(context.filename)),
  );
}

function lengthDeclarationToStyle(
  declaration: Declaration,
  mapping: IPropertyMapping,
  context: IDeclarationContext,
): IStyleObject {
  const cssProperty = declaration.property;
  const value: unknown = declaration.value;
  const length = readLength(value, context);
  if (length !== null) {
    return { [mapping.rnProperty]: lengthToStyleValue(length) };
  }

  // Dropping an initial value changes nothing on screen, so it never earns a warning
  if (INITIAL_VALUE_KEYWORDS.has(readType(value) ?? '')) return {};

  // A math function lightningcss could not fold goes on as text, which C++ evaluates per node
  if (containsMathFunction(value)) {
    const text = serializeValue(declaration);
    if (text === null) return dropUnexpressible(context, cssProperty);
    if (isUnresolvableAtRuntime(value, context)) {
      warnUnresolvable(
        context,
        cssProperty,
        `"${cssProperty}" uses a math function the engine cannot compute (viewport unit, or % next to a length)`,
      );
    }
    return { [mapping.rnProperty]: text };
  }

  // A `calc()` still here mixes a percentage or viewport unit with a length
  const inner = isRecord(value) ? value.value : null;
  warnDrop(
    context,
    cssProperty,
    readType(inner) === 'calc'
      ? `"${cssProperty}" uses a calc() mixing units React Native cannot resolve`
      : `"${cssProperty}" has a value React Native cannot express`,
  );
  return {};
}

function tableDeclarationToStyle(
  declaration: Declaration,
  mapping: IPropertyMapping,
  context: IDeclarationContext,
): IStyleObject {
  const cssProperty = declaration.property;
  const value: unknown = declaration.value;

  if (COLOR_PROPERTIES.has(cssProperty)) {
    return colorDeclarationToStyle(
      cssProperty,
      mapping.rnProperty,
      value,
      context,
    );
  }
  if (mapping.kind === 'raw')
    return rawDeclarationToStyle(declaration, context);
  if (mapping.kind === 'number') {
    const plain =
      readNumber(value) ?? (isRecord(value) ? readNumber(value.value) : null);
    return plain === null ? {} : { [mapping.rnProperty]: roundFloat(plain) };
  }
  return lengthDeclarationToStyle(declaration, mapping, context);
}

function typedDeclarationToStyle(
  declaration: Declaration,
  context: IDeclarationContext,
): IStyleObject {
  const cssProperty: string = declaration.property;
  const value: unknown = declaration.value;

  const shorthand = shorthandToStyle(cssProperty, value, context);
  if (shorthand !== null) return shorthand;

  const mapping = PROPERTY_TABLE[cssProperty];
  if (mapping === undefined) {
    mapCSSProperty(cssProperty, '', warnedKeysFor(context.filename));
    return {};
  }
  return tableDeclarationToStyle(declaration, mapping, context);
}

/** One lightningcss `Declaration` mapped to zero or more RN style entries */
export function declarationToStyle(
  declaration: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!isDeclaration(declaration)) return {};
  if (isCustomDeclaration(declaration)) {
    return customToStyle(declaration, context);
  }
  if (isUnparsedDeclaration(declaration)) {
    return unparsedToStyle(declaration, context);
  }
  // A CSS-Modules directive, the composed names come back through `exports[...].composes`
  if (declaration.property === 'composes') return {};
  return typedDeclarationToStyle(declaration, context);
}

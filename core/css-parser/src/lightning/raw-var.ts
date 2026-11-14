// A `var()` is never resolved at build time, as an inline `--x` or `setVariable` could change it
// The declaration ships as a style key holding the authored text, and C++ substitutes it per node

import type { Declaration } from 'lightningcss';
import { PROPERTY_TABLE, mapCSSProperty } from '../properties.ts';
import { dropUnexpressible, warnDrop, warnedKeysFor } from './drop-warning.ts';
import { serializeValue } from './serialize.ts';
import type { IDeclarationContext, IStyleObject } from './style-types.ts';

const PROPERTY = { custom: 'custom', unparsed: 'unparsed' } as const;

type ICustomDeclaration = Extract<Declaration, { property: typeof PROPERTY.custom }>;
type IUnparsedDeclaration = Extract<
  Declaration,
  { property: typeof PROPERTY.unparsed }
>;

const CUSTOM_PROPERTY_PREFIX = '--';

// The two properties whose RN key is not in the table: `inset` stays whole and C++ expands it
const EXTRA_RN_KEYS: Record<string, string> = {
  inset: 'inset',
  'text-shadow': 'textShadow',
};

function rnKeyFor(cssProperty: string): string | null {
  return PROPERTY_TABLE[cssProperty]?.rnProperty ?? EXTRA_RN_KEYS[cssProperty] ?? null;
}

export function isCustomDeclaration(
  declaration: Declaration,
): declaration is ICustomDeclaration {
  return declaration.property === PROPERTY.custom;
}

export function isUnparsedDeclaration(
  declaration: Declaration,
): declaration is IUnparsedDeclaration {
  return declaration.property === PROPERTY.unparsed;
}

/** The name and authored text of a `--x` declaration, `null` for any other declaration */
export function variableOf(
  declaration: Declaration,
): { name: string; value: string } | null {
  if (!isCustomDeclaration(declaration)) return null;

  const name = declaration.value.name;
  const value = serializeValue(declaration);
  return value === null || !name.startsWith(CUSTOM_PROPERTY_PREFIX)
    ? null
    : { name, value };
}

/** A `--x` declaration ships under its own name, any other `custom` one is a typo to report */
export function customToStyle(
  declaration: ICustomDeclaration,
  context: IDeclarationContext,
): IStyleObject {
  const variable = variableOf(declaration);
  if (variable !== null) return { [variable.name]: variable.value };

  // lightningcss files a property IT does not know under `custom` too
  const name = declaration.value.name;
  if (!name.startsWith(CUSTOM_PROPERTY_PREFIX)) {
    mapCSSProperty(name, '', warnedKeysFor(context.filename));
  }
  return {};
}

// What `initial` and `unset` give a container property: `container-type` is not inherited
const CONTAINER_RESET: Readonly<Record<string, IStyleObject>> = {
  'container-type': { containerType: 'normal' },
  'container-name': { containerName: 'none' },
  container: { containerName: 'none', containerType: 'normal' },
};

const TOKEN_KIND = { token: 'token', ident: 'ident' } as const;
const RESET_KEYWORD = { initial: 'initial', unset: 'unset' } as const;

// A CSS-wide keyword on a container property, `undefined` for any other declaration
function containerKeywordToStyle(
  declaration: IUnparsedDeclaration,
  context: IDeclarationContext,
): IStyleObject | undefined {
  const cssProperty = declaration.value.propertyId.property;
  const reset = CONTAINER_RESET[cssProperty];
  const [first, ...rest] = declaration.value.value;
  if (reset === undefined || first === undefined || rest.length > 0) return undefined;
  if (first.type !== TOKEN_KIND.token || first.value.type !== TOKEN_KIND.ident) return undefined;

  const keyword = first.value.value.toLowerCase();
  if (keyword === RESET_KEYWORD.initial || keyword === RESET_KEYWORD.unset) return reset;
  warnDrop(context, cssProperty, `"${keyword}" needs the style of a parent, which a class rule lacks`);
  return {};
}

/** A declaration that reads a custom property ships under its RN name with the authored text */
export function unparsedToStyle(
  declaration: IUnparsedDeclaration,
  context: IDeclarationContext,
): IStyleObject {
  const cssProperty = declaration.value.propertyId.property;
  const container = containerKeywordToStyle(declaration, context);
  if (container !== undefined) return container;
  const rnProperty = rnKeyFor(cssProperty);
  if (rnProperty === null) {
    mapCSSProperty(cssProperty, '', warnedKeysFor(context.filename));
    return {};
  }

  const text = serializeValue(declaration);
  return text === null
    ? dropUnexpressible(context, cssProperty)
    : { [rnProperty]: text };
}

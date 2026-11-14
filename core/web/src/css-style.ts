// A Fabric payload bag carries style keys hoisted beside plain props. This turns the style keys
// into CSS declarations, one table lookup per key, the exceptions in `CUSTOM`

import { groupDeclarations } from './css-shadow';
import {
  serializeBoxShadow,
  serializeFilter,
  serializeFontVariant,
  serializeOrigin,
  serializeTransform,
  toLength,
  type ICssDeclarations,
} from './css-values';
import {
  CSS_NAMES,
  STYLE_KIND,
  STYLE_KINDS,
  type IStyleKey,
} from './style-table';

type ICustomKey = {
  [K in IStyleKey]: (typeof STYLE_KINDS)[K] extends typeof STYLE_KIND.custom
    ? K
    : never;
}[IStyleKey];

type ICustomWriter = (value: unknown) => ICssDeclarations | undefined;

const AUTO = 'auto';

export function isStyleKey(key: string): key is IStyleKey {
  return Object.hasOwn(STYLE_KINDS, key);
}

// The style keys of a bag, for a rule that composes the app's style with its own
export const styleKeysOf = (
  bag: Readonly<Record<string, unknown>>,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(bag).filter(([key]) => isStyleKey(key)));

function isCustomKey(key: IStyleKey): key is ICustomKey {
  return STYLE_KINDS[key] === STYLE_KIND.custom;
}

function hasCssName(key: IStyleKey): key is keyof typeof CSS_NAMES {
  return Object.hasOwn(CSS_NAMES, key);
}

function cssNameOf(key: IStyleKey): string {
  if (hasCssName(key)) return CSS_NAMES[key];
  return key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

const single = (
  name: string,
  text: string | undefined,
): ICssDeclarations | undefined =>
  text === undefined ? undefined : { [name]: text };

const both =
  (first: string, second: string): ICustomWriter =>
  value => ({ [first]: toLength(value), [second]: toLength(value) });

// Yoga's flex: a positive n grows n and never shrinks, a negative n only shrinks
function flexDeclarations(value: unknown): ICssDeclarations | undefined {
  if (typeof value !== 'number') return undefined;
  if (value > 0) {
    return {
      'flex-grow': String(value),
      'flex-shrink': '0',
      'flex-basis': '0px',
    };
  }
  if (value === 0) return { 'flex-grow': '0', 'flex-shrink': '0' };
  return { 'flex-grow': '0', 'flex-shrink': String(-value) };
}

// CSS has no `auto` alignment, RN's means the start of the writing direction
const textAlignDeclarations: ICustomWriter = value =>
  single('text-align', value === AUTO ? 'start' : String(value));

// `auto` is the default on both sides, so it writes nothing
const unlessAuto =
  (name: string): ICustomWriter =>
  value =>
    value === AUTO ? {} : single(name, String(value));

// Written by `groupDeclarations`, which sees the keys of one shadow together
const inGroup: ICustomWriter = () => ({});

const CUSTOM: Record<ICustomKey, ICustomWriter> = {
  flex: flexDeclarations,
  paddingHorizontal: both('padding-left', 'padding-right'),
  paddingVertical: both('padding-top', 'padding-bottom'),
  marginHorizontal: both('margin-left', 'margin-right'),
  marginVertical: both('margin-top', 'margin-bottom'),
  shadowColor: inGroup,
  shadowOffset: inGroup,
  shadowOpacity: inGroup,
  shadowRadius: inGroup,
  textShadowColor: inGroup,
  textShadowOffset: inGroup,
  textShadowRadius: inGroup,
  transform: value => single('transform', serializeTransform(value)),
  transformOrigin: value => single('transform-origin', serializeOrigin(value)),
  boxShadow: value => single('box-shadow', serializeBoxShadow(value)),
  filter: value => single('filter', serializeFilter(value)),
  experimental_backgroundImage: value =>
    single('background-image', typeof value === 'string' ? value : undefined),
  textAlign: textAlignDeclarations,
  fontVariant: serializeFontVariant,
  writingDirection: unlessAuto('direction'),
  verticalAlign: unlessAuto('vertical-align'),
};

// Undefined when the platform has no CSS for the key or the value is not one this can write
function declarationsOf(
  key: IStyleKey,
  value: unknown,
): ICssDeclarations | undefined {
  if (isCustomKey(key)) return CUSTOM[key](value);
  const name = cssNameOf(key);
  switch (STYLE_KINDS[key]) {
    case STYLE_KIND.length:
      return { [name]: toLength(value) };
    case STYLE_KIND.number:
    case STYLE_KIND.raw:
      return { [name]: String(value) };
    case STYLE_KIND.none:
      return undefined;
  }
}

// Yoga lets the single edge beat the pair and the pair beat the shorthand, in any key order. CSS
// reads the declarations in order, so they are written shorthand first
const SHORTHANDS = new Set<IStyleKey>([
  'padding',
  'margin',
  'borderWidth',
  'borderColor',
  'borderRadius',
  'gap',
  'flex',
]);

const PAIRS = new Set<IStyleKey>([
  'paddingHorizontal',
  'paddingVertical',
  'marginHorizontal',
  'marginVertical',
  'paddingBlock',
  'paddingInline',
  'marginBlock',
  'marginInline',
  'insetBlock',
  'insetInline',
]);

function precedenceOf(key: IStyleKey): number {
  if (SHORTHANDS.has(key)) return 0;
  return PAIRS.has(key) ? 1 : 2;
}

export function cssFromBag(
  bag: Readonly<Record<string, unknown>>,
  onSkipped?: (key: string) => void,
): ICssDeclarations {
  const out: ICssDeclarations = {};
  const keys = Object.keys(bag)
    .filter(isStyleKey)
    .sort((first, second) => precedenceOf(first) - precedenceOf(second));
  for (const key of keys) {
    const declarations = declarationsOf(key, bag[key]);
    if (declarations === undefined) onSkipped?.(key);
    else Object.assign(out, declarations);
  }
  return Object.assign(out, groupDeclarations(bag));
}

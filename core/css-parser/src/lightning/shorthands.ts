import { colorToCss } from './colors.ts';
import { dropUnexpressible, warnDrop } from './drop-warning.ts';
import { LENGTH_KIND, lengthToStyleValue, readLength } from './lengths.ts';
import type {
  IDeclarationContext,
  IStyleObject,
  IStyleValue,
} from './style-types.ts';
import { textShadowToStyle } from './text-shadow.ts';
import {
  isRecord,
  readNumber,
  readString,
  roundFloat,
} from './value-readers.ts';

type IRectMapping = {
  /** RN prop for the uniform case, `null` forces expansion as RN has no single-value form */
  readonly shorthand: string | null;
  /** RN longhands in CSS order, top right bottom left; `null` when RN has no per-side prop */
  readonly sides: readonly [string, string, string, string] | null;
  readonly read: 'length' | 'color' | 'keyword';
};

// Each arrives from lightningcss pre-expanded into a Rect
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
  // RN has no per-side style prop, so a four-value `border-style` cannot be expanded
  'border-style': { shorthand: 'borderStyle', sides: null, read: 'keyword' },
  // Always expanded, as `inset` is newer than the four props every RN version has
  inset: {
    shorthand: null,
    sides: ['top', 'right', 'bottom', 'left'],
    read: 'length',
  },
};

const RECT_KEYS = ['top', 'right', 'bottom', 'left'] as const;
type IRectKey = (typeof RECT_KEYS)[number];

const CORNER_KEYS = [
  'topLeft',
  'topRight',
  'bottomRight',
  'bottomLeft',
] as const;
type ICornerKey = (typeof CORNER_KEYS)[number];

const CORNER_PROPS = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
] as const;
type ICornerProp = (typeof CORNER_PROPS)[number];

// A corner longhand arrives as a Size2D pair, `20px` as `[20px, 20px]`, and only x survives
const CORNER_LONGHANDS: Record<string, ICornerProp> = {
  'border-top-left-radius': 'borderTopLeftRadius',
  'border-top-right-radius': 'borderTopRightRadius',
  'border-bottom-right-radius': 'borderBottomRightRadius',
  'border-bottom-left-radius': 'borderBottomLeftRadius',
};

type IShorthandHandler = (
  value: unknown,
  context: IDeclarationContext,
) => IStyleObject;

function zipStyle(
  props: readonly string[],
  values: readonly IStyleValue[],
): IStyleObject {
  const style: IStyleObject = {};
  props.forEach((prop, index) => {
    const entry = values[index];
    if (entry !== undefined) style[prop] = entry;
  });
  return style;
}

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

// The value every side shares, or `undefined` when they differ
function uniformOf(values: readonly IStyleValue[]): IStyleValue | undefined {
  const [first] = values;
  return values.every(entry => entry === first) ? first : undefined;
}

// The four sides in CSS order, or `null` as soon as one cannot be expressed
function readSides<TKey extends string>(
  keys: readonly TKey[],
  value: Readonly<Record<string, unknown>>,
  read: (side: unknown) => IStyleValue | null,
): IStyleValue[] | null {
  const resolved: IStyleValue[] = [];
  for (const key of keys) {
    const side = read(value[key]);
    if (side === null) return null;
    resolved.push(side);
  }
  return resolved;
}

function rectToStyle(
  cssProperty: string,
  value: unknown,
  mapping: IRectMapping,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

  const resolved = readSides<IRectKey>(RECT_KEYS, value, side =>
    readRectSide(side, mapping, context),
  );
  if (resolved === null) return dropUnexpressible(context, cssProperty);

  const uniform = uniformOf(resolved);
  if (uniform !== undefined && mapping.shorthand !== null) {
    return { [mapping.shorthand]: uniform };
  }

  if (mapping.sides === null) {
    warnDrop(
      context,
      cssProperty,
      `"${cssProperty}" differs per side and React Native has only the "${mapping.shorthand}" shorthand`,
    );
    return {};
  }
  return zipStyle(mapping.sides, resolved);
}

// Each corner is an [x, y] pair; RN has no elliptical radius, so only x survives
function readCornerRadius(
  corner: unknown,
  context: IDeclarationContext,
): IStyleValue | null {
  const length = readLength(
    Array.isArray(corner) ? corner[0] : corner,
    context,
  );
  return length === null ? null : lengthToStyleValue(length);
}

function borderRadiusToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

  const resolved = readSides<ICornerKey>(CORNER_KEYS, value, corner =>
    readCornerRadius(corner, context),
  );
  if (resolved === null) return dropUnexpressible(context, 'border-radius');

  const uniform = uniformOf(resolved);
  if (uniform !== undefined) return { borderRadius: uniform };
  return zipStyle(CORNER_PROPS, resolved);
}

function cornerLonghandToStyle(
  cssProperty: string,
  rnProperty: ICornerProp,
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  const radius = readCornerRadius(value, context);
  if (radius === null) return dropUnexpressible(context, cssProperty);
  return { [rnProperty]: radius };
}

// `gap: normal` is the initial value, so dropping it stays silent
function gapToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

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
  const isZeroPercentBasis =
    basis !== null && basis.kind === LENGTH_KIND.percent && basis.value === 0;
  // RN's `flex: n` means exactly `n 1 0`, so the common case stays the one key
  if (shrink === 1 && isZeroPercentBasis) return { flex: roundFloat(grow) };

  const style: IStyleObject = {
    flexGrow: roundFloat(grow),
    flexShrink: roundFloat(shrink),
  };
  if (basis !== null) style.flexBasis = lengthToStyleValue(basis);
  return style;
}

// RN has one `overflow`, so a differing x and y cannot be expressed
function overflowToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  const horizontal = isRecord(value) ? readString(value.x) : null;
  const vertical = isRecord(value) ? readString(value.y) : null;
  if (horizontal !== null && horizontal === vertical) {
    return { overflow: horizontal };
  }

  warnDrop(
    context,
    'overflow',
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

// `scroll-state` queries scroll position, which nothing here reports
function containerTypeToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  const type = readString(value);
  if (type === null) return {};
  if (type !== 'scroll-state') return { containerType: type };
  warnDrop(
    context,
    'container-type',
    '"scroll-state" needs scroll position, which is not reported',
  );
  return {};
}

// `none` is kept as text so a later rule can still cancel an earlier name
function containerNameToStyle(value: unknown): IStyleObject {
  if (!isRecord(value)) return {};
  const names = Array.isArray(value.value) ? value.value.map(readString) : [];
  return { containerName: names.length === 0 ? 'none' : names.join(' ') };
}

function containerToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};
  return {
    ...containerNameToStyle(value.name),
    ...containerTypeToStyle(value.containerType, context),
  };
}

const SHORTHAND_HANDLERS: Record<string, IShorthandHandler> = {
  'container-type': containerTypeToStyle,
  'container-name': containerNameToStyle,
  container: containerToStyle,
  'border-radius': borderRadiusToStyle,
  gap: gapToStyle,
  flex: flexToStyle,
  overflow: overflowToStyle,
  'aspect-ratio': aspectRatioToStyle,
  'text-shadow': textShadowToStyle,
};

/**
 * Maps the properties whose value is a Rect, a pair or a record, or `null` for any other
 * property, which the caller then reads off the property table
 */
export function shorthandToStyle(
  cssProperty: string,
  value: unknown,
  context: IDeclarationContext,
): IStyleObject | null {
  const rect = RECT_PROPERTIES[cssProperty];
  if (rect !== undefined) return rectToStyle(cssProperty, value, rect, context);

  const corner = CORNER_LONGHANDS[cssProperty];
  if (corner !== undefined) {
    return cornerLonghandToStyle(cssProperty, corner, value, context);
  }

  const handler = SHORTHAND_HANDLERS[cssProperty];
  return handler === undefined ? null : handler(value, context);
}

// Properties lightningcss hands over as a Rect, a corner list or an axis pair, mapped to RN style
import { colorToCss } from './colors.ts';
import type {
  IDeclarationContext,
  IStyleObject,
  IStyleValue,
} from './declaration-types.ts';
import { warnDrop } from './drop-warnings.ts';
import { lengthToStyleValue, readLength } from './lengths.ts';
import {
  isRecord,
  readNumber,
  readString,
  roundFloat,
} from './value-readers.ts';

export type IRectMapping = {
  /** RN prop for the uniform case; `null` forces expansion (RN has no single-value form) */
  readonly shorthand: string | null;
  /** RN longhands in CSS order, top, right, bottom, left; `null` when RN has no per-side prop */
  readonly sides: readonly [string, string, string, string] | null;
  readonly read: 'length' | 'color' | 'keyword';
};

type IRectSide = 'top' | 'right' | 'bottom' | 'left';
type ICorner = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';
type ICornerProp =
  | 'borderTopLeftRadius'
  | 'borderTopRightRadius'
  | 'borderBottomRightRadius'
  | 'borderBottomLeftRadius';
type ICornerRadiusProperty =
  | 'border-top-left-radius'
  | 'border-top-right-radius'
  | 'border-bottom-right-radius'
  | 'border-bottom-left-radius';

// Every one arrives PRE-EXPANDED into a Rect, which is what makes `padding: 8px 16px` fixable
export const RECT_PROPERTIES: Record<string, IRectMapping> = {
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
  // RN has `borderStyle` and no per-side style prop, so four values are inexpressible
  'border-style': { shorthand: 'borderStyle', sides: null, read: 'keyword' },
  // Always expanded: `top` to `left` exist in every RN version, while `inset` is newer
  inset: {
    shorthand: null,
    sides: ['top', 'right', 'bottom', 'left'],
    read: 'length',
  },
};

const RECT_KEYS = [
  'top',
  'right',
  'bottom',
  'left',
] as const satisfies readonly IRectSide[];

const CORNER_KEYS = [
  'topLeft',
  'topRight',
  'bottomRight',
  'bottomLeft',
] as const satisfies readonly ICorner[];

const CORNER_PROPS = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
] as const satisfies readonly ICornerProp[];

// A corner longhand arrives as a Size2D pair, so `20px` is `[20px, 20px]` and not a bare length
const CORNER_RADIUS_PROPERTIES = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
] as const satisfies readonly ICornerRadiusProperty[];

export function isCornerRadiusProperty(cssProperty: string): boolean {
  return CORNER_RADIUS_PROPERTIES.some(property => property === cssProperty);
}

function isResolved(side: IStyleValue | null): side is IStyleValue {
  return side !== null;
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

function expandSides(
  props: readonly string[],
  values: readonly IStyleValue[],
): IStyleObject {
  const style: IStyleObject = {};
  props.forEach((prop, index) => {
    const value = values[index];
    if (value !== undefined) style[prop] = value;
  });
  return style;
}

export function rectToStyle(
  cssProperty: string,
  value: unknown,
  mapping: IRectMapping,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

  const resolved = RECT_KEYS.map(key =>
    readRectSide(value[key], mapping, context),
  );
  if (!resolved.every(isResolved)) {
    warnDrop(
      context,
      cssProperty,
      `"${cssProperty}" has a value React Native cannot express`,
    );
    return {};
  }

  const [first] = resolved;
  const isUniform = resolved.every(side => side === first);
  if (isUniform && mapping.shorthand !== null && first !== undefined) {
    return { [mapping.shorthand]: first };
  }

  if (mapping.sides === null) {
    warnDrop(
      context,
      cssProperty,
      `"${cssProperty}" differs per side and React Native has only the "${mapping.shorthand}" shorthand`,
    );
    return {};
  }

  return expandSides(mapping.sides, resolved);
}

export function borderRadiusToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

  const resolved: IStyleValue[] = [];
  for (const key of CORNER_KEYS) {
    const corner = value[key];
    // Each corner is an [x, y] pair, and RN has no elliptical radius, so only x survives
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

  const [first] = resolved;
  if (first !== undefined && resolved.every(corner => corner === first)) {
    return { borderRadius: first };
  }
  return expandSides(CORNER_PROPS, resolved);
}

export function gapToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!isRecord(value)) return {};

  // `gap: normal` IS the initial value, so dropping it changes nothing and stays silent
  const row = readLength(value.row, context);
  const column = readLength(value.column, context);
  if (row === null || column === null) return {};

  const rowValue = lengthToStyleValue(row);
  const columnValue = lengthToStyleValue(column);
  return rowValue === columnValue
    ? { gap: rowValue }
    : { rowGap: rowValue, columnGap: columnValue };
}

export function flexToStyle(
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
  // RN's `flex: n` means exactly `n 1 0`, so the common case stays the one key it always emitted
  if (isRnFlexShorthand) return { flex: roundFloat(grow) };

  const style: IStyleObject = {
    flexGrow: roundFloat(grow),
    flexShrink: roundFloat(shrink),
  };
  if (basis !== null) style.flexBasis = lengthToStyleValue(basis);
  return style;
}

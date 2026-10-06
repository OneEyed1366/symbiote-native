import { Platform } from 'expo-modules-core';
import { flattenStyle, processColor } from '@symbiote-native/engine';
import type { IColorValue, IViewStyle } from '@symbiote-native/engine';
import type { IImageResizeMode } from './types';

type IStyleBag = Record<string, unknown>;

const SHADOW_KEYS = [
  'shadowColor',
  'shadowOffset',
  'shadowOpacity',
  'shadowRadius',
] as const satisfies readonly (keyof IViewStyle)[];

const BORDER_COLOR_KEYS = [
  'borderColor',
  'borderStartColor',
  'borderEndColor',
  'borderLeftColor',
  'borderRightColor',
  'borderTopColor',
  'borderBottomColor',
] as const satisfies readonly (keyof IViewStyle)[];

const RESIZE_MODES = new Set<unknown>([
  'cover',
  'contain',
  'stretch',
  'repeat',
  'center',
] as const satisfies readonly IImageResizeMode[]);

export type IImageStyleParts = {
  resizeMode?: IImageResizeMode;
  fontWeight?: string | number;
  fontSize?: number;
  color?: unknown;
  /** What is left once the text-like keys are taken out */
  rest: IStyleBag;
};

function isResizeMode(value: unknown): value is IImageResizeMode {
  return RESIZE_MODES.has(value);
}

function isColorValue(value: unknown): value is IColorValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    (typeof value === 'object' && value !== null)
  );
}

/** An Expo view has no attribute processor for colors, so they go through here */
export function toNativeColor(value: unknown): unknown {
  return isColorValue(value) ? processColor(value) : undefined;
}

/** `resizeMode` and the SF Symbol keys are props to native, not style */
export function splitImageStyle(style: unknown): IImageStyleParts {
  const { resizeMode, fontWeight, fontSize, color, ...rest } =
    flattenStyle(style);
  const isWeight =
    typeof fontWeight === 'string' || typeof fontWeight === 'number';
  return {
    resizeMode: isResizeMode(resizeMode) ? resizeMode : undefined,
    fontWeight: isWeight ? fontWeight : undefined,
    fontSize: typeof fontSize === 'number' ? fontSize : undefined,
    color,
    rest,
  };
}

function without(bag: IStyleBag, keys: readonly string[]): IStyleBag {
  return Object.fromEntries(
    Object.entries(bag).filter(([key]) => !keys.includes(key)),
  );
}

/** Android shadows by `elevation` and paints the background itself, iOS by `shadow*` */
export function platformStyle(style: IStyleBag): IStyleBag {
  return Platform.select({
    android: without(style, [...SHADOW_KEYS, 'backgroundColor']),
    default: without(style, ['elevation']),
  });
}

/** `backgroundColor` and the border colors in the form native reads */
export function nativeColorProps(style: IStyleBag): IStyleBag {
  return Object.fromEntries(
    ['backgroundColor', ...BORDER_COLOR_KEYS].map(key => [
      key,
      toNativeColor(style[key]),
    ]),
  );
}

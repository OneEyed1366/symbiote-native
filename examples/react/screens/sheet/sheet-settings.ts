import type { IScreenOptions } from '@symbiote-native/navigation/react';
import { isParamsRecord, readChoice, readFlag } from '../read-params';

const LAST = 'last';
const NONE = 'none';
// Leaves the value to the platform
const SYSTEM = 'system';
const TINT_COLOR = '#1d3557';

type IAllowed = NonNullable<IScreenOptions['sheetAllowedDetents']>;

// `three` and `single` are lists, the others are the names the library takes
export const DETENT_CHOICES = [
  'three',
  'single',
  'fitToContents',
  'medium',
  'large',
  'all',
] as const;

export const INITIAL_CHOICES = ['0', '1', LAST] as const;
export const UNDIMMED_CHOICES = [NONE, '0', '1', LAST] as const;
export const RADIUS_CHOICES = [SYSTEM, '0', '20', '40'] as const;
export const ELEVATION_CHOICES = [SYSTEM, '0', '12'] as const;
export const CONTENT_STYLES = [NONE, 'tint'] as const;

type IDetentChoice = (typeof DETENT_CHOICES)[number];
type IInitialChoice = (typeof INITIAL_CHOICES)[number];
type IUndimmedChoice = (typeof UNDIMMED_CHOICES)[number];
type IRadiusChoice = (typeof RADIUS_CHOICES)[number];
type IElevationChoice = (typeof ELEVATION_CHOICES)[number];
type IContentStyle = (typeof CONTENT_STYLES)[number];

// The panel state and, once pushed, the settings of the sheet itself: one shape for both
export type ISheetSettings = {
  isSheet: boolean;
  detents: IDetentChoice;
  initialDetent: IInitialChoice;
  undimmed: IUndimmedChoice;
  isGrabberVisible: boolean;
  cornerRadius: IRadiusChoice;
  isExpandsOnScroll: boolean;
  elevation: IElevationChoice;
  isOverflowTopInset: boolean;
  isDefaultResizeAnimation: boolean;
  hasFooter: boolean;
  contentStyle: IContentStyle;
};

export const DEFAULT_SHEET_SETTINGS: ISheetSettings = {
  isSheet: false,
  detents: 'three',
  initialDetent: '0',
  undimmed: NONE,
  isGrabberVisible: false,
  cornerRadius: SYSTEM,
  // The library defaults these two to true
  isExpandsOnScroll: true,
  elevation: SYSTEM,
  isOverflowTopInset: false,
  isDefaultResizeAnimation: true,
  hasFooter: false,
  contentStyle: NONE,
};

const BASE = DEFAULT_SHEET_SETTINGS;

function readDetents(params: Record<string, unknown>): Partial<ISheetSettings> {
  return {
    detents: readChoice(params, 'detents', DETENT_CHOICES, BASE.detents),
    initialDetent: readChoice(
      params,
      'initialDetent',
      INITIAL_CHOICES,
      BASE.initialDetent,
    ),
    undimmed: readChoice(params, 'undimmed', UNDIMMED_CHOICES, BASE.undimmed),
  };
}

function readLook(params: Record<string, unknown>): Partial<ISheetSettings> {
  return {
    isGrabberVisible: readFlag(
      params,
      'isGrabberVisible',
      BASE.isGrabberVisible,
    ),
    cornerRadius: readChoice(
      params,
      'cornerRadius',
      RADIUS_CHOICES,
      BASE.cornerRadius,
    ),
    isExpandsOnScroll: readFlag(
      params,
      'isExpandsOnScroll',
      BASE.isExpandsOnScroll,
    ),
    contentStyle: readChoice(
      params,
      'contentStyle',
      CONTENT_STYLES,
      BASE.contentStyle,
    ),
  };
}

function readAndroidSheet(
  params: Record<string, unknown>,
): Partial<ISheetSettings> {
  return {
    elevation: readChoice(
      params,
      'elevation',
      ELEVATION_CHOICES,
      BASE.elevation,
    ),
    isOverflowTopInset: readFlag(
      params,
      'isOverflowTopInset',
      BASE.isOverflowTopInset,
    ),
    isDefaultResizeAnimation: readFlag(
      params,
      'isDefaultResizeAnimation',
      BASE.isDefaultResizeAnimation,
    ),
    hasFooter: readFlag(params, 'hasFooter', BASE.hasFooter),
  };
}

export function readSheetSettings(params: unknown): ISheetSettings {
  if (!isParamsRecord(params)) return BASE;
  return {
    ...BASE,
    isSheet: readFlag(params, 'isSheet', BASE.isSheet),
    ...readDetents(params),
    ...readLook(params),
    ...readAndroidSheet(params),
  };
}

// The params of the sheet the panel presents, the same fields with the sheet flag on
export function sheetParamsOf(settings: ISheetSettings) {
  return { ...settings, isSheet: true };
}

const DETENTS: Record<IDetentChoice, IAllowed> = {
  three: [0.3, 0.6, 1],
  single: [0.5],
  fitToContents: 'fitToContents',
  medium: 'medium',
  large: 'large',
  all: 'all',
};

// How many detents each choice gives, `all` is the pair medium and large
const DETENT_COUNT: Record<IDetentChoice, number> = {
  three: 3,
  single: 1,
  fitToContents: 1,
  medium: 1,
  large: 1,
  all: 2,
};

// An index past the list throws in a dev build, so a short list pulls it back to its last detent
function initialIndexOf(
  choice: IInitialChoice,
  detents: IDetentChoice,
): number | typeof LAST {
  return choice === LAST
    ? LAST
    : Math.min(Number(choice), DETENT_COUNT[detents] - 1);
}

function undimmedIndexOf(
  choice: IUndimmedChoice,
  detents: IDetentChoice,
): number | typeof LAST | typeof NONE {
  if (choice === LAST || choice === NONE) return choice;
  return Math.min(Number(choice), DETENT_COUNT[detents] - 1);
}

function numberOrUndefined(choice: IRadiusChoice | IElevationChoice) {
  return choice === SYSTEM ? undefined : Number(choice);
}

// The panel screen is no sheet and keeps the options of the app
export function sheetOptionsOf(settings: ISheetSettings): IScreenOptions {
  if (!settings.isSheet) return {};
  return {
    stackPresentation: 'formSheet',
    sheetAllowedDetents: DETENTS[settings.detents],
    sheetInitialDetentIndex: initialIndexOf(
      settings.initialDetent,
      settings.detents,
    ),
    sheetLargestUndimmedDetentIndex: undimmedIndexOf(
      settings.undimmed,
      settings.detents,
    ),
    sheetGrabberVisible: settings.isGrabberVisible,
    sheetCornerRadius: numberOrUndefined(settings.cornerRadius),
    sheetExpandsWhenScrolledToEdge: settings.isExpandsOnScroll,
    sheetElevation: numberOrUndefined(settings.elevation),
    sheetShouldOverflowTopInset: settings.isOverflowTopInset,
    sheetDefaultResizeAnimationEnabled: settings.isDefaultResizeAnimation,
    contentStyle:
      settings.contentStyle === NONE
        ? undefined
        : { backgroundColor: TINT_COLOR },
  };
}

// Tab bar appearance of the native tabs: nested objects the ViewConfig cannot process for us
// Colors are processed here and a font weight is sent as text, as native reads a plain record

import { processColor } from '@symbiote-native/engine';
import type { IColorValue } from '@symbiote-native/engine';

type IFontWeight = string | number;

export type ITabBlurEffect =
  | 'none'
  | 'systemDefault'
  | 'extraLight'
  | 'light'
  | 'dark'
  | 'regular'
  | 'prominent'
  | 'systemUltraThinMaterial'
  | 'systemThinMaterial'
  | 'systemMaterial'
  | 'systemThickMaterial'
  | 'systemChromeMaterial'
  | 'systemUltraThinMaterialLight'
  | 'systemThinMaterialLight'
  | 'systemMaterialLight'
  | 'systemThickMaterialLight'
  | 'systemChromeMaterialLight'
  | 'systemUltraThinMaterialDark'
  | 'systemThinMaterialDark'
  | 'systemMaterialDark'
  | 'systemThickMaterialDark'
  | 'systemChromeMaterialDark';

export type ITabItemStateAppearanceIOS = {
  tabBarItemTitleFontFamily?: string;
  tabBarItemTitleFontSize?: number;
  tabBarItemTitleFontWeight?: IFontWeight;
  tabBarItemTitleFontStyle?: string;
  tabBarItemTitleFontColor?: IColorValue;
  tabBarItemTitlePositionAdjustment?: {
    horizontal?: number;
    vertical?: number;
  };
  tabBarItemIconColor?: IColorValue;
  tabBarItemBadgeBackgroundColor?: IColorValue;
};

export type ITabItemAppearanceIOS = {
  normal?: ITabItemStateAppearanceIOS;
  selected?: ITabItemStateAppearanceIOS;
  focused?: ITabItemStateAppearanceIOS;
  disabled?: ITabItemStateAppearanceIOS;
};

export type ITabAppearanceIOS = {
  stacked?: ITabItemAppearanceIOS;
  inline?: ITabItemAppearanceIOS;
  compactInline?: ITabItemAppearanceIOS;
  tabBarBackgroundColor?: IColorValue;
  tabBarShadowColor?: IColorValue;
  tabBarBlurEffect?: ITabBlurEffect;
};

export type ITabItemStateAppearanceAndroid = {
  tabBarItemTitleFontColor?: IColorValue;
  tabBarItemIconColor?: IColorValue;
};

export type ITabLabelVisibilityMode =
  'auto' | 'selected' | 'labeled' | 'unlabeled';

export type ITabAppearanceAndroid = {
  normal?: ITabItemStateAppearanceAndroid;
  selected?: ITabItemStateAppearanceAndroid;
  focused?: ITabItemStateAppearanceAndroid;
  disabled?: ITabItemStateAppearanceAndroid;
  tabBarBackgroundColor?: IColorValue;
  tabBarItemRippleColor?: IColorValue;
  tabBarItemLabelVisibilityMode?: ITabLabelVisibilityMode;
  tabBarItemIconSize?: number;
  tabBarItemActiveIndicatorColor?: IColorValue;
  tabBarItemActiveIndicatorEnabled?: boolean;
  tabBarItemActiveIndicatorWidth?: number;
  tabBarItemActiveIndicatorHeight?: number;
  tabBarItemTitleFontFamily?: string;
  tabBarItemTitleSmallLabelFontSize?: number;
  tabBarItemTitleLargeLabelFontSize?: number;
  tabBarItemTitleFontWeight?: IFontWeight;
  tabBarItemTitleFontStyle?: string;
  tabBarItemBadgeBackgroundColor?: IColorValue;
  tabBarItemBadgeTextColor?: IColorValue;
};

type IAppearanceRecord = Record<string, unknown>;

const STATE_NAMES = [
  'normal',
  'selected',
  'focused',
  'disabled',
] as const satisfies readonly (keyof ITabItemAppearanceIOS)[];

const IOS_STATE_COLORS = [
  'tabBarItemTitleFontColor',
  'tabBarItemIconColor',
  'tabBarItemBadgeBackgroundColor',
] as const satisfies readonly (keyof ITabItemStateAppearanceIOS)[];

const IOS_BAR_COLORS = [
  'tabBarBackgroundColor',
  'tabBarShadowColor',
] as const satisfies readonly (keyof ITabAppearanceIOS)[];

const ANDROID_STATE_COLORS = [
  'tabBarItemTitleFontColor',
  'tabBarItemIconColor',
] as const satisfies readonly (keyof ITabItemStateAppearanceAndroid)[];

const ANDROID_BAR_COLORS = [
  'tabBarBackgroundColor',
  'tabBarItemRippleColor',
  'tabBarItemActiveIndicatorColor',
  'tabBarItemBadgeBackgroundColor',
  'tabBarItemBadgeTextColor',
] as const satisfies readonly (keyof ITabAppearanceAndroid)[];

function fontWeightText(weight: IFontWeight | undefined): string | undefined {
  return weight === undefined ? undefined : String(weight);
}

// An unset color stays undefined, as native reads that as no override
function withProcessedColors<K extends string>(
  source: Partial<Record<K, IColorValue>>,
  colorKeys: readonly K[],
): IAppearanceRecord {
  const result: IAppearanceRecord = { ...source };
  for (const key of colorKeys) {
    const color = source[key];
    result[key] = color === undefined ? undefined : processColor(color);
  }
  return result;
}

function withMappedStates<S>(
  group: Partial<Record<(typeof STATE_NAMES)[number], S>>,
  mapState: (state: S) => IAppearanceRecord,
): IAppearanceRecord {
  const result: IAppearanceRecord = { ...group };
  for (const name of STATE_NAMES) {
    const state = group[name];
    result[name] = state === undefined ? undefined : mapState(state);
  }
  return result;
}

function mapStateIOS(state: ITabItemStateAppearanceIOS): IAppearanceRecord {
  return {
    ...withProcessedColors(state, IOS_STATE_COLORS),
    tabBarItemTitleFontWeight: fontWeightText(state.tabBarItemTitleFontWeight),
  };
}

function mapItemIOS(
  item: ITabItemAppearanceIOS | undefined,
): IAppearanceRecord | undefined {
  return item === undefined ? undefined : withMappedStates(item, mapStateIOS);
}

export function resolveTabAppearanceIOS(
  appearance: ITabAppearanceIOS | undefined,
): IAppearanceRecord | undefined {
  if (!appearance) return undefined;
  return {
    ...withProcessedColors(appearance, IOS_BAR_COLORS),
    stacked: mapItemIOS(appearance.stacked),
    inline: mapItemIOS(appearance.inline),
    compactInline: mapItemIOS(appearance.compactInline),
  };
}

export function resolveTabAppearanceAndroid(
  appearance: ITabAppearanceAndroid | undefined,
): IAppearanceRecord | undefined {
  if (!appearance) return undefined;
  return {
    ...withProcessedColors(appearance, ANDROID_BAR_COLORS),
    ...withMappedStates(appearance, state =>
      withProcessedColors(state, ANDROID_STATE_COLORS),
    ),
    tabBarItemTitleFontWeight: fontWeightText(
      appearance.tabBarItemTitleFontWeight,
    ),
  };
}

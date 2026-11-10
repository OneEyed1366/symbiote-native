import type { IScreenOptions } from '@symbiote-native/navigation/angular';
import { isParamsRecord, readChoice, readFlag } from '../read-params';

type IStatusBarStyle = NonNullable<IScreenOptions['statusBarStyle']>;
type IStatusBarAnimation = NonNullable<IScreenOptions['statusBarAnimation']>;
type IScreenOrientation = NonNullable<IScreenOptions['screenOrientation']>;
type IHeaderStyle = NonNullable<IScreenOptions['headerUserInterfaceStyle']>;
type IScrollEdges = NonNullable<IScreenOptions['scrollEdgeEffects']>;
type IScrollEdgeEffect = NonNullable<IScrollEdges['top']>;
type ISafeAreaEdges = NonNullable<IScreenOptions['safeAreaEdges']>;

export const STATUS_BAR_STYLES = [
  'auto',
  'light',
  'dark',
  'inverted',
] as const satisfies readonly IStatusBarStyle[];

export const STATUS_BAR_ANIMATIONS = [
  'none',
  'fade',
  'slide',
] as const satisfies readonly IStatusBarAnimation[];

export const SCREEN_ORIENTATIONS = [
  'default',
  'all',
  'portrait',
  'portrait_up',
  'portrait_down',
  'landscape',
  'landscape_left',
  'landscape_right',
] as const satisfies readonly IScreenOrientation[];

// `default` leaves the edge to the platform, the other two decide it
export const EDGE_MODES = ['default', 'inset', 'ignore'] as const;

export const SCROLL_EDGE_EFFECTS = [
  'automatic',
  'hard',
  'soft',
  'hidden',
] as const satisfies readonly IScrollEdgeEffect[];

export const HEADER_STYLES = [
  'unspecified',
  'light',
  'dark',
] as const satisfies readonly IHeaderStyle[];

// The four Android opt-outs are one row: at most one edge is switched off
export const DISABLED_INSETS = [
  'none',
  'top',
  'right',
  'bottom',
  'left',
] as const;

type IEdgeMode = (typeof EDGE_MODES)[number];
type IDisabledInset = (typeof DISABLED_INSETS)[number];

// The whole panel state, written to the route params and read back by the options resolver
export type IInsetsSettings = {
  statusBarStyle: IStatusBarStyle;
  isStatusBarHidden: boolean;
  statusBarAnimation: IStatusBarAnimation;
  screenOrientation: IScreenOrientation;
  isHomeIndicatorHidden: boolean;
  isNavigationBarHidden: boolean;
  topEdge: IEdgeMode;
  rightEdge: IEdgeMode;
  bottomEdge: IEdgeMode;
  leftEdge: IEdgeMode;
  topEffect: IScrollEdgeEffect;
  bottomEffect: IScrollEdgeEffect;
  sideEffect: IScrollEdgeEffect;
  disabledInset: IDisabledInset;
  headerStyle: IHeaderStyle;
  isLegacyColorSet: boolean;
};

export const DEFAULT_INSETS_SETTINGS: IInsetsSettings = {
  statusBarStyle: 'auto',
  isStatusBarHidden: false,
  statusBarAnimation: 'fade',
  screenOrientation: 'default',
  isHomeIndicatorHidden: false,
  isNavigationBarHidden: false,
  topEdge: 'default',
  rightEdge: 'default',
  bottomEdge: 'default',
  leftEdge: 'default',
  topEffect: 'automatic',
  bottomEffect: 'automatic',
  sideEffect: 'automatic',
  disabledInset: 'none',
  headerStyle: 'dark',
  isLegacyColorSet: false,
};

const LEGACY_COLOR = '#e5484d';

function readBars(params: Record<string, unknown>): Partial<IInsetsSettings> {
  const base = DEFAULT_INSETS_SETTINGS;
  return {
    statusBarStyle: readChoice(
      params,
      'statusBarStyle',
      STATUS_BAR_STYLES,
      base.statusBarStyle,
    ),
    isStatusBarHidden: readFlag(
      params,
      'isStatusBarHidden',
      base.isStatusBarHidden,
    ),
    statusBarAnimation: readChoice(
      params,
      'statusBarAnimation',
      STATUS_BAR_ANIMATIONS,
      base.statusBarAnimation,
    ),
    screenOrientation: readChoice(
      params,
      'screenOrientation',
      SCREEN_ORIENTATIONS,
      base.screenOrientation,
    ),
    isHomeIndicatorHidden: readFlag(
      params,
      'isHomeIndicatorHidden',
      base.isHomeIndicatorHidden,
    ),
    isNavigationBarHidden: readFlag(
      params,
      'isNavigationBarHidden',
      base.isNavigationBarHidden,
    ),
  };
}

function readInsets(params: Record<string, unknown>): Partial<IInsetsSettings> {
  const base = DEFAULT_INSETS_SETTINGS;
  return {
    topEdge: readChoice(params, 'topEdge', EDGE_MODES, base.topEdge),
    rightEdge: readChoice(params, 'rightEdge', EDGE_MODES, base.rightEdge),
    bottomEdge: readChoice(params, 'bottomEdge', EDGE_MODES, base.bottomEdge),
    leftEdge: readChoice(params, 'leftEdge', EDGE_MODES, base.leftEdge),
    topEffect: readChoice(
      params,
      'topEffect',
      SCROLL_EDGE_EFFECTS,
      base.topEffect,
    ),
    bottomEffect: readChoice(
      params,
      'bottomEffect',
      SCROLL_EDGE_EFFECTS,
      base.bottomEffect,
    ),
    sideEffect: readChoice(
      params,
      'sideEffect',
      SCROLL_EDGE_EFFECTS,
      base.sideEffect,
    ),
    disabledInset: readChoice(
      params,
      'disabledInset',
      DISABLED_INSETS,
      base.disabledInset,
    ),
    headerStyle: readChoice(
      params,
      'headerStyle',
      HEADER_STYLES,
      base.headerStyle,
    ),
    isLegacyColorSet: readFlag(
      params,
      'isLegacyColorSet',
      base.isLegacyColorSet,
    ),
  };
}

export function readInsetsSettings(params: unknown): IInsetsSettings {
  if (!isParamsRecord(params)) return DEFAULT_INSETS_SETTINGS;
  return {
    ...DEFAULT_INSETS_SETTINGS,
    ...readBars(params),
    ...readInsets(params),
  };
}

const EDGE_FLAG: Record<IEdgeMode, boolean | undefined> = {
  default: undefined,
  inset: true,
  ignore: false,
};

function safeAreaEdgesOf(
  settings: IInsetsSettings,
): ISafeAreaEdges | undefined {
  const edges: ISafeAreaEdges = {
    top: EDGE_FLAG[settings.topEdge],
    right: EDGE_FLAG[settings.rightEdge],
    bottom: EDGE_FLAG[settings.bottomEdge],
    left: EDGE_FLAG[settings.leftEdge],
  };
  const changed = Object.entries(edges).filter(
    ([, flag]) => flag !== undefined,
  );
  return changed.length === 0 ? undefined : Object.fromEntries(changed);
}

function scrollEdgesOf(settings: IInsetsSettings): IScrollEdges | undefined {
  const { topEffect, bottomEffect, sideEffect } = settings;
  const isAutomatic = [topEffect, bottomEffect, sideEffect].every(
    effect => effect === 'automatic',
  );
  if (isAutomatic) return undefined;
  return {
    top: topEffect,
    bottom: bottomEffect,
    left: sideEffect,
    right: sideEffect,
  };
}

function legacyColorsOf(settings: IInsetsSettings): IScreenOptions {
  if (!settings.isLegacyColorSet) return {};
  return {
    statusBarColor: LEGACY_COLOR,
    statusBarTranslucent: true,
    navigationBarColor: LEGACY_COLOR,
    navigationBarTranslucent: true,
    headerTopInsetEnabled: false,
  };
}

function flagIf(settings: IInsetsSettings, inset: IDisabledInset) {
  return settings.disabledInset === inset ? true : undefined;
}

function statusBarOptionsOf(settings: IInsetsSettings): IScreenOptions {
  return {
    statusBarStyle: settings.statusBarStyle,
    statusBarHidden: settings.isStatusBarHidden,
    statusBarAnimation: settings.statusBarAnimation,
  };
}

// iOS raises a red box for any status bar option while the app keeps the view controller based
// status bar appearance key off, so the caller says whether the host app can take them
export function insetsOptionsOf(
  settings: IInsetsSettings,
  isStatusBarSettable = true,
): IScreenOptions {
  return {
    ...(isStatusBarSettable ? statusBarOptionsOf(settings) : {}),
    screenOrientation: settings.screenOrientation,
    homeIndicatorHidden: settings.isHomeIndicatorHidden,
    navigationBarHidden: settings.isNavigationBarHidden,
    safeAreaEdges: safeAreaEdgesOf(settings),
    scrollEdgeEffects: scrollEdgesOf(settings),
    disableTopInsetApplication: flagIf(settings, 'top'),
    disableRightInsetApplication: flagIf(settings, 'right'),
    disableBottomInsetApplication: flagIf(settings, 'bottom'),
    disableLeftInsetApplication: flagIf(settings, 'left'),
    headerUserInterfaceStyle: settings.headerStyle,
    ...legacyColorsOf(settings),
  };
}

import type { IScreenOptions } from '@symbiote-native/navigation/solid';
import { isParamsRecord, readChoice, readFlag, readText } from '../read-params';

type IBackDisplayMode = NonNullable<
  IScreenOptions['headerBackButtonDisplayMode']
>;
type IBlurEffect = NonNullable<IScreenOptions['headerBlurEffect']>;
type IPriority = NonNullable<IScreenOptions['headerLeftVisibilityPriority']>;
type IDirection = NonNullable<IScreenOptions['headerDirection']>;

// Values shared by several choice lists below, each one named once
const NONE = 'none';
export const VIEW_KIND = 'view';
const DEFAULT = 'default';
const CUSTOM = 'custom';
const STANDARD = 'standard';

export const BACK_DISPLAY_MODES = [
  DEFAULT,
  'minimal',
  'generic',
] as const satisfies readonly IBackDisplayMode[];

export const BLUR_EFFECTS = [
  NONE,
  'extraLight',
  'light',
  'dark',
  'regular',
  'prominent',
  'systemUltraThinMaterial',
  'systemThinMaterial',
  'systemMaterial',
  'systemThickMaterial',
  'systemChromeMaterial',
  'systemUltraThinMaterialLight',
  'systemThinMaterialLight',
  'systemMaterialLight',
  'systemThickMaterialLight',
  'systemChromeMaterialLight',
  'systemUltraThinMaterialDark',
  'systemThinMaterialDark',
  'systemMaterialDark',
  'systemThickMaterialDark',
  'systemChromeMaterialDark',
] as const satisfies readonly IBlurEffect[];

export const PRIORITIES = [
  'low',
  STANDARD,
  'high',
] as const satisfies readonly IPriority[];

export const TITLE_KINDS = ['text', VIEW_KIND] as const;
export const LEFT_KINDS = ['back', VIEW_KIND] as const;
export const RIGHT_KINDS = [NONE, VIEW_KIND] as const;
export const BACK_TITLES = ['previous', CUSTOM] as const;
export const DIRECTIONS = [DEFAULT, 'ltr', 'rtl'] as const;

type IBackTitle = (typeof BACK_TITLES)[number];
type IDirectionChoice = (typeof DIRECTIONS)[number];

// The whole panel state, written to the route params and read back by the options resolver
export type IHeaderViewsSettings = {
  title: (typeof TITLE_KINDS)[number];
  left: (typeof LEFT_KINDS)[number];
  right: (typeof RIGHT_KINDS)[number];
  backTitle: IBackTitle;
  backDisplayMode: IBackDisplayMode;
  isBackVisible: boolean;
  isBackMenuEnabled: boolean;
  isBackImageCustom: boolean;
  isTranslucent: boolean;
  blur: IBlurEffect;
  isShadowVisible: boolean;
  isLargeTitle: boolean;
  isLargeShadowVisible: boolean;
  isTitleStyled: boolean;
  direction: IDirectionChoice;
  leftPriority: IPriority;
  rightPriority: IPriority;
  isLeftBackgroundVisible: boolean;
  isRightBackgroundVisible: boolean;
  // The header view tapped last, a view cannot show it itself so the body does
  lastTap: string;
};

export const DEFAULT_HEADER_VIEWS_SETTINGS: IHeaderViewsSettings = {
  title: 'text',
  left: 'back',
  right: NONE,
  backTitle: 'previous',
  backDisplayMode: DEFAULT,
  isBackVisible: true,
  isBackMenuEnabled: true,
  isBackImageCustom: false,
  isTranslucent: false,
  blur: NONE,
  isShadowVisible: true,
  isLargeTitle: false,
  isLargeShadowVisible: true,
  isTitleStyled: false,
  direction: DEFAULT,
  leftPriority: STANDARD,
  rightPriority: STANDARD,
  isLeftBackgroundVisible: true,
  isRightBackgroundVisible: true,
  lastTap: 'nothing yet',
};

const BACK_TITLE_TEXT: Record<IBackTitle, string | undefined> = {
  previous: undefined,
  custom: 'Menu',
};

const DIRECTION_OPTION: Record<IDirectionChoice, IDirection | undefined> = {
  default: undefined,
  ltr: 'ltr',
  rtl: 'rtl',
};

const STYLED_TITLE_SIZE = 20;
const STYLED_BACK_TITLE_SIZE = 12;
const STYLED_LARGE_TITLE_COLOR = '#f5a524';

export function readHeaderViewsSettings(params: unknown): IHeaderViewsSettings {
  const base = DEFAULT_HEADER_VIEWS_SETTINGS;
  if (!isParamsRecord(params)) return base;
  return {
    title: readChoice(params, 'title', TITLE_KINDS, base.title),
    left: readChoice(params, 'left', LEFT_KINDS, base.left),
    right: readChoice(params, 'right', RIGHT_KINDS, base.right),
    backTitle: readChoice(params, 'backTitle', BACK_TITLES, base.backTitle),
    backDisplayMode: readChoice(
      params,
      'backDisplayMode',
      BACK_DISPLAY_MODES,
      base.backDisplayMode,
    ),
    isBackVisible: readFlag(params, 'isBackVisible', base.isBackVisible),
    isBackMenuEnabled: readFlag(
      params,
      'isBackMenuEnabled',
      base.isBackMenuEnabled,
    ),
    isBackImageCustom: readFlag(
      params,
      'isBackImageCustom',
      base.isBackImageCustom,
    ),
    isTranslucent: readFlag(params, 'isTranslucent', base.isTranslucent),
    blur: readChoice(params, 'blur', BLUR_EFFECTS, base.blur),
    isShadowVisible: readFlag(params, 'isShadowVisible', base.isShadowVisible),
    isLargeTitle: readFlag(params, 'isLargeTitle', base.isLargeTitle),
    isLargeShadowVisible: readFlag(
      params,
      'isLargeShadowVisible',
      base.isLargeShadowVisible,
    ),
    isTitleStyled: readFlag(params, 'isTitleStyled', base.isTitleStyled),
    direction: readChoice(params, 'direction', DIRECTIONS, base.direction),
    leftPriority: readChoice(
      params,
      'leftPriority',
      PRIORITIES,
      base.leftPriority,
    ),
    rightPriority: readChoice(
      params,
      'rightPriority',
      PRIORITIES,
      base.rightPriority,
    ),
    isLeftBackgroundVisible: readFlag(
      params,
      'isLeftBackgroundVisible',
      base.isLeftBackgroundVisible,
    ),
    isRightBackgroundVisible: readFlag(
      params,
      'isRightBackgroundVisible',
      base.isRightBackgroundVisible,
    ),
    lastTap: readText(params, 'lastTap', base.lastTap),
  };
}

const OPAQUE_BAR_COLOR = '#0b1622';
const TRANSPARENT_BAR_COLOR = 'transparent';

// A blur is painted behind the bar background, so a translucent bar must have none
export function navBarFillOf(
  settings: IHeaderViewsSettings,
): IScreenOptions['headerStyle'] {
  return {
    backgroundColor: settings.isTranslucent
      ? TRANSPARENT_BAR_COLOR
      : OPAQUE_BAR_COLOR,
  };
}

// The options the settings decide, the views and the image source are added by the screen
export function headerOptionsOf(
  settings: IHeaderViewsSettings,
): IScreenOptions {
  return {
    headerBackTitle: BACK_TITLE_TEXT[settings.backTitle],
    headerBackButtonDisplayMode: settings.backDisplayMode,
    headerBackVisible: settings.isBackVisible,
    headerBackButtonMenuEnabled: settings.isBackMenuEnabled,
    headerTranslucent: settings.isTranslucent,
    headerBlurEffect: settings.blur,
    headerShadowVisible: settings.isShadowVisible,
    headerLargeTitle: settings.isLargeTitle,
    headerLargeTitleShadowVisible: settings.isLargeShadowVisible,
    headerDirection: DIRECTION_OPTION[settings.direction],
    headerLeftVisibilityPriority: settings.leftPriority,
    headerRightVisibilityPriority: settings.rightPriority,
    headerLeftBackgroundVisible: settings.isLeftBackgroundVisible,
    headerRightBackgroundVisible: settings.isRightBackgroundVisible,
    ...(settings.isTitleStyled && {
      headerTitleStyle: { fontSize: STYLED_TITLE_SIZE, fontWeight: 'bold' },
      headerBackTitleStyle: { fontSize: STYLED_BACK_TITLE_SIZE },
      headerLargeTitleStyle: {
        fontSize: STYLED_TITLE_SIZE * 2,
        color: STYLED_LARGE_TITLE_COLOR,
      },
    }),
  };
}

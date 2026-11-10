import type {
  IHeaderBarButtonItem,
  ISearchBarAutoCapitalize,
  ISearchBarOptions,
  ISearchBarPlacement,
} from '@symbiote-native/navigation';
import type { IScreenOptions } from '@symbiote-native/navigation/react';
import { LINE_COLOR } from '../../navigation-lines';
import { isParamsRecord, readChoice, readFlag } from '../read-params';

const NONE = 'none';
const BUTTON = 'button';
const MENU = 'menu';
const SUBMENU = 'submenu';
const ACTION = 'action';
// Keeps what the platform draws, the other cancel texts replace it
const PLATFORM_DEFAULT = 'default';

export const ITEM_KINDS = [NONE, BUTTON, 'badge', MENU, SUBMENU] as const;

export const PLACEMENTS = [
  'automatic',
  'inline',
  'stacked',
  'integrated',
  'integratedButton',
  'integratedCentered',
] as const satisfies readonly ISearchBarPlacement[];

export const AUTO_CAPITALIZE = [
  'systemDefault',
  NONE,
  'words',
  'sentences',
  'characters',
] as const satisfies readonly ISearchBarAutoCapitalize[];

export const COLOR_THEMES = ['dark', 'light', 'accent'] as const;

export const CANCEL_TEXTS = [PLATFORM_DEFAULT, 'Done', 'Close'] as const;

export const INPUT_TYPES = ['text', 'phone', 'number', 'email'] as const;

type IItemKind = (typeof ITEM_KINDS)[number];
type IColorTheme = (typeof COLOR_THEMES)[number];
type ICancelText = (typeof CANCEL_TEXTS)[number];
type IInputType = (typeof INPUT_TYPES)[number];

// The whole panel state, written to the route params and read back by the options resolver
export type IHeaderOptionsSettings = {
  isLargeTitle: boolean;
  isTranslucent: boolean;
  leftItems: IItemKind;
  rightItems: IItemKind;
  isSpaced: boolean;
  placement: ISearchBarPlacement;
  autoCapitalize: ISearchBarAutoCapitalize;
  cancelText: ICancelText;
  colorTheme: IColorTheme;
  isHideWhenScrolling: boolean;
  isObscureBackground: boolean;
  isHideNavigationBar: boolean;
  isAutoFocus: boolean;
  isAllowToolbarIntegration: boolean;
  inputType: IInputType;
  isShowHintSearchIcon: boolean;
  isDisableBackButtonOverride: boolean;
};

export const DEFAULT_HEADER_OPTIONS_SETTINGS: IHeaderOptionsSettings = {
  isLargeTitle: true,
  isTranslucent: true,
  leftItems: BUTTON,
  rightItems: MENU,
  isSpaced: false,
  placement: 'automatic',
  autoCapitalize: NONE,
  cancelText: PLATFORM_DEFAULT,
  colorTheme: 'dark',
  isHideWhenScrolling: false,
  isObscureBackground: false,
  isHideNavigationBar: false,
  isAutoFocus: false,
  isAllowToolbarIntegration: false,
  inputType: 'text',
  isShowHintSearchIcon: true,
  isDisableBackButtonOverride: false,
};

const BASE = DEFAULT_HEADER_OPTIONS_SETTINGS;

function readHeader(
  params: Record<string, unknown>,
): Partial<IHeaderOptionsSettings> {
  return {
    isLargeTitle: readFlag(params, 'isLargeTitle', BASE.isLargeTitle),
    isTranslucent: readFlag(params, 'isTranslucent', BASE.isTranslucent),
    leftItems: readChoice(params, 'leftItems', ITEM_KINDS, BASE.leftItems),
    rightItems: readChoice(params, 'rightItems', ITEM_KINDS, BASE.rightItems),
    isSpaced: readFlag(params, 'isSpaced', BASE.isSpaced),
  };
}

function readSearch(
  params: Record<string, unknown>,
): Partial<IHeaderOptionsSettings> {
  return {
    placement: readChoice(params, 'placement', PLACEMENTS, BASE.placement),
    autoCapitalize: readChoice(
      params,
      'autoCapitalize',
      AUTO_CAPITALIZE,
      BASE.autoCapitalize,
    ),
    cancelText: readChoice(params, 'cancelText', CANCEL_TEXTS, BASE.cancelText),
    colorTheme: readChoice(params, 'colorTheme', COLOR_THEMES, BASE.colorTheme),
    isHideWhenScrolling: readFlag(
      params,
      'isHideWhenScrolling',
      BASE.isHideWhenScrolling,
    ),
    isObscureBackground: readFlag(
      params,
      'isObscureBackground',
      BASE.isObscureBackground,
    ),
    isHideNavigationBar: readFlag(
      params,
      'isHideNavigationBar',
      BASE.isHideNavigationBar,
    ),
    isAutoFocus: readFlag(params, 'isAutoFocus', BASE.isAutoFocus),
    isAllowToolbarIntegration: readFlag(
      params,
      'isAllowToolbarIntegration',
      BASE.isAllowToolbarIntegration,
    ),
  };
}

function readAndroid(
  params: Record<string, unknown>,
): Partial<IHeaderOptionsSettings> {
  return {
    inputType: readChoice(params, 'inputType', INPUT_TYPES, BASE.inputType),
    isShowHintSearchIcon: readFlag(
      params,
      'isShowHintSearchIcon',
      BASE.isShowHintSearchIcon,
    ),
    isDisableBackButtonOverride: readFlag(
      params,
      'isDisableBackButtonOverride',
      BASE.isDisableBackButtonOverride,
    ),
  };
}

export function readHeaderOptionsSettings(
  params: unknown,
): IHeaderOptionsSettings {
  if (!isParamsRecord(params)) return BASE;
  return {
    ...BASE,
    ...readHeader(params),
    ...readSearch(params),
    ...readAndroid(params),
  };
}

const SPACING = 16;
const BADGE_COUNT = '3';

type IReport = (text: string) => void;
type IMenuEntries = Extract<
  IHeaderBarButtonItem,
  { type: 'menu' }
>['menu']['items'];

function actionsOf(report: IReport): IMenuEntries {
  return [
    { type: ACTION, title: 'Share', onPress: () => report('menu: Share') },
    {
      type: ACTION,
      title: 'Delete',
      destructive: true,
      onPress: () => report('menu: Delete'),
    },
  ];
}

function sortSubmenuOf(report: IReport): IMenuEntries {
  return [
    {
      type: SUBMENU,
      title: 'Sort by',
      items: [
        { type: ACTION, title: 'Name', onPress: () => report('submenu: Name') },
        { type: ACTION, title: 'Date', onPress: () => report('submenu: Date') },
      ],
    },
    ...actionsOf(report),
  ];
}

function menuOf(items: IMenuEntries): IHeaderBarButtonItem {
  return { type: MENU, title: 'More', menu: { title: 'Actions', items } };
}

// One builder per kind, `none` builds nothing so the side keeps the platform default
const ITEM_BUILDERS: Record<
  IItemKind,
  (report: IReport) => IHeaderBarButtonItem[]
> = {
  none: () => [],
  button: report => [
    { type: BUTTON, title: 'Info', onPress: () => report('button: Info') },
  ],
  badge: report => [
    {
      type: BUTTON,
      title: 'Inbox',
      badge: { value: BADGE_COUNT },
      onPress: () => report(`button: Inbox, badge ${BADGE_COUNT}`),
    },
  ],
  menu: report => [menuOf(actionsOf(report))],
  submenu: report => [menuOf(sortSubmenuOf(report))],
};

// `isSpaced` puts a gap and a second button after the first item
export function barItemsOf(
  kind: IItemKind,
  isSpaced: boolean,
  report: IReport,
): IHeaderBarButtonItem[] | undefined {
  const items = ITEM_BUILDERS[kind](report);
  if (items.length === 0) return undefined;
  if (!isSpaced) return items;
  return [
    ...items,
    { type: 'spacing', spacing: SPACING },
    { type: BUTTON, title: 'Second', onPress: () => report('button: Second') },
  ];
}

const DARK_COLORS = {
  barTintColor: '#13243a',
  tintColor: LINE_COLOR.presentation,
  textColor: '#ffffff',
  hintTextColor: '#64748b',
  headerIconColor: LINE_COLOR.presentation,
};

const COLORS_BY_THEME: Record<IColorTheme, typeof DARK_COLORS> = {
  dark: DARK_COLORS,
  light: {
    barTintColor: '#e2e8f0',
    tintColor: '#0b6fa4',
    textColor: '#0b1622',
    hintTextColor: '#475569',
    headerIconColor: '#0b6fa4',
  },
  accent: {
    barTintColor: LINE_COLOR.presentation,
    tintColor: '#0b1622',
    textColor: '#0b1622',
    hintTextColor: '#0b1622',
    headerIconColor: '#0b1622',
  },
};

// The static half of the search bar, the callbacks and the ref are added by the screen
export function searchBarOptionsOf(
  settings: IHeaderOptionsSettings,
): ISearchBarOptions {
  return {
    placeholder: 'Search demo…',
    placement: settings.placement,
    autoCapitalize: settings.autoCapitalize,
    cancelButtonText:
      settings.cancelText === PLATFORM_DEFAULT
        ? undefined
        : settings.cancelText,
    hideWhenScrolling: settings.isHideWhenScrolling,
    obscureBackground: settings.isObscureBackground,
    hideNavigationBar: settings.isHideNavigationBar,
    autoFocus: settings.isAutoFocus,
    allowToolbarIntegration: settings.isAllowToolbarIntegration,
    inputType: settings.inputType,
    shouldShowHintSearchIcon: settings.isShowHintSearchIcon,
    disableBackButtonOverride: settings.isDisableBackButtonOverride,
    ...COLORS_BY_THEME[settings.colorTheme],
  };
}

export function headerChromeOptionsOf(
  settings: IHeaderOptionsSettings,
  report: IReport,
): IScreenOptions {
  return {
    headerLargeTitle: settings.isLargeTitle,
    headerTranslucent: settings.isTranslucent,
    headerLeftBarButtonItems: barItemsOf(
      settings.leftItems,
      settings.isSpaced,
      report,
    ),
    headerRightBarButtonItems: barItemsOf(
      settings.rightItems,
      settings.isSpaced,
      report,
    ),
  };
}

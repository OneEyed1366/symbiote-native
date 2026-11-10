// `TabsScreen` of react-native-screens: one tab of the native tab bar, one view per platform
// Core folds the options into the props each view reads, an adapter renders the content inside

import type { IColorValue } from '@symbiote-native/engine';
import {
  resolveTabAppearanceAndroid,
  resolveTabAppearanceIOS,
} from './native-tab-appearance';
import type {
  ITabAppearanceAndroid,
  ITabAppearanceIOS,
} from './native-tab-appearance';
import { resolveTabIconsAndroid, resolveTabIconsIOS } from './native-tab-icons';
import type { ITabIconAndroid, ITabIconIOS } from './native-tab-icons';
import { ANDROID_PLATFORM, IOS_PLATFORM } from './platform-names';
import { withoutUndefined } from './without-undefined';

export type ITabOrientation =
  | 'inherit'
  | 'all'
  | 'allButUpsideDown'
  | 'portrait'
  | 'portraitUp'
  | 'portraitDown'
  | 'landscape'
  | 'landscapeLeft'
  | 'landscapeRight';

export type ITabSystemItem =
  | 'bookmarks'
  | 'contacts'
  | 'downloads'
  | 'favorites'
  | 'featured'
  | 'history'
  | 'more'
  | 'mostRecent'
  | 'mostViewed'
  | 'recents'
  | 'search'
  | 'topRated';

export type ITabRole = 'search';
export type ITabUserInterfaceStyle = 'unspecified' | 'light' | 'dark';

export type ITabSpecialEffects = {
  repeatedTabSelection?: { popToRoot?: boolean; scrollToTop?: boolean };
};

export type INativeTabScreenIOS = {
  icon?: ITabIconIOS;
  selectedIcon?: ITabIconIOS;
  standardAppearance?: ITabAppearanceIOS;
  scrollEdgeAppearance?: ITabAppearanceIOS;
  systemItem?: ITabSystemItem;
  role?: ITabRole;
  automaticallyActivatesSearch?: boolean;
  overrideScrollViewContentInsetAdjustmentBehavior?: boolean;
  experimental_userInterfaceStyle?: ITabUserInterfaceStyle;
};

export type INativeTabScreenAndroid = {
  icon?: ITabIconAndroid;
  selectedIcon?: ITabIconAndroid;
  standardAppearance?: ITabAppearanceAndroid;
};

export type INativeTabScreenOptions = {
  screenKey: string;
  preventNativeSelection?: boolean;
  style?: { backgroundColor?: IColorValue };
  title?: string;
  badgeValue?: string;
  specialEffects?: ITabSpecialEffects;
  orientation?: ITabOrientation;
  testID?: string;
  accessibilityLabel?: string;
  tabBarItemTestID?: string;
  tabBarItemAccessibilityLabel?: string;
  onWillAppear?: () => void;
  onDidAppear?: () => void;
  onWillDisappear?: () => void;
  onDidDisappear?: () => void;
  ios?: INativeTabScreenIOS;
  android?: INativeTabScreenAndroid;
};

export type INativeTabScreen = {
  viewName: string;
  props: Record<string, unknown>;
};

const IOS_SCREEN_VIEW_NAME = 'RNSTabsScreenIOS';
const ANDROID_SCREEN_VIEW_NAME = 'RNSTabsScreenAndroid';
const PLAIN_VIEW_NAME = 'view';
const SCREEN_FILL = {
  position: 'absolute',
  flex: 1,
  width: '100%',
  height: '100%',
};

const PLAIN_KEYS = [
  'screenKey',
  'preventNativeSelection',
  'title',
  'badgeValue',
  'specialEffects',
  'testID',
  'accessibilityLabel',
  'tabBarItemTestID',
  'tabBarItemAccessibilityLabel',
] as const satisfies readonly (keyof INativeTabScreenOptions)[];

const LIFECYCLE_KEYS = [
  'onWillAppear',
  'onDidAppear',
  'onWillDisappear',
  'onDidDisappear',
] as const satisfies readonly (keyof INativeTabScreenOptions)[];

// Native fires lifecycle events with an empty payload, the app callback takes none
function wireLifecycle(callback: (() => void) | undefined) {
  return callback === undefined ? undefined : () => callback();
}

function resolveSharedProps(
  options: INativeTabScreenOptions,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    collapsable: false,
    style: [options.style, SCREEN_FILL],
  };
  for (const key of PLAIN_KEYS) props[key] = options[key];
  for (const key of LIFECYCLE_KEYS) props[key] = wireLifecycle(options[key]);
  return withoutUndefined(props);
}

function resolveIosProps(
  options: INativeTabScreenOptions,
): Record<string, unknown> {
  const ios = options.ios ?? {};
  return withoutUndefined({
    isTitleUndefined: options.title === undefined,
    orientation: options.orientation,
    systemItem: ios.systemItem,
    tabRole: ios.role,
    automaticallyActivatesSearch: ios.automaticallyActivatesSearch,
    overrideScrollViewContentInsetAdjustmentBehavior:
      ios.overrideScrollViewContentInsetAdjustmentBehavior,
    userInterfaceStyle: ios.experimental_userInterfaceStyle,
    standardAppearance: resolveTabAppearanceIOS(ios.standardAppearance),
    scrollEdgeAppearance: resolveTabAppearanceIOS(ios.scrollEdgeAppearance),
    ...resolveTabIconsIOS(ios.icon, ios.selectedIcon),
  });
}

function resolveAndroidProps(
  options: INativeTabScreenOptions,
): Record<string, unknown> {
  const android = options.android ?? {};
  return withoutUndefined({
    standardAppearance: resolveTabAppearanceAndroid(android.standardAppearance),
    ...resolveTabIconsAndroid(android.icon, android.selectedIcon),
  });
}

export function resolveNativeTabScreen(
  options: INativeTabScreenOptions,
  os: string,
): INativeTabScreen {
  if (os === IOS_PLATFORM) {
    return {
      viewName: IOS_SCREEN_VIEW_NAME,
      props: { ...resolveSharedProps(options), ...resolveIosProps(options) },
    };
  }
  if (os === ANDROID_PLATFORM) {
    return {
      viewName: ANDROID_SCREEN_VIEW_NAME,
      props: {
        ...resolveSharedProps(options),
        ...resolveAndroidProps(options),
      },
    };
  }
  return {
    viewName: PLAIN_VIEW_NAME,
    props: { style: [options.style, SCREEN_FILL] },
  };
}

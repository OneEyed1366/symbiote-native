// `TabsHost` of react-native-screens: the native tab bar host, one view per platform
// Core folds the options into the props each host reads, an adapter renders the screens inside

import type { ISymbioteEvent } from '@symbiote-native/engine';
import {
  readMoreTabSelected,
  resolveNativeTabsEvents,
  wireTabsEvent,
} from './native-tabs-events';
import type {
  IMoreTabSelectedEvent,
  INativeTabsEventCallbacks,
} from './native-tabs-events';
import { ANDROID_PLATFORM, IOS_PLATFORM } from './platform-names';
import { withoutUndefined } from './without-undefined';

export type ITabsColorScheme = 'inherit' | 'light' | 'dark';
export type ITabsDirection = 'inherit' | 'ltr' | 'rtl';
export type ITabBarMinimizeBehavior =
  'automatic' | 'never' | 'onScrollDown' | 'onScrollUp';
export type ITabBarControllerMode = 'automatic' | 'tabBar' | 'tabSidebar';
export type ITabBarSidebarPlacement = 'automatic' | 'sidebar' | 'tabBar';

export type INativeTabsHostIOS = {
  tabBarHiddenAnimationEnabled?: boolean;
  tabBarTintColor?: unknown;
  tabBarMinimizeBehavior?: ITabBarMinimizeBehavior;
  tabBarControllerMode?: ITabBarControllerMode;
  tabBarSidebarPreferredPlacement?: ITabBarSidebarPlacement;
  bottomAccessoryHidden?: boolean;
  prominentScreenKey?: string;
  onMoreTabSelected?: (event: IMoreTabSelectedEvent) => void;
};

export type INativeTabsHostAndroid = {
  tabBarRespectsIMEInsets?: boolean;
};

export type INativeTabsHostOptions = INativeTabsEventCallbacks & {
  selectedScreenKey: string;
  baseProvenance: number;
  rejectStaleNavStateUpdates?: boolean;
  tabBarHidden?: boolean;
  colorScheme?: ITabsColorScheme;
  direction?: ITabsDirection;
  nativeContainerStyle?: { backgroundColor?: unknown };
  ios?: INativeTabsHostIOS;
  android?: INativeTabsHostAndroid;
};

export type INativeTabsHost = {
  viewName: string;
  props: Record<string, unknown>;
};

const IOS_HOST_VIEW_NAME = 'RNSTabsHostIOS';
const ANDROID_HOST_VIEW_NAME = 'RNSTabsHostAndroid';
const PLAIN_VIEW_NAME = 'view';
const FILL_PARENT = { flex: 1, width: '100%', height: '100%' };

type IMoreTabHandler = ((event: ISymbioteEvent) => void) | undefined;

function resolveIosProps(
  ios: INativeTabsHostIOS,
  direction: ITabsDirection | undefined,
): Record<string, unknown> {
  const { onMoreTabSelected, ...plain } = ios;
  const onMore: IMoreTabHandler = wireTabsEvent(
    onMoreTabSelected,
    readMoreTabSelected,
  );
  return withoutUndefined({
    ...plain,
    layoutDirection: direction,
    onMoreTabSelected: onMore,
  });
}

function resolveSharedProps(
  options: INativeTabsHostOptions,
): Record<string, unknown> {
  return withoutUndefined({
    navStateRequest: {
      selectedScreenKey: options.selectedScreenKey,
      baseProvenance: options.baseProvenance,
    },
    rejectStaleNavStateUpdates: options.rejectStaleNavStateUpdates,
    tabBarHidden: options.tabBarHidden,
    colorScheme: options.colorScheme,
    nativeContainerBackgroundColor:
      options.nativeContainerStyle?.backgroundColor,
    ...resolveNativeTabsEvents(options),
  });
}

export function resolveNativeTabsHost(
  options: INativeTabsHostOptions,
  os: string,
): INativeTabsHost {
  if (os === IOS_PLATFORM) {
    return {
      viewName: IOS_HOST_VIEW_NAME,
      props: {
        style: [FILL_PARENT],
        ...resolveSharedProps(options),
        ...resolveIosProps(options.ios ?? {}, options.direction),
      },
    };
  }
  if (os === ANDROID_PLATFORM) {
    return {
      viewName: ANDROID_HOST_VIEW_NAME,
      props: {
        style: [
          FILL_PARENT,
          withoutUndefined({ direction: options.direction }),
        ],
        ...resolveSharedProps(options),
        ...withoutUndefined({ ...options.android }),
      },
    };
  }
  return { viewName: PLAIN_VIEW_NAME, props: { style: [FILL_PARENT] } };
}

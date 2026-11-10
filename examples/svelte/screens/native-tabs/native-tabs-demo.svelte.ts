import { getContext, hasContext, setContext } from 'svelte';
import type { INativeTabProps } from '@symbiote-native/navigation/svelte';

type IHostIos = NonNullable<INativeTabProps['ios']>;
type IMinimizeBehavior = NonNullable<IHostIos['tabBarMinimizeBehavior']>;
type IControllerMode = NonNullable<IHostIos['tabBarControllerMode']>;
type ISidebarPlacement = NonNullable<
  IHostIos['tabBarSidebarPreferredPlacement']
>;
type IColorScheme = NonNullable<INativeTabProps['colorScheme']>;
type IDirection = NonNullable<INativeTabProps['direction']>;

export const MINIMIZE_OPTIONS = [
  'automatic',
  'never',
  'onScrollDown',
  'onScrollUp',
] as const satisfies readonly IMinimizeBehavior[];

export const CONTROLLER_MODE_OPTIONS = [
  'automatic',
  'tabBar',
  'tabSidebar',
] as const satisfies readonly IControllerMode[];

export const SIDEBAR_PLACEMENT_OPTIONS = [
  'automatic',
  'sidebar',
  'tabBar',
] as const satisfies readonly ISidebarPlacement[];

export const SCHEME_OPTIONS = [
  'inherit',
  'light',
  'dark',
] as const satisfies readonly IColorScheme[];

export const DIRECTION_OPTIONS = [
  'inherit',
  'ltr',
  'rtl',
] as const satisfies readonly IDirection[];

const NO_BADGE = 'none';

// `none` clears the badge, the others are the text the Inbox tab shows
export const BADGE_OPTIONS = [NO_BADGE, '3', '12345', 'new'] as const;

export type IBadgeOption = (typeof BADGE_OPTIONS)[number];

export function badgeValueOf(badge: IBadgeOption): string | undefined {
  return badge === NO_BADGE ? undefined : badge;
}

export type INativeTabsSettings = {
  isBarHidden: boolean;
  isTinted: boolean;
  minimize: IMinimizeBehavior;
  isAccessoryShown: boolean;
  controllerMode: IControllerMode;
  sidebarPlacement: ISidebarPlacement;
  scheme: IColorScheme;
  direction: IDirection;
  badge: IBadgeOption;
  isLocked: boolean;
  isScrollToTop: boolean;
};

const INITIAL_SETTINGS: INativeTabsSettings = {
  isBarHidden: false,
  isTinted: false,
  minimize: 'automatic',
  isAccessoryShown: true,
  controllerMode: 'automatic',
  sidebarPlacement: 'automatic',
  scheme: 'inherit',
  direction: 'inherit',
  badge: '3',
  isLocked: true,
  isScrollToTop: true,
};

const LOG_LIMIT = 10;

type INativeTabsDemo = {
  readonly settings: INativeTabsSettings;
  update: (patch: Partial<INativeTabsSettings>) => void;
  // Newest line first
  readonly log: readonly string[];
  logEvent: (line: string) => void;
};

const demoKey = Symbol('native-tabs-demo');

// Settings and the event log live above the tab bar, so every tab reads and writes the same ones
export function provideNativeTabsDemo(): INativeTabsDemo {
  let settings = $state.raw(INITIAL_SETTINGS);
  let log = $state.raw<readonly string[]>([]);
  const demo: INativeTabsDemo = {
    get settings() {
      return settings;
    },
    update: patch => {
      settings = { ...settings, ...patch };
    },
    get log() {
      return log;
    },
    logEvent: line => {
      log = [line, ...log].slice(0, LOG_LIMIT);
    },
  };
  setContext(demoKey, demo);
  return demo;
}

export function useNativeTabsDemo(): INativeTabsDemo {
  if (!hasContext(demoKey)) {
    throw new Error('useNativeTabsDemo() needs provideNativeTabsDemo() above');
  }
  return getContext<INativeTabsDemo>(demoKey);
}

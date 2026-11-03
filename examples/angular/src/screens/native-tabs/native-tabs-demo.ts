import { InjectionToken, inject, signal } from '@angular/core';
import type { Provider, Signal } from '@angular/core';
import type { INativeTabsViewHostOptions } from '@symbiote-native/navigation/angular';

type IHostIos = NonNullable<INativeTabsViewHostOptions['ios']>;
type IMinimizeBehavior = NonNullable<IHostIos['tabBarMinimizeBehavior']>;
type IControllerMode = NonNullable<IHostIos['tabBarControllerMode']>;
type ISidebarPlacement = NonNullable<
  IHostIos['tabBarSidebarPreferredPlacement']
>;
type IColorScheme = NonNullable<INativeTabsViewHostOptions['colorScheme']>;
type IDirection = NonNullable<INativeTabsViewHostOptions['direction']>;

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

export type INativeTabsDemo = {
  settings: Signal<INativeTabsSettings>;
  update: (patch: Partial<INativeTabsSettings>) => void;
  // Newest line first
  log: Signal<readonly string[]>;
  logEvent: (line: string) => void;
};

function createNativeTabsDemo(): INativeTabsDemo {
  const settings = signal(INITIAL_SETTINGS);
  const log = signal<readonly string[]>([]);
  return {
    settings: settings.asReadonly(),
    update: patch => settings.update(current => ({ ...current, ...patch })),
    log: log.asReadonly(),
    logEvent: line =>
      log.update(current => [line, ...current].slice(0, LOG_LIMIT)),
  };
}

const NativeTabsDemoToken = new InjectionToken<INativeTabsDemo>(
  'native-tabs-demo',
);

// Settings and the event log live above the tab bar, so every tab reads and writes the same ones
export const nativeTabsDemoProvider: Provider = {
  provide: NativeTabsDemoToken,
  useFactory: createNativeTabsDemo,
};

export function injectNativeTabsDemo(): INativeTabsDemo {
  return inject(NativeTabsDemoToken);
}

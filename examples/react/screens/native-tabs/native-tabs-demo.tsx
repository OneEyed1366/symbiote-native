import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { INativeTabProps } from '@symbiote-native/navigation/react';

type IHostIos = NonNullable<INativeTabProps['ios']>;
type IMinimizeBehavior = NonNullable<IHostIos['tabBarMinimizeBehavior']>;
type IControllerMode = NonNullable<IHostIos['tabBarControllerMode']>;
type ISidebarPlacement = NonNullable<IHostIos['tabBarSidebarPreferredPlacement']>;
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
  settings: INativeTabsSettings;
  update: (patch: Partial<INativeTabsSettings>) => void;
  // Newest line first
  log: readonly string[];
  logEvent: (line: string) => void;
};

const NativeTabsDemoContext = createContext<INativeTabsDemo | undefined>(
  undefined,
);

// Settings and the event log live above the tab bar, so every tab reads and writes the same ones
export function NativeTabsDemoProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [log, setLog] = useState<readonly string[]>([]);
  const update = useCallback(
    (patch: Partial<INativeTabsSettings>) =>
      setSettings(current => ({ ...current, ...patch })),
    [],
  );
  const logEvent = useCallback(
    (line: string) =>
      setLog(current => [line, ...current].slice(0, LOG_LIMIT)),
    [],
  );
  const value = useMemo(
    () => ({ settings, update, log, logEvent }),
    [settings, update, log, logEvent],
  );
  return (
    <NativeTabsDemoContext value={value}>{children}</NativeTabsDemoContext>
  );
}

export function useNativeTabsDemo(): INativeTabsDemo {
  const demo = useContext(NativeTabsDemoContext);
  if (demo === undefined) {
    throw new Error('useNativeTabsDemo() needs a NativeTabsDemoProvider above');
  }
  return demo;
}

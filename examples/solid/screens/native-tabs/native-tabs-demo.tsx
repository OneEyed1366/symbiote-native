import { createContext, createSignal, useContext } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import type { INativeTabProps } from '@symbiote-native/navigation/solid';

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
  settings: Accessor<INativeTabsSettings>;
  update: (patch: Partial<INativeTabsSettings>) => void;
  // Newest line first
  log: Accessor<readonly string[]>;
  logEvent: (line: string) => void;
};

const NativeTabsDemoContext = createContext<INativeTabsDemo | undefined>(
  undefined,
);

// Settings and the event log live above the tab bar, so every tab reads and writes the same ones
export function NativeTabsDemoProvider(props: { children: JSX.Element }) {
  const [settings, setSettings] = createSignal(INITIAL_SETTINGS);
  const [log, setLog] = createSignal<readonly string[]>([]);
  const demo: INativeTabsDemo = {
    settings,
    update: patch => setSettings(current => ({ ...current, ...patch })),
    log,
    logEvent: line =>
      setLog(current => [line, ...current].slice(0, LOG_LIMIT)),
  };
  return (
    <NativeTabsDemoContext.Provider value={demo}>
      {props.children}
    </NativeTabsDemoContext.Provider>
  );
}

export function useNativeTabsDemo(): INativeTabsDemo {
  const demo = useContext(NativeTabsDemoContext);
  if (demo === undefined) {
    throw new Error('useNativeTabsDemo() needs a NativeTabsDemoProvider above');
  }
  return demo;
}

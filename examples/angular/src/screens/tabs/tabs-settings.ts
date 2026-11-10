import type { ITabOptions } from '@symbiote-native/navigation/angular';

const NONE = 'none';
const DEFAULT = 'default';

export const TAB_NAMES = ['Home', 'Search', 'Profile'] as const;
export const ICON_CHOICES = [NONE, 'glyph'] as const;
export const BADGE_CHOICES = [NONE, 'number', 'text'] as const;
export const ACTIVE_CHOICES = [DEFAULT, 'line', 'red'] as const;
export const INACTIVE_CHOICES = [DEFAULT, 'light'] as const;
export const BAR_CHOICES = [DEFAULT, 'dark'] as const;

export type ITabName = (typeof TAB_NAMES)[number];
type IBadgeChoice = (typeof BADGE_CHOICES)[number];

export const LABEL_CHOICES = ['tabBarLabel', 'title', 'routeName'] as const;

export type ITabsSettings = {
  label: (typeof LABEL_CHOICES)[number];
  initial: ITabName;
  // Kept above the `Tab`, so it survives a switch where a counter in a tab does not
  liftedCount: number;
  icon: (typeof ICON_CHOICES)[number];
  badge: IBadgeChoice;
  activeTint: (typeof ACTIVE_CHOICES)[number];
  inactiveTint: (typeof INACTIVE_CHOICES)[number];
  bar: (typeof BAR_CHOICES)[number];
};

export const DEFAULT_TABS_SETTINGS: ITabsSettings = {
  label: 'tabBarLabel',
  initial: 'Home',
  liftedCount: 0,
  icon: 'glyph',
  badge: NONE,
  activeTint: DEFAULT,
  inactiveTint: DEFAULT,
  bar: DEFAULT,
};

// Plain text glyphs, an emoji would look different on every OS
const GLYPH: Record<ITabName, string> = {
  Home: '◆',
  Search: '●',
  Profile: '■',
};

const BADGE_VALUE: Record<IBadgeChoice, ITabOptions['tabBarBadge']> = {
  none: undefined,
  number: 3,
  text: 'new',
};

const ACTIVE_TINT = { line: '#4fd1a5', red: '#f2789a' } as const;
const INACTIVE_LIGHT = '#cbd5e1';
const BAR_DARK = { backgroundColor: '#0b1622' };

// Per tab: label, icon and badge, the badge stays on the Search tab
export function tabOptionsOf(
  settings: ITabsSettings,
  name: ITabName,
): ITabOptions {
  const options: ITabOptions = {};
  if (settings.label === 'tabBarLabel') options.tabBarLabel = name;
  if (settings.label === 'title') options.title = `${name} title`;
  if (settings.icon === 'glyph') options.tabBarIcon = GLYPH[name];
  if (name === 'Search') options.tabBarBadge = BADGE_VALUE[settings.badge];
  return options;
}

// For the whole bar, goes to `screenOptions` of the `Tab`
export function tabBarOptionsOf(settings: ITabsSettings): ITabOptions {
  const options: ITabOptions = {};
  if (settings.activeTint !== DEFAULT) {
    options.tabBarActiveTintColor = ACTIVE_TINT[settings.activeTint];
  }
  if (settings.inactiveTint !== DEFAULT) {
    options.tabBarInactiveTintColor = INACTIVE_LIGHT;
  }
  if (settings.bar !== DEFAULT) options.tabBarStyle = BAR_DARK;
  return options;
}

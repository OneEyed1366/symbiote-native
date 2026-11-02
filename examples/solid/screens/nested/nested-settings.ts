import type {
  IScreenOptions,
  ITabOptions,
} from '@symbiote-native/navigation/solid';
import { isParamsRecord, readChoice, readFlag } from '../read-params';

const NONE = 'none';

export const CONTAINER_CHOICES = [NONE, 'tint', 'light'] as const;

export type INestedSettings = {
  isParentHeader: boolean;
  container: (typeof CONTAINER_CHOICES)[number];
};

export const DEFAULT_NESTED_SETTINGS: INestedSettings = {
  isParentHeader: true,
  container: NONE,
};

const CONTAINER_COLOR = { tint: '#1d3557', light: '#e2e8f0' } as const;

export function readNestedSettings(params: unknown): INestedSettings {
  if (!isParamsRecord(params)) return DEFAULT_NESTED_SETTINGS;
  const base = DEFAULT_NESTED_SETTINGS;
  return {
    isParentHeader: readFlag(params, 'isParentHeader', base.isParentHeader),
    container: readChoice(
      params,
      'container',
      CONTAINER_CHOICES,
      base.container,
    ),
  };
}

export const NESTED_TAB_NAMES = [
  'NestedHome',
  'NestedInner',
  'NestedInfo',
] as const;

type INestedTabName = (typeof NESTED_TAB_NAMES)[number];

const NESTED_TAB: Record<INestedTabName, { label: string; glyph: string }> = {
  NestedHome: { label: 'Home', glyph: '◆' },
  NestedInner: { label: 'Inner', glyph: '●' },
  NestedInfo: { label: 'Info', glyph: '■' },
};

// The outer bar: a label and a text glyph per tab, the glyph tints with the bar
export function nestedTabOptionsOf(name: INestedTabName): ITabOptions {
  const { label, glyph } = NESTED_TAB[name];
  return { tabBarLabel: label, tabBarIcon: glyph };
}

// The header of the screen that holds the navigators, the inner stack has its own
export function nestedOptionsOf(
  settings: INestedSettings,
): Pick<IScreenOptions, 'headerShown'> {
  return { headerShown: settings.isParentHeader };
}

// The colour behind the screens of the inner `Stack`, as its `nativeContainerStyle`
export function innerStackStyleOf(
  settings: INestedSettings,
): { backgroundColor: string } | undefined {
  if (settings.container === NONE) return undefined;
  return { backgroundColor: CONTAINER_COLOR[settings.container] };
}

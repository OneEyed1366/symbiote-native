import { UnavailabilityError, type EventSubscription } from 'expo-modules-core';
import { Appearance } from '@symbiote-native/engine';
import { expoNavigationBar } from './native-module';
import type {
  INavigationBarStyle,
  INavigationBarVisibility,
  INavigationBarVisibilityEvent,
} from './types';

type IResolvedNavigationBarStyle = 'light' | 'dark';

function isLightColorScheme(): boolean {
  return (Appearance.getColorScheme() ?? 'light') === 'light';
}

function resolveStyle(style: INavigationBarStyle): IResolvedNavigationBarStyle {
  switch (style) {
    case 'auto':
      return isLightColorScheme() ? 'dark' : 'light';
    case 'inverted':
      return isLightColorScheme() ? 'light' : 'dark';
    default:
      return style;
  }
}

let currentStyle: IResolvedNavigationBarStyle | undefined;
let currentHidden: boolean | undefined;

// The baseline the declarative `<NavigationBar>` stack falls back to once every mounted
// entry unmounts, kept in sync with every imperative `setStyle`/`setHidden` call too -
// mirrors upstream's own `defaultProps`, read by ./entries-stack.ts
export const defaultNavigationBarProps: {
  style: INavigationBarStyle;
  hidden: boolean;
} = {
  style: 'light',
  hidden: false,
};

/** Sets the navigation bar buttons' style */
export function setStyle(style: INavigationBarStyle): void {
  if (!expoNavigationBar.setStyle) {
    throw new UnavailabilityError('NavigationBar', 'setStyle');
  }
  defaultNavigationBarProps.style = style;
  const resolved = resolveStyle(style);
  if (resolved === currentStyle) return;
  currentStyle = resolved;
  expoNavigationBar.setStyle(resolved);
}

/** Shows or hides the navigation bar */
export function setHidden(hidden: boolean): void {
  if (!expoNavigationBar.setHidden) {
    throw new UnavailabilityError('NavigationBar', 'setHidden');
  }
  defaultNavigationBarProps.hidden = hidden;
  if (hidden === currentHidden) return;
  currentHidden = hidden;
  expoNavigationBar.setHidden(hidden);
}

/** Observes changes to the system navigation bar's visibility */
export function addVisibilityListener(
  listener: (event: INavigationBarVisibilityEvent) => void,
): EventSubscription {
  if (!expoNavigationBar.addListener) {
    throw new UnavailabilityError('NavigationBar', 'addVisibilityListener');
  }
  return expoNavigationBar.addListener('ExpoNavigationBar.didChange', listener);
}

/** Sets the navigation bar's visibility */
export async function setVisibilityAsync(
  visibility: INavigationBarVisibility,
): Promise<void> {
  if (!expoNavigationBar.setHidden) {
    throw new UnavailabilityError('NavigationBar', 'setVisibilityAsync');
  }
  await expoNavigationBar.setHidden(visibility === 'hidden');
}

/** Gets the navigation bar's current visibility */
export async function getVisibilityAsync(): Promise<INavigationBarVisibility> {
  if (!expoNavigationBar.getVisibilityAsync) {
    throw new UnavailabilityError('NavigationBar', 'getVisibilityAsync');
  }
  return expoNavigationBar.getVisibilityAsync();
}

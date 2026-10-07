// What a tab navigator shows, as data: the bar items and the focused screen's options
// An adapter reads its own registry through `entryFor` and `optionsOf`, the rest is shared

import { dlog } from '@symbiote-native/engine';
import { mergeScreenOptions } from './navigator-wiring';
import type { IRoute } from './navigator-state';
import type { ITabNavigatorHandle } from './navigator-handles';
import type { ITabBarItemView } from './render-tabs';
import { isFocusedRoute } from './tab-router-state';
import type { ITabRouterState } from './tab-router-state';
import type { ITabOptions } from './tab-options';

type IOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type ITabBarInput<TEntry> = {
  state: ITabRouterState;
  handle: ITabNavigatorHandle;
  entryFor: (routeName: string) => TEntry | undefined;
  // The adapter's registry entry holds its own options, a value or a resolver
  optionsOf: (
    entry: TEntry,
  ) => ITabOptions | ((args: IOptionsArgs) => ITabOptions) | undefined;
  // Navigator-level options every screen starts from
  screenOptions: ITabOptions | undefined;
};

export function buildTabBarItems<TEntry>(
  input: ITabBarInput<TEntry>,
): ITabBarItemView[] {
  const { state, handle, entryFor, optionsOf, screenOptions } = input;
  return state.routes.map((route, index) => {
    const entry = entryFor(route.name);
    const focused = isFocusedRoute(index, state.index);
    if (entry === undefined) {
      dlog(`Tab: no screen registered for route name "${route.name}"`);
      return { key: route.key, focused, label: route.name, passthrough: {} };
    }
    const options = mergeScreenOptions(
      optionsOf(entry),
      { route, navigation: handle },
      screenOptions,
    );
    return {
      key: route.key,
      focused,
      label: options.tabBarLabel ?? options.title ?? route.name,
      icon: options.tabBarIcon,
      badge: options.tabBarBadge,
      activeTintColor: options.tabBarActiveTintColor,
      inactiveTintColor: options.tabBarInactiveTintColor,
      passthrough: {
        onPress: () => handle.jumpTo(route.name),
        accessibilityRole: 'tab',
        accessibilityState: { selected: focused },
      },
    };
  });
}

// The bar's own style comes from the focused screen, and the navigator's when none is registered
export function resolveFocusedTabOptions<TEntry>(
  input: ITabBarInput<TEntry>,
): ITabOptions | undefined {
  const { state, handle, entryFor, optionsOf, screenOptions } = input;
  const route = state.routes[state.index];
  const entry = route === undefined ? undefined : entryFor(route.name);
  if (entry === undefined || route === undefined) return screenOptions;
  return mergeScreenOptions(
    optionsOf(entry),
    { route, navigation: handle },
    screenOptions,
  );
}

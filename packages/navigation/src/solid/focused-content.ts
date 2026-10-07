// The focused route's screen for the fixed-list navigators (Tab, Drawer): only that one is mounted

import { createComponent, createMemo, untrack } from 'solid-js';
import type { Accessor, Component } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { routeByKey } from '../core';
import type { IAnyNavigatorHandle, INavigationEmitter, IRoute } from '../core';
import { NavigationScopeProvider } from './navigation-context';
import type { INavigationScope } from './navigation-context';

type IFocusableState = {
  routes: readonly IRoute<unknown>[];
  index: number;
};

export type IFocusedContentInput = {
  state: Accessor<IFocusableState>;
  componentOf: (routeName: string) => Component | undefined;
  navigation: IAnyNavigatorHandle;
  emitterFor: (routeKey: string) => INavigationEmitter;
  parentScope: INavigationScope | undefined;
};

export function createFocusedKey(
  state: Accessor<IFocusableState>,
): Accessor<string | undefined> {
  return createMemo(() => {
    const current = state();
    return current.routes[current.index]?.key;
  });
}

// The memo depends on the focused route KEY and its component alone, with the build untracked, so
// a `setParams` on the focused route rebuilds nothing. The route object reaches the screen through
// the scope accessor, which is what keeps `useRoute()` live
export function createFocusedContent(
  input: IFocusedContentInput,
  focusedKey: Accessor<string | undefined>,
): Accessor<JSX.Element> {
  const { state, componentOf, navigation, emitterFor, parentScope } = input;

  const focusedComponent = createMemo(() => {
    const current = state();
    const route = current.routes[current.index];
    return route === undefined ? undefined : componentOf(route.name);
  });

  return createMemo(() => {
    const routeKey = focusedKey();
    const Component = focusedComponent();
    return untrack(() => {
      if (routeKey === undefined || Component === undefined) return undefined;
      const scope: INavigationScope = () => ({
        route: routeByKey(state().routes, routeKey),
        navigation,
        emitter: emitterFor(routeKey),
        parent: parentScope?.(),
      });
      // No route or navigation props: the screen reads both off the scope through primitives
      return createComponent(NavigationScopeProvider, {
        value: scope,
        get children(): JSX.Element {
          return createComponent(Component, {});
        },
      });
    });
  });
}

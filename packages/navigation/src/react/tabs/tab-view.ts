// The React Tab's view: the bar and the focused screen as elements on each render

import { createElement } from 'react';
import type { ReactElement } from 'react';
import { descriptorToReact } from '@symbiote-native/react';
import type {
  INavigationEmitter,
  ITabNavigatorHandle,
  ITabOptions,
  ITabRouterState,
} from '../../core';
import { createTabRenderer } from '../../core/tab-renderer';
import { NavigationContext } from '../navigation-context';
import type { INavigationContextValue } from '../navigation-context';
import type { ITabScreenProps } from '../tab-screen';

export type ITabRegistryEntry = Omit<ITabScreenProps, 'name'>;

export type ITabViewInput = {
  registry: ReadonlyMap<string, ITabRegistryEntry>;
  state: ITabRouterState;
  handle: ITabNavigatorHandle;
  screenOptions: ITabOptions | undefined;
  parent: INavigationContextValue | undefined;
  emitter: INavigationEmitter;
};

// Only the focused route's screen is mounted, so one emitter per focus change is enough
function buildContent(input: ITabViewInput): ReactElement[] {
  const { state, registry, handle, parent, emitter } = input;
  const route = state.routes[state.index];
  const entry = route === undefined ? undefined : registry.get(route.name);
  if (route === undefined || entry === undefined) return [];
  return [
    createElement(
      NavigationContext.Provider,
      { value: { route, navigation: handle, emitter, parent } },
      createElement(entry.component),
    ),
  ];
}

export const renderTabView = createTabRenderer<ITabViewInput, ReactElement>(
  {
    createView: (style, children) =>
      createElement('view', { style }, ...children),
    createBar: bar => descriptorToReact(bar),
  },
  buildContent,
);

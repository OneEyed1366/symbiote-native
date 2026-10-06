// The Vue Tab's view: the bar and the focused screen as vnodes on each render

import { h } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';
import { descriptorToVue } from '@symbiote-native/vue';
import type {
  INavigationEmitter,
  ITabNavigatorHandle,
  ITabOptions,
  ITabRouterState,
} from '../../core';
import { createTabRenderer } from '../../core/tab-renderer';
import { NavigationScope } from '../navigation-context';
import type { INavigationScopeValue } from '../navigation-context';
import type { ITabRegistryEntry } from './tab-attrs';

export type ITabViewInput = {
  registry: ReadonlyMap<string, ITabRegistryEntry>;
  state: ITabRouterState;
  handle: ITabNavigatorHandle;
  screenOptions: ITabOptions | undefined;
  parent: INavigationScopeValue | undefined;
  emitterFor: (routeKey: string) => INavigationEmitter;
};

// Only the focused route's screen is mounted, so a fresh scope per focus change is enough
// No route or navigation props: the screen reads both through composables off the scope
function buildContent(input: ITabViewInput): VNode[] {
  const { state, registry, handle, parent, emitterFor } = input;
  const route = state.routes[state.index];
  const entry = route === undefined ? undefined : registry.get(route.name);
  if (route === undefined || entry === undefined) return [];
  const scope = {
    route,
    navigation: handle,
    emitter: emitterFor(route.key),
    parent,
  };
  return [h(NavigationScope, { value: scope }, () => h(entry.component))];
}

export const renderTabView = createTabRenderer(
  {
    createView: (style, children) => h('view', { style }, children),
    createBar: bar => descriptorToVue(bar),
  },
  buildContent,
);

// The Vue Drawer's view: the core plan turned into vnodes on each render

import { h } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';
import { Animated } from '@symbiote-native/vue';
import type {
  AnimatedValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IDrawerOptions,
  IDrawerRouterState,
  INavigationEmitter,
} from '../../core';
import { renderDrawerPanel } from '../../core/drawer-panel-content';
import { createDrawerRenderer } from '../../core/drawer-renderer';
import { findFocusedEntry } from '../../core/drawer-render-plan';
import { NavigationScope } from '../navigation-context';
import type { INavigationScopeValue } from '../navigation-context';
import type { IDrawerRegistryEntry } from './drawer-attrs';

export type IDrawerViewInput = {
  registry: ReadonlyMap<string, IDrawerRegistryEntry>;
  state: IDrawerRouterState;
  handle: IDrawerNavigatorHandle;
  options: IDrawerOptions;
  drawerStyle: IStyleProp<IViewStyle> | undefined;
  progress: AnimatedValue;
  panHandlers: object;
  parent: INavigationScopeValue | undefined;
  emitterFor: (routeKey: string) => INavigationEmitter;
  drawerContentSlot:
    | ((props: {
        state: IDrawerRouterState;
        descriptors: IDrawerDescriptorMap;
        navigation: IDrawerNavigatorHandle;
      }) => VNode[])
    | undefined;
};

// No route or navigation props: the screen reads both through composables off the scope
function buildFocusedContent(input: IDrawerViewInput): VNode[] {
  const { state, registry, handle, parent, emitterFor } = input;
  const focused = findFocusedEntry(state, name => registry.get(name));
  if (focused === undefined) return [];
  const { route, entry } = focused;
  const scope = {
    route,
    navigation: handle,
    emitter: emitterFor(route.key),
    parent,
  };
  return [h(NavigationScope, { value: scope }, () => h(entry.component))];
}

function buildPanel(input: IDrawerViewInput): VNode[] {
  return renderDrawerPanel(input, input.drawerContentSlot) ?? [];
}

export const renderDrawerView = createDrawerRenderer(
  {
    createHost: (type, props, children: VNode[]) => h(type, props, children),
    createAnimated: (props, children) => h(Animated.View, props, children),
    createRoot: (props, slots) => h('view', props, slots),
  },
  (input: IDrawerViewInput) => ({
    content: buildFocusedContent(input),
    overlay: [],
    panel: buildPanel(input),
  }),
);

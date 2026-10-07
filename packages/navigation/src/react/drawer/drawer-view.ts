// The React Drawer's view: the core plan turned into elements on each render

import { createElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Animated } from '@symbiote-native/react';
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
  IDrawerScreenOptions,
  INavigationEmitter,
} from '../../core';
import { renderDrawerPanel } from '../../core/drawer-panel-content';
import { createDrawerRenderer } from '../../core/drawer-renderer';
import { findFocusedEntry } from '../../core/drawer-render-plan';
import { NavigationContext } from '../navigation-context';
import type { INavigationContextValue } from '../navigation-context';
import type { IDrawerScreenProps } from '../drawer-screen';

export type IDrawerRegistryEntry = Omit<IDrawerScreenProps, 'name'>;

export type IDrawerViewInput = {
  registry: ReadonlyMap<string, IDrawerRegistryEntry>;
  state: IDrawerRouterState;
  handle: IDrawerNavigatorHandle;
  options: IDrawerOptions;
  screenOptions: IDrawerScreenOptions | undefined;
  drawerStyle: IStyleProp<IViewStyle> | undefined;
  progress: AnimatedValue;
  panHandlers: object;
  parent: INavigationContextValue | undefined;
  emitter: INavigationEmitter;
  renderDrawerContent:
    | ((props: {
        state: IDrawerRouterState;
        descriptors: IDrawerDescriptorMap;
        navigation: IDrawerNavigatorHandle;
      }) => ReactNode)
    | undefined;
};

function buildFocusedContent(input: IDrawerViewInput): ReactElement | null {
  const { state, registry, handle, parent, emitter } = input;
  const focused = findFocusedEntry(state, name => registry.get(name));
  if (focused === undefined) return null;
  const { route, entry } = focused;
  return createElement(
    NavigationContext.Provider,
    { value: { route, navigation: handle, emitter, parent } },
    createElement(entry.component),
  );
}

function buildPanel(input: IDrawerViewInput): ReactNode {
  return renderDrawerPanel(input, input.renderDrawerContent) ?? null;
}

export const renderDrawerView = createDrawerRenderer<
  IDrawerViewInput,
  ReactElement,
  ReactNode
>(
  {
    createHost: (type, props, children: ReactNode) =>
      createElement(type, props, children),
    createAnimated: (props, children) =>
      createElement(Animated.View, props, children),
    createRoot: (props, slots) => createElement('view', props, ...slots),
  },
  (input: IDrawerViewInput) => ({
    content: buildFocusedContent(input),
    overlay: null,
    panel: buildPanel(input),
  }),
);

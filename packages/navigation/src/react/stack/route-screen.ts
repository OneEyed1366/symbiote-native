// Stack rendering: one native `RNSScreen` per route, with its header config and screen content

import { createElement } from 'react';
import type { ReactElement } from 'react';
import { descriptorToReact } from '@symbiote-native/react';
import { dlog } from '@symbiote-native/engine';
import {
  RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
  RNS_SCREEN_STACK_VIEW_NAME,
  RNS_SCREEN_VIEW_NAME,
  buildStackHostProps,
  mergeScreenOptions,
  resolveStackRoutePlan,
} from '../../core';
import type {
  INavigationEmitter,
  INavigatorHandle,
  INavigatorState,
  IRoute,
  IScreenRenderPlan,
} from '../../core';
import { NavigationContext } from '../navigation-context';
import type { INavigationContextValue } from '../navigation-context';
import type { IReactScreenOptions, IScreenProps } from '../screen';

export type IScreenRegistryEntry = Omit<IScreenProps, 'name'>;

type IRouteScreenInput = {
  route: IRoute<unknown>;
  index: number;
  routeCount: number;
  options: IReactScreenOptions;
  component: IScreenProps['component'];
  navigation: INavigatorHandle;
  emitter: INavigationEmitter;
  parent: INavigationContextValue | undefined;
  onPop: () => void;
  loggedPropKeys: Set<string>;
};

export type IStackRenderInput = {
  registry: ReadonlyMap<string, IScreenRegistryEntry>;
  state: INavigatorState;
  screenOptions: IReactScreenOptions | undefined;
  navigation: INavigatorHandle;
  parent: INavigationContextValue | undefined;
  emitterFor: (routeKey: string) => INavigationEmitter;
  onPop: () => void;
  loggedPropKeys: Set<string>;
};

// Must stay a real view (`collapsable: false`): native finds this class to size a `formSheet`
function buildScreenContent(
  plan: IScreenRenderPlan,
  input: IRouteScreenInput,
): ReactElement {
  const { route, navigation, emitter, parent, component } = input;
  return createElement(
    RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
    plan.contentWrapperProps,
    createElement(
      NavigationContext.Provider,
      { value: { route, navigation, emitter, parent } },
      createElement(component),
    ),
  );
}

// A modal or `formSheet` screen has no navigation controller on iOS, so an inner stack hosts the
// header bar. Its screen mirrors `activityState`, else native parks it off the bottom edge
function wrapInModalStack(
  plan: IScreenRenderPlan,
  header: ReactElement,
  content: ReactElement,
): ReactElement {
  return createElement(
    RNS_SCREEN_STACK_VIEW_NAME,
    { style: plan.innerStackStyle },
    createElement(
      RNS_SCREEN_VIEW_NAME,
      { style: plan.innerScreenStyle, activityState: plan.activityState },
      header,
      content,
    ),
  );
}

function renderRouteScreen(input: IRouteScreenInput): ReactElement {
  const { route, options } = input;
  const plan = resolveStackRoutePlan({
    route,
    index: input.index,
    routeCount: input.routeCount,
    options,
    emitter: input.emitter,
    onPop: input.onPop,
    loggedKeys: input.loggedPropKeys,
    assignSearchBarHandle: handle => {
      const appRef = options.headerSearchBarOptions?.ref;
      if (appRef) appRef.current = handle;
    },
  });
  const header = descriptorToReact(plan.headerConfig);
  const content = buildScreenContent(plan, input);
  const props = { key: route.key, ...plan.screenProps };
  return plan.inModal
    ? createElement(
        plan.screenViewName,
        props,
        wrapInModalStack(plan, header, content),
      )
    : createElement(plan.screenViewName, props, header, content);
}

const STACK_PROPS = buildStackHostProps();

export function renderStack(input: IStackRenderInput): ReactElement {
  const { registry, state, screenOptions, navigation } = input;
  const children = state.routes.map((route, index) => {
    const entry = registry.get(route.name);
    if (!entry) {
      dlog(`Stack: no screen registered for route name "${route.name}"`);
      return null;
    }
    return renderRouteScreen({
      route,
      index,
      routeCount: state.routes.length,
      options: mergeScreenOptions(
        entry.options,
        { route, navigation },
        screenOptions,
      ),
      component: entry.component,
      navigation,
      emitter: input.emitterFor(route.key),
      parent: input.parent,
      onPop: input.onPop,
      loggedPropKeys: input.loggedPropKeys,
    });
  });
  return createElement(RNS_SCREEN_STACK_VIEW_NAME, STACK_PROPS, ...children);
}

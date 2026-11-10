// Stack rendering: one native `RNSScreen` per route, with its header config and screen content

import { createElement } from 'react';
import type { ReactElement } from 'react';
import { descriptorToReact } from '@symbiote-native/react';
import { dlog } from '@symbiote-native/engine';
import {
  RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
  RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
  RNS_SCREEN_STACK_VIEW_NAME,
  RNS_SCREEN_VIEW_NAME,
  buildStackHostProps,
  mergeScreenOptions,
  resolveCustomHeaderSubviewElements,
  resolveNativeContainerProps,
  resolveSheetFooterElements,
  resolveStackRoutePlan,
} from '../../core';
import type {
  INativeContainerStyle,
  INavigationEmitter,
  INavigatorHandle,
  INavigatorState,
  IRoute,
  IScreenRenderPlan,
  ITransitionProgress,
  ITransitionProgressStore,
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
  transitionProgress: ITransitionProgress;
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
  transitionProgress: ITransitionProgressStore;
  nativeContainerStyle: INativeContainerStyle | undefined;
};

// Must stay a real view (`collapsable: false`): native finds this class to size a `formSheet`
function buildScreenContent(
  plan: IScreenRenderPlan,
  input: IRouteScreenInput,
): ReactElement {
  const { route, navigation, emitter, parent, component } = input;
  const { transitionProgress } = input;
  const content = createElement(
    NavigationContext.Provider,
    {
      value: {
        route,
        navigation,
        emitter,
        parent,
        transitionProgress,
        edgeInsets: plan.edgeInsets,
      },
    },
    createElement(component),
  );
  const { safeAreaHost } = plan;
  return createElement(
    RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
    plan.contentWrapperProps,
    safeAreaHost === undefined
      ? content
      : createElement(safeAreaHost.viewName, safeAreaHost.props, content),
  );
}

// A modal or `formSheet` screen has no navigation controller on iOS, so an inner stack hosts the
// header bar. Its screen mirrors `activityState`, else native parks it off the bottom edge
function wrapInModalStack(
  plan: IScreenRenderPlan,
  body: ReactElement[],
): ReactElement {
  return createElement(
    RNS_SCREEN_STACK_VIEW_NAME,
    { style: plan.innerStackStyle },
    createElement(RNS_SCREEN_VIEW_NAME, plan.innerScreenProps, ...body),
  );
}

// Only a `formSheet` has a footer, core says when, the app function supplies what goes inside
function buildSheetFooter(options: IReactScreenOptions): ReactElement[] {
  return resolveSheetFooterElements(options, (host, content) =>
    createElement(
      host.viewName,
      { key: host.viewName, ...host.props },
      content,
    ),
  );
}

// The search bar subview comes from core's descriptor, these sit beside it in the header config
function buildCustomSubviews(options: IReactScreenOptions): ReactElement[] {
  return resolveCustomHeaderSubviewElements(options, {
    subview: (host, content) =>
      createElement(
        RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
        { key: host.kind, ...host.props },
        content,
      ),
    image: props => createElement('image', props),
  });
}

function buildHeader(
  plan: IScreenRenderPlan,
  options: IReactScreenOptions,
): ReactElement {
  const { type, props, children } = plan.headerConfig;
  const bridged = children.map((child, index) =>
    typeof child === 'string' ? child : descriptorToReact(child, index),
  );
  return createElement(
    type,
    props,
    ...bridged,
    ...buildCustomSubviews(options),
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
    parentScope: input.parent,
    transitionProgress: input.transitionProgress,
    assignSearchBarHandle: handle => {
      const appRef = options.headerSearchBarOptions?.ref;
      if (appRef) appRef.current = handle;
    },
  });
  const body = [
    buildHeader(plan, options),
    buildScreenContent(plan, input),
    ...buildSheetFooter(options),
  ];
  const props = { key: route.key, ...plan.screenProps };
  return plan.inModal
    ? createElement(plan.screenViewName, props, wrapInModalStack(plan, body))
    : createElement(plan.screenViewName, props, ...body);
}

const STACK_PROPS = buildStackHostProps();

export function renderStack(input: IStackRenderInput): ReactElement {
  const { registry, state, screenOptions, navigation } = input;
  input.transitionProgress.keepOnly(state.routes.map(route => route.key));
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
      transitionProgress: input.transitionProgress.forRoute(route.key),
    });
  });
  const stackProps = {
    ...STACK_PROPS,
    ...resolveNativeContainerProps(input.nativeContainerStyle),
  };
  return createElement(RNS_SCREEN_STACK_VIEW_NAME, stackProps, ...children);
}

// Stack rendering: one native `RNSScreen` per route, with its header config and screen content

import { h } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';
import { descriptorToVue } from '@symbiote-native/vue';
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
import { NavigationScope } from '../navigation-context';
import type { INavigationScopeValue } from '../navigation-context';
import type { IScreenProps, IVueScreenOptions } from '../screen';

export type IScreenRegistryEntry = {
  component: IScreenProps['component'];
  options: IScreenProps['options'];
  initialParams: unknown;
};

type IRouteScreenInput = {
  route: IRoute<unknown>;
  index: number;
  routeCount: number;
  options: IVueScreenOptions;
  component: IScreenProps['component'];
  navigation: INavigatorHandle;
  emitter: INavigationEmitter;
  parent: INavigationScopeValue | undefined;
  onPop: () => void;
  loggedPropKeys: Set<string>;
};

export type IStackRenderInput = {
  registry: ReadonlyMap<string, IScreenRegistryEntry>;
  current: INavigatorState;
  screenOptions: IVueScreenOptions | undefined;
  navigation: INavigatorHandle;
  parent: INavigationScopeValue | undefined;
  emitterFor: (routeKey: string) => INavigationEmitter;
  onPop: () => void;
  loggedPropKeys: Set<string>;
};

// Must stay a real view (`collapsable: false`): native finds this class to size a `formSheet`
// The screen reads its route and navigation off the scope through composables, not props
function buildScreenContent(
  plan: IScreenRenderPlan,
  input: IRouteScreenInput,
): VNode {
  const { route, navigation, emitter, parent, component } = input;
  const scope = { route, navigation, emitter, parent };
  return h(RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME, plan.contentWrapperProps, [
    h(NavigationScope, { value: scope }, () => h(component)),
  ]);
}

// A modal or `formSheet` screen has no navigation controller on iOS, so an inner stack hosts the
// header bar. Its screen mirrors `activityState`, else native parks it off the bottom edge
function wrapInModalStack(
  plan: IScreenRenderPlan,
  header: VNode,
  content: VNode,
): VNode[] {
  return [
    h(RNS_SCREEN_STACK_VIEW_NAME, { style: plan.innerStackStyle }, [
      h(
        RNS_SCREEN_VIEW_NAME,
        { style: plan.innerScreenStyle, activityState: plan.activityState },
        [header, content],
      ),
    ]),
  ];
}

function renderRouteScreen(input: IRouteScreenInput): VNode {
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
      if (appRef !== undefined) appRef.value = handle;
    },
  });
  const header = descriptorToVue(plan.headerConfig);
  const content = buildScreenContent(plan, input);
  return h(
    plan.screenViewName,
    { key: route.key, ...plan.screenProps },
    plan.inModal ? wrapInModalStack(plan, header, content) : [header, content],
  );
}

const STACK_PROPS = buildStackHostProps();

export function renderStack(input: IStackRenderInput): VNode {
  const { registry, current, screenOptions, navigation } = input;
  const children = current.routes.map((route, index) => {
    const entry = registry.get(route.name);
    if (entry === undefined) {
      dlog(`Stack: no screen registered for route name "${route.name}"`);
      return null;
    }
    return renderRouteScreen({
      route,
      index,
      routeCount: current.routes.length,
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
  return h(RNS_SCREEN_STACK_VIEW_NAME, STACK_PROPS, children);
}

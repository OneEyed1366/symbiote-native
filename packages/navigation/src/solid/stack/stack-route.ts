// One route of the Solid Stack: its plan, its native shape and the screen built behind that shape

import { createMemo, untrack, createComponent } from 'solid-js';
import type { Accessor } from 'solid-js';
import { descriptorToSolid } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { insert, insertNode } from '@symbiote-native/solid/renderer';
import { dlog } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import {
  RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
  RNS_SCREEN_STACK_VIEW_NAME,
  RNS_SCREEN_VIEW_NAME,
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
import { hostElement } from '../host';
import { NavigationScopeProvider } from '../navigation-context';
import type { INavigationScope } from '../navigation-context';
import type { IRegisteredScreen } from '../screen-registry';
import type { IScreenProps, ISolidScreenOptions } from '../screen-props';

type IStackScreenEntry = IRegisteredScreen<IScreenProps['options']>;
type IScreenComponent = IStackScreenEntry['component'];

export type IRouteEnv = {
  registry: Accessor<ReadonlyMap<string, IStackScreenEntry>>;
  currentState: Accessor<INavigatorState>;
  handle: INavigatorHandle;
  onPop: () => void;
  emitterFor: (routeKey: string) => INavigationEmitter;
  parentScope: INavigationScope | undefined;
  screenOptions: () => ISolidScreenOptions | undefined;
  loggedKeys: Set<string>;
};

// What makes a route's NATIVE shape different rather than just its props
type IScreenShape = {
  viewName: string;
  inModal: boolean;
  hasSearchBar: boolean;
};

type ILiveRoute = {
  plan: Accessor<IScreenRenderPlan | undefined>;
  route: Accessor<IRoute<unknown> | undefined>;
  entry: Accessor<IStackScreenEntry | undefined>;
};

type IBuilt = {
  livePlan: () => IScreenRenderPlan;
  contentWrapper: ISymbioteNode;
  headerConfig: ISymbioteNode;
};

function sameShape(a: IScreenShape, b: IScreenShape): boolean {
  return (
    a.viewName === b.viewName &&
    a.inModal === b.inModal &&
    a.hasSearchBar === b.hasSearchBar
  );
}

// Keeps the PREVIOUS plan when the route or its marker vanishes: `<For>` disposes this item in the
// same update, but memo order inside one batch is not ours to choose, so the live accessors must
// never see an undefined plan mid-teardown
function createPlan(
  env: IRouteEnv,
  routeKey: string,
  index: Accessor<number>,
  live: Pick<ILiveRoute, 'route' | 'entry'>,
): Accessor<IScreenRenderPlan | undefined> {
  // `spread` re-runs a bag's `ref` on EVERY prop change, and an app expects one attach per node
  let lastSearchBarNode: ISymbioteNode | null = null;
  return createMemo<IScreenRenderPlan | undefined>(previous => {
    const current = live.route();
    const registered = live.entry();
    if (current === undefined || registered === undefined) return previous;
    const options = mergeScreenOptions(
      registered.options,
      { route: current, navigation: env.handle },
      env.screenOptions(),
    );
    return resolveStackRoutePlan({
      route: current,
      index: index(),
      routeCount: env.currentState().routes.length,
      options,
      emitter: env.emitterFor(routeKey),
      onPop: env.onPop,
      loggedKeys: env.loggedKeys,
      assignSearchBarHandle: (handle, node) => {
        if (node === lastSearchBarNode) return;
        lastSearchBarNode = node;
        options.headerSearchBarOptions?.ref?.(handle);
      },
    });
  }, undefined);
}

// Not an early `return undefined` while the plan is unresolved: `<For>` maps a key once, so that
// would strand the route blank, and an unresolved plan is the NORMAL first state here
function createShape(
  plan: Accessor<IScreenRenderPlan | undefined>,
): Accessor<IScreenShape | undefined> {
  return createMemo<IScreenShape | undefined>(
    () => {
      const current = plan();
      if (current === undefined) return undefined;
      return {
        viewName: current.screenViewName,
        inModal: current.inModal,
        hasSearchBar: current.searchBarProps !== undefined,
      };
    },
    undefined,
    {
      equals: (a, b) =>
        a === b || (a !== undefined && b !== undefined && sameShape(a, b)),
    },
  );
}

// A modal or `formSheet` screen has no navigation controller on iOS, so an inner stack hosts the
// header bar. Its screen mirrors `activityState`, else native parks it off the bottom edge
function wrapInModalStack(screen: ISymbioteNode, built: IBuilt): ISymbioteNode {
  const { livePlan, contentWrapper, headerConfig } = built;
  const innerStack = hostElement(RNS_SCREEN_STACK_VIEW_NAME, () => ({
    style: livePlan().innerStackStyle,
  }));
  const innerScreen = hostElement(RNS_SCREEN_VIEW_NAME, () => ({
    style: livePlan().innerScreenStyle,
    activityState: livePlan().activityState,
  }));
  insertNode(innerScreen, headerConfig);
  insertNode(innerScreen, contentWrapper);
  insertNode(innerStack, innerScreen);
  insertNode(screen, innerStack);
  return screen;
}

// The screen component is created INSIDE the provider's children getter: a computation captures its
// owner at creation, so one built outside would see no scope and `useRoute` would throw
// Reading `component()` tracked makes that getter the rebuild boundary for a component swap
function createContentWrapper(
  scope: INavigationScope,
  component: Accessor<IScreenComponent>,
  livePlan: () => IScreenRenderPlan,
): ISymbioteNode {
  // Must not be flattened away (`collapsable: false`), as native finds this class for a `formSheet`
  const contentWrapper = hostElement(
    RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
    () => livePlan().contentWrapperProps,
  );
  insert(
    contentWrapper,
    createComponent(NavigationScopeProvider, {
      value: scope,
      get children(): JSX.Element {
        const Component = component();
        return untrack(() => createComponent(Component, {}));
      },
    }),
  );
  return contentWrapper;
}

function buildScreen(
  env: IRouteEnv,
  routeKey: string,
  current: IScreenShape,
  live: ILiveRoute,
): ISymbioteNode | undefined {
  // Re-read rather than closed over: this runs on every rebuild boundary crossing, and the
  // fallbacks keep the live accessors from ever seeing `undefined` mid-teardown
  const builtPlan = live.plan();
  const builtRoute = live.route();
  const builtEntry = live.entry();
  if (
    builtPlan === undefined ||
    builtRoute === undefined ||
    builtEntry === undefined
  ) {
    dlog(`Stack: no screen registered for route key "${routeKey}"`);
    return undefined;
  }
  const livePlan = (): IScreenRenderPlan => live.plan() ?? builtPlan;
  const scope: INavigationScope = () => ({
    route: live.route() ?? builtRoute,
    navigation: env.handle,
    emitter: env.emitterFor(routeKey),
    parent: env.parentScope?.(),
  });
  // The narrower boundary inside the shape one: swapping `component` rebuilds only the body
  const component = createMemo(
    () => live.entry()?.component ?? builtEntry.component,
  );

  const built: IBuilt = {
    livePlan,
    contentWrapper: createContentWrapper(scope, component, livePlan),
    // The header config is a pure descriptor leaf, so it goes through the shared bridge
    headerConfig: descriptorToSolid(() => livePlan().headerConfig),
  };
  const screen = hostElement(current.viewName, () => livePlan().screenProps);
  if (current.inModal) return wrapInModalStack(screen, built);
  insertNode(screen, built.headerConfig);
  insertNode(screen, built.contentWrapper);
  return screen;
}

export function createRouteRenderer(env: IRouteEnv) {
  return (routeKey: string, index: Accessor<number>): JSX.Element => {
    const route = createMemo(() =>
      env.currentState().routes.find(candidate => candidate.key === routeKey),
    );
    const entry = createMemo(() => {
      const current = route();
      return current === undefined
        ? undefined
        : env.registry().get(current.name);
    });
    const plan = createPlan(env, routeKey, index, { route, entry });
    const shape = createShape(plan);
    return createMemo(() => {
      const current = shape();
      if (current === undefined) return undefined;
      return untrack(() =>
        buildScreen(env, routeKey, current, { plan, route, entry }),
      );
    });
  };
}

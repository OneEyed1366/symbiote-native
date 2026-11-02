// One route of the Solid Stack: its plan, its native shape and the screen built behind that shape

import { createMemo, untrack, createComponent } from 'solid-js';
import type { Accessor } from 'solid-js';
import { descriptorToSolid } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { insert, insertNode } from '@symbiote-native/solid/renderer';
import { dlog } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import {
  createTransitionProgress,
  RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
  RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
  RNS_SCREEN_STACK_VIEW_NAME,
  RNS_SCREEN_VIEW_NAME,
  mergeScreenOptions,
  resolveCustomHeaderSubviewElements,
  resolveCustomHeaderSubviews,
  resolveCustomHeaderViews,
  resolveSheetFooterElements,
  resolveSheetFooterHost,
  resolveStackRoutePlan,
} from '../../core';
import type {
  INavigationEmitter,
  INavigatorHandle,
  INavigatorState,
  IRoute,
  IScreenRenderPlan,
  ITransitionProgress,
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
  // The app's header views with their props, a change adds or drops a subview leaf
  subviews: string;
  // A footer exists on a `formSheet` that sets one, a change adds or drops the footer view
  hasSheetFooter: boolean;
};

type IScreenOptionsValue = Partial<ISolidScreenOptions>;

type ILiveRoute = {
  options: Accessor<IScreenOptionsValue | undefined>;
  plan: Accessor<IScreenRenderPlan | undefined>;
  route: Accessor<IRoute<unknown> | undefined>;
  entry: Accessor<IStackScreenEntry | undefined>;
  // One set of values per route item, shared by the plan that listens and the scope that exposes it
  transitionProgress: ITransitionProgress;
};

type IBuilt = {
  livePlan: () => IScreenRenderPlan;
  contentWrapper: ISymbioteNode;
  headerConfig: ISymbioteNode;
  footer: ISymbioteNode[];
};

// The navigator defaults under the screen's own options, resolved once per route and read by the
// plan, the shape and the subview leaves
function createOptions(
  env: IRouteEnv,
  live: Pick<ILiveRoute, 'route' | 'entry'>,
): Accessor<IScreenOptionsValue | undefined> {
  return createMemo<IScreenOptionsValue | undefined>(previous => {
    const current = live.route();
    const registered = live.entry();
    if (current === undefined || registered === undefined) return previous;
    return mergeScreenOptions(
      registered.options,
      { route: current, navigation: env.handle },
      env.screenOptions(),
    );
  }, undefined);
}

// Keeps the previous plan when the route or its marker vanishes, because `<For>` disposes this item
// in the same update. Memo order inside one batch is not ours to choose, so the live accessors
// must never see an undefined plan mid-teardown
function createPlan(
  env: IRouteEnv,
  routeKey: string,
  index: Accessor<number>,
  live: Pick<ILiveRoute, 'route' | 'options' | 'transitionProgress'>,
): Accessor<IScreenRenderPlan | undefined> {
  // `spread` re-runs a bag's `ref` on EVERY prop change, and an app expects one attach per node
  let lastSearchBarNode: ISymbioteNode | null = null;
  return createMemo<IScreenRenderPlan | undefined>(previous => {
    const current = live.route();
    const options = live.options();
    if (current === undefined || options === undefined) return previous;
    return resolveStackRoutePlan({
      route: current,
      index: index(),
      routeCount: env.currentState().routes.length,
      options,
      emitter: env.emitterFor(routeKey),
      onPop: env.onPop,
      loggedKeys: env.loggedKeys,
      parentScope: env.parentScope?.(),
      transitionProgress: live.transitionProgress,
      assignSearchBarHandle: (handle, node) => {
        if (node === lastSearchBarNode) return;
        lastSearchBarNode = node;
        options.headerSearchBarOptions?.ref?.(handle);
      },
    });
  }, undefined);
}

// The three app views map to the left, right and center leaves, core adds the back image
function customSubviewHosts(options: IScreenOptionsValue) {
  return resolveCustomHeaderSubviews(
    resolveCustomHeaderViews(options),
    options,
  );
}

// The app view is built once per shape, the view's own signals keep it live inside its leaf
function buildCustomSubviews(options: IScreenOptionsValue): ISymbioteNode[] {
  return resolveCustomHeaderSubviewElements<ISymbioteNode, JSX.Element>(
    options,
    {
      subview: (host, content) => {
        const leaf = hostElement(
          RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
          () => host.props,
        );
        insert(leaf, content);
        return leaf;
      },
      image: props => hostElement('image', () => props),
    },
  );
}

function hasSheetFooter(options: IScreenOptionsValue): boolean {
  const host = resolveSheetFooterHost({
    stackPresentation: options.stackPresentation,
    hasFooter: options.sheetFooter !== undefined,
  });
  return host !== undefined;
}

// The footer is built once per shape, like the header views, its own signals keep it live
function buildSheetFooter(options: IScreenOptionsValue): ISymbioteNode[] {
  return resolveSheetFooterElements<ISymbioteNode, JSX.Element>(
    options,
    (host, content) => {
      const footer = hostElement(host.viewName, () => host.props);
      insert(footer, content);
      return footer;
    },
  );
}

// Not an early `return undefined` while the plan is unresolved: `<For>` maps a key once, so that
// would strand the route blank, and an unresolved plan is the NORMAL first state here
function createShape(
  plan: Accessor<IScreenRenderPlan | undefined>,
  options: Accessor<IScreenOptionsValue | undefined>,
): Accessor<IScreenShape | undefined> {
  return createMemo<IScreenShape | undefined>(
    () => {
      const current = plan();
      const currentOptions = options();
      if (current === undefined || currentOptions === undefined) {
        return undefined;
      }
      return {
        viewName: current.screenViewName,
        inModal: current.inModal,
        hasSearchBar: current.searchBarProps !== undefined,
        subviews: JSON.stringify(customSubviewHosts(currentOptions)),
        hasSheetFooter: hasSheetFooter(currentOptions),
      };
    },
    undefined,
    {
      // The shape is a few scalars, so a structural compare keeps a new field from being forgotten
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    },
  );
}

// A modal or `formSheet` screen has no navigation controller on iOS, so an inner stack hosts the
// header bar. Its screen mirrors `activityState`, else native parks it off the bottom edge
function wrapInModalStack(screen: ISymbioteNode, built: IBuilt): ISymbioteNode {
  const { livePlan, contentWrapper, headerConfig, footer } = built;
  const innerStack = hostElement(RNS_SCREEN_STACK_VIEW_NAME, () => ({
    style: livePlan().innerStackStyle,
  }));
  const innerScreen = hostElement(
    RNS_SCREEN_VIEW_NAME,
    () => livePlan().innerScreenProps,
  );
  insertNode(innerScreen, headerConfig);
  insertNode(innerScreen, contentWrapper);
  for (const leaf of footer) insertNode(innerScreen, leaf);
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
  const scoped = createComponent(NavigationScopeProvider, {
    value: scope,
    get children(): JSX.Element {
      const Component = component();
      return untrack(() => createComponent(Component, {}));
    },
  });
  // The platform never changes while the app runs, so the view exists for the screen's lifetime
  const safeAreaHost = livePlan().safeAreaHost;
  if (safeAreaHost === undefined) {
    insert(contentWrapper, scoped);
    return contentWrapper;
  }
  const safeArea = hostElement(
    safeAreaHost.viewName,
    () => livePlan().safeAreaHost?.props ?? safeAreaHost.props,
  );
  insert(safeArea, scoped);
  insertNode(contentWrapper, safeArea);
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
  const builtOptions = live.options();
  const isUnresolved =
    builtPlan === undefined ||
    builtRoute === undefined ||
    builtEntry === undefined ||
    builtOptions === undefined;
  if (isUnresolved) {
    dlog(`Stack: no screen registered for route key "${routeKey}"`);
    return undefined;
  }
  const livePlan = (): IScreenRenderPlan => live.plan() ?? builtPlan;
  const scope: INavigationScope = () => ({
    route: live.route() ?? builtRoute,
    navigation: env.handle,
    emitter: env.emitterFor(routeKey),
    transitionProgress: live.transitionProgress,
    edgeInsets: livePlan().edgeInsets,
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
    footer: buildSheetFooter(builtOptions),
  };
  // The app's header views join the descriptor's own leaves, each is a child of the config
  for (const leaf of buildCustomSubviews(builtOptions)) {
    insertNode(built.headerConfig, leaf);
  }
  const screen = hostElement(current.viewName, () => livePlan().screenProps);
  if (current.inModal) return wrapInModalStack(screen, built);
  insertNode(screen, built.headerConfig);
  insertNode(screen, built.contentWrapper);
  for (const leaf of built.footer) insertNode(screen, leaf);
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
    const options = createOptions(env, { route, entry });
    const transitionProgress = createTransitionProgress();
    const plan = createPlan(env, routeKey, index, {
      route,
      options,
      transitionProgress,
    });
    const shape = createShape(plan, options);
    return createMemo(() => {
      const current = shape();
      if (current === undefined) return undefined;
      return untrack(() =>
        buildScreen(env, routeKey, current, {
          plan,
          route,
          entry,
          options,
          transitionProgress,
        }),
      );
    });
  };
}

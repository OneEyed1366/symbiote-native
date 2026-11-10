// The Solid NativeTab view: the native host with one screen per route, each built once and kept
// A screen is keyed by its route key, so a state change updates props and never re-mounts content

import { createComponent, createMemo, mapArray, untrack } from 'solid-js';
import type { Accessor, Component } from 'solid-js';
import { Platform } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { insert } from '@symbiote-native/solid/renderer';
import { dlog } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { routeByKey } from '../../core';
import type {
  INativeTabAction,
  INativeTabState,
  INativeTabsView,
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
  INavigationEmitter,
  ITabNavigatorHandle,
  ITabsBottomAccessoryEnvironment,
} from '../../core';
import { planNativeTabs } from '../../core/native-tabs-renderer';
import { hostElement } from '../host';
import type { INativeTabScreenProps } from '../native-tab-screen-props';
import { NavigationScopeProvider } from '../navigation-context';
import type { INavigationScope } from '../navigation-context';
import type { IRegisteredScreen } from '../screen-registry';

export type INativeTabRegistryEntry = IRegisteredScreen<
  INativeTabScreenProps['options']
>;

export type INativeTabAccessoryRenderer = (
  environment: ITabsBottomAccessoryEnvironment,
) => JSX.Element;

export type INativeTabViewInput = {
  state: Accessor<INativeTabState>;
  dispatch: (action: INativeTabAction) => void;
  registry: Accessor<ReadonlyMap<string, INativeTabRegistryEntry>>;
  handle: ITabNavigatorHandle;
  host: () => INativeTabsViewHostOptions;
  screenOptions: () => INativeTabsViewScreenOptions | undefined;
  bottomAccessory: () => INativeTabAccessoryRenderer | undefined;
  parentScope: INavigationScope | undefined;
  emitterFor: (routeKey: string) => INavigationEmitter;
};

const PLAIN_VIEW_NAME = 'view';

// Read inside a memo, so a prop, the registry or the state changing re-plans the whole view
function planOf(input: INativeTabViewInput): INativeTabsView {
  return planNativeTabs(Platform, {
    registry: input.registry(),
    state: input.state(),
    dispatch: input.dispatch,
    handle: input.handle,
    host: input.host(),
    screenOptions: input.screenOptions(),
    bottomAccessory: input.bottomAccessory(),
    parent: undefined,
    emitterFor: input.emitterFor,
  });
}

// The route object reaches the screen through the scope accessor, which keeps `useRoute()` live
function createRouteContent(
  input: INativeTabViewInput,
  routeKey: string,
  RouteComponent: Component,
): JSX.Element {
  const scope: INavigationScope = () => ({
    route: routeByKey(input.state().routes, routeKey),
    navigation: input.handle,
    emitter: input.emitterFor(routeKey),
    parent: input.parentScope?.(),
  });
  return createComponent(NavigationScopeProvider, {
    value: scope,
    get children(): JSX.Element {
      return createComponent(RouteComponent, {});
    },
  });
}

function createScreen(
  input: INativeTabViewInput,
  view: Accessor<INativeTabsView>,
  routeKey: string,
): ISymbioteNode {
  const planned = createMemo(() =>
    view().screens.find(({ route }) => route.key === routeKey),
  );
  const initial = untrack(planned);
  const element = hostElement(
    initial?.screen.viewName ?? PLAIN_VIEW_NAME,
    () => {
      const current = planned();
      return current === undefined ? {} : current.screen.props;
    },
  );
  const entry =
    initial === undefined
      ? undefined
      : untrack(() => input.registry().get(initial.route.name));
  if (entry === undefined) {
    dlog(`NativeTab: no screen registered for route key "${routeKey}"`);
    return element;
  }
  insert(element, createRouteContent(input, routeKey, entry.component));
  return element;
}

// One content view per environment, native shows the one that matches the bar it is in
function createAccessory(
  input: INativeTabViewInput,
  view: Accessor<INativeTabsView>,
): ISymbioteNode | undefined {
  const accessory = view().bottomAccessory;
  if (accessory === undefined) return undefined;
  const element = hostElement(
    accessory.viewName,
    () => view().bottomAccessory?.props ?? {},
  );
  const contents = accessory.contents.map(content => {
    const node = hostElement(content.viewName, () => content.props);
    insert(node, () => input.bottomAccessory()?.(content.environment));
    return node;
  });
  insert(element, contents);
  return element;
}

export function createNativeTabRoot(input: INativeTabViewInput): ISymbioteNode {
  const view = createMemo(() => planOf(input));
  const root = hostElement(
    untrack(() => view().host.viewName),
    () => view().host.props,
  );
  const routeKeys = createMemo(() =>
    view().screens.map(({ route }) => route.key),
  );
  const screens = mapArray(routeKeys, routeKey =>
    createScreen(input, view, routeKey),
  );
  // Built only while the plan has an accessory, so a state change never re-creates it
  const hasAccessory = createMemo(() => view().bottomAccessory !== undefined);
  const accessory = createMemo(() =>
    hasAccessory() ? untrack(() => createAccessory(input, view)) : undefined,
  );
  insert(root, (): readonly ISymbioteNode[] => {
    const extra = accessory();
    return extra === undefined ? screens() : [...screens(), extra];
  });
  return root;
}

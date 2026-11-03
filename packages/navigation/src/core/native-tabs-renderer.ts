// A whole native tab navigator as elements, built with the adapter's factories
// The adapter owns the element type and how a route content gets its scope, core owns the shape

import { dlog } from '@symbiote-native/engine';
import { mergeScreenOptions } from './navigator-wiring';
import type { INavigationEmitter } from './navigation-events';
import type { INativeTabAction, INativeTabState } from './native-tab-state';
import { resolveNativeTabsView } from './render-native-tabs';
import type {
  INativeTabsView,
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
} from './render-native-tabs';
import type { ITabNavigatorHandle } from './navigator-handles';
import type { ITabsBottomAccessoryEnvironment } from './native-tabs-bottom-accessory';
import type { IRoute } from './tab-router-state';

type IOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type INativeTabViewEntry = {
  options?:
    | INativeTabsViewScreenOptions
    | ((args: IOptionsArgs) => INativeTabsViewScreenOptions);
};

export type INativeTabScope<TParent> = IOptionsArgs & {
  emitter: INavigationEmitter;
  parent: TParent | undefined;
};

// What the renderer reads from the adapter's view input, which carries more fields than these
export type INativeTabViewState<TEntry, TParent, TAccessory> = {
  registry: ReadonlyMap<string, TEntry>;
  state: INativeTabState;
  dispatch: (action: INativeTabAction) => void;
  handle: ITabNavigatorHandle;
  host: INativeTabsViewHostOptions;
  screenOptions: INativeTabsViewScreenOptions | undefined;
  bottomAccessory: TAccessory | undefined;
  parent: TParent | undefined;
  emitterFor: (routeKey: string) => INavigationEmitter;
};

export type INativeTabPlatform = { OS: string; Version: string | number };

export type INativeTabElements<TNode, TEntry, TParent, TAccessory> = {
  platform: INativeTabPlatform;
  createView: (
    viewName: string,
    props: Record<string, unknown>,
    children: TNode[],
  ) => TNode;
  createContent: (entry: TEntry, scope: INativeTabScope<TParent>) => TNode;
  createAccessory: (
    accessory: TAccessory,
    environment: ITabsBottomAccessoryEnvironment,
  ) => TNode;
};

// The view plan of one render, shared by the adapters that build elements from it on their own
export function planNativeTabs<
  TEntry extends INativeTabViewEntry,
  TParent,
  TAccessory,
>(
  platform: INativeTabPlatform,
  input: INativeTabViewState<TEntry, TParent, TAccessory>,
): INativeTabsView {
  const { registry, handle, screenOptions } = input;
  return resolveNativeTabsView({
    state: input.state,
    dispatch: input.dispatch,
    os: platform.OS,
    osVersion: platform.Version,
    host: input.host,
    screenOptionsOf: route =>
      mergeScreenOptions(
        registry.get(route.name)?.options,
        { route, navigation: handle },
        screenOptions,
      ),
    emitterFor: input.emitterFor,
    hasBottomAccessory: input.bottomAccessory !== undefined,
  });
}

// Every route stays mounted in its own native screen, native decides which one is visible
function buildScreens<TNode, TEntry, TParent, TAccessory>(
  elements: INativeTabElements<TNode, TEntry, TParent, TAccessory>,
  input: INativeTabViewState<TEntry, TParent, TAccessory>,
  view: INativeTabsView,
): TNode[] {
  const { registry, handle, parent, emitterFor } = input;
  return view.screens.flatMap(({ route, screen }) => {
    const entry = registry.get(route.name);
    if (entry === undefined) {
      dlog(`NativeTab: no screen registered for route name "${route.name}"`);
      return [];
    }
    const scope = {
      route,
      navigation: handle,
      emitter: emitterFor(route.key),
      parent,
    };
    return elements.createView(
      screen.viewName,
      { key: route.key, ...screen.props },
      [elements.createContent(entry, scope)],
    );
  });
}

// One content view per environment, native shows the one that matches the bar it is in
function buildAccessory<TNode, TEntry, TParent, TAccessory>(
  elements: INativeTabElements<TNode, TEntry, TParent, TAccessory>,
  view: INativeTabsView,
  accessory: TAccessory | undefined,
): TNode[] {
  const { bottomAccessory } = view;
  if (bottomAccessory === undefined || accessory === undefined) return [];
  const contents = bottomAccessory.contents.map(content =>
    elements.createView(
      content.viewName,
      { key: content.environment, ...content.props },
      [elements.createAccessory(accessory, content.environment)],
    ),
  );
  return [
    elements.createView(
      bottomAccessory.viewName,
      { key: bottomAccessory.viewName, ...bottomAccessory.props },
      contents,
    ),
  ];
}

export function createNativeTabsRenderer<
  TNode,
  TEntry extends INativeTabViewEntry,
  TParent,
  TAccessory,
>(
  elements: INativeTabElements<TNode, TEntry, TParent, TAccessory>,
): (input: INativeTabViewState<TEntry, TParent, TAccessory>) => TNode {
  return input => {
    const view = planNativeTabs(elements.platform, input);
    return elements.createView(view.host.viewName, view.host.props, [
      ...buildScreens(elements, input, view),
      ...buildAccessory(elements, view, input.bottomAccessory),
    ]);
  };
}

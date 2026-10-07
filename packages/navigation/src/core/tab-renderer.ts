// A whole tab navigator as elements: the focused screen over the bar, built with the adapter's
// factories

import type { IDescriptor } from '@symbiote-native/components';
import type { ITabNavigatorHandle } from './navigator-handles';
import type { IRoute } from './navigator-state';
import { renderTabBar } from './render-tabs';
import { buildTabBarItems, resolveFocusedTabOptions } from './tab-bar-model';
import type { ITabBarInput } from './tab-bar-model';
import type { ITabOptions } from './tab-options';
import type { ITabRouterState } from './tab-router-state';

type IOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

type ITabViewEntry = {
  options?: ITabOptions | ((args: IOptionsArgs) => ITabOptions);
};

// What the renderer reads from the adapter's view input, which carries more fields than these
export type ITabViewState = {
  state: ITabRouterState;
  handle: ITabNavigatorHandle;
  registry: ReadonlyMap<string, ITabViewEntry>;
  screenOptions: ITabOptions | undefined;
};

export type ITabElements<TNode> = {
  createView: (style: object, children: TNode[]) => TNode;
  createBar: (bar: IDescriptor) => TNode;
};

const FILL_STYLE = { flex: 1 };

export function createTabRenderer<TView extends ITabViewState, TNode>(
  elements: ITabElements<TNode>,
  content: (view: TView) => TNode[],
): (view: TView) => TNode {
  return view => {
    const bar: ITabBarInput<ITabViewEntry> = {
      state: view.state,
      handle: view.handle,
      entryFor: name => view.registry.get(name),
      optionsOf: entry => entry.options,
      screenOptions: view.screenOptions,
    };
    const tabBar = elements.createBar(
      renderTabBar({
        items: buildTabBarItems(bar),
        style: resolveFocusedTabOptions(bar)?.tabBarStyle,
        passthrough: {},
      }),
    );
    return elements.createView(FILL_STYLE, [
      elements.createView(FILL_STYLE, content(view)),
      tabBar,
    ]);
  };
}

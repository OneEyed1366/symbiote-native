// The drawer's panel: the adapter's `drawerContent` render function, fed the state and descriptors

import { buildDrawerDescriptors } from './drawer-descriptors';
import type { IDrawerScreenOptions } from './drawer-options';
import type { IDrawerRouterState } from './drawer-router-state';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
} from './navigator-handles';
import type { IRoute } from './navigator-state';

export type IDrawerContentProps = {
  state: IDrawerRouterState;
  descriptors: IDrawerDescriptorMap;
  navigation: IDrawerNavigatorHandle;
};

type IOptionsArgs = {
  route: IRoute<unknown>;
  navigation: IDrawerNavigatorHandle;
};

// What the panel reads from the adapter's view input, which carries more fields than these
export type IDrawerPanelView = {
  state: IDrawerRouterState;
  handle: IDrawerNavigatorHandle;
  registry: ReadonlyMap<
    string,
    {
      options?:
        IDrawerScreenOptions | ((args: IOptionsArgs) => IDrawerScreenOptions);
    }
  >;
  screenOptions?: IDrawerScreenOptions;
};

// `undefined` when the app passed no `drawerContent`, so the slot stays empty
export function renderDrawerPanel<TResult>(
  view: IDrawerPanelView,
  render: ((props: IDrawerContentProps) => TResult) | undefined,
): TResult | undefined {
  const { state, handle, registry, screenOptions } = view;
  return render?.({
    state,
    descriptors: buildDrawerDescriptors({
      state,
      handle,
      entryFor: name => registry.get(name),
      optionsOf: entry => entry.options,
      screenOptions,
    }),
    navigation: handle,
  });
}

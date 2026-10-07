// The descriptor map a drawer's `drawerContent` reads to label its menu entries, by route key

import type { IDrawerScreenOptions } from './drawer-options';
import type { IDrawerRouterState } from './drawer-router-state';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
} from './navigator-handles';
import { mergeScreenOptions } from './navigator-wiring';
import type { IRoute } from './navigator-state';

type IOptionsArgs = {
  route: IRoute<unknown>;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerDescriptorInput<TEntry> = {
  state: IDrawerRouterState;
  handle: IDrawerNavigatorHandle;
  entryFor: (routeName: string) => TEntry | undefined;
  // The adapter's registry entry holds its own options, a value or a resolver
  optionsOf: (
    entry: TEntry,
  ) =>
    | IDrawerScreenOptions
    | ((args: IOptionsArgs) => IDrawerScreenOptions)
    | undefined;
  // Navigator-level options every screen starts from
  screenOptions?: IDrawerScreenOptions;
};

export function buildDrawerDescriptors<TEntry>(
  input: IDrawerDescriptorInput<TEntry>,
): IDrawerDescriptorMap {
  const { state, handle, entryFor, optionsOf, screenOptions } = input;
  const descriptors: IDrawerDescriptorMap = {};
  for (const route of state.routes) {
    const entry = entryFor(route.name);
    if (entry === undefined) continue;
    descriptors[route.key] = {
      options: mergeScreenOptions(
        optionsOf(entry),
        { route, navigation: handle },
        screenOptions,
      ),
      navigation: handle,
    };
  }
  return descriptors;
}

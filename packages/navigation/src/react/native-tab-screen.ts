// NativeTab.Screen: a declarative marker, never rendered on its own
// NativeTab reads its props to build the name -> entry registry and mounts every route itself

import type { FC, ReactElement } from 'react';
import type {
  INativeTabsViewScreenOptions,
  IRoute,
  ITabNavigatorHandle,
} from '../core';

// The resolver runs inside NativeTab while it computes a screen, closing over the live handle
export type INativeTabScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type INativeTabScreenOptionsResolver = (
  args: INativeTabScreenOptionsArgs,
) => INativeTabsViewScreenOptions;

export type INativeTabScreenProps = {
  name: string;
  component: FC;
  options?: INativeTabsViewScreenOptions | INativeTabScreenOptionsResolver;
  initialParams?: unknown;
};

export function NativeTabScreen(
  _props: INativeTabScreenProps,
): ReactElement | null {
  return null;
}

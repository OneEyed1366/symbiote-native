// NativeTab.Screen: a declarative marker, never rendered on its own
// NativeTab scans its default slot for these to build the name -> entry registry

import { defineComponent } from '@vue/runtime-core';
import type { Component } from '@vue/runtime-core';
import type {
  INativeTabsViewScreenOptions,
  IRoute,
  ITabNavigatorHandle,
} from '../core';

export type INativeTabScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type INativeTabScreenOptionsResolver = (
  props: INativeTabScreenOptionsArgs,
) => INativeTabsViewScreenOptions;

export type INativeTabScreenProps = {
  name: string;
  component: Component;
  options?: INativeTabsViewScreenOptions | INativeTabScreenOptionsResolver;
  initialParams?: unknown;
};

export const NativeTabScreen = defineComponent<INativeTabScreenProps>(
  () => () => null,
  { name: 'NativeTabScreen', inheritAttrs: false },
);

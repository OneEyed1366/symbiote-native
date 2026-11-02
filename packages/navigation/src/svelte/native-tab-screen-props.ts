// NativeTab.Screen's public prop types, `component` is a Svelte value and the rest is agnostic

import type { Component } from 'svelte';
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
  args: INativeTabScreenOptionsArgs,
) => INativeTabsViewScreenOptions;

export type INativeTabScreenProps = {
  name: string;
  component: Component;
  options?: INativeTabsViewScreenOptions | INativeTabScreenOptionsResolver;
  initialParams?: unknown;
};

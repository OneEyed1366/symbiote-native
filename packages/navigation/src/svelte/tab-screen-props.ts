// Tab.Screen's public prop surface - mirrors screen-props.ts minus the stack-only concepts (no
// push/pop lifecycle, no header search bar). Split out of `tab-screen.svelte` for the same
// tsc-cannot-see-a-`.svelte`-named-export reason screen-props.ts documents.

import type { Component } from 'svelte';
import type { IRoute, ITabNavigatorHandle, ITabOptions } from '../core';

export type ITabScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type ITabScreenOptionsResolver = (args: ITabScreenOptionsArgs) => ITabOptions;

export type ITabScreenProps = {
  name: string;
  component: Component;
  options?: ITabOptions | ITabScreenOptionsResolver;
  initialParams?: unknown;
};

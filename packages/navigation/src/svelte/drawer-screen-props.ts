// Drawer.Screen's public prop surface - mirrors tab-screen-props.ts (Tab is the closer sibling:
// both are fixed-route-list, no-push navigators). Split out of `drawer-screen.svelte` for the
// same tsc-cannot-see-a-`.svelte`-named-export reason screen-props.ts documents.

import type { Component } from 'svelte';
import type { IDrawerNavigatorHandle, IDrawerScreenOptions, IRoute } from '../core';

export type IDrawerScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerScreenOptionsResolver = (args: IDrawerScreenOptionsArgs) => IDrawerScreenOptions;

export type IDrawerScreenProps = {
  name: string;
  component: Component;
  options?: IDrawerScreenOptions | IDrawerScreenOptionsResolver;
  initialParams?: unknown;
};

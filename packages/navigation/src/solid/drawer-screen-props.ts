// Drawer.Screen's public prop types. Same split rationale as screen-props.ts.

import type { Component } from 'solid-js';
import type {
  IDrawerNavigatorHandle,
  IDrawerScreenOptions,
  IRoute,
} from '../core';

export type IDrawerScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerScreenOptionsResolver = (
  args: IDrawerScreenOptionsArgs,
) => IDrawerScreenOptions;

export type IDrawerScreenProps = {
  name: string;
  component: Component;
  options?: IDrawerScreenOptions | IDrawerScreenOptionsResolver;
  initialParams?: unknown;
};

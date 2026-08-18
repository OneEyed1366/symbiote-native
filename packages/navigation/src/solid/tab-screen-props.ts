// Tab.Screen's public prop types. Same split rationale as screen-props.ts: `component` is a Solid
// value, everything else rides on the agnostic base from ../core.

import type { Component } from 'solid-js';
import type { IRoute, ITabNavigatorHandle, ITabOptions } from '../core';

export type ITabScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type ITabScreenOptionsResolver = (
  args: ITabScreenOptionsArgs,
) => ITabOptions;

export type ITabScreenProps = {
  name: string;
  component: Component;
  options?: ITabOptions | ITabScreenOptionsResolver;
  initialParams?: unknown;
};

// `Stack.Screen` public prop types, apart from the marker so `screen-registry.ts` can name them
// A Solid `Component`, element and callback ref are framework values, so they live here
// The agnostic field base (`IScreenOptions`, `ISearchBarOptions`, `IRoute`) comes from `../core`

import type { Component } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import type {
  IHeaderViewOptions,
  INavigatorHandle,
  IRoute,
  IScreenOptions,
  ISearchBarCommands,
  ISearchBarOptions,
} from '../core';

// The search bar commands reach the app through a callback ref, Solid's spelling of a handle
// `null` arrives when the host element goes away
export type ISolidSearchBarOptions = ISearchBarOptions & {
  ref?: (commands: ISearchBarCommands | null) => void;
};

export type ISolidScreenOptions = Omit<
  IScreenOptions,
  'headerSearchBarOptions'
> &
  IHeaderViewOptions<JSX.Element> & {
    headerSearchBarOptions?: ISolidSearchBarOptions;
    sheetFooter?: () => JSX.Element;
  };

// The resolver runs outside any component scope and gets the route and handle as arguments
// Screens read those through `./primitives`, a resolver has no owner to read a context from
export type IScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

export type IScreenOptionsResolver = (
  args: IScreenOptionsArgs,
) => ISolidScreenOptions;

export type IScreenProps = {
  name: string;
  component: Component;
  options?: ISolidScreenOptions | IScreenOptionsResolver;
  initialParams?: unknown;
};

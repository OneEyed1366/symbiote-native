// Stack.Screen's public prop types, split out of the marker component itself so screen-registry.ts
// can name `IScreenProps['options']` without importing a component (which would make the two
// modules circular).
//
// Declared here rather than re-exported from another adapter: `component` is a Solid `Component`
// and the search-bar `ref` is a Solid callback ref, both framework values, which is exactly the
// test <prop_types_split_agnostic_vs_per_adapter> applies. The agnostic FIELD BASE (IScreenOptions,
// ISearchBarOptions, IRoute, INavigatorHandle) is shared from ../core verbatim.

import type { Component } from 'solid-js';
import type {
  INavigatorHandle,
  IRoute,
  IScreenOptions,
  ISearchBarCommands,
  ISearchBarOptions,
} from '../core';

// The imperative search-bar handle (focus/blur/clearText/setText/cancelSearch/
// toggleCancelButton). React hands it back through a `RefObject`, Vue through a `Ref`; Solid's own
// spelling of "give me the thing when it exists" is a CALLBACK, which is also what
// `ref={setCommands}` compiles to. `null` arrives when the host element goes away.
export type ISolidSearchBarOptions = ISearchBarOptions & {
  ref?: (commands: ISearchBarCommands | null) => void;
};

export type ISolidScreenOptions = Omit<
  IScreenOptions,
  'headerSearchBarOptions'
> & {
  headerSearchBarOptions?: ISolidSearchBarOptions;
};

// The options resolver runs OUTSIDE any component scope (during the options fold), so it still
// receives the route + navigator handle explicitly - screens read those through the primitives in
// ./primitives, but a resolver has no owner to read a context from.
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

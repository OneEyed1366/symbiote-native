// `Stack.Screen` public prop surface, kept out of `screen.svelte` on purpose
// `tsc --build` sees only a default export of a `.svelte` file, so a named type there is invisible

import type { Component, Snippet } from 'svelte';
import type {
  INavigatorHandle,
  IRoute,
  IScreenOptions,
  ISearchBarCommands,
  ISearchBarOptions,
} from '../core';

// The search bar commands reach the app through a cell it owns, as Svelte has no `Ref` type
// `{ current }` is the shape `IAngularSearchBarOptions` uses, a `$state` cell reacts to it
export type ISvelteSearchBarOptions = ISearchBarOptions & {
  ref?: { current: ISearchBarCommands | null };
};

// A header view is a snippet, Svelte renders it into the subview leaf that hosts it
export type ISvelteHeaderViews = {
  headerLeft?: Snippet;
  headerRight?: Snippet;
  headerTitle?: Snippet;
};

export type ISvelteScreenOptions = Omit<
  IScreenOptions,
  'headerSearchBarOptions'
> &
  ISvelteHeaderViews & {
    headerSearchBarOptions?: ISvelteSearchBarOptions;
    sheetFooter?: Snippet;
  };

// The resolver runs outside render and gets the route and handle as arguments
// Screens read those through runes, a resolver has no component scope to read context from
export type IScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

export type IScreenOptionsResolver = (
  args: IScreenOptionsArgs,
) => ISvelteScreenOptions;

export type IScreenProps = {
  name: string;
  component: Component;
  options?: ISvelteScreenOptions | IScreenOptionsResolver;
  initialParams?: unknown;
};

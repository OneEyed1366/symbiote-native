// Stack.Screen's public prop surface. Split out of `screen.svelte` because plain `tsc --build`
// resolves an import of a `.svelte` file through svelte's own ambient `declare module '*.svelte'`
// fallback (a bare default export only) and never parses the real `<script module>` block - so a
// NAMED type re-exported from a `.svelte` file is invisible to `tsc`. Same rule the Svelte
// adapter's own `view-props.ts` / `switch-props.ts` follow.

import type { Component } from 'svelte';
import type {
  INavigatorHandle,
  IRoute,
  IScreenOptions,
  ISearchBarCommands,
  ISearchBarOptions,
} from '../core';

// The imperative search-bar handle (focus/blur/clearText/setText/cancelSearch/
// toggleCancelButton) is delivered through a MUTABLE CELL the app owns, not a Svelte rune: per
// CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter> a framework ref cannot live in the
// shared, agnostic ISearchBarOptions, and Svelte has no `Ref`/`RefObject` type of its own to
// name here. `{ current }` is the same shape Angular's IAngularSearchBarOptions uses, and an app
// that wants to react to it simply declares the cell with `$state`.
export type ISvelteSearchBarOptions = ISearchBarOptions & {
  ref?: { current: ISearchBarCommands | null };
};

export type ISvelteScreenOptions = Omit<IScreenOptions, 'headerSearchBarOptions'> & {
  headerSearchBarOptions?: ISvelteSearchBarOptions;
};

// The options resolver runs OUTSIDE render (during the options fold), so it still receives the
// route + navigator handle explicitly - screens read those through runes, but a resolver has no
// component scope to read context from.
export type IScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

export type IScreenOptionsResolver = (args: IScreenOptionsArgs) => ISvelteScreenOptions;

export type IScreenProps = {
  name: string;
  component: Component;
  options?: ISvelteScreenOptions | IScreenOptionsResolver;
  initialParams?: unknown;
};

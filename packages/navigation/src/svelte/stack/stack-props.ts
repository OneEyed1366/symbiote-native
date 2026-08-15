// Stack's own public prop surface, and the internal per-route prop surface stack-screen.svelte
// takes. Both live in a plain `.ts` file for the tsc-cannot-see-a-`.svelte`-named-export reason
// ../screen-props.ts documents.

import type { Component, Snippet } from 'svelte';
import type { INavigationEmitter, INavigatorHandle, IRoute } from '../../core';
import type { INavigationScopeValue } from '../navigation-context';
import type { ISvelteScreenOptions } from '../screen-props';

// React's `children?: ReactNode` / Vue's default slot become a Svelte Snippet holding the
// `<Stack.Screen>` markers.
export type IStackProps = {
  initialRouteName?: string;
  screenOptions?: ISvelteScreenOptions;
  children?: Snippet;
};

export type IStackScreenProps = {
  route: IRoute<unknown>;
  index: number;
  routeCount: number;
  options: ISvelteScreenOptions;
  navigation: INavigatorHandle;
  emitter: INavigationEmitter;
  // The ambient scope the Stack itself read on mount (undefined at the nesting root) - becomes
  // the `parent` link a nested screen's useNavigation().getParent() walks.
  parentScope: INavigationScopeValue | undefined;
  component: Component;
  // Fired by RNSScreen's own onDismissed / header back button; the Stack pops one route.
  onPopRequested: () => void;
};

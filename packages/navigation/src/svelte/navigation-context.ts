// A screen's route, navigator and emitter travel by `setContext`, one `NavigationScope` per route
// The value is a boxed getter, as a plain value would not see the route after `setParams`

import { getContext, setContext } from 'svelte';
import type {
  IEdgeInsetState,
  INavigationEmitter,
  IRoute,
  IAnyNavigatorHandle,
  ITransitionProgress,
} from '../core';
export type { IAnyNavigatorHandle };

export type INavigationScopeValue = {
  route: IRoute<unknown>;
  navigation: IAnyNavigatorHandle;
  emitter: INavigationEmitter;
  // Only a Stack route has one, as native sends transition events for stack screens alone
  transitionProgress?: ITransitionProgress;
  // The insets this screen's header took, a nested header reads them up the `parent` chain
  edgeInsets?: IEdgeInsetState;
  // Links the enclosing screen's scope, so `getParent()` reaches a navigator above
  parent?: INavigationScopeValue;
};

export type INavigationScope = { readonly current: INavigationScopeValue };

const NAVIGATION_SCOPE_KEY = Symbol('symbiote-navigation-scope');

// Written only from NavigationScope's own init (navigation-scope.svelte), never by app code.
export function setNavigationScope(scope: INavigationScope): void {
  setContext(NAVIGATION_SCOPE_KEY, scope);
}

// Undefined means no ancestor scope, which is the nesting root and not an error
export function getNavigationScope(): INavigationScope | undefined {
  return getContext<INavigationScope | undefined>(NAVIGATION_SCOPE_KEY);
}

// The throw every rune shares, so a wording change lands once
export function requireNavigationScope(runeName: string): INavigationScope {
  const scope = getNavigationScope();
  if (scope === undefined) {
    throw new Error(
      `${runeName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return scope;
}

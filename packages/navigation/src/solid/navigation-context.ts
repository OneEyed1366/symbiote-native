// A screen's route, navigator handle and emitter travel in one Solid context, a Provider per route
// The value is an accessor, as a body runs once and `setParams` makes a new route object

import { createContext, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';
import type {
  IAnyNavigatorHandle,
  IEdgeInsetState,
  INavigationEmitter,
  IRoute,
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

export type INavigationScope = Accessor<INavigationScopeValue>;

const NavigationScopeContext = createContext<INavigationScope>();

export const NavigationScopeProvider = NavigationScopeContext.Provider;

// Undefined means no ancestor scope, which is the nesting root and not an error
export function useNavigationScope(): INavigationScope | undefined {
  return useContext(NavigationScopeContext);
}

// The throw every primitive shares, so a wording change lands once
export function requireNavigationScope(functionName: string): INavigationScope {
  const scope = useNavigationScope();
  if (scope === undefined) {
    throw new Error(
      `${functionName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return scope;
}

// Context a navigator provides per screen: the screen's own route, navigator handle and emitter
// `parent` links the enclosing screen's context, so `getParent()` reaches a navigator above

import { createContext, useContext } from 'react';
import type {
  IEdgeInsetState,
  INavigationEmitter,
  IRoute,
  IAnyNavigatorHandle,
  ITransitionProgress,
} from '../core';
export type { IAnyNavigatorHandle } from '../core';

// `navigation` stays a union, as a screen's own navigator and its parent's can differ in kind
// Consumers narrow it themselves, for example `'push' in handle` picks out a Stack handle
export type INavigationContextValue = {
  route: IRoute<unknown>;
  navigation: IAnyNavigatorHandle;
  emitter: INavigationEmitter;
  // Only a Stack route has one, as native sends transition events for stack screens alone
  transitionProgress?: ITransitionProgress;
  // The insets this screen's header took, a nested header reads them up the `parent` chain
  edgeInsets?: IEdgeInsetState;
  parent?: INavigationContextValue;
};

export const NavigationContext = createContext<
  INavigationContextValue | undefined
>(undefined);

// Every hook in ./hooks needs the same `useContext(NavigationContext)` + missing-provider throw,
// so it's co-located here instead of repeated per hook. `hookName` keeps each hook's own name in
// the thrown message.
export function useRequiredNavigationContext(
  hookName: string,
): INavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error(
      `${hookName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return context;
}

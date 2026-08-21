// The lifecycle half of the framework-agnostic emitter (../core/navigation-events). Solid's twin of
// React's Context / Vue's provide-inject / Svelte's setContext is `createContext` + a Provider over
// one shared key, resolved along the OWNER chain - so a screen's subtree reads its own route,
// navigator handle and per-route emitter without prop-drilling.
//
// THE VALUE IS AN ACCESSOR, never a route object. A Solid component body runs once and a context
// value is captured once, so handing over `{ route, ... }` directly would freeze every consumer at
// the route as it looked when the screen mounted - `setParams` produces a NEW route object under
// the same key and would never reach `useRoute()`. This is the same accessors-not-values rule
// descriptorToSolid is built on, one layer up (.claude/rules/solid-descriptor-bridge.md).
//
// Each navigator mounts ONE Provider per live route (keyed by route.key, exactly like React's
// per-route `<NavigationContext.Provider>`), so sibling screens never see each other's scope -
// an inherent property of any hierarchical dependency-injection scheme, not a React artifact.
//
// `parent` threads the ambient value a navigator read on ITS OWN mount (undefined at the root) into
// the value it provides to its own screens, forming a linked list - this is what lets a screen
// nested inside e.g. a Stack-screen-renders-a-Tab composition reach the enclosing Stack via
// useNavigation().getParent().

import { createContext, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { IAnyNavigatorHandle, INavigationEmitter, IRoute } from '../core';
export type { IAnyNavigatorHandle };

export type INavigationScopeValue = {
  route: IRoute<unknown>;
  navigation: IAnyNavigatorHandle;
  emitter: INavigationEmitter;
  parent?: INavigationScopeValue;
};

export type INavigationScope = Accessor<INavigationScopeValue>;

const NavigationScopeContext = createContext<INavigationScope>();

export const NavigationScopeProvider = NavigationScopeContext.Provider;

// undefined simply means "no ancestor scope", which is a legitimate state (the nesting root a
// navigator itself reads on its own mount) rather than an error - callers that require one go
// through requireNavigationScope below.
export function useNavigationScope(): INavigationScope | undefined {
  return useContext(NavigationScopeContext);
}

// The "throw if missing" half every primitive in ./primitives needs - they all read the scope and
// threw the same shaped error, differing only in which function name the message names.
export function requireNavigationScope(functionName: string): INavigationScope {
  const scope = useNavigationScope();
  if (scope === undefined) {
    throw new Error(
      `${functionName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return scope;
}

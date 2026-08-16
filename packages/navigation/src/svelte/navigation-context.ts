// The lifecycle half of the framework-agnostic emitter (../core/navigation-events). Svelte's twin
// of React's Context / Vue's provide-inject is setContext/getContext over one shared key, so a
// screen's subtree can read its own route, navigator handle, and per-route emitter without
// prop-drilling.
//
// Context in Svelte follows the RUNTIME render tree, not the lexical definition site: a component
// instantiated inside a snippet the app passed down to <Stack> still sees the context <Stack> (or
// the NavigationScope it renders) set - verified against the real compiler before this was built
// on. That is what lets a navigator hand each mounted route its OWN scope: Stack/Tab/Drawer mount
// one NavigationScope per route (keyed by route.key, exactly like React's per-route
// `<NavigationContext.Provider>`), and each instance's own init calls the setter once.
//
// The value is a BOXED GETTER (`{ get current() }`), never a bare value: Svelte 5 reactivity does
// not survive being handed out of the declaring scope as a plain value (svelte-adapter-dom-shim
// skill §21), and consumers must keep seeing the CURRENT route (a setParams that produces a new
// route object for the same key still has to reach them).
//
// `parent` threads the ambient value a navigator read on ITS OWN mount (undefined at the root)
// into the value it provides to its own screens, forming a linked list - this is what lets a
// screen nested inside e.g. a Stack-screen-renders-a-Tab composition reach the enclosing Stack via
// useNavigation().getParent().

import { getContext, setContext } from 'svelte';
import type { INavigationEmitter, IRoute, IAnyNavigatorHandle } from '../core';
export type { IAnyNavigatorHandle };

export type INavigationScopeValue = {
  route: IRoute<unknown>;
  navigation: IAnyNavigatorHandle;
  emitter: INavigationEmitter;
  parent?: INavigationScopeValue;
};

export type INavigationScope = { readonly current: INavigationScopeValue };

const NAVIGATION_SCOPE_KEY = Symbol('symbiote-navigation-scope');

// Written only from NavigationScope's own init (navigation-scope.svelte), never by app code.
export function setNavigationScope(scope: INavigationScope): void {
  setContext(NAVIGATION_SCOPE_KEY, scope);
}

// undefined simply means "no ancestor NavigationScope", which is a legitimate state (the nesting
// root a navigator itself reads on mount) rather than an error - callers that require one go
// through requireNavigationScope below.
export function getNavigationScope(): INavigationScope | undefined {
  return getContext<INavigationScope | undefined>(NAVIGATION_SCOPE_KEY);
}

// The "throw if missing" half every rune in ./runes needs (useNavigation, useRoute, useIsFocused,
// useFocusEffect, useNavigationState) - they all read the scope and threw the same shaped error,
// differing only in which rune name the message names. Centralized here so a wording change lands
// once instead of five times.
export function requireNavigationScope(runeName: string): INavigationScope {
  const scope = getNavigationScope();
  if (scope === undefined) {
    throw new Error(
      `${runeName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return scope;
}

// The lifecycle half of the framework-agnostic emitter (../core/navigation-events): a plain
// React Context so a screen's subtree can read its own route, navigator handle, and per-route
// emitter without prop-drilling — the same role @react-navigation's NavigationContext /
// NavigationRouteContext play, collapsed into one context since a symbiote screen only ever needs
// its OWN route (no per-navigator param-list generics in v1 scope — see screen.ts). Provided
// per-screen by each of stack.ts/tabs.ts/drawer.ts's render loop, consumed by the hooks in
// ./hooks. `parent` threads the ambient context a navigator read on ITS OWN mount (undefined at
// the root) into the value it provides to its own screens, forming a linked list — this is what
// lets a screen nested inside e.g. a Stack-screen-renders-a-Tab composition reach the enclosing
// Stack via useNavigation().getParent().

import { createContext } from 'react';
import type { INavigationEmitter, IRoute } from '../core';
import type { INavigatorHandle } from './stack';
import type { ITabNavigatorHandle } from './tabs';
import type { IDrawerNavigatorHandle } from './drawer';

// Every navigator kind a screen might be rendered under. A nested navigator (e.g. a Tab rendered
// as a Stack screen's content) means a screen's OWN navigation prop and its PARENT's handle can be
// different navigator kinds, so the Context value's `navigation` field can't stay Stack-specific
// like it was before Tab/Drawer also started providing this Context. Consumers narrow the union
// themselves (e.g. `'push' in handle` picks out a Stack handle) — no `as` casts.
export type IAnyNavigatorHandle = INavigatorHandle | ITabNavigatorHandle | IDrawerNavigatorHandle;

export type INavigationContextValue = {
  route: IRoute<unknown>;
  navigation: IAnyNavigatorHandle;
  emitter: INavigationEmitter;
  parent?: INavigationContextValue;
};

export const NavigationContext = createContext<INavigationContextValue | undefined>(undefined);

// Co-located unit test (ADR 0025) for the pure tab-router reducer - CANONICAL coverage for
// tabRouterReducer (twin of navigator-state.test.ts's Stack coverage), so React/Vue/Angular/
// Svelte's tab adapters all inherit one verified reducer instead of re-deriving jumpTo/setParams
// per framework. Structural difference from Stack: tabs never push/pop, they move a focused
// INDEX between a fixed route list (see the source file's header).
//
// No Negative group: tabRouterReducer never throws - an unmatched name/key is a same-reference
// no-op, asserted explicitly with `.toBe` below, not just "didn't crash".

import { describe, expect, it } from 'vitest';
import {
  createInitialTabState,
  isFocusedRoute,
  reconcileTabRoutes,
  tabRouterReducer,
} from './index';
import type { ITabRouterState } from './index';

const FEED = { key: 'feed-1', name: 'Feed', params: { sort: 'new' } };
const PROFILE = { key: 'profile-1', name: 'Profile', params: { id: 1 } };

function twoRouteState(): ITabRouterState {
  return { routes: [FEED, PROFILE], index: 0 };
}

describe('createInitialTabState', () => {
  it('focuses the first route when no initialRouteName is given', () => {
    expect(createInitialTabState([FEED, PROFILE])).toEqual({ routes: [FEED, PROFILE], index: 0 });
  });

  it('focuses the route matching initialRouteName', () => {
    expect(createInitialTabState([FEED, PROFILE], 'Profile').index).toBe(1);
  });

  it('falls back to the first route when initialRouteName matches nothing', () => {
    expect(createInitialTabState([FEED, PROFILE], 'Nowhere').index).toBe(0);
  });
});

describe('tabRouterReducer — jumpTo', () => {
  it('moves the focused index to the named route', () => {
    const next = tabRouterReducer(twoRouteState(), { type: 'jumpTo', name: 'Profile' });
    expect(next.index).toBe(1);
  });

  // why: JUMP_TO only ever MOVES the focus - mirrors TabRouter, tabs have a fixed route set (the
  // source header comment: "tabs never push/pop a route"), so the route array itself must be
  // untouched, only `index` changes.
  it('never mutates the route array itself, only the focused index', () => {
    const state = twoRouteState();
    const next = tabRouterReducer(state, { type: 'jumpTo', name: 'Profile' });
    expect(next.routes).toBe(state.routes);
  });

  it('is a no-op for an unknown route name, same reference returned', () => {
    const state = twoRouteState();
    expect(tabRouterReducer(state, { type: 'jumpTo', name: 'Nowhere' })).toBe(state);
  });

  it('is a no-op when already focused on that route and no params given, same reference returned', () => {
    const state = twoRouteState();
    expect(tabRouterReducer(state, { type: 'jumpTo', name: 'Feed' })).toBe(state);
  });

  it('merges params onto the target route when jumping with params', () => {
    const next = tabRouterReducer(twoRouteState(), {
      type: 'jumpTo',
      name: 'Profile',
      params: { tab: 'posts' },
    });
    expect(next.index).toBe(1);
    expect(next.routes[1].params).toEqual({ id: 1, tab: 'posts' });
  });

  // why: jumpTo(name, params) still merges even when re-jumping to the ALREADY-focused route -
  // params must not be silently dropped just because the index doesn't change (distinct from the
  // no-params case above, which legitimately short-circuits to the same reference).
  it('merges params even when jumping to the already-focused route', () => {
    const next = tabRouterReducer(twoRouteState(), {
      type: 'jumpTo',
      name: 'Feed',
      params: { sort: 'top' },
    });
    expect(next.index).toBe(0);
    expect(next.routes[0].params).toEqual({ sort: 'top' });
  });

  it('jumpTo replaces (not merges) params when incoming params is an array', () => {
    // why: mergeParams (core/guards.ts) only merges when BOTH sides are plain records - an array
    // payload means a clean replace, matching CommonActions.setParams' documented guard against
    // numeric-key-mangled merges.
    const next = tabRouterReducer(twoRouteState(), {
      type: 'jumpTo',
      name: 'Profile',
      params: [1, 2, 3],
    });
    expect(next.routes[1].params).toEqual([1, 2, 3]);
  });
});

describe('tabRouterReducer — setParams', () => {
  it('merges params onto the route matched by key, without changing focus', () => {
    const next = tabRouterReducer(twoRouteState(), {
      type: 'setParams',
      key: 'profile-1',
      params: { tab: 'posts' },
    });
    expect(next.index).toBe(0);
    expect(next.routes[1].params).toEqual({ id: 1, tab: 'posts' });
  });

  it('is a no-op for an unmatched key, same reference returned', () => {
    const state = twoRouteState();
    expect(tabRouterReducer(state, { type: 'setParams', key: 'missing', params: { a: 1 } })).toBe(
      state,
    );
  });

  it('setParams replaces (not merges) params when incoming params is an array', () => {
    const next = tabRouterReducer(twoRouteState(), {
      type: 'setParams',
      key: 'profile-1',
      params: [1, 2, 3],
    });
    expect(next.routes[1].params).toEqual([1, 2, 3]);
  });
});

describe('reconcileTabRoutes', () => {
  const SETTINGS = { key: 'settings-1', name: 'Settings', params: undefined };

  it('is a no-op when the same names come back, same reference returned', () => {
    const state = twoRouteState();
    expect(reconcileTabRoutes(state, [FEED, PROFILE])).toBe(state);
  });

  // why: a re-derived route list carries the marker's initialParams again; the accumulated params
  // (and the key screens are already mounted under) live on the state's own route object, so the
  // survivor must win over its freshly-derived twin.
  it('keeps a surviving route identity and params over the freshly derived entry', () => {
    const state = twoRouteState();
    const derived = [{ key: 'feed-2', name: 'Feed', params: undefined }];
    expect(reconcileTabRoutes(state, derived).routes).toEqual([FEED]);
  });

  it('adds a route for a newly registered name', () => {
    const next = reconcileTabRoutes(twoRouteState(), [FEED, PROFILE, SETTINGS]);
    expect(next.routes).toEqual([FEED, PROFILE, SETTINGS]);
  });

  it('drops a route whose screen unregistered', () => {
    expect(reconcileTabRoutes(twoRouteState(), [FEED]).routes).toEqual([FEED]);
  });

  it('keeps focus on the same route when an unrelated route is dropped', () => {
    const state: ITabRouterState = { routes: [FEED, PROFILE, SETTINGS], index: 2 };
    const next = reconcileTabRoutes(state, [FEED, SETTINGS]);
    expect(next.index).toBe(1);
    expect(next.routes[next.index]).toBe(SETTINGS);
  });

  it('falls back to the first route when the focused route is dropped', () => {
    const state: ITabRouterState = { routes: [FEED, PROFILE], index: 1 };
    expect(reconcileTabRoutes(state, [FEED])).toEqual({ routes: [FEED], index: 0 });
  });

  it('reorders routes to follow the incoming order', () => {
    const next = reconcileTabRoutes(twoRouteState(), [PROFILE, FEED]);
    expect(next.routes).toEqual([PROFILE, FEED]);
    expect(next.index).toBe(1);
  });

  it('yields an empty route list when every screen unregisters', () => {
    expect(reconcileTabRoutes(twoRouteState(), [])).toEqual({ routes: [], index: 0 });
  });
});

describe('isFocusedRoute', () => {
  it('is true when the index matches the focused index', () => {
    expect(isFocusedRoute(1, 1)).toBe(true);
  });

  it('is false when the index does not match the focused index', () => {
    expect(isFocusedRoute(0, 1)).toBe(false);
  });
});

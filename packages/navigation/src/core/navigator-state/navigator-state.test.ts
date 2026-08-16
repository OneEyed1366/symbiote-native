// Co-located unit test (ADR 0025) for the pure route-stack reducer + the activity-state helpers
// every adapter's Stack renders through. This is the CANONICAL coverage for navigatorReducer -
// per the project's core/adapter split, React's stack.test.tsx exercises push/pop/etc only as
// LIFECYCLE WIRING (does the adapter call the right action on the right event), it does not own
// the state-transition proof; that proof belongs here so every adapter (React, Vue, Angular,
// Svelte) inherits ONE verified reducer instead of each framework's test re-deriving it.
//
// No Negative group: navigatorReducer never throws - every unmatched/no-op case is a same-
// reference return (asserted explicitly below with `.toBe`, not just "didn't crash").

import { describe, expect, it } from 'vitest';
import {
  computeActivityState,
  createInitialNavigatorState,
  isTopRoute,
  navigatorReducer,
} from './index';
import type { INavigatorState } from './index';

const HOME = { key: 'home-1', name: 'Home', params: { tab: 'feed' } };
const DETAILS = { key: 'details-1', name: 'Details', params: { id: 1 } };
const SETTINGS = { key: 'settings-1', name: 'Settings', params: undefined };

function twoRouteState(): INavigatorState {
  return { routes: [HOME, DETAILS] };
}

function threeRouteState(): INavigatorState {
  return { routes: [HOME, DETAILS, SETTINGS] };
}

describe('createInitialNavigatorState', () => {
  it('seeds a single-route state with the given route', () => {
    expect(createInitialNavigatorState(HOME)).toEqual({ routes: [HOME] });
  });
});

describe('navigatorReducer — push', () => {
  // why: push must APPEND, never replace - the whole point of a stack navigator is that the
  // prior screen stays reachable underneath the new one.
  it('appends the new route after the existing stack', () => {
    const next = navigatorReducer(twoRouteState(), { type: 'push', route: SETTINGS });
    expect(next.routes).toEqual([HOME, DETAILS, SETTINGS]);
  });

  it('can push onto a single-route stack', () => {
    const next = navigatorReducer({ routes: [HOME] }, { type: 'push', route: DETAILS });
    expect(next.routes).toEqual([HOME, DETAILS]);
  });
});

describe('navigatorReducer — pop', () => {
  it('pops exactly one route when count is omitted', () => {
    const next = navigatorReducer(threeRouteState(), { type: 'pop' });
    expect(next.routes).toEqual([HOME, DETAILS]);
  });

  it('pops the requested count of routes', () => {
    const next = navigatorReducer(threeRouteState(), { type: 'pop', count: 2 });
    expect(next.routes).toEqual([HOME]);
  });

  // why: mirrors the library refusing to pop the initial screen (source comment) - a count that
  // would overshoot the root clamps to the root instead of throwing or emptying the stack.
  it('clamps an overshooting count to the root route, never below it', () => {
    const next = navigatorReducer(threeRouteState(), { type: 'pop', count: 10 });
    expect(next.routes).toEqual([HOME]);
  });

  it('is a no-op on a single-route stack, same reference returned', () => {
    const state: INavigatorState = { routes: [HOME] };
    expect(navigatorReducer(state, { type: 'pop' })).toBe(state);
  });
});

describe('navigatorReducer — popToTop', () => {
  it('collapses a multi-route stack down to just the root', () => {
    const next = navigatorReducer(threeRouteState(), { type: 'popToTop' });
    expect(next.routes).toEqual([HOME]);
  });

  it('is a no-op already at the root, same reference returned', () => {
    const state: INavigatorState = { routes: [HOME] };
    expect(navigatorReducer(state, { type: 'popToTop' })).toBe(state);
  });
});

describe('navigatorReducer — popTo', () => {
  it('truncates the stack down to and including the matched key', () => {
    const next = navigatorReducer(threeRouteState(), { type: 'popTo', key: 'details-1' });
    expect(next.routes).toEqual([HOME, DETAILS]);
  });

  it('is a no-op for an unmatched key, same reference returned', () => {
    const state = threeRouteState();
    expect(navigatorReducer(state, { type: 'popTo', key: 'missing' })).toBe(state);
  });
});

describe('navigatorReducer — replace', () => {
  it('swaps the top route for the new one, keeping the rest of the stack', () => {
    const next = navigatorReducer(twoRouteState(), { type: 'replace', route: SETTINGS });
    expect(next.routes).toEqual([HOME, SETTINGS]);
  });

  // why: an empty routes array is a real, type-honest INavigatorState (routes: readonly
  // IRouteEntry[] allows []) even though createInitialNavigatorState never produces one - the
  // reducer guards it explicitly rather than crashing on `.slice(0, -1)` of nothing to replace.
  it('seeds the stack with the new route when there is nothing to replace', () => {
    const next = navigatorReducer({ routes: [] }, { type: 'replace', route: HOME });
    expect(next.routes).toEqual([HOME]);
  });
});

describe('navigatorReducer — setParams', () => {
  it('merges params onto the focused (top) route when no key is given', () => {
    const next = navigatorReducer(twoRouteState(), { type: 'setParams', params: { id: 2 } });
    expect(next.routes).toEqual([HOME, { ...DETAILS, params: { id: 2 } }]);
  });

  it('merges params onto the route matched by key, not the top route', () => {
    const next = navigatorReducer(twoRouteState(), {
      type: 'setParams',
      key: 'home-1',
      params: { tab: 'search' },
    });
    expect(next.routes).toEqual([{ ...HOME, params: { tab: 'search' } }, DETAILS]);
  });

  it('shallow-merges, keeping sibling fields the new params omit', () => {
    const state: INavigatorState = {
      routes: [{ key: 'r1', name: 'Home', params: { a: 1, b: 2 } }],
    };
    const next = navigatorReducer(state, { type: 'setParams', params: { b: 3 } });
    expect(next.routes[0].params).toEqual({ a: 1, b: 3 });
  });

  it('replaces params outright when the existing params are not an object', () => {
    const state: INavigatorState = { routes: [{ key: 'r1', name: 'Home', params: undefined }] };
    const next = navigatorReducer(state, { type: 'setParams', params: { a: 1 } });
    expect(next.routes[0].params).toEqual({ a: 1 });
  });

  it('leaves state untouched when no route matches the given key', () => {
    const state = twoRouteState();
    const next = navigatorReducer(state, { type: 'setParams', key: 'missing', params: { id: 9 } });
    expect(next).toBe(state);
  });

  it('does not change route position or identity', () => {
    const next = navigatorReducer(twoRouteState(), {
      type: 'setParams',
      key: 'home-1',
      params: { tab: 'search' },
    });
    expect(next.routes).toHaveLength(2);
    expect(next.routes[0].key).toBe('home-1');
    expect(next.routes[1]).toBe(DETAILS);
  });
});

describe('navigatorReducer — reset', () => {
  it('replaces the whole state verbatim, mirroring CommonActions.reset', () => {
    const nextState: INavigatorState = {
      routes: [{ key: 'settings-1', name: 'Settings', params: undefined }],
    };
    const next = navigatorReducer(twoRouteState(), { type: 'reset', state: nextState });
    expect(next).toBe(nextState);
  });

  it('supports rehydrating a persisted multi-route state', () => {
    const persisted: INavigatorState = {
      routes: [HOME, DETAILS, { key: 'r3', name: 'Extra', params: undefined }],
    };
    const next = navigatorReducer({ routes: [HOME] }, { type: 'reset', state: persisted });
    expect(next.routes).toHaveLength(3);
  });
});

describe('computeActivityState', () => {
  // why: mirrors native-stack's `activityState={isInactive ? 0 : 2}` (source comment) - the
  // TOP route of the stack is always focused (SCREEN_ACTIVITY_STATE_FOCUSED, value 2), the
  // number react-native-screens needs to keep it interactive and visible.
  it('the top route (index === routesLength - 1) is focused', () => {
    expect(computeActivityState(2, 3)).toBe(2);
  });

  // why: no mounted route's index can ever exceed routesLength - 1 in this reducer (no
  // preloaded-screen feature), so every route BELOW the top is also focused, not "inactive" -
  // the source comment's explicit "NOT a three-way top/one-below/rest split" callout, proven
  // directly rather than just asserted in a comment.
  it('a route below the top is ALSO focused, not inactive', () => {
    expect(computeActivityState(0, 3)).toBe(2);
    expect(computeActivityState(1, 3)).toBe(2);
  });

  // why: an index past the current route count is the one shape that DOES read as inactive
  // (SCREEN_ACTIVITY_STATE_INACTIVE, value 0) - react-native-screens' own invariant
  // ("activityState can only progress") is what the reducer's design avoids triggering by never
  // producing this shape today, but the pure function itself still has to handle it.
  it('an index past the route count reads as inactive', () => {
    expect(computeActivityState(3, 3)).toBe(0);
  });
});

describe('isTopRoute', () => {
  it('is true for the last index in the stack', () => {
    expect(isTopRoute(2, 3)).toBe(true);
  });

  it('is false for any index below the last', () => {
    expect(isTopRoute(0, 3)).toBe(false);
    expect(isTopRoute(1, 3)).toBe(false);
  });
});

// Co-located unit test (ADR 0025) for the pure stack-registry reconciliation - CANONICAL coverage
// for reconcileStackRoutes (twin of tab-router-state.test.ts's reconcileTabRoutes coverage), so
// React/Vue/Angular/Svelte's stack adapters all inherit one verified rule instead of re-deriving
// "what happens when a screen marker disappears" per framework.
//
// No Negative group: reconcileStackRoutes never throws - every degenerate input (an empty registry,
// a registry sharing no name with the history) is a same-reference no-op, asserted with `.toBe`
// below rather than as "didn't crash".

import { describe, expect, it } from 'vitest';
import { reconcileStackRoutes } from './index';
import type { INavigatorState } from '../navigator-state';

const HOME = { key: 'stack-1-Home-1', name: 'Home', params: undefined };
const DETAILS = { key: 'stack-1-Details-2', name: 'Details', params: { id: 42 } };
const SETTINGS = { key: 'stack-1-Settings-3', name: 'Settings', params: undefined };

function pushedStack(): INavigatorState {
  return { routes: [HOME, DETAILS, SETTINGS] };
}

describe('reconcileStackRoutes', () => {
  it('returns the same state reference when every route name is still registered', () => {
    const state = pushedStack();
    expect(reconcileStackRoutes(state, ['Home', 'Details', 'Settings'])).toBe(state);
  });

  // why: a registry always holds names the history has never visited (every screen the app declares,
  // not just the pushed ones) - an extra registered name must not count as a change.
  it('ignores registered names the history never visited', () => {
    const state = pushedStack();
    expect(reconcileStackRoutes(state, ['Home', 'Details', 'Settings', 'Profile'])).toBe(state);
  });

  it('drops the history entry whose screen is no longer registered', () => {
    const next = reconcileStackRoutes(pushedStack(), ['Home', 'Settings']);
    expect(next.routes).toEqual([HOME, SETTINGS]);
  });

  // why: a stack route key is counter-derived, not name-derived - re-deriving a survivor would give
  // it a new key and remount a live screen, so survivors must pass through BY REFERENCE, params
  // included.
  it('preserves each surviving route object, key and params untouched', () => {
    const state = pushedStack();
    const next = reconcileStackRoutes(state, ['Home', 'Details']);
    expect(next.routes[0]).toBe(state.routes[0]);
    expect(next.routes[1]).toBe(state.routes[1]);
    expect(next.routes[1].params).toEqual({ id: 42 });
  });

  // why: the focused route IS the top one here (no `index` field - see the source header), so
  // dropping it must leave the nearest surviving route beneath it focused, exactly where a pop()
  // would have landed - upstream's `Math.min(state.index, routes.length - 1)` degenerated.
  it('leaves the nearest surviving route on top when the FOCUSED route is the one dropped', () => {
    const next = reconcileStackRoutes(pushedStack(), ['Home', 'Details']);
    expect(next.routes.at(-1)).toBe(DETAILS);
  });

  it('drops several phantom entries in one pass, keeping the survivors in order', () => {
    const next = reconcileStackRoutes(pushedStack(), ['Settings']);
    expect(next.routes).toEqual([SETTINGS]);
  });

  // why: the same screen pushed twice is two distinct history entries with distinct keys; both are
  // phantoms once the marker goes, and both must survive while it stays.
  it('treats repeated visits to one screen as separate entries', () => {
    const revisit = { key: 'stack-1-Details-4', name: 'Details', params: { id: 7 } };
    const state: INavigatorState = { routes: [HOME, DETAILS, revisit] };
    expect(reconcileStackRoutes(state, ['Home', 'Details'])).toBe(state);
    expect(reconcileStackRoutes(state, ['Home']).routes).toEqual([HOME]);
  });

  // why: `routes.length - 1` is the focused index, so an emptied list means NO focused route - the
  // blank screen this whole function exists to prevent. Minting a replacement key is the caller's
  // job (navigator-state.ts's header), so the honest fallback is to leave the history alone.
  it('never empties the route list: keeps the state when no route survives', () => {
    const state = pushedStack();
    expect(reconcileStackRoutes(state, ['Profile'])).toBe(state);
  });

  // why: an empty registry is the transient state while markers unregister and re-register across
  // a re-render, and it is also what every adapter starts from before its markers have registered -
  // wiping the history there would blank the screen on every re-render.
  it('keeps the state when nothing at all is registered', () => {
    const state = pushedStack();
    expect(reconcileStackRoutes(state, [])).toBe(state);
  });
});

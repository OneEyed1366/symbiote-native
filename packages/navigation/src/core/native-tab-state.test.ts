import { describe, expect, it } from 'vitest';
import {
  createInitialNativeTabState,
  nativeTabReducer,
  reconcileNativeTabRoutes,
} from './native-tab-state';

const ROUTES = [
  { key: 'home-1', name: 'Home', params: undefined },
  { key: 'feed-2', name: 'Feed', params: undefined },
  { key: 'me-3', name: 'Me', params: undefined },
];

describe('native tab state at the start', () => {
  it('focuses the first tab and has acknowledged nothing from native', () => {
    const state = createInitialNativeTabState(ROUTES);

    expect(state.index).toBe(0);
    expect(state.baseProvenance).toBe(0);
  });

  it('focuses the tab the app asked for', () => {
    expect(createInitialNativeTabState(ROUTES, 'Feed').index).toBe(1);
  });
});

describe('native tab state when the app moves between tabs', () => {
  it('moves the focus on jumpTo and keeps the acknowledged provenance', () => {
    const state = nativeTabReducer(
      { ...createInitialNativeTabState(ROUTES), baseProvenance: 4 },
      { type: 'jumpTo', name: 'Me' },
    );

    expect(state.index).toBe(2);
    expect(state.baseProvenance).toBe(4);
  });

  it('keeps the same state for a jump to the focused tab', () => {
    const state = createInitialNativeTabState(ROUTES);

    expect(nativeTabReducer(state, { type: 'jumpTo', name: 'Home' })).toBe(
      state,
    );
  });

  it('merges params of a route on setParams', () => {
    const state = nativeTabReducer(createInitialNativeTabState(ROUTES), {
      type: 'setParams',
      key: 'feed-2',
      params: { page: 2 },
    });

    expect(state.routes[1]?.params).toEqual({ page: 2 });
    expect(state.baseProvenance).toBe(0);
  });
});

describe('native tab state when native reports a selection', () => {
  const select = (selectedScreenKey: string, provenance: number) =>
    ({ type: 'nativeSelected', selectedScreenKey, provenance }) as const;

  it('follows the tab the user tapped and takes its provenance', () => {
    const state = nativeTabReducer(
      createInitialNativeTabState(ROUTES),
      select('me-3', 1),
    );

    expect(state.index).toBe(2);
    expect(state.baseProvenance).toBe(1);
  });

  it('takes the provenance of the echo of an app jump, the focus is already there', () => {
    const jumped = nativeTabReducer(createInitialNativeTabState(ROUTES), {
      type: 'jumpTo',
      name: 'Feed',
    });
    const state = nativeTabReducer(jumped, select('feed-2', 1));

    expect(state.index).toBe(1);
    expect(state.baseProvenance).toBe(1);
  });

  it('ignores a report older than the last acknowledged one', () => {
    const current = nativeTabReducer(
      createInitialNativeTabState(ROUTES),
      select('me-3', 5),
    );

    expect(nativeTabReducer(current, select('feed-2', 4))).toBe(current);
  });

  it('ignores a tab that is not in the route list', () => {
    const state = createInitialNativeTabState(ROUTES);

    expect(nativeTabReducer(state, select('gone-9', 1))).toBe(state);
  });

  it('keeps the same state when native repeats what JS already knows', () => {
    const current = nativeTabReducer(
      createInitialNativeTabState(ROUTES),
      select('feed-2', 2),
    );

    expect(nativeTabReducer(current, select('feed-2', 2))).toBe(current);
  });
});

describe('native tab state when the route list changes', () => {
  it('keeps the acknowledged provenance when a route disappears', () => {
    const acknowledged = nativeTabReducer(createInitialNativeTabState(ROUTES), {
      type: 'nativeSelected',
      selectedScreenKey: 'feed-2',
      provenance: 3,
    });

    const state = reconcileNativeTabRoutes(acknowledged, ROUTES.slice(0, 2));

    expect(state.routes.map(route => route.name)).toEqual(['Home', 'Feed']);
    expect(state.index).toBe(1);
    expect(state.baseProvenance).toBe(3);
  });

  it('returns the same state when the routes did not change', () => {
    const state = createInitialNativeTabState(ROUTES);

    expect(reconcileNativeTabRoutes(state, ROUTES)).toBe(state);
  });
});

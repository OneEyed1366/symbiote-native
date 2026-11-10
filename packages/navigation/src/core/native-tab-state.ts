// State of the native tabs: the tab router state plus the provenance native last acknowledged
// Native holds the real selection, so a report from it moves the focus and a JS jump only asks

import {
  createInitialTabState,
  reconcileTabRoutes,
  tabRouterReducer,
} from './tab-router-state';
import type {
  IRoute,
  ITabRouterAction,
  ITabRouterState,
} from './tab-router-state';

export type INativeTabState = ITabRouterState & {
  readonly baseProvenance: number;
};

export type INativeTabAction =
  | ITabRouterAction
  | { type: 'nativeSelected'; selectedScreenKey: string; provenance: number };

const INITIAL_PROVENANCE = 0;

export function createInitialNativeTabState(
  routes: readonly IRoute<unknown>[],
  initialRouteName?: string,
): INativeTabState {
  return {
    ...createInitialTabState(routes, initialRouteName),
    baseProvenance: INITIAL_PROVENANCE,
  };
}

// A report older than the acknowledged one is stale, as native has already moved on
function applyNativeSelection(
  state: INativeTabState,
  selectedScreenKey: string,
  provenance: number,
): INativeTabState {
  const index = state.routes.findIndex(
    route => route.key === selectedScreenKey,
  );
  if (index === -1 || provenance < state.baseProvenance) return state;
  if (index === state.index && provenance === state.baseProvenance)
    return state;
  return { ...state, index, baseProvenance: provenance };
}

export function nativeTabReducer(
  state: INativeTabState,
  action: INativeTabAction,
): INativeTabState {
  if (action.type === 'nativeSelected') {
    return applyNativeSelection(
      state,
      action.selectedScreenKey,
      action.provenance,
    );
  }
  const next = tabRouterReducer(state, action);
  return next === state
    ? state
    : { ...next, baseProvenance: state.baseProvenance };
}

export function reconcileNativeTabRoutes(
  state: INativeTabState,
  nextRoutes: readonly IRoute<unknown>[],
): INativeTabState {
  const next = reconcileTabRoutes(state, nextRoutes);
  return next === state
    ? state
    : { ...next, baseProvenance: state.baseProvenance };
}

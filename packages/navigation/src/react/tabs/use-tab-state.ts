// Router state and handle of the React Tab: a stored state reconciled with the registry on render

import { useCallback, useId, useMemo, useState } from 'react';
import { dlog } from '@symbiote-native/engine';
import {
  buildFixedRoutes,
  createInitialTabState,
  reconcileTabRoutes,
  tabRouterReducer,
} from '../../core';
import type { ITabRouterAction, ITabRouterState } from '../../core';
import { createTabHandle } from '../../core/tab-handle';

export function useTabState(
  registry: ReadonlyMap<string, { initialParams?: unknown }>,
  initialRouteName: string | undefined,
) {
  const routeIdPrefix = useId();
  const routes = useMemo(
    () => buildFixedRoutes(registry, routeIdPrefix),
    [registry, routeIdPrefix],
  );
  if (routes.length === 0) dlog('Tab: no <Tab.Screen> children registered');

  // A screen can appear or disappear after mount, so the stored state is reconciled with the
  // routes on every render, keeping each survivor's key and params and focus on the same name
  // `null` means no marker had registered, as seeding an empty list would lose `initialRouteName`
  const [storedState, setStoredState] = useState<ITabRouterState | null>(() =>
    routes.length === 0
      ? null
      : createInitialTabState(routes, initialRouteName),
  );

  const resolveState = useCallback(
    (stored: ITabRouterState | null): ITabRouterState =>
      stored === null
        ? createInitialTabState(routes, initialRouteName)
        : reconcileTabRoutes(stored, routes),
    [routes, initialRouteName],
  );

  // The updater re-resolves instead of closing over the state, so two batched dispatches compose
  const dispatch = useCallback(
    (action: ITabRouterAction) =>
      setStoredState(current =>
        tabRouterReducer(resolveState(current), action),
      ),
    [resolveState],
  );

  const handle = useMemo(() => createTabHandle(dispatch), [dispatch]);
  return { state: resolveState(storedState), handle };
}

// Stored state of a fixed-list navigator (Tab, NativeTab), reconciled with the registry on render

import { useCallback, useId, useMemo, useState } from 'react';
import { dlog } from '@symbiote-native/engine';
import { buildFixedRoutes } from '../core';
import type { IFixedRouter } from '../core';

export function useFixedRouteState<TState, TAction>(
  registry: ReadonlyMap<string, { initialParams?: unknown }>,
  initialRouteName: string | undefined,
  router: IFixedRouter<TState, TAction>,
  emptyMessage: string,
) {
  const routeIdPrefix = useId();
  const routes = useMemo(
    () => buildFixedRoutes(registry, routeIdPrefix),
    [registry, routeIdPrefix],
  );
  if (routes.length === 0) dlog(emptyMessage);

  // A screen can appear or disappear after mount
  // The state is reconciled with the routes on every render, a survivor keeps its key and params
  // `null` means no marker had registered, as seeding an empty list would lose `initialRouteName`
  const [storedState, setStoredState] = useState<TState | null>(() =>
    routes.length === 0 ? null : router.create(routes, initialRouteName),
  );

  const resolveState = useCallback(
    (stored: TState | null): TState =>
      stored === null
        ? router.create(routes, initialRouteName)
        : router.reconcile(stored, routes),
    [routes, initialRouteName, router],
  );

  // The updater re-resolves instead of closing over the state, so two batched dispatches compose
  const dispatch = useCallback(
    (action: TAction) =>
      setStoredState(current => router.reduce(resolveState(current), action)),
    [resolveState, router],
  );

  return { state: resolveState(storedState), dispatch };
}

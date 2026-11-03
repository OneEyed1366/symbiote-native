// Router state and handle of the React Tab: a stored state reconciled with the registry on render

import { useMemo } from 'react';
import {
  createInitialTabState,
  reconcileTabRoutes,
  tabRouterReducer,
} from '../../core';
import { createTabHandle } from '../../core/tab-handle';
import { useFixedRouteState } from '../use-fixed-route-state';

const TAB_ROUTER = {
  create: createInitialTabState,
  reconcile: reconcileTabRoutes,
  reduce: tabRouterReducer,
};

export function useTabState(
  registry: ReadonlyMap<string, { initialParams?: unknown }>,
  initialRouteName: string | undefined,
) {
  const { state, dispatch } = useFixedRouteState(
    registry,
    initialRouteName,
    TAB_ROUTER,
    'Tab: no <Tab.Screen> children registered',
  );
  const handle = useMemo(() => createTabHandle(dispatch), [dispatch]);
  return { state, handle };
}

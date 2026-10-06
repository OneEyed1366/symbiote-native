// Router state of the Solid Drawer: frozen at the first dispatch, seeded from the registry before

import type { Accessor } from 'solid-js';
import { dlog } from '@symbiote-native/engine';
import {
  createInitialDrawerRouterState,
  drawerRouterReducer,
} from '../../core';
import { createFixedRouterState } from '../fixed-router-state';

type IRegistry = ReadonlyMap<string, { initialParams: unknown }>;

export function createDrawerState(
  registry: Accessor<IRegistry>,
  routeIdPrefix: string,
  readInitialRouteName: () => string | undefined,
) {
  return createFixedRouterState({
    registry,
    routeIdPrefix,
    createInitial: routes => {
      if (routes.length === 0)
        dlog('Drawer: no <Drawer.Screen> children registered');
      return createInitialDrawerRouterState(routes, readInitialRouteName());
    },
    reducer: drawerRouterReducer,
  });
}

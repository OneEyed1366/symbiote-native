// Router state of the Solid Tab: a signal that stays derived from the registry until a dispatch

import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import {
  buildFixedRoutes,
  createInitialTabState,
  reconcileTabRoutes,
  tabRouterReducer,
} from '../../core';
import type {
  ITabNavigatorHandle,
  ITabRouterAction,
  ITabRouterState,
} from '../../core';

type IRegistry = ReadonlyMap<string, { initialParams: unknown }>;

export function createTabState(
  registry: Accessor<IRegistry>,
  routeIdPrefix: string,
  readInitialRouteName: () => string | undefined,
) {
  // Keys come from the screen NAME, never a counter, as the list is rebuilt on every registration
  // change and a counter would re-mount every screen for an unrelated marker edit
  const routes = createMemo(() => buildFixedRoutes(registry(), routeIdPrefix));

  // `null` means nothing was dispatched, which keeps `initialRouteName` honored when the markers
  // arrive after the body has already run
  const [dispatched, setDispatched] = createSignal<ITabRouterState | null>(
    null,
  );

  const state = createMemo<ITabRouterState>(() => {
    const previous = dispatched();
    return previous === null
      ? createInitialTabState(routes(), readInitialRouteName())
      : reconcileTabRoutes(previous, routes());
  });

  function dispatch(action: ITabRouterAction): void {
    setDispatched(tabRouterReducer(state(), action));
  }

  const handle: ITabNavigatorHandle = {
    jumpTo: (name, params) => dispatch({ type: 'jumpTo', name, params }),
    setParams: (params, key) => dispatch({ type: 'setParams', key, params }),
  };

  return { state, handle };
}

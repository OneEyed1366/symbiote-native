// Dispatched state of a fixed-list navigator (Tab, NativeTab), reconciled against the slot routes
// The state is never written back from a render, as a state write inside a derivation is an error

import { shallowReactive } from '@vue/runtime-core';
import type { IFixedRouter, IRoute } from '../core';

export function createFixedRouteState<TState, TAction>(
  router: IFixedRouter<TState, TAction>,
  initialRouteName: () => string | undefined,
  initialRoutes: readonly IRoute<unknown>[],
) {
  // `null` means nothing was dispatched, which keeps the initial route honored on late markers
  const holder = shallowReactive<{ dispatchedState: TState | null }>({
    dispatchedState: null,
  });
  // The routes the last render derived: an action must reduce over the list that paint used
  let latestRoutes = initialRoutes;

  function resolveFor(routes: readonly IRoute<unknown>[]): TState {
    const current = holder.dispatchedState;
    return current === null
      ? router.create(routes, initialRouteName())
      : router.reconcile(current, routes);
  }

  return {
    resolve(routes: readonly IRoute<unknown>[]): TState {
      latestRoutes = routes;
      return resolveFor(routes);
    },
    applyAction(action: TAction): void {
      holder.dispatchedState = router.reduce(resolveFor(latestRoutes), action);
    },
  };
}

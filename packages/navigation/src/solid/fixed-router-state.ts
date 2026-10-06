// Router state of a Solid navigator with a fixed route list (Tab, Drawer), derived from its
// registry until the first dispatch

import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import { buildFixedRoutes } from '../core';
import type { IRoute } from '../core';

export type IFixedRouterInput<TState, TAction> = {
  registry: Accessor<ReadonlyMap<string, { initialParams: unknown }>>;
  routeIdPrefix: string;
  createInitial: (routes: readonly IRoute<unknown>[]) => TState;
  // Without it the state stays frozen at the first dispatch, as Drawer does
  reconcile?: (previous: TState, routes: readonly IRoute<unknown>[]) => TState;
  reducer: (state: TState, action: TAction) => TState;
};

export function createFixedRouterState<TState, TAction>(
  input: IFixedRouterInput<TState, TAction>,
) {
  const { registry, routeIdPrefix, createInitial, reconcile, reducer } = input;
  // Keys come from the screen NAME, never a counter, so a registration change cannot re-mount
  // every screen
  const routes = createMemo(() => buildFixedRoutes(registry(), routeIdPrefix));

  // `null` means nothing was dispatched, and then the state is re-derived on every read. Each
  // marker registers with its own signal write, so a one-shot seed caught only the first screen
  const [dispatched, setDispatched] = createSignal<TState | null>(null);

  const state = createMemo<TState>(() => {
    const previous = dispatched();
    if (previous === null) return createInitial(routes());
    return reconcile ? reconcile(previous, routes()) : previous;
  });

  function dispatch(action: TAction): void {
    setDispatched(() => reducer(state(), action));
  }

  return { state, dispatch };
}

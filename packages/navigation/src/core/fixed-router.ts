// The three steps of a fixed-list navigator's router, for the adapters that store its state

import type { IRoute } from './navigator-state';

export type IFixedRouter<TState, TAction> = {
  create: (
    routes: readonly IRoute<unknown>[],
    initialRouteName: string | undefined,
  ) => TState;
  reconcile: (state: TState, routes: readonly IRoute<unknown>[]) => TState;
  reduce: (state: TState, action: TAction) => TState;
};

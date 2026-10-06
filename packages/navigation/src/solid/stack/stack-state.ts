// Router state of the Solid Stack: seeded once the markers have registered, reconciled on read

import { createEffect, createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import { dlog } from '@symbiote-native/engine';
import {
  buildInitialState,
  createEmitterStore,
  createRouteFactory,
  createStackHandle,
  navigatorReducer,
  reconcileStackRoutes,
} from '../../core';
import type { INavigatorAction, INavigatorState } from '../../core';

type IRegistry = ReadonlyMap<string, { initialParams?: unknown }>;

const EMPTY_STATE: INavigatorState = { routes: [] };

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

export function createStackState(
  registry: Accessor<IRegistry>,
  routeIdPrefix: string,
  readInitialRouteName: () => string | undefined,
) {
  const createRoute = createRouteFactory(routeIdPrefix);
  const { emitterFor, broadcastState } = createEmitterStore();
  const [dispatched, setDispatched] = createSignal<INavigatorState | null>(
    null,
  );

  // The initial push waits until the markers have registered, as Solid cannot inspect children.
  // It sits in a plain local and not a memo, since it must run EXACTLY once: a second run would
  // mint a second route key for the same screen and silently reset the stack
  let seeded: INavigatorState | undefined;
  function seed(entries: IRegistry): INavigatorState {
    if (seeded !== undefined) return seeded;
    // Never seeded from an empty registry, even when `initialRouteName` names the route: `<For>`
    // maps a key once, so a route minted before its marker exists would stay blank forever
    if (entries.size === 0) {
      dlog('Stack: no <Stack.Screen> children registered');
      return EMPTY_STATE;
    }
    seeded = buildInitialState(
      entries,
      readInitialRouteName(),
      routeIdPrefix,
      createRoute,
    );
    return seeded;
  }

  // A marker can vanish while its route is still in the history, so the repair happens on READ
  // and the next dispatch persists it
  const currentState = createMemo<INavigatorState>(() => {
    const entries = registry();
    const state = dispatched();
    if (state === null) return seed(entries);
    return reconcileStackRoutes(state, [...entries.keys()]);
  });

  function dispatch(action: INavigatorAction): void {
    setDispatched(navigatorReducer(currentState(), action));
  }

  const handle = createStackHandle(
    dispatch,
    createRoute,
    () => currentState().routes.length > 1,
  );

  // Deferred by a microtask: a screen's subtree, and the subscriptions inside it, are built by the
  // effects of the very update that changed the state, so an inline emit reaches nobody
  createEffect(() => {
    const current = currentState();
    queueMicrotask(() => broadcastState(current));
  });

  // Keyed on route KEYS, so a `setParams` (new route object, same key) never reaches `<For>` and
  // never rebuilds a screen subtree
  const routeKeys = createMemo<readonly string[]>(
    () => currentState().routes.map(route => route.key),
    [],
    { equals: sameKeys },
  );

  return { currentState, dispatch, handle, emitterFor, routeKeys };
}

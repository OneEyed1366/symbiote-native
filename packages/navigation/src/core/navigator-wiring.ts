// Navigator bookkeeping every adapter repeated: route keys, per-route emitters, option merging,
// the initial state and the imperative handle. Adapters supply only their lifecycle around it

import { dlog } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_STATE,
  createNavigationEmitter,
} from './navigation-events';
import type { INavigationEmitter } from './navigation-events';
import type { INavigatorHandle } from './navigator-handles';
import {
  createInitialNavigatorState,
  type INavigatorAction,
  type INavigatorState,
  type IRoute,
} from './navigator-state';

export type ICreateRoute = (name: string, params: unknown) => IRoute<unknown>;

// An entry's own options win over the navigator-level ones. A function is resolved OUTSIDE render,
// so it gets the route and handle explicitly instead of reading them from a component scope
export function mergeScreenOptions<TOptions extends object, TArgs>(
  entryOptions: TOptions | ((args: TArgs) => TOptions) | undefined,
  args: TArgs,
  navigatorOptions: TOptions | undefined,
): Partial<TOptions> {
  const own =
    typeof entryOptions === 'function' ? entryOptions(args) : entryOptions;
  return { ...navigatorOptions, ...own };
}

// The counter is per navigator instance and `routeIdPrefix` keeps keys unique across navigators
export function createRouteFactory(routeIdPrefix: string): ICreateRoute {
  let routeSequence = 0;
  return (name, params) => {
    routeSequence += 1;
    return { key: `${routeIdPrefix}-${name}-${routeSequence}`, name, params };
  };
}

// One emitter per `route.key`, created on the first render of a route and pruned once it is gone
export function createEmitterStore() {
  const emitters = new Map<string, INavigationEmitter>();

  function emitterFor(routeKey: string): INavigationEmitter {
    let emitter = emitters.get(routeKey);
    if (emitter === undefined) {
      emitter = createNavigationEmitter();
      emitters.set(routeKey, emitter);
    }
    return emitter;
  }

  function broadcastState(current: INavigatorState): void {
    for (const route of current.routes) {
      emitterFor(route.key).emit(NAVIGATION_EVENT_STATE, current);
    }
    for (const routeKey of emitters.keys()) {
      if (!current.routes.some(route => route.key === routeKey))
        emitters.delete(routeKey);
    }
  }

  return { emitterFor, broadcastState };
}

export function buildInitialState(
  registry: ReadonlyMap<string, { initialParams?: unknown }>,
  requestedName: string | undefined,
  routeIdPrefix: string,
  createRoute: ICreateRoute,
): INavigatorState {
  const name = requestedName ?? registry.keys().next().value;
  if (name === undefined) {
    dlog('Stack: no <Stack.Screen> children registered');
    return createInitialNavigatorState({
      key: routeIdPrefix,
      name: '',
      params: undefined,
    });
  }
  return createInitialNavigatorState(
    createRoute(name, registry.get(name)?.initialParams),
  );
}

export function createStackHandle(
  dispatch: (action: INavigatorAction) => void,
  createRoute: ICreateRoute,
  canGoBack: () => boolean,
): INavigatorHandle {
  return {
    push: (name, params) =>
      dispatch({ type: 'push', route: createRoute(name, params) }),
    pop: count => dispatch({ type: 'pop', count }),
    popToTop: () => dispatch({ type: 'popToTop' }),
    popTo: key => dispatch({ type: 'popTo', key }),
    replace: (name, params) =>
      dispatch({ type: 'replace', route: createRoute(name, params) }),
    setParams: (params, key) => dispatch({ type: 'setParams', key, params }),
    reset: nextState => dispatch({ type: 'reset', state: nextState }),
    canGoBack,
  };
}

import { NetworkRequestObserver } from './app-metrics';
import {
  filterKeyOf,
  subscribeNetworkRequestObserverEvents,
} from './network-request-observer-subscription';
import type { INetworkRequestObserverCallbacks } from './network-request-observer-subscription';
import type { INetworkRequestFilter } from './types';

export type IUseNetworkRequestObserverOptions =
  INetworkRequestObserverCallbacks & {
    /** Applied natively. Omit or pass `null` to observe every request */
    filter?: INetworkRequestFilter | null;
  };

// Shared by adapters whose reactivity auto-tracks reads inside a plain effect (Vue's
// `watchEffect`, Solid's `createEffect`); React's render model doesn't, so it keeps its own wiring
export function createNetworkRequestObserverLifecycle(
  getOptions: () => IUseNetworkRequestObserverOptions,
  runFilterEffect: (effect: () => void) => void,
  registerCleanup: (cleanup: () => void) => void,
): NetworkRequestObserver {
  const initialFilter = getOptions().filter;
  const observer = new NetworkRequestObserver(initialFilter);

  let appliedFilterKey = filterKeyOf(initialFilter);
  runFilterEffect(() => {
    const nextKey = filterKeyOf(getOptions().filter);
    if (appliedFilterKey === nextKey) return;
    appliedFilterKey = nextKey;
    observer.setFilter(getOptions().filter ?? null);
  });

  registerCleanup(subscribeNetworkRequestObserverEvents(observer, getOptions));
  registerCleanup(() => observer.release());

  return observer;
}

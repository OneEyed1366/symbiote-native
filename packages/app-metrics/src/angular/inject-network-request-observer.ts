import { DestroyRef, effect, inject } from '@angular/core';
import { createNetworkRequestObserverLifecycle } from '../core/network-request-observer-lifecycle';
import type { NetworkRequestObserver } from '../core';
import type { IUseNetworkRequestObserverOptions } from '../core/network-request-observer-lifecycle';

export type { IUseNetworkRequestObserverOptions } from '../core/network-request-observer-lifecycle';

/** Angular twin of `expo-app-metrics`'s `useNetworkRequestObserver` */
export function injectNetworkRequestObserver(
  getOptions: () => IUseNetworkRequestObserverOptions = () => ({}),
): NetworkRequestObserver {
  const destroyRef = inject(DestroyRef);
  return createNetworkRequestObserverLifecycle(
    getOptions,
    filterEffect => effect(filterEffect),
    cleanup => destroyRef.onDestroy(cleanup),
  );
}

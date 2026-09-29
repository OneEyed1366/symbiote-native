import { createEffect, onCleanup } from 'solid-js';
import { createNetworkRequestObserverLifecycle } from '../core/network-request-observer-lifecycle';
import type { NetworkRequestObserver } from '../core';
import type { IUseNetworkRequestObserverOptions } from '../core/network-request-observer-lifecycle';

export type { IUseNetworkRequestObserverOptions } from '../core/network-request-observer-lifecycle';

/** Solid twin of `expo-app-metrics`'s `useNetworkRequestObserver` */
export function useNetworkRequestObserver(
  getOptions: () => IUseNetworkRequestObserverOptions = () => ({}),
): NetworkRequestObserver {
  return createNetworkRequestObserverLifecycle(
    getOptions,
    createEffect,
    onCleanup,
  );
}

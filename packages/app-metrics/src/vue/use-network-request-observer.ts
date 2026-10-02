import { onUnmounted, watchEffect } from '@vue/runtime-core';
import { createNetworkRequestObserverLifecycle } from '../core/network-request-observer-lifecycle';
import type { NetworkRequestObserver } from '../core';
import type { IUseNetworkRequestObserverOptions } from '../core/network-request-observer-lifecycle';

export type { IUseNetworkRequestObserverOptions } from '../core/network-request-observer-lifecycle';

/** Vue twin of `expo-app-metrics`'s `useNetworkRequestObserver` */
export function useNetworkRequestObserver(
  getOptions: () => IUseNetworkRequestObserverOptions = () => ({}),
): NetworkRequestObserver {
  return createNetworkRequestObserverLifecycle(
    getOptions,
    watchEffect,
    onUnmounted,
  );
}

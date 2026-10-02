// `$effect` is a compiler macro, can't be passed by reference like `watchEffect`/`createEffect`,
// so it's wrapped instead of handed to `createNetworkRequestObserverLifecycle` directly

import { createNetworkRequestObserverLifecycle } from '../core/network-request-observer-lifecycle';
import type { NetworkRequestObserver } from '../core';
import type { IUseNetworkRequestObserverOptions } from '../core/network-request-observer-lifecycle';

export function useNetworkRequestObserver(
  getOptions: () => IUseNetworkRequestObserverOptions = () => ({}),
): NetworkRequestObserver {
  const cleanups: Array<() => void> = [];

  const observer = createNetworkRequestObserverLifecycle(
    getOptions,
    effect => {
      $effect(effect);
    },
    cleanup => cleanups.push(cleanup),
  );

  $effect(() => () => {
    for (const cleanup of cleanups) cleanup();
  });

  return observer;
}

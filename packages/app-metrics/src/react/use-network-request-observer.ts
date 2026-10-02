import { useEffect, useRef } from 'react';
import { useReleasingSharedObject } from 'expo-modules-core';
import { NetworkRequestObserver } from '../core';
import {
  filterKeyOf,
  subscribeNetworkRequestObserverEvents,
} from '../core/network-request-observer-subscription';
import type { IUseNetworkRequestObserverOptions } from '../core/network-request-observer-lifecycle';

export type { IUseNetworkRequestObserverOptions } from '../core/network-request-observer-lifecycle';

/** Allocates a `NetworkRequestObserver` for the component's lifetime, releases it on unmount */
export function useNetworkRequestObserver(
  options: IUseNetworkRequestObserverOptions = {},
): NetworkRequestObserver {
  const filterKey = filterKeyOf(options.filter);
  const observer = useReleasingSharedObject(
    () => new NetworkRequestObserver(options.filter),
    [],
  );

  // The constructor already applied the initial filter - only a LATER change goes through
  // `setFilter`, seeded with the mount key so the first effect run is a no-op
  const appliedFilterKey = useRef(filterKey);
  useEffect(() => {
    if (appliedFilterKey.current === filterKey) return;
    appliedFilterKey.current = filterKey;
    observer.setFilter(options.filter ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observer, filterKey]);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(
    () =>
      subscribeNetworkRequestObserverEvents(observer, () => optionsRef.current),
    [observer],
  );

  return observer;
}

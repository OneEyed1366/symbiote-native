// React lifecycle wiring over the framework-agnostic core (core/network.ts). Seeds the initial
// value with a one-shot getNetworkStateAsync() call before the first native event fires, matching
// upstream's own useNetworkState.
import { useEffect, useState } from 'react';
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from '../../../core';

export function useNetworkState(): NetworkState {
  const [networkState, setNetworkState] = useState<NetworkState>({});

  useEffect(() => {
    getNetworkStateAsync().then(setNetworkState);
    const subscription = addNetworkStateListener(event =>
      setNetworkState(event),
    );
    return () => subscription.remove();
  }, []);

  return networkState;
}

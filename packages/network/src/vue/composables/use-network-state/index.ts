// Vue lifecycle wiring over the framework-agnostic core (core/network.ts). Seeds the initial
// value with a one-shot getNetworkStateAsync() call before the first native event fires, matching
// upstream's own useNetworkState.

import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type EventSubscription,
  type NetworkState,
} from '../../../core';

export function useNetworkState(): Ref<NetworkState> {
  const networkState = ref<NetworkState>({});
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    getNetworkStateAsync().then(state => {
      networkState.value = state;
    });
    subscription = addNetworkStateListener(event => {
      networkState.value = event;
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return networkState;
}

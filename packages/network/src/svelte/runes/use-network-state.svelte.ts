// Svelte lifecycle wiring over the framework-agnostic core (core/network.ts). Seeds the initial
// value with a one-shot getNetworkStateAsync() call before the first native event fires, matching
// upstream's own useNetworkState and the Vue composable's onMounted half.
//
// `.svelte.ts` extension: runes ($state/$effect) only work there outside a `.svelte` component;
// `runes/` is Svelte's name for the lifecycle bucket (React's `hooks/`, Vue's `composables/`).
// Returns a boxed getter, not a bare `$state`: Svelte 5 reactivity is lexically scoped to the
// declaring module and doesn't survive being returned raw from a plain function, so the caller
// reads `.current` like unwrapping Vue's `Ref` via `.value`.
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type EventSubscription,
  type NetworkState,
} from '../../core';

export function useNetworkState(): { readonly current: NetworkState } {
  let networkState = $state<NetworkState>({});

  $effect(() => {
    // Write-only touches of `networkState`, so the effect has no dependency on it and runs once
    // per mount - the twin of Vue's onMounted/onUnmounted pair.
    getNetworkStateAsync().then(state => {
      networkState = state;
    });
    const subscription: EventSubscription = addNetworkStateListener(event => {
      networkState = event;
    });
    return () => subscription.remove();
  });

  return {
    get current(): NetworkState {
      return networkState;
    },
  };
}

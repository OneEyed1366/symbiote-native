// Svelte lifecycle wiring over the framework-agnostic core (core/network.ts). Seeds the initial
// value with a one-shot getNetworkStateAsync() call before the first native event fires, matching
// upstream's own useNetworkState and the Vue composable's onMounted half.
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) are only usable in files with this extension
// outside an actual `.svelte` component. `runes/` is Svelte's own term for the lifecycle bucket,
// per CLAUDE.md's <adapter_src_follows_framework_idioms> — React calls it `hooks/`, Vue
// `composables/`. Returns a boxed getter object, NOT a bare `$state`: Svelte 5 reactivity is
// lexically scoped to the declaring module and does not survive being returned as a raw value
// from a plain function, so the caller reads `.current` exactly like unwrapping Vue's `Ref`
// via `.value`.
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type EventSubscription,
  type NetworkState,
} from '../../core';

export function useNetworkState(): { readonly current: NetworkState } {
  let networkState = $state<NetworkState>({});

  $effect(() => {
    // Write-only touches of `networkState` (never a read), so the effect has no dependency on it
    // and runs exactly once on mount, cleaning up exactly once on unmount — the twin of Vue's
    // onMounted/onUnmounted pair.
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

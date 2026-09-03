// createNetworkState — the Solid twin of React's `useNetworkState` hook, Vue's composable and
// Svelte's rune, over the framework-agnostic core (core/network.ts). Seeds with a one-shot
// getNetworkStateAsync() call before the first native event fires, matching upstream's own
// useNetworkState.
//
// `primitives/` and `create*`, never `hooks/`+`use*`: Solid's ecosystem calls a composable
// reactive function a PRIMITIVE and reserves `use*` for consuming something that already exists.
// Full rationale in adapters/solid/src/primitives/create-color-scheme.ts.
//
// Returns an ACCESSOR, never a snapshot: a Solid component body runs ONCE, so a returned object
// would pin the caller to the empty seed forever.
//
// Outside a component or `createRoot` there is no owner for `onCleanup` — Solid warns and the
// native listener lives for the process. The accessor still tracks; only the teardown is lost.

import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type EventSubscription,
  type NetworkState,
} from '../../core';

export function createNetworkState(): Accessor<NetworkState> {
  const [networkState, setNetworkState] = createSignal<NetworkState>({});

  getNetworkStateAsync().then(state => {
    setNetworkState(state);
  });

  // Subscribed from the primitive body, not from an effect: React/Vue/Svelte start listening a
  // tick after their seed runs, so a change landing in that window is lost. Both statements here
  // run in one synchronous tick and nothing can interleave.
  const subscription: EventSubscription = addNetworkStateListener(event => {
    setNetworkState(event);
  });

  onCleanup(() => {
    subscription.remove();
  });

  return networkState;
}

// Svelte wiring of the focus/blur events: an effect feeds the focused route key to the shared
// tracker. A `.svelte.ts` file, as `$effect` is only usable outside a component in one

import { onDestroy, tick } from 'svelte';
import { createFocusTracker } from '../core';
import type { INavigationEmitter } from '../core';

type IFocusableState = {
  routes: readonly { key: string }[];
  index: number;
};

// The emit waits a `tick()`, since the focused screen's own effects subscribe during this flush
export function trackFocus(
  readState: () => IFocusableState,
  emitterFor: (routeKey: string) => INavigationEmitter,
  label: string,
): void {
  const tracker = createFocusTracker(emitterFor, label, task => {
    void tick().then(task);
  });
  $effect(() => {
    const state = readState();
    tracker.update(state.routes[state.index]?.key);
  });
  onDestroy(() => tracker.dispose());
}

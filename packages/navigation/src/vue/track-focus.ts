// Vue wiring of the focus/blur events: watchers feed the focused route key to the shared tracker

import { onMounted, onUnmounted, watch } from '@vue/runtime-core';
import type { ShallowRef } from '@vue/runtime-core';
import { createFocusTracker } from '../core';
import type { INavigationEmitter } from '../core';

type IFocusableState = {
  routes: readonly { key: string }[];
  index: number;
};

// The first emit waits for `onMounted`: the render closure runs before the focused screen mounts,
// so an emit there would always find zero subscribers
export function trackFocus(
  state: ShallowRef<IFocusableState>,
  emitterFor: (routeKey: string) => INavigationEmitter,
  label: string,
): void {
  const tracker = createFocusTracker(emitterFor, label);
  const focusedKey = (): string | undefined =>
    state.value.routes[state.value.index]?.key;
  onMounted(() => tracker.update(focusedKey()));
  watch(focusedKey, nextKey => tracker.update(nextKey));
  onUnmounted(() => tracker.dispose());
}

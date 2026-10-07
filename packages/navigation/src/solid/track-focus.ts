// Solid wiring of the focus/blur events: an effect feeds the focused key to the shared tracker

import { createEffect, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { createFocusTracker } from '../core';
import type { INavigationEmitter } from '../core';

export function trackFocus(
  focusedKey: Accessor<string | undefined>,
  emitterFor: (routeKey: string) => INavigationEmitter,
  label: string,
): void {
  const tracker = createFocusTracker(emitterFor, label);
  createEffect(() => tracker.update(focusedKey()));
  onCleanup(() => tracker.dispose());
}

// Solid lifecycle wiring over the framework-agnostic watchStepCount free function (core/) — the
// Solid twin of react/hooks/use-pedometer, vue/composables/use-pedometer and
// svelte/runes/use-pedometer.svelte.ts. Pedometer is the one sensor here that is not a
// DeviceSensor subclass (core/pedometer.ts's header), so it has no setUpdateInterval and takes no
// interval argument — hence its own body instead of ./device-sensor-accessor.
//
// `primitives/` and `create*`, and an ACCESSOR rather than a snapshot, for the reasons recorded in
// adapters/solid/src/primitives/create-color-scheme.ts.

import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  watchStepCount,
  type EventSubscription,
  type IPedometerResult,
} from '../../core';

export function createPedometer(): Accessor<IPedometerResult | null> {
  const [result, setResult] = createSignal<IPedometerResult | null>(null);

  // Subscribed from the primitive body, not from an effect: React/Vue/Svelte start listening a
  // tick after their seed runs, so a step count landing in that window is lost.
  const subscription: EventSubscription = watchStepCount(next => {
    setResult(next);
  });

  onCleanup(() => {
    subscription.remove();
  });

  return result;
}

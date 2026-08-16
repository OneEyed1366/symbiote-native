// Svelte lifecycle wiring over the framework-agnostic watchStepCount free function (core/) —
// mirrors use-accelerometer.svelte.ts's shape. Pedometer has no setUpdateInterval, so unlike
// useAccelerometer there is no interval param to apply at subscribe time. See
// use-accelerometer.svelte.ts's header for why this lives in `runes/` with a `.svelte.ts`
// extension and returns a boxed getter object.
import { watchStepCount, type EventSubscription, type IPedometerResult } from '../../core';

export function usePedometer(): { readonly current: IPedometerResult | null } {
  let result = $state<IPedometerResult | null>(null);

  $effect(() => {
    const subscription: EventSubscription = watchStepCount(next => {
      result = next;
    });
    return () => subscription.remove();
  });

  return {
    get current(): IPedometerResult | null {
      return result;
    },
  };
}

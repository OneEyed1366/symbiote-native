// Svelte lifecycle wiring over the framework-agnostic Magnetometer singleton (core/) — mirrors
// use-accelerometer.svelte.ts's shape exactly. See its header for why this lives in `runes/` with
// a `.svelte.ts` extension, returns a boxed getter object, and takes a plain `updateIntervalMs`
// rather than a getter.
import {
  Magnetometer,
  type EventSubscription,
  type IMagnetometerMeasurement,
} from '../../core';

export function useMagnetometer(updateIntervalMs?: number): {
  readonly current: IMagnetometerMeasurement | null;
} {
  let measurement = $state<IMagnetometerMeasurement | null>(null);

  $effect(() => {
    if (updateIntervalMs !== undefined) {
      Magnetometer.setUpdateInterval(updateIntervalMs);
    }
    const subscription: EventSubscription = Magnetometer.addListener(next => {
      measurement = next;
    });
    return () => subscription.remove();
  });

  return {
    get current(): IMagnetometerMeasurement | null {
      return measurement;
    },
  };
}

// Svelte lifecycle wiring over the framework-agnostic MagnetometerUncalibrated singleton (core/) —
// mirrors use-accelerometer.svelte.ts's shape exactly. See its header for why this lives in
// `runes/` with a `.svelte.ts` extension, returns a boxed getter object, and takes a plain
// `updateIntervalMs` rather than a getter.
import {
  MagnetometerUncalibrated,
  type EventSubscription,
  type IMagnetometerUncalibratedMeasurement,
} from '../../core';

export function useMagnetometerUncalibrated(updateIntervalMs?: number): {
  readonly current: IMagnetometerUncalibratedMeasurement | null;
} {
  let measurement = $state<IMagnetometerUncalibratedMeasurement | null>(null);

  $effect(() => {
    if (updateIntervalMs !== undefined) {
      MagnetometerUncalibrated.setUpdateInterval(updateIntervalMs);
    }
    const subscription: EventSubscription = MagnetometerUncalibrated.addListener(next => {
      measurement = next;
    });
    return () => subscription.remove();
  });

  return {
    get current(): IMagnetometerUncalibratedMeasurement | null {
      return measurement;
    },
  };
}

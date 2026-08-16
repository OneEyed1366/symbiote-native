// Svelte lifecycle wiring over the framework-agnostic Barometer singleton (core/) — mirrors
// use-accelerometer.svelte.ts's shape exactly. See its header for why this lives in `runes/` with
// a `.svelte.ts` extension, returns a boxed getter object, and takes a plain `updateIntervalMs`
// rather than a getter.
import { Barometer, type EventSubscription, type IBarometerMeasurement } from '../../core';

export function useBarometer(updateIntervalMs?: number): {
  readonly current: IBarometerMeasurement | null;
} {
  let measurement = $state<IBarometerMeasurement | null>(null);

  $effect(() => {
    if (updateIntervalMs !== undefined) {
      Barometer.setUpdateInterval(updateIntervalMs);
    }
    const subscription: EventSubscription = Barometer.addListener(next => {
      measurement = next;
    });
    return () => subscription.remove();
  });

  return {
    get current(): IBarometerMeasurement | null {
      return measurement;
    },
  };
}

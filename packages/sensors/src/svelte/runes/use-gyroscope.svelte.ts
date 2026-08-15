// Svelte lifecycle wiring over the framework-agnostic Gyroscope singleton (core/) — mirrors
// use-accelerometer.svelte.ts's shape exactly. See its header for why this lives in `runes/` with
// a `.svelte.ts` extension, returns a boxed getter object, and takes a plain `updateIntervalMs`
// rather than a getter.
import { Gyroscope, type EventSubscription, type IGyroscopeMeasurement } from '../../core';

export function useGyroscope(updateIntervalMs?: number): {
  readonly current: IGyroscopeMeasurement | null;
} {
  let measurement = $state<IGyroscopeMeasurement | null>(null);

  $effect(() => {
    if (updateIntervalMs !== undefined) {
      Gyroscope.setUpdateInterval(updateIntervalMs);
    }
    const subscription: EventSubscription = Gyroscope.addListener(next => {
      measurement = next;
    });
    return () => subscription.remove();
  });

  return {
    get current(): IGyroscopeMeasurement | null {
      return measurement;
    },
  };
}

// Svelte lifecycle wiring over the framework-agnostic LightSensor singleton (core/) — mirrors
// use-accelerometer.svelte.ts's shape exactly. See its header for why this lives in `runes/` with
// a `.svelte.ts` extension, returns a boxed getter object, and takes a plain `updateIntervalMs`
// rather than a getter.
import { LightSensor, type EventSubscription, type ILightSensorMeasurement } from '../../core';

export function useLightSensor(updateIntervalMs?: number): {
  readonly current: ILightSensorMeasurement | null;
} {
  let measurement = $state<ILightSensorMeasurement | null>(null);

  $effect(() => {
    if (updateIntervalMs !== undefined) {
      LightSensor.setUpdateInterval(updateIntervalMs);
    }
    const subscription: EventSubscription = LightSensor.addListener(next => {
      measurement = next;
    });
    return () => subscription.remove();
  });

  return {
    get current(): ILightSensorMeasurement | null {
      return measurement;
    },
  };
}

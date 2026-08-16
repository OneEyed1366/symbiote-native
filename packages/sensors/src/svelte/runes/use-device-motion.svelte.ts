// Svelte lifecycle wiring over the framework-agnostic DeviceMotion singleton (core/) — mirrors
// use-accelerometer.svelte.ts's shape exactly. See its header for why this lives in `runes/` with
// a `.svelte.ts` extension, returns a boxed getter object, and takes a plain `updateIntervalMs`
// rather than a getter.
import { DeviceMotion, type EventSubscription, type IDeviceMotionMeasurement } from '../../core';

export function useDeviceMotion(updateIntervalMs?: number): {
  readonly current: IDeviceMotionMeasurement | null;
} {
  let measurement = $state<IDeviceMotionMeasurement | null>(null);

  $effect(() => {
    if (updateIntervalMs !== undefined) {
      DeviceMotion.setUpdateInterval(updateIntervalMs);
    }
    const subscription: EventSubscription = DeviceMotion.addListener(next => {
      measurement = next;
    });
    return () => subscription.remove();
  });

  return {
    get current(): IDeviceMotionMeasurement | null {
      return measurement;
    },
  };
}

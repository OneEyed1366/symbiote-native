// Svelte lifecycle wiring over the framework-agnostic Accelerometer singleton (core/).
// `.svelte.ts` (not `.ts`): runes ($state/$effect) only work in files with this extension
// outside an actual `.svelte` component; `runes/` is the framework's own lifecycle-bucket term
// (CLAUDE.md's <adapter_src_follows_framework_idioms>).
//
// Returns a boxed getter, not a bare `$state`: Svelte 5 reactivity is lexically scoped to the
// declaring module and doesn't survive being returned as a raw value, so callers read `.current`
// like unwrapping Vue's `Ref.value`.
//
// `updateIntervalMs` is a plain number, not a getter: it applies once at subscribe time and
// never reacts to a later change, matching the Vue/React twins.
import { Accelerometer, type EventSubscription, type IAccelerometerMeasurement } from '../../core';

export function useAccelerometer(updateIntervalMs?: number): {
  readonly current: IAccelerometerMeasurement | null;
} {
  let measurement = $state<IAccelerometerMeasurement | null>(null);

  $effect(() => {
    if (updateIntervalMs !== undefined) {
      Accelerometer.setUpdateInterval(updateIntervalMs);
    }
    // `measurement` is only ever written here, never read, so the effect has an empty dependency
    // set and runs exactly once on mount, cleaning up exactly once on unmount.
    const subscription: EventSubscription = Accelerometer.addListener(next => {
      measurement = next;
    });
    return () => subscription.remove();
  });

  return {
    get current(): IAccelerometerMeasurement | null {
      return measurement;
    },
  };
}

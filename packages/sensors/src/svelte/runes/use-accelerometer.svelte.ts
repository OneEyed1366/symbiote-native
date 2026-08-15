// Svelte lifecycle wiring over the framework-agnostic Accelerometer singleton (core/) — mirrors
// the lifecycle-bucket naming convention of adapters/svelte/src/runes and the onMounted/onUnmounted
// shape of the Vue composable's subscription handle. `updateIntervalMs` is a PLAIN number, not a
// getter (unlike splash-screen's useHideAnimation): the Vue and React twins both apply it once at
// subscribe time and never react to a later change, so a getter here would add a reactive
// dependency neither other adapter has.
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) are only usable in files with this extension
// outside an actual `.svelte` component. `runes/` is Svelte's own term for the lifecycle bucket,
// per CLAUDE.md's <adapter_src_follows_framework_idioms> — React calls it `hooks/`, Vue
// `composables/`. Returns a boxed getter object, NOT a bare `$state`: Svelte 5 reactivity is
// lexically scoped to the declaring module and does not survive being returned as a raw value
// from a plain function, so the caller reads `.current` exactly like unwrapping Vue's `Ref`
// via `.value`.
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

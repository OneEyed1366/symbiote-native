// Svelte lifecycle wiring over the framework-agnostic core (core/battery.ts) — the Svelte twin of
// vue/composables/use-battery-level and react/hooks/use-battery-level. Seeds the initial value
// with a one-shot getBatteryLevelAsync() call before the first native event fires, matching
// upstream's own useBatteryLevel.
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) are only usable in a file with this extension
// outside an actual `.svelte` component. `runes/` is Svelte's own term for the bucket React calls
// `hooks/` and Vue calls `composables/` — see adapters/svelte/src/runes.
//
// Vue's onMounted/onUnmounted pair collapses into ONE `$effect` whose returned function is the
// teardown. The effect only WRITES `batteryLevel`, never reads it, so its dependency set stays
// empty: it runs exactly once on mount and cleans up exactly once on unmount.
//
// Returns a boxed getter object, NOT a bare `$state`: Svelte 5 reactivity is lexically scoped to
// the declaring module, so a raw `let x = $state(...)` handed out of a plain function arrives
// dead at the caller. `{ get current() { … } }` is the sanctioned way across, read as `.current`
// exactly like Vue's `Ref` is unwrapped via `.value`.
import { addBatteryLevelListener, getBatteryLevelAsync, type EventSubscription } from '../../core';

// core/battery.ts's documented sentinel for "this device cannot report a battery level".
const UNKNOWN_BATTERY_LEVEL = -1;

export function useBatteryLevel(): { readonly current: number } {
  let batteryLevel = $state(UNKNOWN_BATTERY_LEVEL);

  $effect(() => {
    getBatteryLevelAsync().then(level => {
      batteryLevel = level;
    });
    const subscription: EventSubscription = addBatteryLevelListener(event => {
      batteryLevel = event.batteryLevel;
    });
    return () => subscription.remove();
  });

  return {
    get current(): number {
      return batteryLevel;
    },
  };
}

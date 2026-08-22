// Svelte lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors
// use-battery-level.svelte.ts's shape; see its header for the `.svelte.ts`/`runes/`/boxed-getter
// reasoning. Seeds the initial value with a one-shot getBatteryStateAsync() call before the first
// native event fires, matching upstream's own useBatteryState.
import {
  addBatteryStateListener,
  BatteryState,
  getBatteryStateAsync,
  type EventSubscription,
} from '../../core';

export function useBatteryState(): { readonly current: BatteryState } {
  let batteryState = $state<BatteryState>(BatteryState.UNKNOWN);

  $effect(() => {
    getBatteryStateAsync().then(state => {
      batteryState = state;
    });
    const subscription: EventSubscription = addBatteryStateListener(event => {
      batteryState = event.batteryState;
    });
    return () => subscription.remove();
  });

  return {
    get current(): BatteryState {
      return batteryState;
    },
  };
}

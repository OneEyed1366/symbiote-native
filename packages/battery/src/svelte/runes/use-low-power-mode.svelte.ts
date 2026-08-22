// Svelte lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors
// use-battery-level.svelte.ts's shape; see its header for the `.svelte.ts`/`runes/`/boxed-getter
// reasoning. Seeds the initial value with a one-shot isLowPowerModeEnabledAsync() call before the
// first native event fires, matching upstream's own useLowPowerMode.
import {
  addLowPowerModeListener,
  isLowPowerModeEnabledAsync,
  type EventSubscription,
} from '../../core';

export function useLowPowerMode(): { readonly current: boolean } {
  let lowPowerMode = $state(false);

  $effect(() => {
    isLowPowerModeEnabledAsync().then(enabled => {
      lowPowerMode = enabled;
    });
    const subscription: EventSubscription = addLowPowerModeListener(event => {
      lowPowerMode = event.lowPowerMode;
    });
    return () => subscription.remove();
  });

  return {
    get current(): boolean {
      return lowPowerMode;
    },
  };
}

// Svelte lifecycle wiring over `watchPowerState` from core, twin of upstream's `usePowerState`
import {
  initialPowerState,
  watchPowerState,
  type PowerState,
} from '../../core';

export function usePowerState(): { readonly current: PowerState } {
  let powerState = $state.raw(initialPowerState);

  $effect(() =>
    watchPowerState(next => {
      powerState = next;
    }),
  );

  return {
    get current(): PowerState {
      return powerState;
    },
  };
}

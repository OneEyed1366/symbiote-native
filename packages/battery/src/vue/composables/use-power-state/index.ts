// Vue lifecycle wiring over `watchPowerState` from core, twin of upstream's `usePowerState`
import {
  onMounted,
  onUnmounted,
  shallowRef,
  type Ref,
} from '@vue/runtime-core';
import {
  initialPowerState,
  watchPowerState,
  type PowerState,
} from '../../../core';

export function usePowerState(): Ref<PowerState> {
  const powerState = shallowRef(initialPowerState);
  let stop: (() => void) | undefined;

  onMounted(() => {
    stop = watchPowerState(next => {
      powerState.value = next;
    });
  });

  onUnmounted(() => {
    stop?.();
  });

  return powerState;
}

// Solid lifecycle wiring over `watchPowerState` from core, twin of upstream's `usePowerState`
import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  initialPowerState,
  watchPowerState,
  type PowerState,
} from '../../core';

export function createPowerState(): Accessor<PowerState> {
  const [powerState, setPowerState] = createSignal(initialPowerState);

  onCleanup(watchPowerState(setPowerState));

  return powerState;
}

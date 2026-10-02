// React lifecycle wiring over `watchPowerState` from core, twin of upstream's `usePowerState`
import { useEffect, useState } from 'react';
import {
  initialPowerState,
  watchPowerState,
  type PowerState,
} from '../../../core';

export function usePowerState(): PowerState {
  const [powerState, setPowerState] = useState(initialPowerState);

  useEffect(() => watchPowerState(setPowerState), []);

  return powerState;
}

// React lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors
// use-battery-level's shape. Seeds the initial value with a one-shot getBatteryStateAsync()
// call before the first native event fires, matching upstream's own useBatteryState.
import { useEffect, useState } from 'react';
import {
  addBatteryStateListener,
  BatteryState,
  getBatteryStateAsync,
} from '../../../core';

export function useBatteryState(): BatteryState {
  const [batteryState, setBatteryState] = useState<BatteryState>(
    BatteryState.UNKNOWN,
  );

  useEffect(() => {
    getBatteryStateAsync().then(setBatteryState);
    const subscription = addBatteryStateListener(event =>
      setBatteryState(event.batteryState),
    );
    return () => subscription.remove();
  }, []);

  return batteryState;
}

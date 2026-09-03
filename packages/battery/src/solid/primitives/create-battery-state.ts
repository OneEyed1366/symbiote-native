// Solid lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors
// create-battery-level's shape, including the seed-vs-event ordering guard documented there.
import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  addBatteryStateListener,
  BatteryState,
  getBatteryStateAsync,
  type EventSubscription,
} from '../../core';

export function createBatteryState(): Accessor<BatteryState> {
  const [batteryState, setBatteryState] = createSignal<BatteryState>(
    BatteryState.UNKNOWN,
  );
  let hasNativeReading = false;

  const subscription: EventSubscription = addBatteryStateListener(event => {
    hasNativeReading = true;
    setBatteryState(event.batteryState);
  });

  getBatteryStateAsync().then(state => {
    if (!hasNativeReading) {
      setBatteryState(state);
    }
  });

  onCleanup(() => {
    subscription.remove();
  });

  return batteryState;
}

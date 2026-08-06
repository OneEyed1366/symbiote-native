// Vue lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors
// use-battery-level's shape. Seeds the initial value with a one-shot getBatteryStateAsync()
// call before the first native event fires, matching upstream's own useBatteryState.

import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import {
  addBatteryStateListener,
  BatteryState,
  getBatteryStateAsync,
  type EventSubscription,
} from '../../../core';

export function useBatteryState(): Ref<BatteryState> {
  const batteryState = ref<BatteryState>(BatteryState.UNKNOWN);
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    getBatteryStateAsync().then(state => {
      batteryState.value = state;
    });
    subscription = addBatteryStateListener(event => {
      batteryState.value = event.batteryState;
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return batteryState;
}

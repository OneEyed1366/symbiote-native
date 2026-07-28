// Vue lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors the
// lifecycle-bucket naming convention of adapters/vue/src/composables and the
// onMounted/onUnmounted shape of packages/sensors/src/vue/composables/use-accelerometer. Seeds
// the initial value with a one-shot getBatteryLevelAsync() call before the first native event
// fires, matching upstream's own useBatteryLevel.

import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import {
  addBatteryLevelListener,
  getBatteryLevelAsync,
  type EventSubscription,
} from '../../../core';

export function useBatteryLevel(): Ref<number> {
  const batteryLevel = ref(-1);
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    getBatteryLevelAsync().then(level => {
      batteryLevel.value = level;
    });
    subscription = addBatteryLevelListener(event => {
      batteryLevel.value = event.batteryLevel;
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return batteryLevel;
}

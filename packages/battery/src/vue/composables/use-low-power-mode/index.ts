// Vue lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors
// use-battery-level's shape. Seeds the initial value with a one-shot
// isLowPowerModeEnabledAsync() call before the first native event fires, matching upstream's
// own useLowPowerMode.

import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import {
  addLowPowerModeListener,
  isLowPowerModeEnabledAsync,
  type EventSubscription,
} from '../../../core';

export function useLowPowerMode(): Ref<boolean> {
  const lowPowerMode = ref(false);
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    isLowPowerModeEnabledAsync().then(enabled => {
      lowPowerMode.value = enabled;
    });
    subscription = addLowPowerModeListener(event => {
      lowPowerMode.value = event.lowPowerMode;
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return lowPowerMode;
}

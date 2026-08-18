// Solid lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors
// create-battery-level's shape, including the seed-vs-event ordering guard documented there.
import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  addLowPowerModeListener,
  isLowPowerModeEnabledAsync,
  type EventSubscription,
} from '../../core';

export function createLowPowerMode(): Accessor<boolean> {
  const [lowPowerMode, setLowPowerMode] = createSignal(false);
  let hasNativeReading = false;

  const subscription: EventSubscription = addLowPowerModeListener(event => {
    hasNativeReading = true;
    setLowPowerMode(event.lowPowerMode);
  });

  isLowPowerModeEnabledAsync().then(enabled => {
    if (!hasNativeReading) {
      setLowPowerMode(enabled);
    }
  });

  onCleanup(() => {
    subscription.remove();
  });

  return lowPowerMode;
}

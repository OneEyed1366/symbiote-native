// React lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors the
// lifecycle-bucket naming convention of adapters/react/src/hooks and the shape of
// packages/sensors/src/react/hooks/use-accelerometer. Seeds the initial value with a one-shot
// getBatteryLevelAsync() call before the first native event fires, matching upstream's own
// useBatteryLevel (.vendors/expo/packages/expo-battery/src/Battery.ts).
import { useEffect, useState } from 'react';
import { addBatteryLevelListener, getBatteryLevelAsync } from '../../../core';

export function useBatteryLevel(): number {
  const [batteryLevel, setBatteryLevel] = useState(-1);

  useEffect(() => {
    getBatteryLevelAsync().then(setBatteryLevel);
    const subscription = addBatteryLevelListener(event => setBatteryLevel(event.batteryLevel));
    return () => subscription.remove();
  }, []);

  return batteryLevel;
}

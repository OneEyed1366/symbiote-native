// React lifecycle wiring over the framework-agnostic core (core/battery.ts) — mirrors
// use-battery-level's shape. Seeds the initial value with a one-shot
// isLowPowerModeEnabledAsync() call before the first native event fires, matching upstream's
// own useLowPowerMode.
import { useEffect, useState } from 'react';
import {
  addLowPowerModeListener,
  isLowPowerModeEnabledAsync,
} from '../../../core';

export function useLowPowerMode(): boolean {
  const [lowPowerMode, setLowPowerMode] = useState(false);

  useEffect(() => {
    isLowPowerModeEnabledAsync().then(setLowPowerMode);
    const subscription = addLowPowerModeListener(event =>
      setLowPowerMode(event.lowPowerMode),
    );
    return () => subscription.remove();
  }, []);

  return lowPowerMode;
}

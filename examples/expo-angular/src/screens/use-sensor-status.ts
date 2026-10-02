import { DestroyRef, computed, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { SENSOR_AVAILABILITY, resolveSensorStatus } from './sensor-status';
import type { ISensorAvailability, ISensorStatus } from './sensor-status';

// A sensor can be unavailable (simulator) or available with no first reading yet,
// the two must not render as one blank state
export function useSensorStatus(
  checkAsync: () => Promise<boolean>,
  hasReading: () => boolean,
): Signal<ISensorStatus> {
  const availability = signal<ISensorAvailability>(
    SENSOR_AVAILABILITY.checking,
  );

  let isAlive = true;
  inject(DestroyRef).onDestroy(() => {
    isAlive = false;
  });
  void checkAsync().then(isAvailable => {
    if (isAlive) {
      availability.set(
        isAvailable
          ? SENSOR_AVAILABILITY.available
          : SENSOR_AVAILABILITY.unavailable,
      );
    }
  });

  return computed(() => resolveSensorStatus(availability(), hasReading()));
}

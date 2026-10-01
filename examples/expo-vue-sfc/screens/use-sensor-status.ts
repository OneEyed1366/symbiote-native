import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ComputedRef } from 'vue';
import { SENSOR_AVAILABILITY, resolveSensorStatus } from './sensor-status';
import type { ISensorAvailability, ISensorStatus } from './sensor-status';

// A sensor can be unavailable (simulator) or available with no first reading yet,
// the two must not render as one blank state
export function useSensorStatus(
  checkAsync: () => Promise<boolean>,
  hasReading: () => boolean,
): ComputedRef<ISensorStatus> {
  const availability = ref<ISensorAvailability>(SENSOR_AVAILABILITY.checking);

  let isMounted = true;
  onUnmounted(() => {
    isMounted = false;
  });
  onMounted(() => {
    void checkAsync().then(isAvailable => {
      if (isMounted) {
        availability.value = isAvailable
          ? SENSOR_AVAILABILITY.available
          : SENSOR_AVAILABILITY.unavailable;
      }
    });
  });

  return computed(() => resolveSensorStatus(availability.value, hasReading()));
}

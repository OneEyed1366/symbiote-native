export const SENSOR_AVAILABILITY = {
  checking: 'checking',
  available: 'available',
  unavailable: 'unavailable',
} as const;
export type ISensorAvailability =
  (typeof SENSOR_AVAILABILITY)[keyof typeof SENSOR_AVAILABILITY];

export const SENSOR_STATUS = {
  checking: 'checking',
  unavailable: 'unavailable',
  waiting: 'waiting',
  live: 'live',
} as const;
export type ISensorStatus = (typeof SENSOR_STATUS)[keyof typeof SENSOR_STATUS];

export const SENSOR_STATUS_TEXT: Record<ISensorStatus, string> = {
  [SENSOR_STATUS.checking]: 'CHECKING…',
  [SENSOR_STATUS.unavailable]: 'UNAVAILABLE',
  [SENSOR_STATUS.waiting]: 'WAITING…',
  [SENSOR_STATUS.live]: 'LIVE',
};

export function resolveSensorStatus(
  availability: ISensorAvailability,
  hasReading: boolean,
): ISensorStatus {
  if (availability === SENSOR_AVAILABILITY.checking) {
    return SENSOR_STATUS.checking;
  }
  if (availability === SENSOR_AVAILABILITY.unavailable) {
    return SENSOR_STATUS.unavailable;
  }
  return hasReading ? SENSOR_STATUS.live : SENSOR_STATUS.waiting;
}

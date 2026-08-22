// @symbiote-native/sensors/svelte: the Svelte entry over the framework-agnostic core.
// useAccelerometer wires the Accelerometer singleton's addListener lifecycle onto Svelte's own
// `$effect` (runes/use-accelerometer.svelte.ts) — mirrors the lifecycle-bucket naming convention
// of adapters/svelte/src/runes (never `hooks/`/`composables/`, those are React's and Vue's terms).

export { useAccelerometer } from './runes/use-accelerometer.svelte';
export type { IAccelerometerMeasurement } from '../core';
export { useBarometer } from './runes/use-barometer.svelte';
export type { IBarometerMeasurement } from '../core';
export { useDeviceMotion } from './runes/use-device-motion.svelte';
export {
  DeviceMotionOrientation,
  gravity,
  type IDeviceMotionMeasurement,
} from '../core';
export { useGyroscope } from './runes/use-gyroscope.svelte';
export type { IGyroscopeMeasurement } from '../core';
export { useLightSensor } from './runes/use-light-sensor.svelte';
export type { ILightSensorMeasurement } from '../core';
export { useMagnetometer } from './runes/use-magnetometer.svelte';
export type { IMagnetometerMeasurement } from '../core';
export { useMagnetometerUncalibrated } from './runes/use-magnetometer-uncalibrated.svelte';
export type { IMagnetometerUncalibratedMeasurement } from '../core';
export { usePedometer } from './runes/use-pedometer.svelte';
export {
  watchStepCount,
  getStepCountAsync,
  isAvailableAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  type IPedometerResult,
  type IPedometerUpdateCallback,
} from '../core';

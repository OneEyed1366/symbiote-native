// @symbiote-native/sensors/solid: the Solid entry over the framework-agnostic core.
// createAccelerometer wires the Accelerometer singleton's addListener lifecycle onto Solid's own
// signal + onCleanup (primitives/create-accelerometer) — `primitives/` and `create*` are Solid's
// terms for a composable reactive function, never `hooks/`/`composables/`/`runes/`, which are
// React's, Vue's and Svelte's. Same convention as adapters/solid/src/primitives.
//
// Every primitive returns an `Accessor`, and each DeviceSensor-shaped one takes its update
// interval as a number OR an accessor — see primitives/device-sensor-accessor for why.

export { createAccelerometer } from './primitives/create-accelerometer';
export { createBarometer } from './primitives/create-barometer';
export { createDeviceMotion } from './primitives/create-device-motion';
export { createGyroscope } from './primitives/create-gyroscope';
export { createLightSensor } from './primitives/create-light-sensor';
export { createMagnetometer } from './primitives/create-magnetometer';
export { createMagnetometerUncalibrated } from './primitives/create-magnetometer-uncalibrated';
export { createPedometer } from './primitives/create-pedometer';
export type { IUpdateIntervalMs } from './primitives/device-sensor-accessor';
export * from '../core';

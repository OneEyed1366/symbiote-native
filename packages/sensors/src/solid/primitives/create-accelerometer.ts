// Solid lifecycle wiring over the framework-agnostic Accelerometer singleton (core/) — the Solid
// twin of react/hooks/use-accelerometer, vue/composables/use-accelerometer and
// svelte/runes/use-accelerometer.svelte.ts. The lifecycle itself, and why the interval takes an
// accessor as well as a number, live once in ./device-sensor-accessor.
import type { Accessor } from 'solid-js';
import { Accelerometer, type IAccelerometerMeasurement } from '../../core';
import {
  createDeviceSensorAccessor,
  type IUpdateIntervalMs,
} from './device-sensor-accessor';

export function createAccelerometer(
  updateIntervalMs?: IUpdateIntervalMs,
): Accessor<IAccelerometerMeasurement | null> {
  return createDeviceSensorAccessor(Accelerometer, updateIntervalMs);
}

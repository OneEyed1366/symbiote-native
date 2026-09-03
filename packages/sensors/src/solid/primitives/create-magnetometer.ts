// Solid lifecycle wiring over the framework-agnostic Magnetometer singleton (core/) — the Solid
// twin of react/hooks/use-magnetometer, vue/composables/use-magnetometer and
// svelte/runes/use-magnetometer.svelte.ts. The lifecycle itself, and why the interval takes an
// accessor as well as a number, live once in ./device-sensor-accessor.
import type { Accessor } from 'solid-js';
import { Magnetometer, type IMagnetometerMeasurement } from '../../core';
import {
  createDeviceSensorAccessor,
  type IUpdateIntervalMs,
} from './device-sensor-accessor';

export function createMagnetometer(
  updateIntervalMs?: IUpdateIntervalMs,
): Accessor<IMagnetometerMeasurement | null> {
  return createDeviceSensorAccessor(Magnetometer, updateIntervalMs);
}

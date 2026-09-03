// Solid lifecycle wiring over the framework-agnostic MagnetometerUncalibrated singleton (core/) — the Solid
// twin of react/hooks/use-magnetometer-uncalibrated, vue/composables/use-magnetometer-uncalibrated and
// svelte/runes/use-magnetometer-uncalibrated.svelte.ts. The lifecycle itself, and why the interval takes an
// accessor as well as a number, live once in ./device-sensor-accessor.
import type { Accessor } from 'solid-js';
import {
  MagnetometerUncalibrated,
  type IMagnetometerUncalibratedMeasurement,
} from '../../core';
import {
  createDeviceSensorAccessor,
  type IUpdateIntervalMs,
} from './device-sensor-accessor';

export function createMagnetometerUncalibrated(
  updateIntervalMs?: IUpdateIntervalMs,
): Accessor<IMagnetometerUncalibratedMeasurement | null> {
  return createDeviceSensorAccessor(MagnetometerUncalibrated, updateIntervalMs);
}

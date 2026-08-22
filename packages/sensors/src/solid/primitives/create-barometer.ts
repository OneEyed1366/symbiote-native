// Solid lifecycle wiring over the framework-agnostic Barometer singleton (core/) — the Solid
// twin of react/hooks/use-barometer, vue/composables/use-barometer and
// svelte/runes/use-barometer.svelte.ts. The lifecycle itself, and why the interval takes an
// accessor as well as a number, live once in ./device-sensor-accessor.
import type { Accessor } from 'solid-js';
import { Barometer, type IBarometerMeasurement } from '../../core';
import {
  createDeviceSensorAccessor,
  type IUpdateIntervalMs,
} from './device-sensor-accessor';

export function createBarometer(
  updateIntervalMs?: IUpdateIntervalMs,
): Accessor<IBarometerMeasurement | null> {
  return createDeviceSensorAccessor(Barometer, updateIntervalMs);
}

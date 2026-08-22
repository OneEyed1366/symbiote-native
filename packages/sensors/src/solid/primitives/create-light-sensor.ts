// Solid lifecycle wiring over the framework-agnostic LightSensor singleton (core/) — the Solid
// twin of react/hooks/use-light-sensor, vue/composables/use-light-sensor and
// svelte/runes/use-light-sensor.svelte.ts. The lifecycle itself, and why the interval takes an
// accessor as well as a number, live once in ./device-sensor-accessor.
import type { Accessor } from 'solid-js';
import { LightSensor, type ILightSensorMeasurement } from '../../core';
import {
  createDeviceSensorAccessor,
  type IUpdateIntervalMs,
} from './device-sensor-accessor';

export function createLightSensor(
  updateIntervalMs?: IUpdateIntervalMs,
): Accessor<ILightSensorMeasurement | null> {
  return createDeviceSensorAccessor(LightSensor, updateIntervalMs);
}

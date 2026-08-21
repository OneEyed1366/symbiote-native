// Solid lifecycle wiring over the framework-agnostic Gyroscope singleton (core/) — the Solid
// twin of react/hooks/use-gyroscope, vue/composables/use-gyroscope and
// svelte/runes/use-gyroscope.svelte.ts. The lifecycle itself, and why the interval takes an
// accessor as well as a number, live once in ./device-sensor-accessor.
import type { Accessor } from 'solid-js';
import { Gyroscope, type IGyroscopeMeasurement } from '../../core';
import {
  createDeviceSensorAccessor,
  type IUpdateIntervalMs,
} from './device-sensor-accessor';

export function createGyroscope(
  updateIntervalMs?: IUpdateIntervalMs,
): Accessor<IGyroscopeMeasurement | null> {
  return createDeviceSensorAccessor(Gyroscope, updateIntervalMs);
}

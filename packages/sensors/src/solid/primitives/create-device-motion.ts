// Solid lifecycle wiring over the framework-agnostic DeviceMotion singleton (core/) — the Solid
// twin of react/hooks/use-device-motion, vue/composables/use-device-motion and
// svelte/runes/use-device-motion.svelte.ts. The lifecycle itself, and why the interval takes an
// accessor as well as a number, live once in ./device-sensor-accessor.
import type { Accessor } from 'solid-js';
import { DeviceMotion, type IDeviceMotionMeasurement } from '../../core';
import {
  createDeviceSensorAccessor,
  type IUpdateIntervalMs,
} from './device-sensor-accessor';

export function createDeviceMotion(
  updateIntervalMs?: IUpdateIntervalMs,
): Accessor<IDeviceMotionMeasurement | null> {
  return createDeviceSensorAccessor(DeviceMotion, updateIntervalMs);
}

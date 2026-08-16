// Co-located Vue-driven test (ADR 0025) for useDeviceMotion. Mocks the whole core module
// (never expo-modules-core internals) since this exercises composable mount/unmount lifecycle
// timing, not any native view — there is none here, so no ViewConfig fixture is needed.
//
// No Negative group: the composable has no guard clause and nothing to reject — every prop
// shape the type system allows flows straight into DeviceMotion.addListener/setUpdateInterval,
// so every scenario below is Positive. `DeviceMotion.removeAllListeners` and the rest of
// DeviceSensor's async API are N/A here — the composable never calls them; they're core-level
// surface covered by device-motion.test.ts.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { IDeviceMotionMeasurement } from '../../../core';
import { useDeviceMotion } from './index';

const ROOT_TAG = 9822;

type IListener = (measurement: IDeviceMotionMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../../core', () => ({
  DeviceMotion: {
    addListener: (listener: IListener) => addListenerMock(listener),
    removeAllListeners: vi.fn(),
    setUpdateInterval: (intervalMs: number) => setUpdateIntervalMock(intervalMs),
  },
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  setUpdateIntervalMock.mockClear();
});

afterEach(() => unmount(ROOT_TAG));

function mountDeviceMotion(updateIntervalMs?: number): Ref<IDeviceMotionMeasurement | null> {
  let measurement: Ref<IDeviceMotionMeasurement | null> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        measurement = useDeviceMotion(updateIntervalMs);
        return () => h('symbiote-text', {}, 'sensor');
      },
    }),
  );
  if (measurement === undefined) {
    throw new Error('setup() did not run');
  }
  return measurement;
}

const FIRST_READING: IDeviceMotionMeasurement = {
  acceleration: { x: 0.1, y: 0.2, z: 0.3, timestamp: 123 },
  accelerationIncludingGravity: { x: 0.1, y: 0.2, z: 9.9, timestamp: 123 },
  rotation: { alpha: 1, beta: 2, gamma: 3, timestamp: 123 },
  rotationRate: { alpha: 0.1, beta: 0.2, gamma: 0.3, timestamp: 123 },
  interval: 16,
  orientation: 0, // DeviceMotionOrientation.Portrait
};

const SECOND_READING: IDeviceMotionMeasurement = {
  acceleration: null,
  accelerationIncludingGravity: { x: -0.1, y: -0.2, z: 9.7, timestamp: 456 },
  rotation: { alpha: 4, beta: 5, gamma: 6, timestamp: 456 },
  rotationRate: null,
  interval: 16,
  orientation: 90, // DeviceMotionOrientation.RightLandscape
};

describe('useDeviceMotion (Vue)', () => {
  describe('Positive', () => {
    it('starts null before any measurement arrives', () => {
      // why: the caller has no measurement synchronously at mount time — null is the
      // documented "nothing reported yet" state, not an error.
      const measurement = mountDeviceMotion();

      expect(measurement.value).toBeNull();
    });

    it('updates the ref when the native listener fires', () => {
      // why: the composable's whole job is bridging the native event stream into Vue
      // reactivity — a fired event that never reaches the ref would make it useless.
      const measurement = mountDeviceMotion();

      registeredListener?.(FIRST_READING);

      expect(measurement.value).toEqual(FIRST_READING);
    });

    it('replaces the previous measurement rather than merging with it, including nullable fields', () => {
      // why: `acceleration`/`rotationRate` are nullable per-reading (device-motion.ts) — a
      // merge instead of a replace would keep a stale non-null value alive after the native
      // side legitimately reports null.
      const measurement = mountDeviceMotion();

      registeredListener?.(FIRST_READING);
      expect(measurement.value).toEqual(FIRST_READING);
      registeredListener?.(SECOND_READING);

      expect(measurement.value).toEqual(SECOND_READING);
    });

    it('removes the subscription on unmount', () => {
      // why: a leftover subscription keeps writing into a ref no one reads and pins the
      // native listener alive for no consumer.
      mountDeviceMotion();
      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });

    it('sets the update interval once at subscribe time when provided', () => {
      // why: without this call the native module keeps its default sample rate regardless
      // of what the caller asked for.
      mountDeviceMotion(50);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
    });

    it('sets the update interval for an explicit 0ms, not just a truthy value', () => {
      // why: the composable's guard is `!== undefined`, not truthiness — 0 is a legitimate
      // "as fast as possible" interval and must not be mistaken for "no interval given".
      mountDeviceMotion(0);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(0);
    });

    it('does not touch the update interval when omitted', () => {
      // why: an unconditional call would stomp on whatever rate another consumer of the
      // shared DeviceMotion singleton already configured.
      mountDeviceMotion();

      expect(setUpdateIntervalMock).not.toHaveBeenCalled();
    });
  });
});

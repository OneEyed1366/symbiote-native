// Co-located Vue-driven test (ADR 0025) for useBarometer. Mocks the whole core module
// (never expo-modules-core internals) since this exercises composable mount/unmount lifecycle
// timing, not any native view — there is none here, so no ViewConfig fixture is needed.
//
// No Negative group: the composable has no guard clause and nothing to reject — every prop
// shape the type system allows flows straight into Barometer.addListener/setUpdateInterval,
// so every scenario below is Positive. `Barometer.removeAllListeners` and the rest of
// DeviceSensor's async API are N/A here — the composable never calls them; they're core-level
// surface covered by barometer.test.ts.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { IBarometerMeasurement } from '../../../core';
import { useBarometer } from './index';

const ROOT_TAG = 9822;

type IListener = (measurement: IBarometerMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../../core', () => ({
  Barometer: {
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

function mountBarometer(updateIntervalMs?: number): Ref<IBarometerMeasurement | null> {
  let measurement: Ref<IBarometerMeasurement | null> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        measurement = useBarometer(updateIntervalMs);
        return () => h('symbiote-text', {}, 'sensor');
      },
    }),
  );
  if (measurement === undefined) {
    throw new Error('setup() did not run');
  }
  return measurement;
}

describe('useBarometer (Vue)', () => {
  describe('Positive', () => {
    it('starts null before any measurement arrives', () => {
      // why: the caller has no measurement synchronously at mount time — null is the
      // documented "nothing reported yet" state, not an error.
      const measurement = mountBarometer();

      expect(measurement.value).toBeNull();
    });

    it('updates the ref when the native listener fires', () => {
      // why: the composable's whole job is bridging the native event stream into Vue
      // reactivity — a fired event that never reaches the ref would make it useless.
      const measurement = mountBarometer();
      const reading: IBarometerMeasurement = {
        pressure: 1013.25,
        relativeAltitude: 12.3,
        timestamp: 123,
      };

      registeredListener?.(reading);

      expect(measurement.value).toEqual(reading);
    });

    it('replaces the previous measurement rather than merging with it', () => {
      // why: each native event is a full snapshot, not a delta — merging would leave a
      // stale altitude/pressure behind after a real reading changes.
      const measurement = mountBarometer();
      const first: IBarometerMeasurement = { pressure: 1013.25, relativeAltitude: 12.3, timestamp: 1 };
      const second: IBarometerMeasurement = { pressure: 950, relativeAltitude: 500, timestamp: 2 };

      registeredListener?.(first);
      expect(measurement.value).toEqual(first);
      registeredListener?.(second);

      expect(measurement.value).toEqual(second);
    });

    it('removes the subscription on unmount', () => {
      // why: a leftover subscription keeps writing into a ref no one reads and pins the
      // native listener alive for no consumer.
      mountBarometer();
      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });

    it('sets the update interval once at subscribe time when provided', () => {
      // why: without this call the native module keeps its default sample rate regardless
      // of what the caller asked for.
      mountBarometer(50);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
    });

    it('sets the update interval for an explicit 0ms, not just a truthy value', () => {
      // why: the composable's guard is `!== undefined`, not truthiness — 0 is a legitimate
      // "as fast as possible" interval and must not be mistaken for "no interval given".
      mountBarometer(0);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(0);
    });

    it('does not touch the update interval when omitted', () => {
      // why: an unconditional call would stomp on whatever rate another consumer of the
      // shared Barometer singleton already configured.
      mountBarometer();

      expect(setUpdateIntervalMock).not.toHaveBeenCalled();
    });
  });
});

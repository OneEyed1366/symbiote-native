// Co-located Solid-driven test (ADR 0025) for createDeviceMotion, the Solid twin of
// react/hooks/use-device-motion, vue/composables/use-device-motion and
// svelte/runes/use-device-motion.svelte.ts. Same coverage as the Vue file — seed, listener-driven
// update, replace-not-merge, teardown, the three update-interval boundaries — plus the two cases
// that exist only here: the synchronous subscribe and a REACTIVE interval accessor.
//
// Driven with `createRoot` + an explicit dispose rather than a mounted component: the primitive
// renders nothing, so a root is the whole owner it needs. The core module is mocked wholesale
// (never expo-modules-core internals) — DeviceSensor's async/permission surface belongs to
// core/device-motion.test.ts, and there is no native view here, so no ViewConfig fixture.
//
// No Negative group: the primitive has no guard clause and nothing to reject — every argument the
// type system allows flows straight into addListener/setUpdateInterval.

import {
  createEffect,
  createRoot,
  createSignal,
  type Accessor,
} from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDeviceMotionMeasurement } from '../../core';
import { createDeviceMotion } from './create-device-motion';

type IListener = (measurement: IDeviceMotionMeasurement) => void;

const READING: IDeviceMotionMeasurement = {
  acceleration: { x: 0.1, y: 0.2, z: 0.3, timestamp: 123 },
  accelerationIncludingGravity: { x: 0.1, y: 0.2, z: 9.9, timestamp: 123 },
  rotation: { alpha: 1, beta: 2, gamma: 3, timestamp: 123 },
  rotationRate: { alpha: 0.1, beta: 0.2, gamma: 0.3, timestamp: 123 },
  interval: 16,
  orientation: 0, // DeviceMotionOrientation.Portrait
};
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

let registeredListener: IListener | undefined;
// remove() clears the captured listener, exactly as the real subscription does — otherwise the
// "stops moving after dispose" assertion below could never fail.
const removeMock = vi.fn(() => {
  registeredListener = undefined;
});
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../core', () => ({
  DeviceMotion: {
    addListener: (listener: IListener) => addListenerMock(listener),
    removeAllListeners: vi.fn(),
    setUpdateInterval: (intervalMs: number) =>
      setUpdateIntervalMock(intervalMs),
  },
}));

// A user `createEffect` is deferred to the end of the enclosing `runUpdates`, so one created
// inside `createRoot`'s callback has not run when that callback returns — every test therefore
// builds inside the root and asserts outside it, the same ordering a component gets.
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

let disposeRoot: (() => void) | undefined;

function buildDeviceMotion(
  updateIntervalMs?: number | Accessor<number | undefined>,
): Accessor<IDeviceMotionMeasurement | null> {
  const { value, dispose } = inRoot(() => createDeviceMotion(updateIntervalMs));
  disposeRoot = dispose;
  return value;
}

beforeEach(() => {
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  setUpdateIntervalMock.mockClear();
});

afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
});

describe('createDeviceMotion (Solid)', () => {
  describe('Positive', () => {
    it('starts null before any measurement arrives', () => {
      // why: the caller has no measurement synchronously at build time — null is the documented
      // "nothing reported yet" state, not an error.
      const measurement = buildDeviceMotion();

      expect(measurement()).toBeNull();
    });

    it('subscribes synchronously in the primitive body, not from a deferred effect', () => {
      // why: Solid defers user effects to the end of the enclosing update, so a subscription
      // created there would miss any native event landing between the seed and the flush — the
      // same seed/subscribe race React's useEffect and Vue's onMounted both carry.
      let hasSubscribedDuringBuild = false;
      const { dispose } = inRoot(() => {
        createDeviceMotion();
        hasSubscribedDuringBuild = addListenerMock.mock.calls.length === 1;
      });
      disposeRoot = dispose;

      expect(hasSubscribedDuringBuild).toBe(true);
    });

    it('updates the accessor when the native listener fires', () => {
      // why: the primitive's whole job is bridging the native event stream into Solid
      // reactivity, and reading it from a tracked scope proves it — a value that only updated
      // when polled would never re-run a consumer's effect.
      const seen: (IDeviceMotionMeasurement | null)[] = [];
      const { value: measurement, dispose } = inRoot(() => {
        const reading = createDeviceMotion();
        createEffect(() => {
          seen.push(reading());
        });
        return reading;
      });
      disposeRoot = dispose;

      registeredListener?.(READING);

      expect(measurement()).toEqual(READING);
      expect(seen).toEqual([null, READING]);
    });

    it('replaces the previous measurement rather than merging with it, including nullable fields', () => {
      // why: `acceleration`/`rotationRate` are nullable per-reading (core/device-motion.ts) — a
      // merge instead of a replace would keep a stale non-null value alive after the native side
      // legitimately reports null.
      const measurement = buildDeviceMotion();

      registeredListener?.(FIRST_READING);
      expect(measurement()).toEqual(FIRST_READING);
      registeredListener?.(SECOND_READING);

      expect(measurement()).toEqual(SECOND_READING);
    });

    it('removes the subscription on dispose', () => {
      // why: a leftover subscription keeps writing into a disposed scope and pins the native
      // listener alive for no consumer. Asserting the accessor stops moving catches a `remove`
      // that silently no-ops; asserting `remove` was called does not.
      const measurement = buildDeviceMotion();
      registeredListener?.(FIRST_READING);

      disposeRoot?.();
      disposeRoot = undefined;

      expect(removeMock).toHaveBeenCalledTimes(1);
      expect(registeredListener).toBeUndefined();
      expect(measurement()).toEqual(FIRST_READING);
    });

    it('sets the update interval once at subscribe time when provided', () => {
      // why: without this call the native module keeps its default sample rate regardless of what
      // the caller asked for.
      buildDeviceMotion(50);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
    });

    it('sets the update interval for an explicit 0ms, not just a truthy value', () => {
      // why: the guard is `!== undefined`, not truthiness — 0 is a legitimate "as fast as
      // possible" interval and must not be mistaken for "no interval given".
      buildDeviceMotion(0);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(0);
    });

    it('does not touch the update interval when omitted', () => {
      // why: an unconditional call would stomp on whatever rate another consumer of the shared
      // DeviceMotion singleton already configured.
      buildDeviceMotion();

      expect(setUpdateIntervalMock).not.toHaveBeenCalled();
    });

    it('re-applies the update interval when a reactive accessor changes, without re-subscribing', () => {
      // why: a Solid body runs ONCE, so a plain number freezes the sample rate at the mount-time
      // value while the caller's state moves on — the one way this primitive can silently rot.
      // The listener is per-sensor and unaffected by the rate, so it must survive: React's hook
      // re-subscribes only because its effect keys on the interval.
      const [intervalMs, setIntervalMs] = createSignal<number | undefined>(50);
      buildDeviceMotion(intervalMs);
      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);

      setIntervalMs(200);

      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(2);
      expect(setUpdateIntervalMock).toHaveBeenLastCalledWith(200);
      expect(addListenerMock).toHaveBeenCalledTimes(1);
    });
  });
});

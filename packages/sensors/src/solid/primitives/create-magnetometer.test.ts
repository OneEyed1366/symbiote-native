// Co-located Solid-driven test (ADR 0025) for createMagnetometer, the Solid twin of
// react/hooks/use-magnetometer, vue/composables/use-magnetometer and
// svelte/runes/use-magnetometer.svelte.ts. Same coverage as the Vue file — seed, listener-driven
// update, replace-not-merge, teardown, the three update-interval boundaries — plus the two cases
// that exist only here: the synchronous subscribe and a REACTIVE interval accessor.
//
// Driven with `createRoot` + an explicit dispose rather than a mounted component: the primitive
// renders nothing, so a root is the whole owner it needs. The core module is mocked wholesale
// (never expo-modules-core internals) — DeviceSensor's async/permission surface belongs to
// core/magnetometer.test.ts, and there is no native view here, so no ViewConfig fixture.
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
import type { IMagnetometerMeasurement } from '../../core';
import { createMagnetometer } from './create-magnetometer';

type IListener = (measurement: IMagnetometerMeasurement) => void;

const READING: IMagnetometerMeasurement = {
  x: 0.1,
  y: 0.2,
  z: 0.9,
  timestamp: 123,
};
const FIRST_READING: IMagnetometerMeasurement = {
  x: 0.1,
  y: 0.2,
  z: 0.3,
  timestamp: 1,
};
const SECOND_READING: IMagnetometerMeasurement = {
  x: 9,
  y: 9,
  z: 9,
  timestamp: 2,
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
  Magnetometer: {
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

function buildMagnetometer(
  updateIntervalMs?: number | Accessor<number | undefined>,
): Accessor<IMagnetometerMeasurement | null> {
  const { value, dispose } = inRoot(() => createMagnetometer(updateIntervalMs));
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

describe('createMagnetometer (Solid)', () => {
  describe('Positive', () => {
    it('starts null before any measurement arrives', () => {
      // why: the caller has no measurement synchronously at build time — null is the documented
      // "nothing reported yet" state, not an error.
      const measurement = buildMagnetometer();

      expect(measurement()).toBeNull();
    });

    it('subscribes synchronously in the primitive body, not from a deferred effect', () => {
      // why: Solid defers user effects to the end of the enclosing update, so a subscription
      // created there would miss any native event landing between the seed and the flush — the
      // same seed/subscribe race React's useEffect and Vue's onMounted both carry.
      let hasSubscribedDuringBuild = false;
      const { dispose } = inRoot(() => {
        createMagnetometer();
        hasSubscribedDuringBuild = addListenerMock.mock.calls.length === 1;
      });
      disposeRoot = dispose;

      expect(hasSubscribedDuringBuild).toBe(true);
    });

    it('updates the accessor when the native listener fires', () => {
      // why: the primitive's whole job is bridging the native event stream into Solid
      // reactivity, and reading it from a tracked scope proves it — a value that only updated
      // when polled would never re-run a consumer's effect.
      const seen: (IMagnetometerMeasurement | null)[] = [];
      const { value: measurement, dispose } = inRoot(() => {
        const reading = createMagnetometer();
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

    it('replaces the previous measurement rather than merging with it', () => {
      // why: each native event is a full snapshot, not a delta — merging would leave stale axis
      // values behind after a real reading changes.
      const measurement = buildMagnetometer();

      registeredListener?.(FIRST_READING);
      expect(measurement()).toEqual(FIRST_READING);
      registeredListener?.(SECOND_READING);

      expect(measurement()).toEqual(SECOND_READING);
    });

    it('removes the subscription on dispose', () => {
      // why: a leftover subscription keeps writing into a disposed scope and pins the native
      // listener alive for no consumer. Asserting the accessor stops moving catches a `remove`
      // that silently no-ops; asserting `remove` was called does not.
      const measurement = buildMagnetometer();
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
      buildMagnetometer(50);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
    });

    it('sets the update interval for an explicit 0ms, not just a truthy value', () => {
      // why: the guard is `!== undefined`, not truthiness — 0 is a legitimate "as fast as
      // possible" interval and must not be mistaken for "no interval given".
      buildMagnetometer(0);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(0);
    });

    it('does not touch the update interval when omitted', () => {
      // why: an unconditional call would stomp on whatever rate another consumer of the shared
      // Magnetometer singleton already configured.
      buildMagnetometer();

      expect(setUpdateIntervalMock).not.toHaveBeenCalled();
    });

    it('re-applies the update interval when a reactive accessor changes, without re-subscribing', () => {
      // why: a Solid body runs ONCE, so a plain number freezes the sample rate at the mount-time
      // value while the caller's state moves on — the one way this primitive can silently rot.
      // The listener is per-sensor and unaffected by the rate, so it must survive: React's hook
      // re-subscribes only because its effect keys on the interval.
      const [intervalMs, setIntervalMs] = createSignal<number | undefined>(50);
      buildMagnetometer(intervalMs);
      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);

      setIntervalMs(200);

      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(2);
      expect(setUpdateIntervalMock).toHaveBeenLastCalledWith(200);
      expect(addListenerMock).toHaveBeenCalledTimes(1);
    });
  });
});

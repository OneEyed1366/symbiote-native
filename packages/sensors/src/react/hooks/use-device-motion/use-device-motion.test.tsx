// Co-located React-driven test (ADR 0025) for useDeviceMotion. Mocks the whole `core`
// module rather than expo-modules-core internals — this hook's own lifecycle wiring
// (subscribe/unsubscribe/interval) is what's under test, not the core port itself, which
// already has its own coverage in packages/sensors/src/core/device-motion.test.ts.
//
// No Negative group: the hook has no guard clause and nothing to reject — every prop shape
// the type system allows flows straight into DeviceMotion.addListener/setUpdateInterval, so
// every scenario below is Positive. `DeviceMotion.removeAllListeners` /
// `hasListeners`/`getListenerCount`/`isAvailableAsync`/`getPermissionsAsync`/
// `requestPermissionsAsync` are N/A here — the hook never calls them; they're core-level API
// surface covered by device-motion.test.ts.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useDeviceMotion } from './index';
import type { IDeviceMotionMeasurement } from '../../../core';

const { addListener, removeAllListeners, setUpdateInterval, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addListener: vi.fn((_listener: (measurement: IDeviceMotionMeasurement) => void) => ({
      remove,
    })),
    removeAllListeners: vi.fn(),
    setUpdateInterval: vi.fn(),
    remove,
  };
});

vi.mock('../../../core', () => ({
  DeviceMotion: { addListener, removeAllListeners, setUpdateInterval },
}));

const ROOT_TAG = 902;

const results: Array<IDeviceMotionMeasurement | null> = [];

function Probe(props: { updateIntervalMs?: number }): ReactElement {
  results.push(useDeviceMotion(props.updateIntervalMs));
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

const FIRST_READING: IDeviceMotionMeasurement = {
  acceleration: { x: 0.1, y: 0.2, z: 0.3, timestamp: 123 },
  accelerationIncludingGravity: { x: 0.1, y: 0.2, z: 9.8, timestamp: 123 },
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

describe('useDeviceMotion', () => {
  describe('Positive', () => {
    it('reports null before any native measurement arrives', () => {
      // why: the caller has no measurement synchronously at mount time — null is the
      // documented "nothing reported yet" state, not an error.
      mount(ROOT_TAG, createElement(Probe, {}));

      expect(results[results.length - 1]).toBeNull();
    });

    it('updates to the latest measurement once the native listener fires', async () => {
      // why: the hook's whole job is bridging the native event stream into React state —
      // a fired event that never reaches the return value would make it useless.
      mount(ROOT_TAG, createElement(Probe, {}));

      const listener = addListener.mock.calls[0][0];
      listener(FIRST_READING);

      // The mock invokes the listener directly, outside the engine's event dispatcher
      // (setEventDispatcher in render.ts), which is what normally flushes a native-driven
      // setState synchronously — so the resulting re-render lands on a later microtask here.
      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(FIRST_READING));
    });

    it('replaces the previous measurement rather than merging with it, including nullable fields', async () => {
      // why: `acceleration`/`rotationRate` are nullable per-reading (device-motion.ts) —
      // a merge instead of a replace would keep a stale non-null value alive after the
      // native side legitimately reports null (e.g. rotation-rate unsupported on a frame).
      mount(ROOT_TAG, createElement(Probe, {}));
      const listener = addListener.mock.calls[0][0];

      listener(FIRST_READING);
      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(FIRST_READING));
      listener(SECOND_READING);

      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(SECOND_READING));
    });

    it('unsubscribes from the native listener on unmount', () => {
      // why: a leftover subscription keeps firing setState on an unmounted component and
      // pins the native listener alive for no consumer.
      mount(ROOT_TAG, createElement(Probe, {}));

      unmount(ROOT_TAG);

      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('sets the native update interval when updateIntervalMs is provided', () => {
      // why: without this call the native module keeps its default sample rate regardless
      // of what the caller asked for.
      mount(ROOT_TAG, createElement(Probe, { updateIntervalMs: 100 }));

      expect(setUpdateInterval).toHaveBeenCalledWith(100);
    });

    it('sets the update interval for an explicit 0ms, not just a truthy value', () => {
      // why: the hook's guard is `!== undefined`, not truthiness — 0 is a legitimate "as
      // fast as possible" interval and must not be mistaken for "no interval given".
      mount(ROOT_TAG, createElement(Probe, { updateIntervalMs: 0 }));

      expect(setUpdateInterval).toHaveBeenCalledWith(0);
    });

    it('does not touch the update interval when updateIntervalMs is omitted', () => {
      // why: an unconditional call would stomp on whatever rate another consumer of the
      // shared DeviceMotion singleton already configured.
      mount(ROOT_TAG, createElement(Probe, {}));

      expect(setUpdateInterval).not.toHaveBeenCalled();
    });
  });
});

// Co-located React-driven test (ADR 0025) for useLightSensor. Mocks the whole `core`
// module rather than expo-modules-core internals — this hook's own lifecycle wiring
// (subscribe/unsubscribe/interval) is what's under test, not the core port itself, which
// already has its own coverage in packages/sensors/src/core/light-sensor.test.ts.
//
// No Negative group: the hook has no guard clause and nothing to reject — every prop shape
// the type system allows flows straight into LightSensor.addListener/setUpdateInterval, so
// every scenario below is Positive. `LightSensor.removeAllListeners` /
// `hasListeners`/`getListenerCount`/`isAvailableAsync`/`getPermissionsAsync`/
// `requestPermissionsAsync` are N/A here — the hook never calls them; they're core-level API
// surface covered by light-sensor.test.ts.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useLightSensor } from './index';
import type { ILightSensorMeasurement } from '../../../core';

const { addListener, removeAllListeners, setUpdateInterval, remove } =
  vi.hoisted(() => {
    const remove = vi.fn();
    return {
      addListener: vi.fn(
        (_listener: (measurement: ILightSensorMeasurement) => void) => ({
          remove,
        }),
      ),
      removeAllListeners: vi.fn(),
      setUpdateInterval: vi.fn(),
      remove,
    };
  });

vi.mock('../../../core', () => ({
  LightSensor: { addListener, removeAllListeners, setUpdateInterval },
}));

const ROOT_TAG = 902;

const results: Array<ILightSensorMeasurement | null> = [];

function Probe(props: { updateIntervalMs?: number }): ReactElement {
  results.push(useLightSensor(props.updateIntervalMs));
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

describe('useLightSensor', () => {
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

      const measurement: ILightSensorMeasurement = {
        illuminance: 42,
        timestamp: 123,
      };
      const listener = addListener.mock.calls[0][0];
      listener(measurement);

      // The mock invokes the listener directly, outside the engine's event dispatcher
      // (setEventDispatcher in render.ts), which is what normally flushes a native-driven
      // setState synchronously — so the resulting re-render lands on a later microtask here.
      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(measurement),
      );
    });

    it('replaces the previous measurement rather than merging with it', async () => {
      // why: each native event is a full snapshot, not a delta — merging would leave a
      // stale illuminance value behind after the light level actually changes.
      mount(ROOT_TAG, createElement(Probe, {}));
      const listener = addListener.mock.calls[0][0];
      const first: ILightSensorMeasurement = { illuminance: 42, timestamp: 1 };
      const second: ILightSensorMeasurement = {
        illuminance: 900,
        timestamp: 2,
      };

      listener(first);
      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(first),
      );
      listener(second);

      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(second),
      );
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
      // shared LightSensor singleton already configured.
      mount(ROOT_TAG, createElement(Probe, {}));

      expect(setUpdateInterval).not.toHaveBeenCalled();
    });
  });
});

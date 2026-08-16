// Co-located React-driven test (ADR 0025) for usePedometer. Mocks the whole `core` module
// rather than expo-modules-core internals — this hook's own lifecycle wiring (subscribe/
// unsubscribe) is what's under test, not the core port itself, which already has its own
// coverage in packages/sensors/src/core/pedometer.test.ts.
//
// No Negative group: the hook has no guard clause and nothing to reject — it always
// forwards `setResult` straight into `watchStepCount`, so every scenario below is Positive.
// `getStepCountAsync`/`isAvailableAsync`/`getPermissionsAsync`/`requestPermissionsAsync` are
// N/A here — the hook only calls `watchStepCount`; the rest of Pedometer's free-function API
// is core-level surface covered by pedometer.test.ts. Unlike every other sensor in this
// package, Pedometer has no `setUpdateInterval` (core/pedometer.ts's own header comment: it
// isn't a DeviceSensor subclass), so there is no interval-boundary group to cover here.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { usePedometer } from './index';
import type { IPedometerResult } from '../../../core';

const { watchStepCount, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    watchStepCount: vi.fn((_callback: (result: IPedometerResult) => void) => ({ remove })),
    remove,
  };
});

vi.mock('../../../core', () => ({ watchStepCount }));

const ROOT_TAG = 902;

const results: Array<IPedometerResult | null> = [];

function Probe(): ReactElement {
  results.push(usePedometer());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

describe('usePedometer', () => {
  describe('Positive', () => {
    it('reports null before any native step count arrives', () => {
      // why: the caller has no reading synchronously at mount time — null is the
      // documented "nothing reported yet" state, not an error.
      mount(ROOT_TAG, createElement(Probe));

      expect(results[results.length - 1]).toBeNull();
    });

    it('updates to the latest result once the native listener fires', async () => {
      // why: the hook's whole job is bridging the native step-count stream into React
      // state — a fired event that never reaches the return value would make it useless.
      mount(ROOT_TAG, createElement(Probe));

      const result: IPedometerResult = { steps: 123 };
      const listener = watchStepCount.mock.calls[0][0];
      listener(result);

      // The mock invokes the listener directly, outside the engine's event dispatcher
      // (setEventDispatcher in render.ts), which is what normally flushes a native-driven
      // setState synchronously — so the resulting re-render lands on a later microtask here.
      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(result));
    });

    it('replaces the previous result rather than accumulating step counts client-side', async () => {
      // why: the native module already reports the running total (Pedometer's own
      // "steps" is cumulative) — a client-side merge/add would double-count.
      mount(ROOT_TAG, createElement(Probe));
      const listener = watchStepCount.mock.calls[0][0];

      listener({ steps: 10 });
      await vi.waitFor(() => expect(results[results.length - 1]).toEqual({ steps: 10 }));
      listener({ steps: 25 });

      await vi.waitFor(() => expect(results[results.length - 1]).toEqual({ steps: 25 }));
    });

    it('unsubscribes from the native listener on unmount', () => {
      // why: a leftover subscription keeps firing setState on an unmounted component and
      // pins the native listener alive for no consumer.
      mount(ROOT_TAG, createElement(Probe));

      unmount(ROOT_TAG);

      expect(remove).toHaveBeenCalledTimes(1);
    });
  });
});

// Co-located Vue-driven test (ADR 0025) for usePedometer. Mocks the whole core module (never
// expo-modules-core internals) since this exercises composable mount/unmount lifecycle timing,
// not any native view — there is none here, so no ViewConfig fixture is needed.
//
// No Negative group: the composable has no guard clause and nothing to reject — it always
// forwards its listener straight into `watchStepCount`, so every scenario below is Positive.
// `getStepCountAsync`/`isAvailableAsync`/`getPermissionsAsync`/`requestPermissionsAsync` are
// N/A here — the composable only calls `watchStepCount`; the rest of Pedometer's free-function
// API is core-level surface covered by pedometer.test.ts. Unlike every other sensor in this
// package, Pedometer has no `setUpdateInterval` (core/pedometer.ts's own header comment: it
// isn't a DeviceSensor subclass), so there is no interval-boundary group to cover here.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { IPedometerResult } from '../../../core';
import { usePedometer } from './index';

const ROOT_TAG = 9822;

type IListener = (result: IPedometerResult) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const watchStepCountMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});

vi.mock('../../../core', () => ({
  watchStepCount: (listener: IListener) => watchStepCountMock(listener),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  watchStepCountMock.mockClear();
  removeMock.mockClear();
});

afterEach(() => unmount(ROOT_TAG));

function mountPedometer(): Ref<IPedometerResult | null> {
  let result: Ref<IPedometerResult | null> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        result = usePedometer();
        return () => h('symbiote-text', {}, 'pedometer');
      },
    }),
  );
  if (result === undefined) {
    throw new Error('setup() did not run');
  }
  return result;
}

describe('usePedometer (Vue)', () => {
  describe('Positive', () => {
    it('starts null before any step count arrives', () => {
      // why: the caller has no reading synchronously at mount time — null is the
      // documented "nothing reported yet" state, not an error.
      const result = mountPedometer();

      expect(result.value).toBeNull();
    });

    it('updates the ref when the native listener fires', () => {
      // why: the composable's whole job is bridging the native step-count stream into Vue
      // reactivity — a fired event that never reaches the ref would make it useless.
      const result = mountPedometer();
      const reading: IPedometerResult = { steps: 456 };

      registeredListener?.(reading);

      expect(result.value).toEqual(reading);
    });

    it('replaces the previous result rather than accumulating step counts client-side', () => {
      // why: the native module already reports the running total (Pedometer's own "steps"
      // is cumulative) — a client-side merge/add would double-count.
      const result = mountPedometer();

      registeredListener?.({ steps: 10 });
      expect(result.value).toEqual({ steps: 10 });
      registeredListener?.({ steps: 25 });

      expect(result.value).toEqual({ steps: 25 });
    });

    it('removes the subscription on unmount', () => {
      // why: a leftover subscription keeps writing into a ref no one reads and pins the
      // native listener alive for no consumer.
      mountPedometer();
      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });
});

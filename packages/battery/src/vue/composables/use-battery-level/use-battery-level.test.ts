// Co-located Vue-driven test (ADR 0025) for useBatteryLevel. Mocks the whole core module (never
// expo-modules-core internals) since this exercises composable mount/unmount lifecycle timing,
// not any native view — there is none here, so no ViewConfig fixture is needed.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { useBatteryLevel } from './index';

const ROOT_TAG = 9951;

type IListener = (event: { batteryLevel: number }) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getBatteryLevelAsyncMock = vi.fn(async () => 0.42);

vi.mock('../../../core', () => ({
  addBatteryLevelListener: (listener: IListener) => addListenerMock(listener),
  getBatteryLevelAsync: () => getBatteryLevelAsyncMock(),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getBatteryLevelAsyncMock.mockClear();
  getBatteryLevelAsyncMock.mockResolvedValue(0.42);
});

afterEach(() => unmount(ROOT_TAG));

function mountBatteryLevel(): Ref<number> {
  let batteryLevel: Ref<number> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        batteryLevel = useBatteryLevel();
        return () => h('symbiote-text', {}, 'battery');
      },
    }),
  );
  if (batteryLevel === undefined) {
    throw new Error('setup() did not run');
  }
  return batteryLevel;
}

describe('useBatteryLevel (Vue)', () => {
  it('starts at -1 before the initial fetch resolves', () => {
    const batteryLevel = mountBatteryLevel();

    expect(batteryLevel.value).toBe(-1);
  });

  it('updates to the fetched value once getBatteryLevelAsync() resolves', async () => {
    const batteryLevel = mountBatteryLevel();

    await vi.waitFor(() => expect(batteryLevel.value).toBe(0.42));
  });

  it('updates the ref when the native listener fires', async () => {
    const batteryLevel = mountBatteryLevel();
    await vi.waitFor(() => expect(batteryLevel.value).toBe(0.42));

    registeredListener?.({ batteryLevel: 0.1 });

    expect(batteryLevel.value).toBe(0.1);
  });

  it('removes the subscription on unmount', () => {
    mountBatteryLevel();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});

// Co-located Vue-driven test (ADR 0025) for useLowPowerMode. See use-battery-level's test for
// the shared rationale.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { useLowPowerMode } from './index';

const ROOT_TAG = 9953;

type IListener = (event: { lowPowerMode: boolean }) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const isLowPowerModeEnabledAsyncMock = vi.fn(async () => true);

vi.mock('../../../core', () => ({
  addLowPowerModeListener: (listener: IListener) => addListenerMock(listener),
  isLowPowerModeEnabledAsync: () => isLowPowerModeEnabledAsyncMock(),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  isLowPowerModeEnabledAsyncMock.mockClear();
  isLowPowerModeEnabledAsyncMock.mockResolvedValue(true);
});

afterEach(() => unmount(ROOT_TAG));

function mountLowPowerMode(): Ref<boolean> {
  let lowPowerMode: Ref<boolean> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        lowPowerMode = useLowPowerMode();
        return () => h('symbiote-text', {}, 'battery');
      },
    }),
  );
  if (lowPowerMode === undefined) {
    throw new Error('setup() did not run');
  }
  return lowPowerMode;
}

describe('useLowPowerMode (Vue)', () => {
  it('starts at false before the initial fetch resolves', () => {
    const lowPowerMode = mountLowPowerMode();

    expect(lowPowerMode.value).toBe(false);
  });

  it('updates to the fetched value once isLowPowerModeEnabledAsync() resolves', async () => {
    const lowPowerMode = mountLowPowerMode();

    await vi.waitFor(() => expect(lowPowerMode.value).toBe(true));
  });

  it('updates the ref when the native listener fires', async () => {
    isLowPowerModeEnabledAsyncMock.mockResolvedValue(false);
    const lowPowerMode = mountLowPowerMode();
    await vi.waitFor(() => expect(lowPowerMode.value).toBe(false));

    registeredListener?.({ lowPowerMode: true });

    expect(lowPowerMode.value).toBe(true);
  });

  it('removes the subscription on unmount', () => {
    mountLowPowerMode();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});

// Co-located Vue-driven test (ADR 0025) for useScreenOrientation. See network's
// use-network-state.test.ts for the shared rationale.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { useScreenOrientation } from './index';

const ROOT_TAG = 9954;

type IScreenOrientationState = { orientation: number; orientationLock: number };
type IOrientationChangeEvent = {
  orientationLock: number;
  orientationInfo: { orientation: number };
};
type IListener = (event: IOrientationChangeEvent) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getOrientationAsyncMock = vi.fn(async () => 1);
const getOrientationLockAsyncMock = vi.fn(async () => 0);

vi.mock('../../../core', () => ({
  addOrientationChangeListener: (listener: IListener) => addListenerMock(listener),
  getOrientationAsync: () => getOrientationAsyncMock(),
  getOrientationLockAsync: () => getOrientationLockAsyncMock(),
  Orientation: { UNKNOWN: 0, PORTRAIT_UP: 1 },
  OrientationLock: { UNKNOWN: 9, DEFAULT: 0 },
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getOrientationAsyncMock.mockClear();
  getOrientationLockAsyncMock.mockClear();
  getOrientationAsyncMock.mockResolvedValue(1);
  getOrientationLockAsyncMock.mockResolvedValue(0);
});

afterEach(() => unmount(ROOT_TAG));

function mountScreenOrientation(): Ref<IScreenOrientationState> {
  let screenOrientation: Ref<IScreenOrientationState> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        screenOrientation = useScreenOrientation();
        return () => h('symbiote-text', {}, 'screen-orientation');
      },
    }),
  );
  if (screenOrientation === undefined) {
    throw new Error('setup() did not run');
  }
  return screenOrientation;
}

describe('useScreenOrientation (Vue)', () => {
  it('starts at Orientation/OrientationLock UNKNOWN before the initial fetch resolves', () => {
    const screenOrientation = mountScreenOrientation();

    expect(screenOrientation.value).toEqual({ orientation: 0, orientationLock: 9 });
  });

  it('updates to the fetched value once getOrientationAsync()/getOrientationLockAsync() resolve', async () => {
    const screenOrientation = mountScreenOrientation();

    await vi.waitFor(() =>
      expect(screenOrientation.value).toEqual({ orientation: 1, orientationLock: 0 }),
    );
  });

  it('updates the ref when the native listener fires', async () => {
    const screenOrientation = mountScreenOrientation();
    await vi.waitFor(() => expect(screenOrientation.value.orientation).toBe(1));

    registeredListener?.({ orientationLock: 5, orientationInfo: { orientation: 3 } });

    expect(screenOrientation.value).toEqual({ orientation: 3, orientationLock: 5 });
  });

  it('removes the subscription on unmount', () => {
    mountScreenOrientation();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});

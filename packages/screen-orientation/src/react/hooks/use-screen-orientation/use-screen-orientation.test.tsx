// Co-located React-driven test (ADR 0025) for useScreenOrientation. See network's
// use-network-state.test.tsx for the shared rationale (mocks `core`, not expo-modules-core
// internals).

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useScreenOrientation } from './index';

type IScreenOrientationState = { orientation: number; orientationLock: number };
type IOrientationChangeEvent = {
  orientationLock: number;
  orientationInfo: { orientation: number };
};

const { addListener, getOrientationAsync, getOrientationLockAsync, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addListener: vi.fn((_listener: (event: IOrientationChangeEvent) => void) => ({ remove })),
    getOrientationAsync: vi.fn(async () => 1),
    getOrientationLockAsync: vi.fn(async () => 0),
    remove,
  };
});

vi.mock('../../../core', () => ({
  addOrientationChangeListener: addListener,
  getOrientationAsync,
  getOrientationLockAsync,
  Orientation: { UNKNOWN: 0, PORTRAIT_UP: 1 },
  OrientationLock: { UNKNOWN: 9, DEFAULT: 0 },
}));

const ROOT_TAG = 954;

const results: IScreenOrientationState[] = [];

function Probe(): ReactElement {
  results.push(useScreenOrientation());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
  getOrientationAsync.mockResolvedValue(1);
  getOrientationLockAsync.mockResolvedValue(0);
});

afterEach(() => unmount(ROOT_TAG));

describe('useScreenOrientation', () => {
  it('reports OrientationLock/Orientation UNKNOWN before the initial fetch resolves', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toEqual({ orientation: 0, orientationLock: 9 });
  });

  it('reports the fetched state once the initial getOrientationAsync()/getOrientationLockAsync() resolve', async () => {
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() =>
      expect(results[results.length - 1]).toEqual({ orientation: 1, orientationLock: 0 }),
    );
  });

  it('updates when the native listener fires', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(results[results.length - 1].orientation).toBe(1));

    const listener = addListener.mock.calls[0][0];
    listener({ orientationLock: 5, orientationInfo: { orientation: 3 } });

    await vi.waitFor(() =>
      expect(results[results.length - 1]).toEqual({
        orientation: 3,
        orientationLock: 5,
      }),
    );
  });

  it('unsubscribes from the native listener on unmount', () => {
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

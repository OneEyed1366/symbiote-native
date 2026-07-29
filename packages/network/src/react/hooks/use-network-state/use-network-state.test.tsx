// Co-located React-driven test (ADR 0025) for useNetworkState. See battery's
// use-battery-state.test.tsx for the shared rationale (mocks `core`, not expo-modules-core
// internals).

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useNetworkState } from './index';

type INetworkState = { type?: string; isConnected?: boolean; isInternetReachable?: boolean };

const { addListener, getNetworkStateAsync, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addListener: vi.fn((_listener: (event: INetworkState) => void) => ({ remove })),
    getNetworkStateAsync: vi.fn(async () => ({
      type: 'WIFI',
      isConnected: true,
      isInternetReachable: true,
    })),
    remove,
  };
});

vi.mock('../../../core', () => ({
  addNetworkStateListener: addListener,
  getNetworkStateAsync,
}));

const ROOT_TAG = 953;

const results: INetworkState[] = [];

function Probe(): ReactElement {
  results.push(useNetworkState());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
  getNetworkStateAsync.mockResolvedValue({
    type: 'WIFI',
    isConnected: true,
    isInternetReachable: true,
  });
});

afterEach(() => unmount(ROOT_TAG));

describe('useNetworkState', () => {
  it('reports an empty object before the initial fetch resolves', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toEqual({});
  });

  it('reports the fetched state once the initial getNetworkStateAsync() resolves', async () => {
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() =>
      expect(results[results.length - 1]).toEqual({
        type: 'WIFI',
        isConnected: true,
        isInternetReachable: true,
      }),
    );
  });

  it('updates when the native listener fires', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(results[results.length - 1].type).toBe('WIFI'));

    const listener = addListener.mock.calls[0][0];
    listener({ type: 'CELLULAR', isConnected: true, isInternetReachable: false });

    await vi.waitFor(() => expect(results[results.length - 1].type).toBe('CELLULAR'));
  });

  it('unsubscribes from the native listener on unmount', () => {
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

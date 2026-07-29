// Co-located Vue-driven test (ADR 0025) for useNetworkState. See battery's
// use-battery-state.test.ts for the shared rationale.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { useNetworkState } from './index';

const ROOT_TAG = 9953;

type INetworkState = { type?: string; isConnected?: boolean; isInternetReachable?: boolean };
type IListener = (event: INetworkState) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getNetworkStateAsyncMock = vi.fn(async () => ({
  type: 'WIFI',
  isConnected: true,
  isInternetReachable: true,
}));

vi.mock('../../../core', () => ({
  addNetworkStateListener: (listener: IListener) => addListenerMock(listener),
  getNetworkStateAsync: () => getNetworkStateAsyncMock(),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getNetworkStateAsyncMock.mockClear();
  getNetworkStateAsyncMock.mockResolvedValue({
    type: 'WIFI',
    isConnected: true,
    isInternetReachable: true,
  });
});

afterEach(() => unmount(ROOT_TAG));

function mountNetworkState(): Ref<INetworkState> {
  let networkState: Ref<INetworkState> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        networkState = useNetworkState();
        return () => h('symbiote-text', {}, 'network');
      },
    }),
  );
  if (networkState === undefined) {
    throw new Error('setup() did not run');
  }
  return networkState;
}

describe('useNetworkState (Vue)', () => {
  it('starts at an empty object before the initial fetch resolves', () => {
    const networkState = mountNetworkState();

    expect(networkState.value).toEqual({});
  });

  it('updates to the fetched value once getNetworkStateAsync() resolves', async () => {
    const networkState = mountNetworkState();

    await vi.waitFor(() =>
      expect(networkState.value).toEqual({
        type: 'WIFI',
        isConnected: true,
        isInternetReachable: true,
      }),
    );
  });

  it('updates the ref when the native listener fires', async () => {
    const networkState = mountNetworkState();
    await vi.waitFor(() => expect(networkState.value.type).toBe('WIFI'));

    registeredListener?.({ type: 'CELLULAR', isConnected: true, isInternetReachable: false });

    expect(networkState.value.type).toBe('CELLULAR');
  });

  it('removes the subscription on unmount', () => {
    mountNetworkState();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});

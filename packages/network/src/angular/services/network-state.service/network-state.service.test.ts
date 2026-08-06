// Co-located Angular-driven test (ADR 0025) for NetworkStateService. See battery's
// battery-state.service.test.ts for the shared rationale.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { NetworkStateService } from './index';

type INetworkState = { type?: string; isConnected?: boolean; isInternetReachable?: boolean };

const addListenerMock = vi.fn();
const removeMock = vi.fn();
const getNetworkStateAsyncMock = vi.fn(async () => ({
  type: 'WIFI',
  isConnected: true,
  isInternetReachable: true,
}));

vi.mock('../../../core', () => ({
  addNetworkStateListener: (listener: (event: INetworkState) => void) => addListenerMock(listener),
  getNetworkStateAsync: () => getNetworkStateAsyncMock(),
}));

const ROOT_TAG = 973;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<INetworkState> | undefined;
let capturedListener: ((event: INetworkState) => void) | undefined;

@Component({
  selector: 'symbiote-network-state-host',
  standalone: true,
  template: '',
})
class NetworkStateHost {
  readonly networkState = inject(NetworkStateService).connect();

  constructor() {
    capturedResult = this.networkState;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  getNetworkStateAsyncMock.mockResolvedValue({
    type: 'WIFI',
    isConnected: true,
    isInternetReachable: true,
  });
  addListenerMock.mockImplementation(listener => {
    capturedListener = listener;
    return { remove: removeMock };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('NetworkStateService.connect', () => {
  it('reports an empty object before the initial fetch resolves', async () => {
    mount(ROOT_TAG, NetworkStateHost);

    expect(capturedResult?.()).toEqual({});
  });

  it('reports the fetched state once getNetworkStateAsync() resolves', async () => {
    mount(ROOT_TAG, NetworkStateHost);
    await tick();

    expect(capturedResult?.()).toEqual({
      type: 'WIFI',
      isConnected: true,
      isInternetReachable: true,
    });
  });

  it('updates the signal when the registered listener fires', async () => {
    mount(ROOT_TAG, NetworkStateHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    capturedListener({ type: 'CELLULAR', isConnected: true, isInternetReachable: false });

    expect(capturedResult?.()?.type).toBe('CELLULAR');
  });

  it('removes the subscription when the host component is unmounted', async () => {
    mount(ROOT_TAG, NetworkStateHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});

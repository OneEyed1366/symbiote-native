// Co-located Angular-driven test (ADR 0025) for NetworkStateService. See battery's
// battery-state.service.test.ts for the shared rationale.
//
// Scope: this service adds no branching of its own — getNetworkStateAsync/
// addNetworkStateListener are mocked wholesale, and their own guard/throw paths are already
// exhaustively covered by core/network.test.ts (Positive/Negative). What's unique to THIS
// layer is Angular lifecycle: does connect() seed the signal, subscribe inside the effect,
// react to the native event, and release the subscription on the effect's onCleanup. No
// Negative group — the service has no guard clause of its own to reject on.

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

describe('NetworkStateService.connect — lifecycle (mount seeds + subscribes, event updates, unmount cleans up)', () => {
  // why: a template reading the signal synchronously on first render must never see
  // `undefined` before the first fetch lands — connect()'s own initial signal value
  // guarantees a safe first read.
  it('reports an empty object before the initial fetch resolves', async () => {
    mount(ROOT_TAG, NetworkStateHost);

    expect(capturedResult?.()).toEqual({});
  });

  // why: the effect must trigger the one-shot fetch so the signal has real data before any
  // native change event ever fires.
  it('reports the fetched state once getNetworkStateAsync() resolves', async () => {
    mount(ROOT_TAG, NetworkStateHost);
    await tick();

    expect(capturedResult?.()).toEqual({
      type: 'WIFI',
      isConnected: true,
      isInternetReachable: true,
    });
  });

  // why: the signal must stay reactive for the component's whole lifetime — a subscription
  // that only fires once would leave consumers reading a stale connection type forever.
  it('updates the signal when the registered listener fires', async () => {
    mount(ROOT_TAG, NetworkStateHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    capturedListener({ type: 'CELLULAR', isConnected: true, isInternetReachable: false });

    expect(capturedResult?.()?.type).toBe('CELLULAR');
  });

  // why: an un-cleaned subscription is a memory/listener leak and can write to a signal whose
  // owning injector no longer exists — the effect's onCleanup must release it.
  it('removes the subscription when the host component is unmounted', async () => {
    mount(ROOT_TAG, NetworkStateHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});

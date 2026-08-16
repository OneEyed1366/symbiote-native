// Co-located React-driven test (ADR 0025) for useNetworkState. See battery's
// use-battery-state.test.tsx for the shared rationale (mocks `core`, not expo-modules-core
// internals).
//
// Scope: this hook adds no branching of its own — getNetworkStateAsync/addNetworkStateListener
// are mocked wholesale, and their own guard/throw paths are already exhaustively covered by
// core/network.test.ts (Positive/Negative). What's unique to THIS layer is React lifecycle:
// does it seed state, subscribe on mount, react to the native event, and clean up on unmount.
// No Negative group — the hook has no guard clause of its own to reject on.

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

describe('useNetworkState — lifecycle (mount seeds + subscribes, event updates, unmount cleans up)', () => {
  // why: a component must never render `undefined`/stale native data before the first fetch
  // lands — the hook's own initial state (not core's) is what guarantees a safe first paint.
  it('reports an empty object before the initial fetch resolves', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toEqual({});
  });

  // why: mounting must trigger the one-shot fetch so the UI has real data before any native
  // change event ever fires (a device may go a long time between network transitions).
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

  // why: the hook must stay reactive for the component's whole lifetime, not just its first
  // render — a subscription that only fires once would show a stale connection type forever.
  it('updates when the native listener fires', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(results[results.length - 1].type).toBe('WIFI'));

    const listener = addListener.mock.calls[0][0];
    listener({ type: 'CELLULAR', isConnected: true, isInternetReachable: false });

    await vi.waitFor(() => expect(results[results.length - 1].type).toBe('CELLULAR'));
  });

  // why: an un-cleaned subscription is a memory/listener leak and can update state on an
  // unmounted component — React's own effect-cleanup contract requires this call on teardown.
  it('unsubscribes from the native listener on unmount', () => {
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

// Co-located Solid-driven test (ADR 0025) for createNetworkState, the Solid twin of
// react/hooks/use-network-state, vue/composables/use-network-state and
// svelte/runes/use-network-state. Same coverage as the Vue file: seed, fetched value,
// listener-driven update, teardown.
//
// Driven with `createRoot` + an explicit dispose rather than a mounted component: this primitive
// renders nothing, so a root is the whole owner it needs. core is mocked wholesale — its own
// guard/throw paths are covered by core/network.test.ts; what is unique to THIS layer is the
// Solid lifecycle.

import { createEffect, createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNetworkState } from './create-network-state';

type INetworkState = {
  type?: string;
  isConnected?: boolean;
  isInternetReachable?: boolean;
};
type IListener = (event: INetworkState) => void;

let registeredListener: IListener | undefined;
// remove() clears the captured listener, exactly as the real subscription does — otherwise the
// "stops moving after dispose" assertion below could never fail.
const removeMock = vi.fn(() => {
  registeredListener = undefined;
});
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getNetworkStateAsyncMock = vi.fn(async (): Promise<INetworkState> => ({
  type: 'WIFI',
  isConnected: true,
  isInternetReachable: true,
}));

vi.mock('../../core', () => ({
  addNetworkStateListener: (listener: IListener) => addListenerMock(listener),
  getNetworkStateAsync: () => getNetworkStateAsyncMock(),
}));

// A user `createEffect` is deferred to the end of the enclosing `runUpdates`, so one created
// inside `createRoot`'s callback has not run when that callback returns — every test therefore
// builds inside the root and asserts outside it, the same ordering a component gets.
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

let disposeRoot: (() => void) | undefined;

beforeEach(() => {
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

afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
});

describe('createNetworkState (Solid)', () => {
  // why: a template reading the accessor must never see `undefined` before the first fetch lands.
  // The never-settling promise proves `{}` is the primitive's OWN seed rather than a value that
  // happened to win a race with the mock.
  it('starts at an empty object before the initial fetch resolves', () => {
    getNetworkStateAsyncMock.mockReturnValue(
      new Promise<INetworkState>(() => {}),
    );
    const { value: networkState, dispose } = inRoot(createNetworkState);
    disposeRoot = dispose;

    expect(networkState()).toEqual({});
  });

  // why: the one-shot fetch must actually reach the caller, so the app has real data before any
  // native change event ever fires.
  it('updates to the fetched value once getNetworkStateAsync() resolves', async () => {
    const { value: networkState, dispose } = inRoot(createNetworkState);
    disposeRoot = dispose;

    await vi.waitFor(() =>
      expect(networkState()).toEqual({
        type: 'WIFI',
        isConnected: true,
        isInternetReachable: true,
      }),
    );
  });

  // why: a snapshot return would satisfy every read above and still leave the screen showing the
  // boot connection type forever — reading the accessor from a TRACKED scope is what proves it is
  // a real signal and not a value that only moves when polled.
  it('updates the accessor when the native listener fires', async () => {
    const seen: (string | undefined)[] = [];
    const { value: networkState, dispose } = inRoot(() => {
      const state = createNetworkState();
      createEffect(() => {
        seen.push(state().type);
      });
      return state;
    });
    disposeRoot = dispose;
    await vi.waitFor(() => expect(networkState().type).toBe('WIFI'));

    registeredListener?.({
      type: 'CELLULAR',
      isConnected: true,
      isInternetReachable: false,
    });

    expect(networkState().type).toBe('CELLULAR');
    expect(seen).toEqual([undefined, 'WIFI', 'CELLULAR']);
  });

  // why: a listener outliving its owner is a real leak — it keeps writing into a disposed scope.
  // Asserting `remove` was CALLED would pass on a subscription object that ignores it; asserting
  // the accessor stops moving cannot.
  it('removes the subscription on dispose', () => {
    const { value: networkState, dispose } = inRoot(createNetworkState);

    registeredListener?.({ type: 'CELLULAR', isConnected: true });
    expect(networkState().type).toBe('CELLULAR');

    dispose();

    expect(removeMock).toHaveBeenCalledTimes(1);
    registeredListener?.({ type: 'WIFI', isConnected: true });
    expect(networkState().type).toBe('CELLULAR');
  });
});

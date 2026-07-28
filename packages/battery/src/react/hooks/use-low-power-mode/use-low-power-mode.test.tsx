// Co-located React-driven test (ADR 0025) for useLowPowerMode. See use-battery-level's test for
// the shared rationale (mocks `core`, not expo-modules-core internals).

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useLowPowerMode } from './index';

const { addListener, isLowPowerModeEnabledAsync, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addListener: vi.fn((_listener: (event: { lowPowerMode: boolean }) => void) => ({ remove })),
    isLowPowerModeEnabledAsync: vi.fn(async () => true),
    remove,
  };
});

vi.mock('../../../core', () => ({
  addLowPowerModeListener: addListener,
  isLowPowerModeEnabledAsync,
}));

const ROOT_TAG = 953;

const results: boolean[] = [];

function Probe(): ReactElement {
  results.push(useLowPowerMode());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
  isLowPowerModeEnabledAsync.mockResolvedValue(true);
});

afterEach(() => unmount(ROOT_TAG));

describe('useLowPowerMode', () => {
  it('reports false before the initial fetch resolves', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toBe(false);
  });

  it('reports the fetched value once the initial isLowPowerModeEnabledAsync() resolves', async () => {
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() => expect(results[results.length - 1]).toBe(true));
  });

  it('updates when the native listener fires', async () => {
    isLowPowerModeEnabledAsync.mockResolvedValue(false);
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(results[results.length - 1]).toBe(false));

    const listener = addListener.mock.calls[0][0];
    listener({ lowPowerMode: true });

    await vi.waitFor(() => expect(results[results.length - 1]).toBe(true));
  });

  it('unsubscribes from the native listener on unmount', () => {
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

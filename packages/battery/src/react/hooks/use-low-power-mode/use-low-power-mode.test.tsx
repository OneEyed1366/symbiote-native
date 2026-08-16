// Co-located React-driven test (ADR 0025) for useLowPowerMode. See use-battery-level's test for
// the shared rationale (mocks `core`, not expo-modules-core internals; native delegation is
// covered once in packages/battery/src/core/battery.test.ts).
//
// No Negative group: the hook has no guard clause or throwing path.

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
    // why: false is the documented "assume off until proven otherwise" sentinel — must show on
    // the synchronous first render, before the effect's async fetch settles.
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toBe(false);
  });

  it('reports the fetched value once the initial isLowPowerModeEnabledAsync() resolves', async () => {
    // why: proves the one-shot seed fetch actually reaches a re-render.
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() => expect(results[results.length - 1]).toBe(true));
  });

  it('updates when the native listener fires', async () => {
    // why: toggling low-power mode must come from the native event, not a second fetch — proves
    // the listener drives a re-render independent of the seed value (seed=false, event flips it
    // to true, isolating the two code paths).
    isLowPowerModeEnabledAsync.mockResolvedValue(false);
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(results[results.length - 1]).toBe(false));

    const listener = addListener.mock.calls[0][0];
    listener({ lowPowerMode: true });

    await vi.waitFor(() => expect(results[results.length - 1]).toBe(true));
  });

  it('unsubscribes from the native listener on unmount', () => {
    // why: the effect's cleanup must run on unmount or the native listener leaks past the
    // component's lifetime.
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

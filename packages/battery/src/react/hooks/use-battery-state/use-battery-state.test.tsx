// Co-located React-driven test (ADR 0025) for useBatteryState. See use-battery-level's test for
// the shared rationale (mocks `core`, not expo-modules-core internals; native delegation is
// covered once in packages/battery/src/core/battery.test.ts).
//
// No Negative group: the hook has no guard clause or throwing path.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useBatteryState } from './index';

const { addListener, getBatteryStateAsync, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addListener: vi.fn(
      (_listener: (event: { batteryState: number }) => void) => ({ remove }),
    ),
    getBatteryStateAsync: vi.fn(async () => 2),
    remove,
  };
});

vi.mock('../../../core', () => ({
  addBatteryStateListener: addListener,
  getBatteryStateAsync,
  BatteryState: {
    UNKNOWN: 0,
    UNPLUGGED: 1,
    CHARGING: 2,
    FULL: 3,
    NOT_CHARGING: 4,
  },
}));

const ROOT_TAG = 952;

const results: number[] = [];

function Probe(): ReactElement {
  results.push(useBatteryState());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
  getBatteryStateAsync.mockResolvedValue(2);
});

afterEach(() => unmount(ROOT_TAG));

describe('useBatteryState', () => {
  it('reports UNKNOWN (0) before the initial fetch resolves', () => {
    // why: BatteryState.UNKNOWN is the documented "can't tell yet" sentinel — must show on the
    // synchronous first render, before the effect's async fetch settles.
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toBe(0);
  });

  it('reports the fetched state once the initial getBatteryStateAsync() resolves', async () => {
    // why: proves the one-shot seed fetch actually reaches a re-render.
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() => expect(results[results.length - 1]).toBe(2));
  });

  it('updates when the native listener fires', async () => {
    // why: state transitions (charging → unplugged, etc.) must come from the native event, not
    // a second fetch — proves the listener registered in the effect drives a re-render.
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(results[results.length - 1]).toBe(2));

    const listener = addListener.mock.calls[0][0];
    listener({ batteryState: 1 });

    await vi.waitFor(() => expect(results[results.length - 1]).toBe(1));
  });

  it('unsubscribes from the native listener on unmount', () => {
    // why: the effect's cleanup must run on unmount or the native listener leaks past the
    // component's lifetime.
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

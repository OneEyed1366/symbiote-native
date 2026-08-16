// Co-located Vue-driven test (ADR 0025) for useBatteryState. See use-battery-level's test for
// the shared rationale (native delegation is covered once in
// packages/battery/src/core/battery.test.ts).
//
// No Negative group: the composable has no guard clause or throwing path.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { useBatteryState } from './index';

const ROOT_TAG = 9952;

type IListener = (event: { batteryState: number }) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getBatteryStateAsyncMock = vi.fn(async () => 2);

vi.mock('../../../core', () => ({
  addBatteryStateListener: (listener: IListener) => addListenerMock(listener),
  getBatteryStateAsync: () => getBatteryStateAsyncMock(),
  BatteryState: { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3, NOT_CHARGING: 4 },
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getBatteryStateAsyncMock.mockClear();
  getBatteryStateAsyncMock.mockResolvedValue(2);
});

afterEach(() => unmount(ROOT_TAG));

function mountBatteryState(): Ref<number> {
  let batteryState: Ref<number> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        batteryState = useBatteryState();
        return () => h('symbiote-text', {}, 'battery');
      },
    }),
  );
  if (batteryState === undefined) {
    throw new Error('setup() did not run');
  }
  return batteryState;
}

describe('useBatteryState (Vue)', () => {
  it('starts at UNKNOWN (0) before the initial fetch resolves', () => {
    // why: BatteryState.UNKNOWN is the documented "can't tell yet" sentinel — must hold
    // synchronously at setup, before onMounted's async fetch settles.
    const batteryState = mountBatteryState();

    expect(batteryState.value).toBe(0);
  });

  it('updates to the fetched value once getBatteryStateAsync() resolves', async () => {
    // why: proves the one-shot seed fetch actually reaches the ref.
    const batteryState = mountBatteryState();

    await vi.waitFor(() => expect(batteryState.value).toBe(2));
  });

  it('updates the ref when the native listener fires', async () => {
    // why: state transitions must come from the native event, not a second fetch — proves the
    // listener registered in onMounted writes the ref.
    const batteryState = mountBatteryState();
    await vi.waitFor(() => expect(batteryState.value).toBe(2));

    registeredListener?.({ batteryState: 1 });

    expect(batteryState.value).toBe(1);
  });

  it('removes the subscription on unmount', () => {
    // why: onUnmounted must call subscription.remove(), or the native listener leaks past the
    // component's lifetime.
    mountBatteryState();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
